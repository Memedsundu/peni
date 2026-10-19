/**
 * Turkish copy for error codes returned by the API (and NETWORK from the client).
 * Unknown codes fall back to the server message. Wording: sen, short, no blame,
 * no exclamation marks.
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
  STAFF_UNAUTHENTICATED: "Devam etmek için ekip hesabınla giriş yap.",
  SIGN_IN_FAILED: "E-posta ya da şifre yanlış.",
  SIGN_IN_LIMITED: "Çok fazla deneme oldu. Biraz sonra tekrar dene.",
  WRONG_PASSWORD: "Şu anki şifren yanlış.",
  NOT_STAFF: "Bu kafenin ekibinde değilsin.",
  ALREADY_STAFF: "Bu kişi zaten ekipte.",
  LAST_OWNER: "Kafenin en az bir sahibi olmalı.",
  OWNER_ONLY: "Bunu yalnız kafenin sahibi yapabilir.",
  PASSWORD_REQUIRED: "Yeni kişi için bir şifre belirle.",
};

export function errorMessageTr(code: string, fallback?: string): string {
  return errorMessagesTr[code] ?? fallback ?? "Bir şeyler ters gitti. Tekrar dene.";
}

/** Kept for existing screens; new UI uses `formatTL` from `@peni/brand`. */
export function formatKurus(kurus: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
}

export function formatPeni(peni: number): string {
  return `${new Intl.NumberFormat("tr-TR").format(peni)} peni`;
}
