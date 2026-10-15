/** Per-café peni and askıda kahve rules. Each café sets its own. */
export interface CafePeniSettings {
  cafeId: string;
  /** IANA zone used for "per day" limits. */
  timeZone: string;

  peniEnabled: boolean;
  /** Share of the paid total returned as peni, in basis points (500 = 5 %). */
  earnRateBps: number;
  /** Max share of an order that peni may cover, in basis points (10_000 = 100 %). */
  maxRedeemShareBps: number;
  /** Products peni can be spent on. `null` means every product. */
  redeemableProductIds: string[] | null;

  /** Max peni a member may send as gifts per local day. */
  dailyGiftLimitPeni: number;
  /** Unaccepted gifts return to the sender after this many hours. */
  giftExpiryHours: number;

  askidaEnabled: boolean;
  /** Products that can be taken from the askı. Usually a plain tea or filter coffee. */
  askidaProductIds: string[];
  /** How many askı items one member may take per local day. */
  askidaClaimsPerDay: number;
  /** A membership must be this many days old before it may take from the askı. */
  askidaMinMembershipDays: number;
  /** The café adds this share on top of every member donation (5_000 = café adds 50 %). */
  askidaMatchBps: number;
  /** Ceiling for café matching per calendar month, in peni. 0 = no matching. */
  askidaMatchMonthlyCapPeni: number;

  /** Consecutive no-shows that switch off pre-ordering for a member. */
  noShowStrikeLimit: number;
}

export function defaultSettings(cafeId: string): CafePeniSettings {
  return {
    cafeId,
    timeZone: "Europe/Istanbul",
    peniEnabled: true,
    earnRateBps: 500,
    maxRedeemShareBps: 10_000,
    redeemableProductIds: null,
    dailyGiftLimitPeni: 200,
    giftExpiryHours: 24,
    askidaEnabled: true,
    askidaProductIds: [],
    askidaClaimsPerDay: 1,
    askidaMinMembershipDays: 0,
    askidaMatchBps: 0,
    askidaMatchMonthlyCapPeni: 0,
    noShowStrikeLimit: 2,
  };
}
