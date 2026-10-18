import type {
  RolesDTO,
  StaffCafeAccessDTO,
  StaffCafeDTO,
  StaffMeDTO,
  StaffSessionDTO,
  TeamDTO,
  TeamMemberDTO,
  TillDTO,
  TillDeviceDTO,
} from "@peni/api";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  NO_PIN,
  ROLE_LABELS,
  SECTIONS,
  STAFF_ROLES,
  TILL_PERMISSIONS,
  isLocked,
  normalizeEmail,
  overridesFrom,
  permissionsFor,
  pinProblem,
  roleMatrix,
  type Cafe,
  type IdentityStore,
  type Permission,
  type Section,
  type StaffAccount,
  type StaffMember,
  type StaffRole,
  type StaffSessionRecord,
  type StaffSignInMethod,
  type StaffStore,
  type TillDevice,
} from "@peni/core";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AppError } from "./errors";

/**
 * Staff sign-in, the team and roles: plan piece 2.
 *
 * Staff sign in with email and password (bcrypt, as in Shelby, so Shelby's
 * passwords move across unchanged). One account can work at several cafés with
 * a different role at each; every café call checks the role's permissions at
 * that café.
 *
 * At the till (piece 2b): an owner sets the café's computer up once with their
 * password, which gives it a device token. Baristas then tap their name and type
 * their PIN on that computer only. A PIN session lasts a shift, belongs to that
 * café and computer, and can do only the till's own work (TILL_PERMISSIONS).
 */

/** Staff sessions last this long, then the password is asked again. */
const SESSION_MS = 14 * 24 * 3_600_000;
/** Failed sign-ins per email in the window before sign-in pauses. */
export const SIGN_IN_LIMIT = 10;
const SIGN_IN_WINDOW_MS = 15 * 60_000;
/** A PIN sign-in lasts a shift. */
const PIN_SESSION_MS = 12 * 3_600_000;
/** Every this many wrong PINs in a row, the PIN pauses for PIN_LOCK_MS. */
export const PIN_TRIES = 5;
const PIN_LOCK_MS = 15 * 60_000;
/** After this many wrong PINs in a row the PIN is cleared; its owner sets a new one with their password. */
export const PIN_MAX_FAILURES = 20;
const DEVICE_SEEN_EVERY_MS = 5 * 60_000;

/** Who is calling, at which café, and what they may do there. */
export interface StaffContext {
  account: StaffAccount;
  member: StaffMember;
  cafe: Cafe;
  role: StaffRole;
  permissions: Set<Permission>;
  tokenHash: string;
  /** "pin" at the till: only TILL_PERMISSIONS, at this café, on that device. */
  method: StaffSignInMethod;
  /** The till computer a PIN session belongs to; payments go to its terminal. */
  deviceId: string | null;
  /** What the role may do after a password sign-in. */
  rolePermissions: Set<Permission>;
}

export interface StaffServiceOptions {
  now: () => Date;
  /** bcrypt cost. Tests lower it. */
  bcryptRounds?: number;
}

