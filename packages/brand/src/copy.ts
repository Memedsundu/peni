/**
 * Shared copy (design-system.md §9–§11): the strings both platforms ship, exactly as written
 * in the spec. Voice: warm, short, *sen*; one sentence where possible; no blame; no
 * exclamation marks except "Hazır!" and "Afiyet olsun!".
 *
 * Rules enforced by `test/copy-lint.test.ts` (which also scans this file):
 * - No "≈ → ✓ ☞ ❦" or emoji in strings that reach the web (the web fonts lack them, D23).
 *   Goods lines are returned WITHOUT the "≈": web prefixes `<Approx/>`, mobile "≈ ".
 * - peni is a common noun: "penin", "peniyi", never an apostrophe.
 * - NEVER a suffix on a dynamic café name; use "için" or a legend [G10].
 *
 * Glossary (§11): peni · ikram · askı · askıdan al · askıya bırak · ısmarla · Peni masası ·
 * Günün sorusu · Masa · Tezgâh · kod (P-003) · Peni kodu.
 */
import { formatNumber, formatPeni, formatTL, goodsName, numberWord, SEP, trUpper } from "./format";

/* ========================================================================================== */
/* Order status                                                                               */
/* ========================================================================================== */

/** Same union as `FulfillmentStatus` in `@peni/api`. */
export type OrderStatus = "submitted" | "accepted" | "ready" | "collected" | "rejected" | "cancelled" | "no_show";

export const activeStatuses: readonly OrderStatus[] = ["submitted", "accepted", "ready"];
export const terminalStatuses: readonly OrderStatus[] = ["collected", "rejected", "cancelled", "no_show"];

/** Status words (§11). `fulfillmentLabelsTr` in `@peni/api` must match these. */
export const statusWords: Record<OrderStatus, string> = {
  submitted: "İletildi",
  accepted: "Hazırlanıyor",
  ready: "Hazır",
  collected: "Teslim edildi",
  rejected: "Kafe yetişemedi",
  cancelled: "İptal edildi",
  no_show: "Teslim alınmadı",
};

/** StatusTrack stops, evenly spaced (§6.3). */
export const statusTrackStops = ["İletildi", "Hazırlanıyor", "Hazır", "Teslim"] as const;

/** Index of the current StatusTrack stop for a status (rejected / cancelled / no_show stop where they were). */
export function statusTrackIndex(status: OrderStatus): number {
  switch (status) {
    case "submitted":
      return 0;
    case "accepted":
      return 1;
    case "ready":
      return 2;
    case "collected":
      return 3;
    default:
      return 0;
  }
}

/** History chips (§9.5): word + lucide icon + tone. */
export const statusChips: Record<
  "collected" | "rejected" | "cancelled" | "no_show",
  { label: string; icon: "Check" | "Undo2" | "CircleAlert" | null; tone: "success" | "neutral" | "warning" }
> = {
  collected: { label: "Teslim edildi", icon: "Check", tone: "success" },
  rejected: { label: "Kafe yetişemedi", icon: "Undo2", tone: "neutral" },
  cancelled: { label: "İptal edildi", icon: null, tone: "neutral" },
  no_show: { label: "Teslim alınmadı", icon: "CircleAlert", tone: "warning" },
};

