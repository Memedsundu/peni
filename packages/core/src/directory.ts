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
  /** Pre-ordering from the app. Switched off automatically after repeated no-shows. */
  preorderEnabled: boolean;
  consecutiveNoShows: number;
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
  saveMembership(membership: Membership): Promise<void>;
  getSettings(cafeId: string): Promise<CafePeniSettings>;
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

  async saveMembership(membership: Membership) {
    this.memberships.set(membership.id, { ...membership });
  }

  async getSettings(cafeId: string) {
    return { ...(this.settings.get(cafeId) ?? defaultSettings(cafeId)) };
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