export class StaffService {
  private readonly rounds: number;
  /** Compared against when the email is unknown, so a miss takes as long as a wrong password. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly store: StaffStore,
    private readonly identity: IdentityStore,
    private readonly options: StaffServiceOptions,
  ) {
    this.rounds = options.bcryptRounds ?? 12;
  }

  private now(): Date {
    return this.options.now();
  }

  // ─────────────────────────────────────────────── sign-in

  async signIn(email: string, password: string): Promise<StaffSessionDTO> {
    const now = this.now();
    const key = normalizeEmail(email);
    if ((await this.store.countFailedSignIns(key, new Date(now.getTime() - SIGN_IN_WINDOW_MS))) >= SIGN_IN_LIMIT) {
      throw new AppError("SIGN_IN_LIMITED", "Too many attempts; try again later", 429);
    }
    const account = await this.store.getAccountByEmail(key);
    const hash = account?.passwordHash ?? (await this.dummy());
    const ok = (await bcrypt.compare(password, hash)) && !!account?.passwordHash && !account.disabledAt;
    if (!ok || !account) {
      await this.store.recordFailedSignIn(key, now);
      throw new AppError("SIGN_IN_FAILED", "Wrong email or password", 401);
    }
    const token = newToken();
    await this.store.createSession(account.id, sha256(token), new Date(now.getTime() + SESSION_MS));
    return { token, ...(await this.meFor(account, null)) };
  }

  async signOut(token: string | null): Promise<void> {
    if (token) await this.store.revokeSession(sha256(token), this.now());
  }

  /** The signed-in account and its session, or 401. A PIN session dies with its device. */
  async account(token: string | null): Promise<{ account: StaffAccount; session: StaffSessionRecord; tokenHash: string }> {
    if (token) {
      const tokenHash = sha256(token);
      const session = await this.store.sessionFor(tokenHash);
      if (session && !session.revokedAt && session.expiresAt > this.now()) {
        const device = session.deviceId ? await this.store.getDevice(session.deviceId) : null;
        const deviceOk = session.method === "password" || (device && !device.revokedAt);
        const account = deviceOk ? await this.store.getAccount(session.accountId) : null;
        if (account && !account.disabledAt) return { account, session, tokenHash };
      }
    }
    throw new AppError("STAFF_UNAUTHENTICATED", "Sign in with your staff account", 401);
  }

  /**
   * The caller at a café, checked against a permission. 401 when not signed in,
   * 403 when not on this café's team or the role lacks the permission.
   */
  async at(token: string | null, cafeSlug: string, permission?: Permission): Promise<StaffContext> {
    const { account, session, tokenHash } = await this.account(token);
    const cafe = await this.identity.getCafeBySlug(cafeSlug);
    const member = cafe ? await this.store.memberAt(account.id, cafe.id) : null;
    const inScope = !!cafe && (session.method === "password" || session.cafeId === cafe.id);
    if (!cafe || !member || member.removedAt || !inScope) throw new AppError("NOT_STAFF", "Not on this café's team", 403);
    const rolePermissions = permissionsFor(member.role, await this.store.listOverrides(cafe.id));
    const ctx: StaffContext = {
      account,
      member,
      cafe,
      role: member.role,
      permissions: this.scoped(rolePermissions, session.method),
      rolePermissions,
      tokenHash,
      method: session.method,
      deviceId: session.deviceId,
    };
    if (permission) this.require(ctx, permission);
    return ctx;
  }

  async me(token: string | null): Promise<StaffMeDTO> {
    const { account, session } = await this.account(token);
    return this.meFor(account, session);
  }

  /** Changes the caller's own password and signs them out everywhere else. */
  async changePassword(token: string | null, currentPassword: string, newPassword: string): Promise<{ ok: true }> {
    const { account, session, tokenHash } = await this.account(token);
    if (session.method !== "password") throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    if (!account.passwordHash || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
      throw new AppError("WRONG_PASSWORD", "Current password is wrong", 403);
    }
    await this.store.saveAccount({ ...account, passwordHash: await this.hash(newPassword) });
    await this.store.revokeSessionsOf(account.id, this.now(), tokenHash);
    return { ok: true };
  }

  /** The cafés a customer works at, for the customer app's way into the café panel. [G19] */
  async cafesForCustomer(customerId: string): Promise<StaffCafeDTO[]> {
    const account = await this.store.accountForCustomer(customerId);
    if (!account || account.disabledAt) return [];
    return (await this.cafesOf(account)).map(({ slug, name, role }) => ({ slug, name, role }));
  }

  // ─────────────────────────────────────────────── team

  async team(ctx: StaffContext): Promise<TeamDTO> {
    this.require(ctx, "team.view");
    const members: TeamMemberDTO[] = [];
    for (const m of await this.store.listMembers(ctx.cafe.id)) {
      const account = await this.store.getAccount(m.accountId);
      if (!account) continue;
      members.push({
        id: m.id,
        name: account.name,
        email: account.email,
        role: m.role,
        sinceIso: m.createdAt.toISOString(),
        isYou: account.id === ctx.account.id,
        canSignIn: !!account.passwordHash && !account.disabledAt,
        hasPin: !!m.pinHash,
      });
    }
    return { members };
  }