/** The order fiş (§9.4, §10.3). */
export const orderCopy = {
  /** Fiş legend: "MODA KAHVESİ · SİPARİŞ". */
  legend: (cafeName: string) => `${trUpper(cafeName)}${SEP}SİPARİŞ`,
  headline: {
    submitted: "Kafeye iletildi. Barista birazdan onaylar.",
    accepted: "Hazırlanıyor.",
    ready: "Hazır!",
    collected: "Afiyet olsun.",
    rejected: "Kafe şu an yetişemiyor.",
    cancelled: "İptal edildi.",
    no_show: "Teslim alınmadı.",
  } satisfies Record<OrderStatus, string>,
  /** Only with real median data [G14]: "Hazırlanıyor · genelde 5–8 dk". */
  acceptedWithMedian: (low: number, high: number) => `Hazırlanıyor${SEP}genelde ${low}–${high} dk`,
  /** "Kasada P-003 kodunu söyle, ₺55 öde." / "Kasada P-003 kodunu söyle. Ödeme yok." */
  readyBody: (code: string, dueKurus: number) =>
    dueKurus > 0 ? `Kasada ${code} kodunu söyle, ${formatTL(dueKurus)} öde.` : `Kasada ${code} kodunu söyle. Ödeme yok.`,
  /** Document title while ready: "Hazır · P-003". */
  readyTitle: (code: string) => `Hazır${SEP}${code}`,
  /** Mobile `announceForAccessibility`: "Hazır. Kasada P-003 kodunu söyle." */
  readyAnnouncement: (code: string) => `Hazır. Kasada ${code} kodunu söyle.`,
  /** With `earnedPeni` [G7]: "+2 peni cüzdanında". */
  earned: (peni: number) => `${formatPeni(peni, { signed: true })} cüzdanında`,
  rejectedNote: (reason: string) => `Kafenin notu: ${reason}`,
  /** "Kullandığın 90 penin cüzdanına döndü." */
  rejectedPeniBack: (peni: number) => `Kullandığın ${formatPeni(peni)}n cüzdanına döndü.`,
  /** "Askıdaki çay yerine döndü." */
  rejectedAskiBack: (itemName?: string | null) => `Askıdaki ${itemName ? goodsName(itemName) : "ikram"} yerine döndü.`,
  cancelledPeniBack: "Kullandığın peni cüzdanına döndü.",
  noShowBody: "Kullandığın peni cüzdanına döndü. Üst üste iki sipariş teslim alınmazsa bu kafede önden sipariş kapanır.",
  peniLine: "Peni",
  askiLine: "İkram",
  dueLabel: "Kasada ödenecek",
  noPayment: "Kasada ödeme yok",
  /** [G7b] "Peni kodun: M7K-42Q". */
  memberCode: (code: string) => `Peni kodun: ${code}`,
  reorder: "Yeniden sipariş ver",
  backToCafe: "Kafeye dön",
  cancel: "İptal et",
  cancelSheet: {
    title: "Siparişi iptal edelim mi?",
    body: "Barista henüz başlamadı; iptal edersen kullandığın peni cüzdanına döner.",
    confirm: "İptal et",
    keep: "Vazgeç",
  },
  notFound: "Bu sipariş bulunamadı.",
  notFoundAction: "Siparişlerim",
  headerTitle: "Sipariş",
  /** Active-order chip: "P-003 · Hazırlanıyor". */
  chip: (code: string, status: OrderStatus) => `${code}${SEP}${statusWords[status]}`,
} as const;

/* ========================================================================================== */
/* Cart and peni (§9.3)                                                                       */
/* ========================================================================================== */

export const cartCopy = {
  title: "Siparişin",
  /** CartBar left: "2 ürün". */
  itemCount: (n: number) => `${formatNumber(n)} ürün`,
  open: "Sepeti gör",
  /** "1 × Latte". */
  line: (qty: number, name: string) => `${formatNumber(qty)} × ${name}`,
  noteLabel: "Not (isteğe bağlı)",
  notePlaceholder: "az şekerli, yulaf sütlü…",
  /** Peni toggle label: "55 penini kullan". */
  usePeni: (usable: number) => `${formatPeni(usable)}ni kullan`,
  /** Peni toggle hint when capped below the balance. */
  usePeniCap: (usable: number) => `Bu siparişte en fazla ${formatPeni(usable)} kullanabilirsin.`,
  /** Earn preview, with the amount in bold: "Kasada ödeyince **+2 peni** kazanırsın". */
  earnPreview: (peni: number) => ({ before: "Kasada ödeyince ", amount: formatPeni(peni, { signed: true }), after: " kazanırsın" }),
  earnPreviewNote: "Peniyle ödenen kısım peni kazandırmaz.",
  dueLabel: "Kasada ödenecek",
  noPayment: "Kasada ödeme yok",
  /** "Siparişi gönder · ₺55", or "Siparişi gönder" when nothing is due. */
  submit: (dueKurus: number) => (dueKurus > 0 ? `Siparişi gönder${SEP}${formatTL(dueKurus)}` : "Siparişi gönder"),
  sending: "Gönderiliyor…",
  empty: "Menüden bir şey seç. Ödemeyi kasada yaparsın.",
  /** "Simit şu an tükendi; sepetine eklemedik." */
  dropped: (name: string) => `${name} şu an tükendi; sepetine eklemedik.`,
  soldOut: "Tükendi",
  add: (itemName: string) => `${itemName} ekle`,
  remove: (itemName: string) => `${itemName} azalt`,
} as const;

