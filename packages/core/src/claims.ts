import type { Peni } from "./money";

/**
 * Peni claims (plan pieces 7 and 10). When an order is paid, the server makes a
 * one-time claim: a QR token and a 4-digit code that the customer screen shows. The
 * customer scans it or types the code in the app (piece 10), and the peni is credited
 * then, with the order's id as the ledger's idempotency key. Until then nothing is owed:
 * an unclaimed claim simply expires at the end of the café's day.
 */
export interface PeniClaim {
  id: string;
  cafeId: string;
  orderId: string;
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

export interface ClaimStore {
  /**
   * Creates the claim, or updates it. A new claim whose code is already used that day
   * at the café is refused with `false`, so the caller can pick another code.
   */
  saveClaim(claim: PeniClaim): Promise<boolean>;
  getClaimByOrder(cafeId: string, orderId: string): Promise<PeniClaim | null>;
  /** Codes already handed out at the café that day. */
  codesUsed(cafeId: string, businessDay: string): Promise<Set<string>>;
}

export class InMemoryClaimStore implements ClaimStore {
  private readonly claims = new Map<string, PeniClaim>();

  async saveClaim(claim: PeniClaim) {
    const clash = [...this.claims.values()].some(
      (c) => c.id !== claim.id && c.cafeId === claim.cafeId && c.businessDay === claim.businessDay && c.code === claim.code,
    );
    if (clash) return false;
    this.claims.set(claim.id, { ...claim });
    return true;
  }

  async getClaimByOrder(cafeId: string, orderId: string) {
    const c = [...this.claims.values()].find((x) => x.cafeId === cafeId && x.orderId === orderId);
    return c ? { ...c } : null;
  }

  async codesUsed(cafeId: string, businessDay: string) {
    return new Set([...this.claims.values()].filter((c) => c.cafeId === cafeId && c.businessDay === businessDay).map((c) => c.code));
  }
}
