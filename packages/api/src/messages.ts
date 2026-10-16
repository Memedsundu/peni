/**
 * Turkish copy for error codes returned by the API (and NETWORK from the client).
 * Unknown codes fall back to the server message. Wording follows §9 and §11 of
 * docs/design-system.md: sen, short, no blame, no exclamation marks.
 */
export const errorMessagesTr: Record<string, string> = {
  NETWORK: "Bağlantı kurulamadı. Tekrar dene.",
  INTERNAL: "Bir şeyler ters gitti. Tekrar dene.",
  INSUFFICIENT_BALANCE: "Bakiyen bunun için yetmiyor.",
  NOT_FOUND: "Bulunamadı.",
  FORBIDDEN: "Bunu yapmaya yetkin yok.",
  UNAUTHENTICATED: "Devam etmek için giriş yap.",
  VALIDATION: "Bilgilerde bir sorun var, kontrol edip tekrar dene.",
  CROSS_CAFE: "Yalnız aynı kafenin üyelerine ısmarlayabilirsin.",
  MEMBERSHIP_BLOCKED: "Bu kafedeki üyeliğin şu an kullanılamıyor. Kasaya sorabilirsin.",
  NOT_A_MEMBER: "Bunun için kafeye katıl. Üyelik ücretsiz.",
  RECIPIENT_NOT_MEMBER: "Bu numarayla bu kafede üye bulunamadı.",
  GIFT_INVALID: "Kendine ısmarlayamazsın.",
  GIFT_LIMIT: "Bugünkü ısmarlama sınırına ulaştın. Yarın yine ısmarlayabilirsin.",
  GIFT_NOT_PENDING: "Bu ısmarlama artık geçerli değil.",
  GIFT_NOT_ACCEPTED: "Teşekkür etmek için önce ısmarlamayı kabul et.",
  LOOKUP_LIMITED: "Çok fazla numara denedin. Biraz sonra tekrar dene.",
  ASKIDA_DISABLED: "Bu kafede askı yok.",
  ASKIDA_EMPTY: "Askı şu an boş. Biri bıraktığında burada görünür.",
  ASKIDA_LIMIT: "Bugünkü ikramını aldın. Yarın yine gel.",
  ASKIDA_TOO_NEW: "Askıdan almak için üyeliğinin biraz daha eski olması gerekiyor.",
  PRODUCT_NOT_ELIGIBLE: "Bu ürün askıdan alınamıyor.",
  EVENT_FULL: "Masa doldu.",
  INVALID_TRANSITION: "Sipariş bu aşamada değiştirilemez.",
  ORDERING_CLOSED: "Kafe şu an uygulamadan sipariş almıyor. Kasaya uğrayabilirsin.",
  PREORDER_DISABLED:
    "Son iki siparişin teslim alınmadığı için burada önden sipariş şimdilik kapalı. Kafeye uğradığında baristaya söylemen yeterli; yeniden açabilir.",
  CODE_INVALID: "Kod tutmadı. Tekrar dener misin?",
  RATE_LIMITED: "Çok fazla hatalı deneme oldu. Yeni bir kod iste.",
  SMS_NOT_CONFIGURED: "Şu an SMS gönderemiyoruz. Biraz sonra tekrar dene.",
};

export function errorMessageTr(code: string, fallback?: string): string {
  return errorMessagesTr[code] ?? fallback ?? "Bir şeyler ters gitti. Tekrar dene.";
}

/** Status words (§11). The fiş headline per status is longer copy, written in the screen. */
export const fulfillmentLabelsTr = {
  submitted: "İletildi",
  accepted: "Hazırlanıyor",
  ready: "Hazır",
  collected: "Teslim edildi",
  rejected: "Kafe yetişemedi",
  cancelled: "İptal edildi",
  no_show: "Teslim alınmadı",
} as const;

/** Kept for existing screens; new UI uses `formatTL` from `@peni/brand`. */
export function formatKurus(kurus: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
}

export function formatPeni(peni: number): string {
  return `${new Intl.NumberFormat("tr-TR").format(peni)} peni`;
}