export const peniCopy = {
  /** "Sende **90 peni**". */
  balance: (peni: number) => ({ before: "Sende ", amount: formatPeni(peni) }),
  member: "Üyesin",
  /** "Her harcamada %5 peni · 1 peni = ₺1, yalnız bu kafede". */
  earnRule: (earnRatePercent: number) => `Her harcamada %${formatNumber(earnRatePercent)} peni${SEP}1 peni = ₺1, yalnız bu kafede`,
  walletRule: "1 peni = ₺1, yalnız bu kafe için.",
  approxSr: "yaklaşık",
  /** "2 kafede peni biriktirdin." */
  walletSummary: (cafes: number) => `${formatNumber(cafes)} kafede peni biriktirdin.`,
  coinPurse: "JETON KESESİ",
  movements: "HAREKETLER",
  peniCode: "Peni kodum",
  peniCodeBody: "Kasada bu kodu göster, peni kazan.",
} as const;

/* ========================================================================================== */
/* Askı (§6.2, §9.3, §9.10)                                                                   */
/* ========================================================================================== */

export interface AskiCaptionInput {
  itemsAvailable: number;
  referenceItemName: string | null | undefined;
  claimsPerDay: number;
  claimedLast7Days: number;
  donatedLast7DaysPeni: number;
}

/**
 * The rail caption (§6.2). The rail is `aria-hidden`; this text is the accessible text and is
 * never duplicated as an `aria-label`.
 * - line1 (`text-item`): "Askıda 7 çay bekliyor" / "Askı şu an boş."
 * - line2 (`meta ink-2`): "İsteyen alır, günde bir tane."
 * - line3 (`meta ink-2`): "Bu hafta 12 ikram içildi · 235 peni bırakıldı", each part dropped
 *   when it would identify takers (< 3 ikram, D8) or is zero; null when both are dropped.
 */
export function askiCaption(a: AskiCaptionInput): { line1: string; line2: string; line3: string | null } {
  const item = a.referenceItemName ? goodsName(a.referenceItemName) : "ikram";
  const line1 = a.itemsAvailable > 0 ? `Askıda ${formatNumber(a.itemsAvailable)} ${item} bekliyor` : "Askı şu an boş.";
  const line2 = `İsteyen alır, günde ${numberWord(Math.max(1, a.claimsPerDay))} tane.`;
  const parts: string[] = [];
  if (a.claimedLast7Days >= 3) parts.push(`Bu hafta ${formatNumber(a.claimedLast7Days)} ikram içildi`);
  if (a.donatedLast7DaysPeni > 0) parts.push(`${parts.length ? "" : "Bu hafta "}${formatPeni(a.donatedLast7DaysPeni)} bırakıldı`);
  return { line1, line2, line3: parts.length ? parts.join(SEP) : null };
}

