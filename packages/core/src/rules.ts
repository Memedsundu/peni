import { applyBps, kurusToPeniFloor, peniToKurus, type Kurus, type Peni } from "./money";
import type { CafePeniSettings } from "./settings";

export interface OrderLine {
  productId: string;
  unitPriceKurus: Kurus;
  quantity: number;
}

export function orderTotalKurus(lines: OrderLine[]): Kurus {
  return lines.reduce((sum, line) => sum + line.unitPriceKurus * line.quantity, 0);
}

/** Peni earned for an order paid at the till. Rounded down to whole peni. */
export function calculateEarn(paidTotalKurus: Kurus, settings: CafePeniSettings): Peni {
  if (!settings.peniEnabled || paidTotalKurus <= 0) return 0;
  return kurusToPeniFloor(applyBps(paidTotalKurus, settings.earnRateBps));
}

export interface RedemptionPlan {
  appliedPeni: Peni;
  discountKurus: Kurus;
  /** The most peni this order could take, whatever the balance. */
  maxPeniForOrder: Peni;
}

/** Works out how much of a wallet can go towards an order under the café's rules. */
export function planRedemption(input: {
  lines: OrderLine[];
  balance: Peni;
  requestedPeni: Peni;
  settings: CafePeniSettings;
}): RedemptionPlan {
  const { lines, balance, requestedPeni, settings } = input;
  if (!settings.peniEnabled) return { appliedPeni: 0, discountKurus: 0, maxPeniForOrder: 0 };

  const eligible = settings.redeemableProductIds
    ? new Set(settings.redeemableProductIds)
    : null;
  const eligibleKurus = orderTotalKurus(
    lines.filter((line) => !eligible || eligible.has(line.productId)),
  );
  const shareCapKurus = applyBps(orderTotalKurus(lines), settings.maxRedeemShareBps);
  const maxPeniForOrder = kurusToPeniFloor(Math.min(eligibleKurus, shareCapKurus));
  const appliedPeni = Math.max(0, Math.min(requestedPeni, balance, maxPeniForOrder));

  return { appliedPeni, discountKurus: peniToKurus(appliedPeni), maxPeniForOrder };
}
