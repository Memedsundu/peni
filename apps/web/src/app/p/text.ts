import { PeniApiError } from "@peni/api";

/** The claim pages' words in Turkish and English. Turkish is the default. */
export type Lang = "tr" | "en";

const TEXT = {
  loading: { tr: "Açılıyor…", en: "Opening…" },
  waiting: { tr: "seni bekliyor", en: "waiting for you" },
  waitingBody: {
    tr: "Bu alışverişten kazandığın peni. Gün sonuna kadar alabilirsin; sonra kod kapanır.",
    en: "What this purchase earned you. Take it before the day ends; the code closes then.",
  },
  take: { tr: "Peni'yi al", en: "Take the peni" },
  taking: { tr: "Alınıyor…", en: "Taking…" },
  yours: { tr: "hesabına geçti", en: "is in your account" },
  balance: { tr: "Bu kafedeki bakiyen", en: "Your balance at this café" },
  joined: { tr: "Kafeye de katıldın. Üyelik ücretsiz.", en: "You've joined the café too. It's free." },
  spendHint: {
    tr: "Bir sonraki siparişte kasada Peni kodunu göster, istediğin kadarını harca.",
    en: "Show your Peni code at the till next time and spend as much as you like.",
  },
  taken: { tr: "Bu peni başka bir hesaba geçmiş.", en: "These peni went to another account." },
  takenBody: { tr: "Sen almadıysan kasaya sorabilirsin.", en: "If it wasn't you, ask at the till." },
  expired: { tr: "Bu kodun süresi doldu.", en: "This code has closed." },
  expiredBody: { tr: "Peni kodları gün sonunda kapanır.", en: "Peni codes close at the end of the day." },
  cancelled: { tr: "Bu satış iade edildi.", en: "This sale was refunded." },
  cancelledBody: { tr: "İade edilen satışın penisi alınamaz.", en: "A refunded sale earns no peni." },
  notFound: { tr: "Bu peni kodu bulunamadı.", en: "We couldn't find this peni code." },

  // Typing the code
  codeTitle: { tr: "Ekrandaki kodu yaz", en: "Type the code on the screen" },
  codeBody: {
    tr: "Ödemeden sonra kasadaki küçük ekran 4 haneli bir kod gösterir. Onu buraya yaz.",
    en: "After you pay, the small screen at the till shows a 4-digit code. Type it here.",
  },
  whichCafe: { tr: "Hangi kafe?", en: "Which café?" },
  code: { tr: "Kod", en: "Code" },
  scanInstead: { tr: "Kamerayla QR'ı okutmak daha hızlı.", en: "Scanning the QR with your camera is quicker." },
  another: { tr: "Başka bir kod yaz", en: "Type another code" },

  // Signing in
  signInFirst: { tr: "Peni'yi almak için giriş yap.", en: "Sign in to take your peni." },
  email: { tr: "E-posta", en: "Email" },
  sendCode: { tr: "Kod gönder", en: "Send code" },
  sending: { tr: "Gönderiliyor…", en: "Sending…" },
  codeSent: { tr: "6 haneli kodu şu adrese gönderdik:", en: "We sent a 6-digit code to" },
  emailCode: { tr: "E-postadaki kod", en: "Code from the email" },
  signInAndTake: { tr: "Giriş yap ve al", en: "Sign in and take it" },
  signIn: { tr: "Giriş yap", en: "Sign in" },
  otherEmail: { tr: "Başka bir e-posta", en: "Another email" },
  emailOff: { tr: "E-postayla giriş şu an kapalı.", en: "Email sign-in is off right now." },
  signedInAs: { tr: "Giriş yapıldı", en: "Signed in" },
} as const;

export type TextKey = keyof typeof TEXT;

export function text(lang: Lang) {
  return (key: TextKey) => TEXT[key][lang];
}

export type T = ReturnType<typeof text>;

/** What to show for a failed call: the Turkish copy, or the server's English message. */
export function errorText(error: unknown, lang: Lang): string {
  if (error instanceof PeniApiError) return lang === "tr" ? error.message : error.serverMessage;
  return lang === "tr" ? "Bir şeyler ters gitti. Tekrar dene." : "Something went wrong. Try again.";
}
