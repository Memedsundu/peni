import type { Peni } from "./money";

/**
 * Peni claims (plan pieces 7 and 10). When an order is paid, the server makes a
 * one-time claim: a QR token and a 4-digit code that the customer screen shows. The
 * customer scans it or types the code (piece 10), and the peni is credited then, with
 * the order's id as the ledger's idempotency key. Until then nothing is owed: an
 * unclaimed claim simply expires at the end of the café's day.
 */
export interface PeniClaim {
  id: string;
  cafeId: string;
  /** The till order it's for. Null for a code from the penny screen (N11), where the café took the money on its own till. */
  orderId: string | null;
  /** Penny screen codes: what the customer paid on the café's own till. Null for a till order. */
  paidKurus: number | null;
  /** Penny screen codes: who gave it. Null for a till order. */
  staffMemberId: string | null;
  /** The café's local day it was made; codes are unique per café and day. */
  businessDay: string;
  /** Four digits, "0427". */
  code: string;
  /** Random, URL-safe; what the QR carries. */
  token: string;
  /** What the customer will get, worked out at payment with the café's rate. */
  peni: Peni;
  createdAt: Date;
  /** The end of the café's day. */
  expiresAt: Date;
  claimedAt: Date | null;
  claimedByMembershipId: string | null;
  /** Refunded before anyone claimed it. */
  cancelledAt: Date | null;
}

export const CLAIM_CODE_LENGTH = 4;

/** "0000" to "9999". */
export function randomClaimCode(random: () => number = Math.random): string {
  return String(Math.floor(random() * 10 ** CLAIM_CODE_LENGTH)).padStart(CLAIM_CODE_LENGTH, "0");
}

export function claimIsOpen(claim: PeniClaim, now: Date): boolean {
  return !claim.claimedAt && !claim.cancelledAt && claim.expiresAt > now;
}

/** Where a claim stands, as the customer sees it. */
export type ClaimState = "open" | "claimed" | "expired" | "cancelled";

export function claimState(claim: PeniClaim, now: Date): ClaimState {
  if (claim.claimedAt) return "claimed";
  if (claim.cancelledAt) return "cancelled";
  return claim.expiresAt > now ? "open" : "expired";
}

/**
 * Wrong codes a customer may type in an hour. A café hands out at most a few hundred
 * codes a day out of 10,000, so guessing someone else's takes far more tries than this.
 */
export const CLAIM_MISSES_PER_HOUR = 10;

export interface ClaimStore {
  /**
   * Creates the claim, or updates it. A new claim whose code is already used that day
   * at the café is refused with `false`, so the caller can pick another code.
   */
  saveClaim(claim: PeniClaim): Promise<boolean>;
  getClaim(id: string): Promise<PeniClaim | null>;
  getClaimByOrder(cafeId: string, orderId: string): Promise<PeniClaim | null>;
  /** The claim a QR carries. */
  getClaimByToken(token: string): Promise<PeniClaim | null>;
  /** The claim a typed code points to, that day at the café. */
  getClaimByCode(cafeId: string, businessDay: string, code: string): Promise<PeniClaim | null>;
  /** Codes already handed out at the café that day. */
  codesUsed(cafeId: string, businessDay: string): Promise<Set<string>>;
  /** The penny screen's codes that day (the ones with no order), newest first. */
  listCounterClaims(cafeId: string, businessDay: string): Promise<PeniClaim[]>;
  /** A wrong code typed by `who` (a customer id), counted to stop guessing. */
  recordMiss(who: string, at: Date): Promise<void>;
  countMisses(who: string, since: Date): Promise<number>;
}

export class InMemoryClaimStore implements ClaimStore {
  private readonly claims = new Map<string, PeniClaim>();
  private readonly misses: { who: string; at: Date }[] = [];

  async saveClaim(claim: PeniClaim) {
    const clash = [...this.claims.values()].some(
      (c) => c.id !== claim.id && c.cafeId === claim.cafeId && c.businessDay === claim.businessDay && c.code === claim.code,
    );
    if (clash) return false;
    this.claims.set(claim.id, { ...claim });
    return true;
  }

  async getClaim(id: string) {
    const c = this.claims.get(id);
    return c ? { ...c } : null;
  }

  async getClaimByOrder(cafeId: string, orderId: string) {
    return this.find((x) => x.cafeId === cafeId && x.orderId === orderId);
  }

  async getClaimByToken(token: string) {
    return this.find((x) => x.token === token);
  }

  async getClaimByCode(cafeId: string, businessDay: string, code: string) {
    return this.find((x) => x.cafeId === cafeId && x.businessDay === businessDay && x.code === code);
  }

  async codesUsed(cafeId: string, businessDay: string) {
    return new Set([...this.claims.values()].filter((c) => c.cafeId === cafeId && c.businessDay === businessDay).map((c) => c.code));
  }

  async listCounterClaims(cafeId: string, businessDay: string) {
    return [...this.claims.values()]
      .filter((c) => c.cafeId === cafeId && c.businessDay === businessDay && c.orderId === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((c) => ({ ...c }));
  }

  async recordMiss(who: string, at: Date) {
    this.misses.push({ who, at });
  }

  async countMisses(who: string, since: Date) {
    return this.misses.filter((m) => m.who === who && m.at >= since).length;
  }

  private find(match: (c: PeniClaim) => boolean): PeniClaim | null {
    const c = [...this.claims.values()].find(match);
    return c ? { ...c } : null;
  }
}