  /**
   * Adds someone to the café's team. A new email gets an account with the
   * password the owner sets (no invitation emails yet); an email that already has
   * an account joins with its own password, which is left alone.
   */
  async addMember(
    ctx: StaffContext,
    input: { name: string; email: string; role: StaffRole; password?: string },
  ): Promise<TeamDTO> {
    this.require(ctx, "team.manage");
    this.requireOwnerFor(ctx, input.role);
    const now = this.now();
    let account = await this.store.getAccountByEmail(input.email);
    if (!account) {
      if (!input.password) throw new AppError("PASSWORD_REQUIRED", "Set a password for the new account", 400);
      account = {
        id: `acct_${randomUUID()}`,
        email: normalizeEmail(input.email),
        name: input.name.trim(),
        passwordHash: await this.hash(input.password),
        customerId: null,
        disabledAt: null,
      };
      await this.store.saveAccount(account);
    }
    const existing = await this.store.memberAt(account.id, ctx.cafe.id);
    if (existing && !existing.removedAt) throw new AppError("ALREADY_STAFF", "Already on the team", 409);
    await this.store.saveMember(
      existing
        ? { ...existing, role: input.role, removedAt: null }
        : { id: `sm_${randomUUID()}`, cafeId: ctx.cafe.id, accountId: account.id, role: input.role, createdAt: now, removedAt: null, ...NO_PIN },
    );
    return this.team(ctx);
  }

  /**
   * Changes someone's role, clears their till PIN (they set a new one with their
   * password) or takes them off the team. The café always keeps an owner.
   */
  async updateMember(
    ctx: StaffContext,
    memberId: string,
    input: { role?: StaffRole; removed?: true; clearPin?: true },
  ): Promise<TeamDTO> {
    this.require(ctx, "team.manage");
    const member = await this.teamMember(ctx, memberId);
    if (input.role) this.requireOwnerFor(ctx, input.role);
    if (member.role === "owner") this.requireOwnerFor(ctx, "owner");
    const leavesOwners = member.role === "owner" && (input.removed || (input.role && input.role !== "owner"));
    if (leavesOwners) {
      const owners = (await this.store.listMembers(ctx.cafe.id)).filter((m) => m.role === "owner");
      if (owners.length <= 1) throw new AppError("LAST_OWNER", "A café needs at least one owner", 409);
    }
    await this.store.saveMember({
      ...member,
      ...(input.clearPin || input.removed ? NO_PIN : {}),
      role: input.role ?? member.role,
      removedAt: input.removed ? this.now() : member.removedAt,
    });
    return this.team(ctx);
  }

  /**
   * The owner sets a new password for someone who forgot theirs, and signs them
   * out everywhere. Only for accounts that work nowhere else, or only at cafés
   * this owner also owns, so one café cannot take over another café's staff.
   */
  async resetPassword(ctx: StaffContext, memberId: string, password: string): Promise<{ ok: true }> {
    this.require(ctx, "team.manage");
    const member = await this.teamMember(ctx, memberId);
    const account = await this.store.getAccount(member.accountId);
    if (!account) throw new AppError("NOT_FOUND", "No such team member", 404);
    for (const elsewhere of await this.store.membershipsOf(account.id)) {
      if (elsewhere.cafeId === ctx.cafe.id) continue;
      const mine = await this.store.memberAt(ctx.account.id, elsewhere.cafeId);
      if (!mine || mine.removedAt || mine.role !== "owner") {
        throw new AppError("OWNER_ONLY", "This person also works at another café; they can reset it there", 403);
      }
    }
    await this.store.saveAccount({ ...account, passwordHash: await this.hash(password) });
    await this.store.revokeSessionsOf(account.id, this.now());
    return { ok: true };
  }