export const askiCopy = {
  legend: "ASKIDA KAHVE",
  whatIs: "Askı nedir?",
  explainer:
    "Askı, eski mahalle sebilleri gibi: herkese açık, kimse soru sormaz. Biri bırakır, isteyen alır; kimin aldığı hiçbir yerde görünmez.",
  take: "Askıdan al",
  give: "Askıya bırak",
  /** Home card line: "Askıda 7 çay" / "Askı boş". */
  cardLine: (itemsAvailable: number, referenceItemName: string | null | undefined) =>
    itemsAvailable > 0
      ? `Askıda ${formatNumber(itemsAvailable)} ${referenceItemName ? goodsName(referenceItemName) : "ikram"}`
      : "Askı boş",
  /** Named donors only, max 3: "Ayşe K. 1 çay bıraktı · bugün". */
  donorLine: (donorName: string, what: string, day: string) => `${donorName} ${what} bıraktı${SEP}${day}`,
  takeSheet: {
    title: "Askıdan bir ikram",
    which: "Hangisi?",
    notEnough: "Askıda yeterli peni yok",
    body: "Siparişine eklenir, kasada ₺0 görünür. Adın kimseye görünmez.",
    confirm: "Siparişime ekle",
    cancel: "Vazgeç",
  },
  /** Take states [G3]; each replaces the chips and the primary. */
  takeStates: {
    claimedToday: "Bugünkü ikramını aldın. Yarın yine gel.",
    tooNew: (daysLeft: number, minDays = 7) =>
      `Askıdan almak için üyeliğinin ${formatNumber(minDays)} günlük olması gerekiyor. ${formatNumber(daysLeft)} gün kaldı.`,
    blocked: "Şu an askıdan alamıyorsun. Kasaya sorabilirsin.",
    empty: "Askı şu an boş. Biri bıraktığında burada görünür.",
    orderingBlocked: "Askıdan almak için sipariş gerekiyor; kafe şu an uygulamadan sipariş almıyor.",
    nonMember: "Askıdan almak için kafeye katıl. Üyelik ücretsiz.",
    nonMemberAction: "Kafeye katıl",
  },
  giveSheet: {
    title: "Askıya bırak",
    what: "Ne bırakıyorsun?",
    /** Choice chip: "1 çay · 30 peni". */
    chip: (itemName: string, peni: number) => `1 ${goodsName(itemName)}${SEP}${formatPeni(peni)}`,
    other: "Başka",
    stepperLabel: "Peni",
    /** Disabled reason: "Bakiyen 25". */
    balance: (peni: number) => `Bakiyen ${formatNumber(peni)}`,
    nameSwitch: "Adım askıda görünsün",
    nameHint: "Kapalıyken bağışın adsız görünür.",
    /** [G12] "Kafe her bağışa %50 ekliyor." */
    match: (percent: number) => `Kafe her bağışa %${formatNumber(percent)} ekliyor.`,
    /** Primary (ink): "1 çay bırak · 30 peni"; custom: "45 peni bırak". */
    submitItem: (itemName: string, peni: number) => `1 ${goodsName(itemName)} bırak${SEP}${formatPeni(peni)}`,
    submitCustom: (peni: number) => `${formatPeni(peni)} bırak`,
    /** Not a member yet: the sheet says what's needed before anything else. */
    nonMember: "Askıya bırakmak için kafeye katıl. Üyelik ücretsiz.",
  },
  /** Toast after one's own donation: "1 çay askıya asıldı." */
  hungToast: (count: number, itemName: string | null | undefined) =>
    `${formatNumber(count)} ${itemName ? goodsName(itemName) : "ikram"} askıya asıldı.`,
  /** Toast addition with a café match: "Kafe de 15 peni ekledi." */
  matchToast: (peni: number) => `Kafe de ${formatPeni(peni)} ekledi.`,
  /** Staff till (§9.10). */
  till: {
    title: "Kasada askıya bırakılanlar",
    /** "Çay · 30 peni". */
    row: (itemName: string, peni: number) => `${itemName}${SEP}${formatPeni(peni)}`,
    /** "Askıya ekle · 2 çay (60 peni)". */
    submit: (count: number, itemName: string, peni: number) =>
      `Askıya ekle${SEP}${formatNumber(count)} ${goodsName(itemName)} (${formatPeni(peni)})`,
    /** "Askıya 2 çay eklendi." */
    toast: (count: number, itemName: string) => `Askıya ${formatNumber(count)} ${goodsName(itemName)} eklendi.`,
  },
  /** The neutral staff ticket chip for an askı line. Never turquoise, never next to the customer name. */
  ticketChip: "ikram",
} as const;

/* ========================================================================================== */
/* Masa (§6.5, §9.3)                                                                          */
/* ========================================================================================== */

export const masaCopy = {
  section: "Masa",
  todayLegend: "BUGÜN MASADA",
  questionLegend: "GÜNÜN SORUSU",
  eventLegend: "PENİ MASASI",
  /** "6/14 yer dolu · sen de geliyorsun" / "Masa doldu". */
  seats: (count: number, capacity: number, rsvpedByMe = false) =>
    `${count >= capacity ? "Masa doldu" : `${formatNumber(count)}/${formatNumber(capacity)} yer dolu`}${rsvpedByMe ? `${SEP}sen de geliyorsun` : ""}`,
  rsvp: "Geliyorum",
  rsvped: "Geliyorsun",
  full: "Masa doldu",
  past: "GEÇTİ",
  addToCalendar: "Takvime ekle",
  share: "Paylaş",
  linkCopied: "Bağlantı kopyalandı.",
  /** "12 cevabın hepsini gör". */
  allAnswers: (n: number) => `${formatNumber(n)} cevabın hepsini gör`,
  answer: "Sen de cevapla",
  answerLabel: "Cevabın",
  answered: "Bugünkü cevabın masada.",
  answerJoin: "Cevap yazmak için kafeye katıl.",
  heartJoin: "Kalp bırakmak için kafeye katıl.",
  heartJoinAction: "Katıl",
  /** "4 yorum". */
  comments: (n: number) => `${formatNumber(n)} yorum`,
  commentLabel: "Yorum yaz",
  empty: "Masa bugün sakin. Kafe yeni bir soru sorunca burada görürsün.",
} as const;

