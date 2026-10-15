/** Turkish copy for error codes returned by the API. Unknown codes fall back to the server message. */
export const errorMessagesTr: Record<string, string> = {
  INSUFFICIENT_BALANCE: "Bakiyen bunun için yetmiyor.",
  NOT_FOUND: "Bulunamadı.",
  FORBIDDEN: "Bunu yapmaya yetkin yok.",
  UNAUTHENTICATED: "Devam etmek için giriş yap.",
  VALIDATION: "Bilgilerde bir sorun var, kontrol edip tekrar dene.",
  CROSS_CAFE: "Peni yalnızca aynı kafenin üyeleri arasında gönderilebilir.",
  MEMBERSHIP_BLOCKED: "Bu kafedeki üyeliğin askıya alınmış.",
  NOT_A_MEMBER: "Önce bu kafeye katılman gerekiyor.",
  RECIPIENT_NOT_MEMBER: "Bu numara bu kafenin üyesi değil.",
  GIFT_INVALID: "Kendine peni gönderemezsin.",
  GIFT_LIMIT: "Bugünlük ısmarlama limitine ulaştın.",
  GIFT_NOT_PENDING: "Bu ısmarlama artık geçerli değil.",
  ASKIDA_DISABLED: "Bu kafede askıda kahve yok.",
  ASKIDA_EMPTY: "Askı şu an boş. Biri bıraktığında haber veririz.",
  ASKIDA_LIMIT: "Bugün askıdan aldın. Yarın yine bekleriz.",
  ASKIDA_TOO_NEW: "Askıdan alabilmek için üyeliğinin biraz eskimesi gerekiyor.",
  PRODUCT_NOT_ELIGIBLE: "Bu ürün askıdan alınamıyor.",
  INVALID_TRANSITION: "Sipariş bu aşamada değiştirilemez.",
  ORDERING_CLOSED: "Kafe şu an uygulamadan sipariş almıyor.",
  PREORDER_DISABLED: "Uygulamadan sipariş verme özelliğin kapalı. Kasadan sipariş verebilirsin.",
  CODE_INVALID: "Kod hatalı ya da süresi dolmuş.",
  RATE_LIMITED: "Çok fazla deneme yaptın, biraz bekle.",
};

export function errorMessageTr(code: string, fallback?: string): string {
  return errorMessagesTr[code] ?? fallback ?? "Bir şeyler ters gitti. Tekrar dene.";
}

export const fulfillmentLabelsTr = {
  submitted: "Kafeye iletildi",
  accepted: "Hazırlanıyor",
  ready: "Hazır! Kasaya uğra",
  collected: "Teslim edildi",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
  no_show: "Teslim alınmadı",
} as const;

export function formatKurus(kurus: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
}

export function formatPeni(peni: number): string {
  return `${new Intl.NumberFormat("tr-TR").format(peni)} peni`;
}