  // ─────────────────────────────────────────────── the till: devices and PINs

  /** Sets the caller's own till PIN at this café. Needs a password sign-in. */
  async setPin(ctx: StaffContext, pin: string): Promise<{ ok: true }> {
    if (ctx.method !== "password") throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    const problem = pinProblem(pin);
    if (problem) throw new AppError(problem, problem === "PIN_FORMAT" ? "A PIN is 4 to 6 digits" : "Choose a less obvious PIN", 400);
    await this.store.saveMember({ ...ctx.member, pinHash: await this.hash(pin), pinFailures: 0, pinLockedUntil: null });
    return { ok: true };
  }

  /** Makes this computer a till for the café. Returns the device token, shown once. */
  async registerDevice(ctx: StaffContext, name: string): Promise<{ device: TillDeviceDTO; token: string }> {
    this.require(ctx, "devices.manage");
    if (ctx.method !== "password") throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    const token = newToken();
    const device: TillDevice = {
      id: `dev_${randomUUID()}`,
      cafeId: ctx.cafe.id,
      name: name.trim(),
      createdAt: this.now(),
      createdByMemberId: ctx.member.id,
      lastSeenAt: null,
      revokedAt: null,
    };
    await this.store.createDevice(device, sha256(token));
    return { device: toDeviceDTO(device), token };
  }

  async devices(ctx: StaffContext): Promise<{ devices: TillDeviceDTO[] }> {
    this.require(ctx, "devices.manage");
    return { devices: (await this.store.listDevices(ctx.cafe.id)).map(toDeviceDTO) };
  }

  /** A lost or replaced computer: its token stops working and everyone signed in on it is signed out. */
  async revokeDevice(ctx: StaffContext, deviceId: string): Promise<{ devices: TillDeviceDTO[] }> {
    this.require(ctx, "devices.manage");
    const device = await this.store.getDevice(deviceId);
    if (!device || device.cafeId !== ctx.cafe.id || device.revokedAt) throw new AppError("NOT_FOUND", "No such device", 404);
    const now = this.now();
    await this.store.saveDevice({ ...device, revokedAt: now });
    await this.store.revokeSessionsOnDevice(device.id, now);
    return this.devices(ctx);
  }

  /** The till's sign-in screen: who can sign in here with a PIN. */
  async till(deviceToken: string | null): Promise<TillDTO> {
    const device = await this.device(deviceToken);
    const cafe = (await this.identity.getCafe(device.cafeId))!;
    const overrides = await this.store.listOverrides(cafe.id);
    const now = this.now();
    const staff: TillDTO["staff"] = [];
    for (const m of await this.store.listMembers(cafe.id)) {
      if (!permissionsFor(m.role, overrides).has("till.use")) continue;
      const account = await this.store.getAccount(m.accountId);
      if (!account || account.disabledAt) continue;
      staff.push({
        memberId: m.id,
        name: account.name,
        role: m.role,
        hasPin: !!m.pinHash,
        lockedUntilIso: m.pinLockedUntil && m.pinLockedUntil > now ? m.pinLockedUntil.toISOString() : null,
      });
    }
    return { cafe: { slug: cafe.slug, name: cafe.name }, device: toDeviceDTO(device), staff };
  }

