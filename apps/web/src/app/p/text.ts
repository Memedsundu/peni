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
    tr: "Bir sonraki siparişte kasada ödeme kodunu göster, istediğin kadarını harca.",
    en: "Show your payment code at the till next time and spend as much as you like.",
  },
  mySpendCode: { tr: "Ödeme kodum", en: "My payment code" },

  // Ödeme kodum (piece 11)
  spendTitle: { tr: "Ödeme kodun", en: "Your payment code" },
  spendHelp: {
    tr: "Kasada bu QR'ı okut ya da kodu söyle. Ne kadar peni harcayacağını kasada söylersin.",
    en: "Let the till scan this QR, or read out the code. Say at the till how many peni to spend.",
  },
  spendValid: { tr: "Kalan süre", en: "Valid for" },
  spendRenew: { tr: "Yeni kod al", en: "Get a new code" },
  spendWhichCafe: { tr: "Hangi kafede ödüyorsun?", en: "Where are you paying?" },
  spendNoCafe: {
    tr: "Henüz bir kafeye üye değilsin. Bir alışverişin penisini aldığında kafeye katılırsın.",
    en: "You're not a member of any café yet. Taking the peni from a purchase makes you one.",
  },
  otherCafe: { tr: "Başka bir kafe", en: "Another café" },
  signInToSpend: { tr: "Peni harcamak için giriş yap.", en: "Sign in to spend peni." },
  taken: { tr: "Bu peni başka bir hesaba geçmiş.", en: "These peni went to another account." },
  takenBody: { tr: "Sen almadıysan kasaya sorabilirsin.", en: "If it wasn't you, ask at the till." },
  expired: { tr: "Bu kodun süresi doldu.", en: "This code has closed." },
  expiredBody: { tr: "Peni kodları gün sonunda kapanır.", en: "Peni codes close at the end of the day." },
  cancelled: { tr: "Bu satış iade edildi.", en: "This sale was refunded." },
  cancelledBody: { tr: "İade edilen satışın penisi alınamaz.", en: "A refunded sale earns no peni." },
  notFound: { tr: "Bu peni kodu bulunamadı.", en: "We couldn't find this peni code." },

  // Ismarlama (piece 12). {name}, {n} and {h} are filled in with fill().
  treats: { tr: "Ismarlamalar", en: "Treats" },
  treatSomeone: { tr: "Birine ısmarla", en: "Treat someone" },
  treatWhichCafe: { tr: "Hangi kafede ısmarlıyorsun?", en: "At which café?" },
  treatWho: { tr: "Kime ısmarlıyorsun?", en: "Who are you treating?" },
  treatOnlyHere: {
    tr: "Peni yalnız bu kafede geçer; bu yüzden kafenin üyelerine ısmarlayabilirsin.",
    en: "Peni only work at this café, so you can treat its members.",
  },
  recents: { tr: "Son ısmarladıkların", en: "People you treated" },
  byList: { tr: "Üyeler", en: "Members" },
  byCode: { tr: "Peni kodu", en: "Peni code" },
  byPhone: { tr: "Telefon", en: "Phone" },
  searchMembers: { tr: "İsimle ara", en: "Search by name" },
  noMembers: { tr: "Profilini gösteren üye bulunamadı.", en: "No members who show their profile." },
  listHelp: {
    tr: "Listede yalnız profilini gösteren üyeler var. Arkadaşın yoksa Peni kodunu sor.",
    en: "Only members who show their profile are listed. If your friend isn't here, ask for their Peni code.",
  },
  codeHelpTreat: {
    tr: "Arkadaşının Peni kodu, kendi Ismarlamalar sayfasında yazar.",
    en: "Your friend's Peni code is on their own Treats page.",
  },
  phoneNumber: { tr: "Telefon numarası", en: "Phone number" },
  find: { tr: "Bul", en: "Find" },
  change: { tr: "Değiştir", en: "Change" },
  howMuch: { tr: "Kaç peni?", en: "How many peni?" },
  yourBalance: { tr: "Bakiyen", en: "Your balance" },
  other: { tr: "Başka", en: "Other" },
  note: { tr: "Not (isteğe bağlı)", en: "Note (optional)" },
  notePlaceholder: { tr: "Afiyet olsun!", en: "Enjoy!" },
  treat: { tr: "Ismarla", en: "Treat" },
  treatTo: { tr: "{name} {n} peni ısmarla", en: "Treat {name} to {n} peni" },
  sent: { tr: "{name} {n} peni ısmarladın", en: "You treated {name} to {n} peni" },
  sentBody: {
    tr: "Kabul edince peni onun hesabına geçer. {h} saat içinde kabul edilmezse sana geri döner.",
    en: "They get the peni when they accept. If not accepted within {h} hours, the peni come back to you.",
  },
  shareHelp: { tr: "Bağlantıyı gönder, haberi olsun.", en: "Send them the link so they know." },
  share: { tr: "Bağlantıyı paylaş", en: "Share the link" },
  copied: { tr: "Bağlantı kopyalandı", en: "Link copied" },
  shareText: { tr: "Sana {n} peni ısmarladım", en: "I treated you to {n} peni" },
  takeBack: { tr: "Geri al", en: "Take back" },
  takenBack: { tr: "Geri aldın; peni bakiyene döndü.", en: "Taken back; the peni are in your balance again." },
  treatAnother: { tr: "Başka birine ısmarla", en: "Treat someone else" },
  signInToTreat: { tr: "Ismarlamak için giriş yap.", en: "Sign in to treat someone." },
  treatNoCafe: {
    tr: "Henüz bir kafeye üye değilsin. Bir alışverişin penisini aldığında kafeye katılırsın.",
    en: "You're not a member of any café yet. Taking the peni from a purchase makes you one.",
  },

  // One treat, by its link
  treatedYou: { tr: "{name} sana ısmarladı", en: "{name} treated you" },
  treatedSomeone: { tr: "{name} bir arkadaşına ısmarladı", en: "{name} treated a friend" },
  ifForYou: { tr: "Senin içinse giriş yap, sonra kabul et.", en: "If it's for you, sign in, then accept it." },
  acceptBy: { tr: "Son kabul", en: "Accept by" },
  accept: { tr: "Kabul et", en: "Accept" },
  accepting: { tr: "Kabul ediliyor…", en: "Accepting…" },
  decline: { tr: "İstemiyorum", en: "No, thanks" },
  inYourAccount: { tr: "hesabına geçti", en: "is in your account" },
  declinedBody: { tr: "Peni gönderene geri döndü.", en: "The peni went back to the sender." },
  thank: { tr: "Teşekkür et", en: "Say thanks" },
  thanked: { tr: "Teşekkür ettin", en: "You said thanks" },
  theyThanked: { tr: "{name} teşekkür etti", en: "{name} said thanks" },
  notForYou: { tr: "Bu ısmarlama başka biri için.", en: "This treat is for someone else." },
  treatGone: { tr: "Bu ısmarlama artık açık değil.", en: "This treat isn't open any more." },
  treatNotFound: { tr: "Bu ısmarlama bulunamadı.", en: "We couldn't find this treat." },
  myTreats: { tr: "Ismarlamalarım", en: "My treats" },

  // Ismarlamalar list
  waitingForYou: { tr: "Seni bekleyenler", en: "Waiting for you" },
  earlier: { tr: "Geçmiş", en: "Earlier" },
  noTreats: { tr: "Henüz ısmarlama yok.", en: "No treats yet." },
  yourCode: { tr: "Peni kodun", en: "Your Peni code" },
  yourCodeHelp: { tr: "Sana ısmarlamak isteyen bu kodu kullanabilir.", en: "Friends can use it to treat you." },
  inPending: { tr: "Seni bekliyor", en: "Waiting for you" },
  inAccepted: { tr: "Kabul ettin", en: "Accepted" },
  inDeclined: { tr: "İstemedin", en: "Declined" },
  inExpired: { tr: "Süresi doldu", en: "Ran out" },
  outPending: { tr: "Kabul bekleniyor", en: "Not accepted yet" },
  outAccepted: { tr: "Kabul etti", en: "Accepted" },
  outDeclined: { tr: "İstemedi, sana döndü", en: "Declined, came back to you" },
  outCancelled: { tr: "Geri aldın", en: "Taken back" },
  outExpired: { tr: "Süresi doldu, sana döndü", en: "Ran out, came back to you" },
  from: { tr: "Gönderen", en: "From" },
  to: { tr: "Alan", en: "To" },

  // Askıda kahve (piece 13)
  askidaTitle: { tr: "Askıda kahve", en: "Askıda kahve" },
  askidaWaiting: { tr: "Askıda {goods} var", en: "{goods} waiting on the askı" },
  askidaNothing: { tr: "Askı şu an boş", en: "The askı is empty right now" },
  askidaPeni: { tr: "Askıda {n} peni", en: "{n} peni on the askı" },
  askidaHow: {
    tr: "Kasada isteyen herkes askıdan alabilir. Hesap ya da sınır yok; birinin bıraktığını ihtiyacı olan alır.",
    en: "Anyone can ask for one at the till. No account, no limit: what someone leaves goes to whoever needs it.",
  },
  askidaWeek: { tr: "Son 7 günde askıdan {n} ikram", en: "{n} treats from the askı in the last 7 days" },
  askidaOff: { tr: "Bu kafede askı kapalı.", en: "This café has no askı." },
  askidaLeave: { tr: "Askıya bırak", en: "Leave some on the askı" },
  askidaLeaveN: { tr: "Askıya {n} peni bırak", en: "Leave {n} peni on the askı" },
  askidaShowName: { tr: "Adım duvarda görünsün", en: "Show my name on the wall" },
  askidaMatch: { tr: "Kafe her bırakılana %{n} ekliyor.", en: "The café adds {n}% to everything left." },
  askidaLeft: { tr: "Askıya {n} peni bıraktın. Teşekkürler!", en: "You left {n} peni on the askı. Thank you!" },
  askidaMatched: { tr: "Kafe de {n} peni ekledi.", en: "The café added {n} peni too." },
  askidaAtTill: {
    tr: "Kasada nakit ya da kartla da bırakabilirsin: siparişine “Askıya çay” ekletmen yeter.",
    en: "You can also leave one at the till with cash or card: just ask for “Askıya çay” on your order.",
  },
  askidaSignIn: { tr: "Peninle askıya bırakmak için giriş yap.", en: "Sign in to leave peni on the askı." },
  askidaNoPeni: {
    tr: "Bu kafede henüz penin yok. Bir alışverişin penisini aldığında buradan askıya bırakabilirsin.",
    en: "You have no peni at this café yet. Once you take the peni from a purchase, you can leave some here.",
  },
  askidaWall: { tr: "Askı duvarı", en: "The askı wall" },
  wallDonation: { tr: "{name} {n} peni bıraktı", en: "{name} left {n} peni" },
  wallSomeone: { tr: "Bir üye", en: "A member" },
  wallTill: { tr: "Kasada {n} peni bırakıldı", en: "{n} peni left at the till" },
  wallMatch: { tr: "Kafe {n} peni ekledi", en: "The café added {n} peni" },
  wallEmpty: { tr: "Henüz kimse bırakmadı. İlk sen ol.", en: "Nobody has left any yet. Be the first." },

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

/** "{name} {n} peni ısmarla" with its blanks filled. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));
}

/** What to show for a failed call: the Turkish copy, or the server's English message. */
export function errorText(error: unknown, lang: Lang): string {
  if (error instanceof PeniApiError) return lang === "tr" ? error.message : error.serverMessage;
  return lang === "tr" ? "Bir şeyler ters gitti. Tekrar dene." : "Something went wrong. Try again.";
}
