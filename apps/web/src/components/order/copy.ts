/*
 * Spec strings for the order fiş (§9.4) and Siparişlerim (§9.5) that @peni/brand/copy does not
 * hold yet. They belong there (so the mobile screens say exactly the same words); until that
 * shared change lands they live here, in one place, under the names they would have there.
 */

/** Siparişlerim (§9.5). */
export const ordersCopy = {
  title: "Siparişlerim",
  legendNow: "ŞİMDİ",
  legendPast: "GEÇMİŞ",
  empty: "Henüz siparişin yok. Bir kafe seç, ilk siparişini ver.",
  signedOut: "Siparişlerini görmek için giriş yap.",
  /** Accessible name of the loading skeleton. */
  loading: "Siparişler yükleniyor",
  /** A history row's total when nothing was due at the till (§11: never "₺0"). */
  noPayment: "Ödeme yok",
} as const;

/** The order fiş (§9.4), beside `orderCopy`. */
export const orderPageCopy = {
  signedOut: "Bu siparişi görmek için giriş yap.",
  /** Accessible name of the loading skeleton. */
  loading: "Sipariş yükleniyor",
  /** The barista accepted while the cancel sheet was open: nothing left to cancel. */
  cancelTooLate: "Barista siparişini hazırlamaya başladı; artık iptal edilemez.",
} as const;