  /**
   * PIN sign-in on a till device. Every 5 wrong PINs in a row pause that PIN for
   * 15 minutes; 20 in a row clear it. Four digits then give at most 20 guesses.
   */
  async pinSignIn(deviceToken: string | null, memberId: string, pin: string): Promise<StaffSessionDTO> {
    const device = await this.device(deviceToken);
    const now = this.now();
    const member = await this.store.getMember(memberId);
    const account = member ? await this.store.getAccount(member.accountId) : null;
    const allowed =
      member && account && !account.disabledAt && member.cafeId === device.cafeId && !member.removedAt &&
      permissionsFor(member.role, await this.store.listOverrides(device.cafeId)).has("till.use");
    if (!member || !account || !allowed) throw new AppError("NOT_STAFF", "Not on this café's team", 403);
    if (!member.pinHash) throw new AppError("NO_PIN", "Set a PIN first", 409);
    if (member.pinLockedUntil && member.pinLockedUntil > now) {
      throw new AppError("PIN_LOCKED", `Try again after ${member.pinLockedUntil.toISOString()}`, 429);
    }
    if (!(await bcrypt.compare(pin, member.pinHash))) {
      const failures = member.pinFailures + 1;
      const cleared = failures >= PIN_MAX_FAILURES;
      await this.store.saveMember({
        ...member,
        ...(cleared ? NO_PIN : {}),
        pinFailures: cleared ? 0 : failures,
        pinLockedUntil: !cleared && failures % PIN_TRIES === 0 ? new Date(now.getTime() + PIN_LOCK_MS) : member.pinLockedUntil,
      });
      throw cleared
        ? new AppError("PIN_CLEARED", "Too many wrong PINs; set a new one with your password", 403)
        : new AppError("PIN_WRONG", "Wrong PIN", 401);
    }
    await this.store.saveMember({ ...member, pinFailures: 0, pinLockedUntil: null });
    const token = newToken();
    const session: StaffSessionRecord = {
      accountId: account.id,
      expiresAt: new Date(now.getTime() + PIN_SESSION_MS),
      revokedAt: null,
      method: "pin",
      cafeId: device.cafeId,
      deviceId: device.id,
    };
    await this.store.createSession(account.id, sha256(token), session.expiresAt, { cafeId: device.cafeId, deviceId: device.id });
    return { token, ...(await this.meFor(account, session)) };
  }

  // ─────────────────────────────────────────────── roles

  async roles(ctx: StaffContext): Promise<RolesDTO> {
    this.require(ctx, "team.view");
    const matrix = roleMatrix(await this.store.listOverrides(ctx.cafe.id));
    const bySection = new Map<Section, RolesDTO["sections"][number]>();
    for (const key of ALL_PERMISSIONS) {
      const d = PERMISSIONS[key];
      let section = bySection.get(d.section);
      if (!section) {
        section = { section: d.section, label: { ...SECTIONS[d.section] }, permissions: [] };
        bySection.set(d.section, section);
      }
      const roles = Object.fromEntries(STAFF_ROLES.map((r) => [r, matrix[r][key]])) as Record<StaffRole, boolean>;
      section.permissions.push({ key, label: { ...d.label }, hint: { ...d.hint }, locked: isLocked(key), roles });
    }
    return {
      roles: STAFF_ROLES.map((role) => ({ role, label: { ...ROLE_LABELS[role] } })),
      sections: (Object.keys(SECTIONS) as Section[]).flatMap((s) => bySection.get(s) ?? []),
      canEdit: ctx.permissions.has("roles.manage"),
    };
  }

  async saveRoles(ctx: StaffContext, roles: Record<string, Record<string, boolean>>): Promise<RolesDTO> {
    this.require(ctx, "roles.manage");
    await this.store.replaceOverrides(ctx.cafe.id, overridesFrom(roles));
    return this.roles(ctx);
  }

  // ─────────────────────────────────────────────── demo and seeding

  /** Creates an account with a password, or returns the existing one. Seeding and tests only. */
  async ensureAccount(input: { name: string; email: string; password: string; customerId?: string }): Promise<StaffAccount> {
    const existing = await this.store.getAccountByEmail(input.email);
    if (existing) return existing;
    const account: StaffAccount = {
      id: `acct_${randomUUID()}`,
      email: normalizeEmail(input.email),
      name: input.name,
      passwordHash: await this.hash(input.password),
      customerId: input.customerId ?? null,
      disabledAt: null,
    };
    await this.store.saveAccount(account);
    return account;
  }

