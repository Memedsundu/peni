/**
 * Cafés, customers and their sessions: who is who. Staff live in staff.ts;
 * plan piece 3 (sign-in) grows this module.
 */
import type { CafePlan } from "./plans";

export interface Cafe {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  district: string | null;
  city: string | null;
  coverImageUrl: string | null;
  /** Items that read peni as goods ("3 çay"). Empty: the cheapest askı items. */
  referenceProductIds: string[];
  /** The café's own colour, once it picks one. */
  hue: string | null;
  /** What it pays for (N11). While `trialEndsAt` is ahead it has everything: see `planOn`. */
  plan: CafePlan;
  trialEndsAt: Date | null;
}

export interface Customer {
  id: string;
  /** E.164. Optional: Google, Apple and email sign-in don't give one. */
  phone: string | null;
  /** Lower case, verified by the sign-in that gave it. */
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  profileVisible: boolean;
}

/** How a customer signs in. Each is one row: Google's or Apple's user id, or the email address. */
export type LoginProvider = "google" | "apple" | "email";

export interface CustomerLogin {
  customerId: string;
  provider: LoginProvider;
  /** Google's or Apple's `sub`, or the lower-case email for email codes. */
  subject: string;
  email: string | null;
}

/** A sign-in code sent by email. Only its hash is kept. */
export interface EmailCode {
  id: string;
  /** Lower case. */
  email: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  /** Wrong tries so far. */
  attempts: number;
  usedAt: Date | null;
}

export interface IdentityStore {
  listCafes(): Promise<Cafe[]>;
  getCafe(id: string): Promise<Cafe | null>;
  getCafeBySlug(slug: string): Promise<Cafe | null>;
  saveCafe(cafe: Cafe): Promise<void>;

  getCustomer(id: string): Promise<Customer | null>;
  getCustomers(ids: readonly string[]): Promise<Customer[]>;
  getCustomerByPhone(phone: string): Promise<Customer | null>;
  getCustomerByEmail(email: string): Promise<Customer | null>;
  saveCustomer(customer: Customer): Promise<void>;

  /** The customer behind a Google, Apple or email login. */
  findLogin(provider: LoginProvider, subject: string): Promise<CustomerLogin | null>;
  addLogin(login: CustomerLogin): Promise<void>;
  loginsOf(customerId: string): Promise<CustomerLogin[]>;

  saveEmailCode(code: EmailCode): Promise<void>;
  /** The newest code for an email that is not used and not expired at `now`. */
  liveEmailCode(email: string, now: Date): Promise<EmailCode | null>;
  /** Codes sent to an email since `since`, for the per-hour limit. */
  countEmailCodes(email: string, since: Date): Promise<number>;

  /** Stores only the hash of a session token. */
  createSession(customerId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  /** The customer behind a live session: not expired at `now`, not revoked. */
  customerIdForSession(tokenHash: string, now: Date): Promise<string | null>;
  revokeSession(tokenHash: string, at: Date): Promise<void>;
  /**
   * "Hesabımı sil": the customer's name, email, phone and photo are wiped, their sign-ins,
   * sessions, devices and email codes go. What they did at cafés (peni, posts) stays under
   * `displayName` ("Silinmiş üye"), since cafés' books need it. Signing in again starts afresh.
   */
  forgetCustomer(customerId: string, displayName: string, at: Date): Promise<void>;

  /** A membership's Peni kodu. Codes are unique across all cafés. */
  memberCodeOf(membershipId: string): Promise<string | null>;
  /** Saves the code, or returns false when another membership already has it. */
  setMemberCode(membershipId: string, code: string): Promise<boolean>;
  membershipIdForCode(code: string): Promise<string | null>;

  /** Gift recipient lookups, kept for the per-hour limit. */
  recordLookup(customerId: string, at: Date): Promise<void>;
  countLookups(customerId: string, since: Date): Promise<number>;
}

export class InMemoryIdentityStore implements IdentityStore {
  private readonly cafes = new Map<string, Cafe>();
  private readonly customers = new Map<string, Customer>();
  private readonly sessions = new Map<string, { customerId: string; expiresAt: Date; revokedAt: Date | null }>();
  private readonly codes = new Map<string, string>(); // membership id to code
  private readonly byCode = new Map<string, string>(); // code to membership id
  private readonly lookups = new Map<string, Date[]>();
  private readonly logins: CustomerLogin[] = [];
  private readonly emailCodes = new Map<string, EmailCode>();

