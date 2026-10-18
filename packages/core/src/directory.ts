import type { Peni } from "./money";
import { defaultSettings, type CafePeniSettings } from "./settings";

/** A customer's relationship with one café. Peni balances live per membership. */
export interface Membership {
  id: string;
  cafeId: string;
  customerId: string;
  joinedAt: Date;
  /** Removed from the café's community by staff. Cannot earn, spend or take from the askı. */
  blocked: boolean;
}

export type GiftStatus = "pending" | "accepted" | "declined" | "expired";

/** A peni gift ("ısmarlama") from one member to another at the same café. */
export interface Gift {
  id: string;
  cafeId: string;
  fromMembershipId: string;
  toMembershipId: string;
  peni: Peni;
  message: string | null;
  status: GiftStatus;
  createdAt: Date;
  expiresAt: Date;
  resolvedAt: Date | null;
  sendTransactionId: string;
  /** When the recipient said thanks. Only accepted gifts can be thanked. */
  thankedAt?: Date | null;
}

export interface MembershipFilter {
  cafeId?: string;
  customerId?: string;
}

export interface GiftFilter {
  cafeId?: string;
  membershipId?: string;
  status?: GiftStatus;
  expiresBefore?: Date;
}

/** Non-ledger records the peni service reads and writes. */
export interface PeniDirectory {
  getMembership(id: string): Promise<Membership | null>;
  /** The customer's membership at that café, if they joined it. */
  findMembership(customerId: string, cafeId: string): Promise<Membership | null>;
  /** Oldest first. */
  listMemberships(filter: MembershipFilter): Promise<Membership[]>;
  /** Creates the membership or updates it. */
  saveMembership(membership: Membership): Promise<void>;
  getSettings(cafeId: string): Promise<CafePeniSettings>;
  saveSettings(settings: CafePeniSettings): Promise<void>;
  getGift(id: string): Promise<Gift | null>;
  saveGift(gift: Gift): Promise<void>;
  listGifts(filter: GiftFilter): Promise<Gift[]>;
}

export class InMemoryDirectory implements PeniDirectory {
  readonly memberships = new Map<string, Membership>();
  readonly settings = new Map<string, CafePeniSettings>();
  readonly gifts = new Map<string, Gift>();

  async getMembership(id: string) {
    const m = this.memberships.get(id);
    return m ? { ...m } : null;
  }

  async findMembership(customerId: string, cafeId: string) {
    const m = [...this.memberships.values()].find((x) => x.customerId === customerId && x.cafeId === cafeId);
    return m ? { ...m } : null;
  }

  async listMemberships(filter: MembershipFilter) {
    return [...this.memberships.values()]
      .filter((m) => (!filter.cafeId || m.cafeId === filter.cafeId) && (!filter.customerId || m.customerId === filter.customerId))
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((m) => ({ ...m }));
  }

  async saveMembership(membership: Membership) {
    this.memberships.set(membership.id, { ...membership });
  }

  async getSettings(cafeId: string) {
    return { ...(this.settings.get(cafeId) ?? defaultSettings(cafeId)) };
  }

  async saveSettings(settings: CafePeniSettings) {
    this.settings.set(settings.cafeId, { ...settings });
  }

  async getGift(id: string) {
    const g = this.gifts.get(id);
    return g ? { ...g } : null;
  }

  async saveGift(gift: Gift) {
    this.gifts.set(gift.id, { ...gift });
  }

  async listGifts(filter: GiftFilter) {
    return [...this.gifts.values()]
      .filter(
        (g) =>
          (!filter.cafeId || g.cafeId === filter.cafeId) &&
          (!filter.status || g.status === filter.status) &&
          (!filter.expiresBefore || g.expiresAt <= filter.expiresBefore) &&
          (!filter.membershipId ||
            g.fromMembershipId === filter.membershipId ||
            g.toMembershipId === filter.membershipId),
      )
      .map((g) => ({ ...g }));
  }
}