  /** Puts an account on a café's team. Seeding, tests and café sign-up (piece 5) only: no permission check. */
  async join(accountId: string, cafeId: string, role: StaffRole, pin?: string): Promise<StaffMember> {
    const existing = await this.store.memberAt(accountId, cafeId);
    const member: StaffMember = existing
      ? { ...existing, role, removedAt: null }
      : { id: `sm_${randomUUID()}`, cafeId, accountId, role, createdAt: this.now(), removedAt: null, ...NO_PIN };
    if (pin) member.pinHash = await this.hash(pin);
    await this.store.saveMember(member);
    return member;
  }

  // ─────────────────────────────────────────────── helpers

  /** FORBIDDEN when the role can't; NEEDS_PASSWORD when it can, but not after a PIN sign-in. */
  private require(ctx: StaffContext, permission: Permission) {
    if (ctx.permissions.has(permission)) return;
    throw ctx.rolePermissions.has(permission)
      ? new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403)
      : new AppError("FORBIDDEN", `Your role cannot do this (${permission})`, 403);
  }

  /** Only an owner makes, changes or removes an owner. */
  private requireOwnerFor(ctx: StaffContext, role: StaffRole) {
    if (role === "owner" && ctx.role !== "owner") throw new AppError("OWNER_ONLY", "Only an owner can do this", 403);
  }

  private async teamMember(ctx: StaffContext, memberId: string): Promise<StaffMember> {
    const member = await this.store.getMember(memberId);
    if (!member || member.cafeId !== ctx.cafe.id || member.removedAt) {
      throw new AppError("NOT_FOUND", "No such team member", 404);
    }
    return member;
  }

  /** A PIN session sees only its café, with only the till's permissions. */
  private async meFor(account: StaffAccount, session: StaffSessionRecord | null): Promise<StaffMeDTO> {
    const method = session?.method ?? "password";
    const cafes = (await this.cafesOf(account, method)).filter(
      (c) => method === "password" || c.cafeId === session?.cafeId,
    );
    return {
      account: { id: account.id, name: account.name, email: account.email },
      signedInWith: method,
      cafes: cafes.map(({ cafeId: _, ...c }) => c),
    };
  }

  private async cafesOf(
    account: StaffAccount,
    method: StaffSignInMethod = "password",
  ): Promise<(StaffCafeAccessDTO & { cafeId: string })[]> {
    const out: (StaffCafeAccessDTO & { cafeId: string })[] = [];
    for (const m of await this.store.membershipsOf(account.id)) {
      const cafe = await this.identity.getCafe(m.cafeId);
      if (!cafe) continue;
      const permissions = this.scoped(permissionsFor(m.role, await this.store.listOverrides(cafe.id)), method);
      out.push({
        cafeId: cafe.id,
        slug: cafe.slug,
        name: cafe.name,
        role: m.role,
        permissions: ALL_PERMISSIONS.filter((p) => permissions.has(p)),
      });
    }
    return out;
  }

  private scoped(permissions: Set<Permission>, method: StaffSignInMethod): Set<Permission> {
    return method === "pin" ? new Set(TILL_PERMISSIONS.filter((p) => permissions.has(p))) : permissions;
  }

  /** The till device behind a device token, or 401. Notes when it was last used. */
  private async device(deviceToken: string | null): Promise<TillDevice> {
    const device = deviceToken ? await this.store.deviceForToken(sha256(deviceToken)) : null;
    if (!device || device.revokedAt) throw new AppError("DEVICE_UNKNOWN", "This computer is not set up as a till", 401);
    const now = this.now();
    if (!device.lastSeenAt || now.getTime() - device.lastSeenAt.getTime() > DEVICE_SEEN_EVERY_MS) {
      device.lastSeenAt = now;
      await this.store.saveDevice(device);
    }
    return device;
  }

  private hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.rounds);
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= this.hash(randomBytes(16).toString("hex"));
    return this.dummyHash;
  }
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function toDeviceDTO(d: TillDevice): TillDeviceDTO {
  return { id: d.id, name: d.name, createdIso: d.createdAt.toISOString(), lastSeenIso: d.lastSeenAt?.toISOString() ?? null };
}

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