  async listCafes() {
    return [...this.cafes.values()].map(copyCafe);
  }

  async getCafe(id: string) {
    const c = this.cafes.get(id);
    return c ? copyCafe(c) : null;
  }

  async getCafeBySlug(slug: string) {
    const c = [...this.cafes.values()].find((x) => x.slug === slug);
    return c ? copyCafe(c) : null;
  }

  async saveCafe(cafe: Cafe) {
    this.cafes.set(cafe.id, copyCafe(cafe));
  }

  async getCustomer(id: string) {
    const c = this.customers.get(id);
    return c ? { ...c } : null;
  }

  async getCustomers(ids: readonly string[]) {
    return ids.flatMap((id) => {
      const c = this.customers.get(id);
      return c ? [{ ...c }] : [];
    });
  }

  async getCustomerByPhone(phone: string) {
    const c = [...this.customers.values()].find((x) => x.phone === phone);
    return c ? { ...c } : null;
  }

  async getCustomerByEmail(email: string) {
    const c = [...this.customers.values()].find((x) => x.email === email.trim().toLowerCase());
    return c ? { ...c } : null;
  }

  async findLogin(provider: LoginProvider, subject: string) {
    const l = this.logins.find((x) => x.provider === provider && x.subject === subject);
    return l ? { ...l } : null;
  }

  async addLogin(login: CustomerLogin) {
    if (!(await this.findLogin(login.provider, login.subject))) this.logins.push({ ...login });
  }

  async loginsOf(customerId: string) {
    return this.logins.filter((l) => l.customerId === customerId).map((l) => ({ ...l }));
  }

  async saveEmailCode(code: EmailCode) {
    this.emailCodes.set(code.id, { ...code });
  }

  async liveEmailCode(email: string, now: Date) {
    const live = [...this.emailCodes.values()]
      .filter((c) => c.email === email && !c.usedAt && c.expiresAt > now)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return live[0] ? { ...live[0] } : null;
  }

  async countEmailCodes(email: string, since: Date) {
    return [...this.emailCodes.values()].filter((c) => c.email === email && c.createdAt > since).length;
  }

  async saveCustomer(customer: Customer) {
    this.customers.set(customer.id, { ...customer });
  }

  async createSession(customerId: string, tokenHash: string, expiresAt: Date) {
    this.sessions.set(tokenHash, { customerId, expiresAt, revokedAt: null });
  }

  async customerIdForSession(tokenHash: string, now: Date) {
    const s = this.sessions.get(tokenHash);
    return s && !s.revokedAt && s.expiresAt > now ? s.customerId : null;
  }

  async revokeSession(tokenHash: string, at: Date) {
    const s = this.sessions.get(tokenHash);
    if (s && !s.revokedAt) s.revokedAt = at;
  }

  async forgetCustomer(customerId: string, displayName: string, at: Date) {
    const c = this.customers.get(customerId);
    if (!c) return;
    const emails = new Set([c.email, ...this.logins.filter((l) => l.customerId === customerId).map((l) => l.email)].filter(Boolean));
    this.customers.set(customerId, { ...c, displayName, email: null, phone: null, avatarUrl: null, profileVisible: false });
    this.logins.splice(0, this.logins.length, ...this.logins.filter((l) => l.customerId !== customerId));
    for (const s of this.sessions.values()) if (s.customerId === customerId && !s.revokedAt) s.revokedAt = at;
    for (const [id, code] of this.emailCodes) if (emails.has(code.email)) this.emailCodes.delete(id);
  }

  async memberCodeOf(membershipId: string) {
    return this.codes.get(membershipId) ?? null;
  }

  async setMemberCode(membershipId: string, code: string) {
    const owner = this.byCode.get(code);
    if (owner && owner !== membershipId) return false;
    const previous = this.codes.get(membershipId);
    if (previous) this.byCode.delete(previous);
    this.codes.set(membershipId, code);
    this.byCode.set(code, membershipId);
    return true;
  }

  async membershipIdForCode(code: string) {
    return this.byCode.get(code) ?? null;
  }

  async recordLookup(customerId: string, at: Date) {
    this.lookups.set(customerId, [...(this.lookups.get(customerId) ?? []), at]);
  }

  async countLookups(customerId: string, since: Date) {
    return (this.lookups.get(customerId) ?? []).filter((t) => t > since).length;
  }
}

function copyCafe(c: Cafe): Cafe {
  return { ...c, referenceProductIds: [...c.referenceProductIds] };
}
