import type { Kurus, Peni } from "./money";
import { applyBps, kurusToPeniFloor } from "./money";
import type { CafePeniSettings } from "./settings";

/**
 * Spending peni at the till (plan piece 11). The customer opens their ödeme kodu: a
 * 6-digit code, also shown as a QR for the till's scanner, that lasts a few minutes and
 * is replaced each time they open it. The Peni kodu is not enough to spend: people
 * share it to receive gifts (D28), so anyone could read it off a screen.
 */
export interface SpendCode {
  cafeId: string;
  membershipId: string;
  /** Six digits, "042731". */
  code: string;
  createdAt: Date;
  expiresAt: Date;
}

export const SPEND_CODE_LENGTH = 6;
export const SPEND_CODE_TTL_MS = 5 * 60_000;

export function randomSpendCode(random: () => number = Math.random): string {
  return String(Math.floor(random() * 10 ** SPEND_CODE_LENGTH)).padStart(SPEND_CODE_LENGTH, "0");
}

/** What a scanner or a barista typed: digits only, or null. */
export function normalizeSpendCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${SPEND_CODE_LENGTH}}$`).test(digits) ? digits : null;
}

export interface SpendCodeStore {
  /**
   * Replaces the membership's code. Refused with `false` when another member of the café
   * holds the same digits, so the caller picks another.
   */
  saveSpendCode(code: SpendCode): Promise<boolean>;
  getSpendCode(cafeId: string, code: string): Promise<SpendCode | null>;
}

export class InMemorySpendCodeStore implements SpendCodeStore {
  private readonly codes = new Map<string, SpendCode>();

  async saveSpendCode(code: SpendCode) {
    const clash = [...this.codes.values()].some((c) => c.cafeId === code.cafeId && c.code === code.code && c.membershipId !== code.membershipId);
    if (clash) return false;
    this.codes.set(code.membershipId, { ...code });
    return true;
  }

  async getSpendCode(cafeId: string, code: string) {
    const c = [...this.codes.values()].find((x) => x.cafeId === cafeId && x.code === code);
    return c ? { ...c } : null;
  }
}

/**
 * The most peni an order at the till can still take: what's left to pay, within the
 * café's share of the order peni may cover and its products peni may pay for, less the
 * peni already on it. Whole peni only; the kuruş left over go on cash or card.
 */
export function tillSpendCap(input: {
  /** Each line's total after its own discount. */
  lines: { productId: string; totalKurus: Kurus }[];
  orderTotalKurus: Kurus;
  dueKurus: Kurus;
  peniOnOrder: Peni;
  settings: CafePeniSettings;
}): Peni {
  const { lines, orderTotalKurus, dueKurus, peniOnOrder, settings } = input;
  if (!settings.peniEnabled || orderTotalKurus <= 0) return 0;
  const eligible = settings.redeemableProductIds ? new Set(settings.redeemableProductIds) : null;
  const linesKurus = lines.reduce((s, l) => s + l.totalKurus, 0);
  const eligibleLinesKurus = lines.filter((l) => !eligible || eligible.has(l.productId)).reduce((s, l) => s + l.totalKurus, 0);
  // The order discount shrinks every line alike.
  const eligibleKurus = linesKurus > 0 ? Math.floor((eligibleLinesKurus * orderTotalKurus) / linesKurus) : 0;
  const capKurus = Math.min(eligibleKurus, applyBps(orderTotalKurus, settings.maxRedeemShareBps));
  return Math.max(0, Math.min(kurusToPeniFloor(capKurus) - peniOnOrder, kurusToPeniFloor(dueKurus)));
}
