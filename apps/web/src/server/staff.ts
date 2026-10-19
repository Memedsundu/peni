import type {
  RolesDTO,
  StaffCafeAccessDTO,
  StaffCafeDTO,
  StaffMeDTO,
  StaffSessionDTO,
  TeamDTO,
  TeamMemberDTO,
} from "@peni/api";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_LABELS,
  SECTIONS,
  STAFF_ROLES,
  isLocked,
  normalizeEmail,
  overridesFrom,
  permissionsFor,
  roleMatrix,
  type Cafe,
  type IdentityStore,
  type Permission,
  type Section,
  type StaffAccount,
  type StaffMember,
  type StaffRole,
  type StaffStore,
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
 * that café. Baristas' PIN at the till is the next piece (2b).
 */

/** Staff sessions last this long, then the password is asked again. */
const SESSION_MS = 14 * 24 * 3_600_000;
/** Failed sign-ins per email in the window before sign-in pauses. */
export const SIGN_IN_LIMIT = 10;
const SIGN_IN_WINDOW_MS = 15 * 60_000;

/** Who is calling, at which café, and what they may do there. */
export interface StaffContext {
  account: StaffAccount;
  member: StaffMember;
  cafe: Cafe;
  role: StaffRole;
  permissions: Set<Permission>;
  tokenHash: string;
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
    const token = randomBytes(32).toString("base64url");
    await this.store.createSession(account.id, sha256(token), new Date(now.getTime() + SESSION_MS));
    return { token, ...(await this.meFor(account)) };
  }

  async signOut(token: string | null): Promise<void> {
    if (token) await this.store.revokeSession(sha256(token), this.now());
  }

  /** The signed-in account, or 401. */
  async account(token: string | null): Promise<{ account: StaffAccount; tokenHash: string }> {
    if (token) {
      const tokenHash = sha256(token);
      const session = await this.store.sessionFor(tokenHash);
      if (session && !session.revokedAt && session.expiresAt > this.now()) {
        const account = await this.store.getAccount(session.accountId);
        if (account && !account.disabledAt) return { account, tokenHash };
      }
    }
    throw new AppError("STAFF_UNAUTHENTICATED", "Sign in with your staff account", 401);
  }

  /**
   * The caller at a café, checked against a permission. 401 when not signed in,
   * 403 when not on this café's team or the role lacks the permission.
   */
  async at(token: string | null, cafeSlug: string, permission?: Permission): Promise<StaffContext> {
    const { account, tokenHash } = await this.account(token);
    const cafe = await this.identity.getCafeBySlug(cafeSlug);
    const member = cafe ? await this.store.memberAt(account.id, cafe.id) : null;
    if (!cafe || !member || member.removedAt) throw new AppError("NOT_STAFF", "Not on this café's team", 403);
    const permissions = permissionsFor(member.role, await this.store.listOverrides(cafe.id));
    if (permission && !permissions.has(permission)) {
      throw new AppError("FORBIDDEN", `Your role cannot do this (${permission})`, 403);
    }
    return { account, member, cafe, role: member.role, permissions, tokenHash };
  }

  async me(token: string | null): Promise<StaffMeDTO> {
    return this.meFor((await this.account(token)).account);
  }

  /** Changes the caller's own password and signs them out everywhere else. */
  async changePassword(token: string | null, currentPassword: string, newPassword: string): Promise<{ ok: true }> {
    const { account, tokenHash } = await this.account(token);
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
        : { id: `sm_${randomUUID()}`, cafeId: ctx.cafe.id, accountId: account.id, role: input.role, createdAt: now, removedAt: null },
    );
    return this.team(ctx);
  }

  /** Changes someone's role or takes them off the team. The café always keeps an owner. */
  async updateMember(ctx: StaffContext, memberId: string, input: { role?: StaffRole; removed?: true }): Promise<TeamDTO> {
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
  async join(accountId: string, cafeId: string, role: StaffRole): Promise<StaffMember> {
    const existing = await this.store.memberAt(accountId, cafeId);
    const member: StaffMember = existing
      ? { ...existing, role, removedAt: null }
      : { id: `sm_${randomUUID()}`, cafeId, accountId, role, createdAt: this.now(), removedAt: null };
    await this.store.saveMember(member);
    return member;
  }

  // ─────────────────────────────────────────────── helpers

  private require(ctx: StaffContext, permission: Permission) {
    if (!ctx.permissions.has(permission)) throw new AppError("FORBIDDEN", `Your role cannot do this (${permission})`, 403);
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

  private async meFor(account: StaffAccount): Promise<StaffMeDTO> {
    return { account: { id: account.id, name: account.name, email: account.email }, cafes: await this.cafesOf(account) };
  }

  private async cafesOf(account: StaffAccount): Promise<StaffCafeAccessDTO[]> {
    const out: StaffCafeAccessDTO[] = [];
    for (const m of await this.store.membershipsOf(account.id)) {
      const cafe = await this.identity.getCafe(m.cafeId);
      if (!cafe) continue;
      const permissions = permissionsFor(m.role, await this.store.listOverrides(cafe.id));
      out.push({ slug: cafe.slug, name: cafe.name, role: m.role, permissions: ALL_PERMISSIONS.filter((p) => permissions.has(p)) });
    }
    return out;
  }

  private hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.rounds);
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= this.hash(randomBytes(16).toString("hex"));
    return this.dummyHash;
  }
}

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