/* ========================================================================================== */
/* Staff (§9.10)                                                                              */
/* ========================================================================================== */

/** Elapsed chip on a staff ticket, from `submittedAt` (from `acceptedAt` once accepted). */
export function elapsedChip(
  minutes: number,
  /** "ready": counted from `readyAt`. The bar is done, so nothing is late: from 10 min the cup is just waiting. */
  stage: "making" | "ready" = "making",
): {
  label: string;
  icon: "Clock" | "Timer" | "AlarmClock";
  tone: "neutral" | "warning" | "danger";
} {
  const m = Math.max(0, Math.floor(minutes));
  if (stage === "ready") {
    return m >= 10
      ? { label: `${formatNumber(m)} dk bekliyor`, icon: "Clock", tone: "warning" }
      : { label: `${formatNumber(m)} dk`, icon: "Clock", tone: "neutral" };
  }
  if (m >= 10) return { label: `${formatNumber(m)} dk${SEP}gecikiyor`, icon: "AlarmClock", tone: "danger" };
  if (m >= 5) return { label: `${formatNumber(m)} dk`, icon: "Timer", tone: "warning" };
  return { label: `${formatNumber(m)} dk`, icon: "Clock", tone: "neutral" };
}

export const staffCopy = {
  sections: { tezgah: "Tezgâh", aski: "Askı", rapor: "Rapor", ayarlar: "Ayarlar" },
  columns: { new: "Yeni", accepted: "Hazırlanıyor", ready: "Hazır" },
  /** "YENİ · 2" (≥768 column header). */
  columnHeader: (label: string, n: number) => `${label}${SEP}${formatNumber(n)}`,
  /** "Yeni (2)" (<768 segmented). */
  segment: (label: string, n: number) => `${label} (${formatNumber(n)})`,
  columnEmpty: {
    new: "Yeni sipariş yok. Gelince ses çalar.",
    accepted: "Hazırlanan sipariş yok.",
    ready: "Bekleyen sipariş yok.",
  },
  action: {
    submitted: "Kabul et",
    accepted: "Hazır",
    ready: "Ödendi, teslim edildi",
    closesAtTill: "Kasada kapanacak",
  },
  reject: "Yetişemiyoruz",
  noShow: "Gelmedi",
  rejectSheet: {
    title: "Müşteriye ne diyelim?",
    reasons: ["Malzeme bitti", "Şu an çok yoğunuz", "Kapanmak üzereyiz"],
    confirm: "Siparişi geri çevir",
  },
  /** "Not: az şekerli, yulaf sütlü". */
  note: (text: string) => `Not: ${text}`,
  /** "Kasada ₺55" / "Kasada ödeme yok". */
  payment: (dueKurus: number) => (dueKurus > 0 ? `Kasada ${formatTL(dueKurus)}` : "Kasada ödeme yok"),
  /** Undo toast: "P-004 · Hazır" + "Geri al". */
  bumpToast: (code: string, label: string) => `${code}${SEP}${label}`,
  undo: "Geri al",
  /** Document title with new tickets: "(2) Yeni sipariş · Tezgâh". */
  newOrdersTitle: (n: number) => `(${formatNumber(n)}) Yeni sipariş${SEP}Tezgâh`,
  ordersOpen: "Uygulama siparişleri: Açık",
  ordersPaused: "Uygulama siparişleri: Durdu",
  /** The pill's qualifier on phones, where "Uygulama siparişleri:" doesn't fit. */
  ordersShort: "Uygulama:",
  pauseSheet: {
    title: "Uygulama siparişlerini durdur",
    question: "Ne kadar durduralım?",
    options: ["15 dakika", "30 dakika", "Gün sonuna kadar"],
  },
  /** "Uygulama siparişleri durdu · 12 dk kaldı" [G20], or without a countdown. */
  pausedBanner: (minutesLeft?: number | null) =>
    minutesLeft != null ? `Uygulama siparişleri durdu${SEP}${formatNumber(minutesLeft)} dk kaldı` : "Uygulama siparişleri durdu",
  resume: "Şimdi aç",
  soundOn: "Ses açık",
  soundOff: "Ses kapalı",
  soundOffBanner: "Ses kapalı. Yeni siparişleri duymayabilirsin.",
  soundOffAction: "Sesi aç",
  shiftStart: {
    title: "Vardiyaya hoş geldin",
    body: "Yeni sipariş gelince ses çalsın diye bir kez dokun.",
    action: "Vardiyayı başlat",
  },
  gate: { title: "Kafe paneli", keyLabel: "Personel anahtarı", submit: "Gir", empty: "Önce anahtarı yaz." },
  logout: "Çıkış",
  logoutConfirm: {
    title: "Panelden çıkmak istiyor musun?",
    body: "Geri girmek için personel anahtarı gerekecek.",
  },
  /** Under a failed poll's banner: the board below is the last good one. */
  staleBoard: "Gördüğün liste güncel olmayabilir.",
  tillOff: "Askı bu kafede kapalı.",
  tillNoItems: "Menüde askıya uygun ürün yok.",
  report: {
    title: "Son 30 gün",
    issued: "Dağıtılan peni",
    spent: "Harcanan peni",
    outstanding: "Henüz harcanmayan",
    outstandingNote: "Bu, müşterilerin henüz kullanmadığı ürün hakkı.",
    askiIn: "Askıya gelen",
    /** "üyeler 420 · kasa 210 · kafe 150". */
    askiInSplit: (members: number, till: number, cafe: number) =>
      `üyeler ${formatNumber(members)}${SEP}kasa ${formatNumber(till)}${SEP}kafe ${formatNumber(cafe)}`,
    askiOut: "Askıdan içilen",
    /** "27 ikram". */
    askiOutValue: (n: number) => `${formatNumber(n)} ikram`,
    members: "Üye sayısı",
  },
} as const;

