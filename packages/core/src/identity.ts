/**
 * Cafés, customers, their sessions and staff grants: who is who. Plan piece 2
 * (staff and roles) and piece 3 (sign-in) grow this module.
 */

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
}

export interface Customer {
  id: string;
  phone: string;
  displayName: string;
  avatarUrl: string | null;
  profileVisible: boolean;
}

export type StaffRole = "owner" | "manager" | "barista";

export interface StaffGrant {
  cafeId: string;
  customerId: string;
  role: StaffRole;
}

export interface IdentityStore {
  listCafes(): Promise<Cafe[]>;
  getCafe(id: string): Promise<Cafe | null>;
  getCafeBySlug(slug: string): Promise<Cafe | null>;
  saveCafe(cafe: Cafe): Promise<void>;

  getCustomer(id: string): Promise<Customer | null>;
  getCustomers(ids: readonly string[]): Promise<Customer[]>;
  getCustomerByPhone(phone: string): Promise<Customer | null>;
  saveCustomer(customer: Customer): Promise<void>;

  /** Stores only the hash of a session token. */
  createSession(customerId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  /** The customer behind a live session: not expired at `now`, not revoked. */
  customerIdForSession(tokenHash: string, now: Date): Promise<string | null>;
  revokeSession(tokenHash: string, at: Date): Promise<void>;

  /** One role per café; granting again replaces it. */
  grantStaff(grant: StaffGrant): Promise<void>;
  staffGrantsFor(customerId: string): Promise<StaffGrant[]>;

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
  private readonly staff = new Map<string, StaffGrant[]>(); // customer id to grants
  private readonly codes = new Map<string, string>(); // membership id to code
  private readonly byCode = new Map<string, string>(); // code to membership id
  private readonly lookups = new Map<string, Date[]>();

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

  async grantStaff(grant: StaffGrant) {
    const others = (this.staff.get(grant.customerId) ?? []).filter((g) => g.cafeId !== grant.cafeId);
    this.staff.set(grant.customerId, [...others, { ...grant }]);
  }

  async staffGrantsFor(customerId: string) {
    return (this.staff.get(customerId) ?? []).map((g) => ({ ...g }));
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
