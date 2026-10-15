/**
 * Money is kept in kuruş (integer, 1 TL = 100 kuruş) so arithmetic is exact.
 * Peni is a whole-number unit: 1 peni is worth 1 TL at the café that issued it.
 */
export type Kurus = number;
export type Peni = number;

export const KURUS_PER_PENI = 100;

export function assertWholeNumber(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, got ${value}`);
  }
}

export function peniToKurus(peni: Peni): Kurus {
  return peni * KURUS_PER_PENI;
}

/** Whole peni that fit inside an amount of money (rounded down). */
export function kurusToPeniFloor(kurus: Kurus): Peni {
  return Math.floor(kurus / KURUS_PER_PENI);
}

/** Whole peni needed to cover an amount of money (rounded up). */
export function kurusToPeniCeil(kurus: Kurus): Peni {
  return Math.ceil(kurus / KURUS_PER_PENI);
}

/** Basis points: 10_000 = 100 %. */
export function applyBps(amount: number, bps: number): number {
  return Math.floor((amount * bps) / 10_000);
}

export function formatTL(kurus: Kurus): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
}