/* ========================================================================================== */
/* Errors and common actions                                                                  */
/* ========================================================================================== */

/**
 * An error for a banner that has its own "Tekrar dene" button: the sentence without its
 * trailing "Tekrar dene." ("Bağlantı kurulamadı. Tekrar dene." → "Bağlantı kurulamadı."), so the
 * action is never said twice.
 */
export function withoutRetry(message: string): string {
  const stripped = message.replace(/\s*Tekrar dene\.$/u, "").trim();
  return stripped || message;
}

/** Error fallbacks used when the API gives no message of its own. Always shown with `CircleAlert`. */
export const errorCopy = {
  generic: "Bir şeyler ters gitti. Tekrar dene.",
  network: "Bağlantı kurulamadı. Tekrar dene.",
  retry: "Tekrar dene",
  orderSend: "Gönderilemedi. Sepetin duruyor, tekrar dene.",
  change: "Değiştirilemedi. Tekrar dene.",
  /** Staff bump failures: "Kaydedilemedi: {message}". */
  save: (message: string) => `Kaydedilemedi: ${message}`,
  cafesLoad: "Kafeler yüklenemedi.",
  cafeNotFound: "Bu kafe masada yok.",
  cafeNotFoundAction: "Kafelere dön",
  orderNotFound: "Bu sipariş bulunamadı.",
  staffKey: "Anahtar tutmadı.",
  phone: "Numara 5 ile başlamalı ve 10 haneli olmalı.",
  code: "Kod tutmadı. Tekrar dener misin?",
  codeLocked: "Çok fazla hatalı deneme oldu. Yeni bir kod iste.",
  giftNoMember: "Bu numarayla bu kafede üye bulunamadı.",
  giftSelf: "Kendine ısmarlayamazsın.",
} as const;

export const actionCopy = {
  cancel: "Vazgeç",
  close: "Kapat",
  ok: "Tamam",
  continue: "Devam",
  save: "Kaydet",
  signIn: "Giriş yap",
  signOut: "Çıkış yap",
  join: "Kafeye katıl",
  signInAndJoin: "Giriş yap ve katıl",
  joinAndAdd: "Katıl ve ekle",
  backToCafes: "Kafelere dön",
  browseCafes: "Kafelere bak",
  gift: "Ismarla",
  back: "Geri",
} as const;
