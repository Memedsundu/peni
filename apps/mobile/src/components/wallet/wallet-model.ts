/**
 * Pure wallet logic for Cüzdan, the ismarla sheet and Peni kodum (design-system.md §9.6,
 * §10.5, §10.6): names, goods, the HAREKETLER sentences, gift caps, phone digits. No React,
 * no fetch.
 *
 * The sentences match the web wallet (`apps/web/src/components/wallet/wallet-model.ts`) word
 * for word, so a gift reads the same on both platforms.
 */
import type { GiftDTO, LedgerEntryDTO, RecentRecipientDTO, RefItemDTO, WalletDTO } from "@peni/api";
import {
  capitalizeTr,
  dativeName,
  dativeTime,
  formatNumber,
  formatPeni,
  formatTime,
  goodsName,
  locativeTime,
  numberWord,
  relDay,
  SEP,
  trUpper,
} from "@peni/brand/format";

/**
 * The café's daily gift cap and expiry. The wallet DTO does not carry café settings yet, so
 * these are the defaults every café runs with today (`defaultSettings` in @peni/core). The
 * server still enforces the real value (GIFT_LIMIT is shown inline if it differs).
 */
export const DAILY_GIFT_LIMIT_PENI = 200;
export const GIFT_EXPIRY_HOURS = 24;
export const NOTE_MAX = 140;

/* ========================================================================================== */
/* Copy that only the wallet uses (§9.6)                                                      */
/* ========================================================================================== */

export const walletCopy = {
  title: "Cüzdan",
  signedOut: "Cüzdanını görmek için giriş yap.",
  loadError: "Cüzdanın yüklenemedi.",
  empty: "Henüz peni yok. Bir kafeye katıl; ilk siparişinden itibaren her harcamada peni birikir.",
  historyEmpty: "Kazandığın ve kullandığın peni burada görünür.",
  more: "Daha eskileri göster",
  incoming: "Sana ısmarlananlar",
  goToCafe: "Kafeye git",
  accept: "Kabul et",
  accepting: "Kabul ediliyor…",
  decline: "Geri çevir",
  thank: "Teşekkür et",
  cancelGift: "Geri al",
  cancelling: "Geri alınıyor…",
  afiyet: "Afiyet olsun!",
  /** "30 peni" + " cüzdanında." */
  inWallet: " cüzdanında.",
  declineSheet: {
    title: "Geri çevirelim mi?",
    /** "Peni Ayşe'ye döner." */
    body: (first: string) => `Peni ${dativeName(first)} döner.`,
  },
  /** "Teşekkürün Ayşe'ye iletildi." */
  thanked: (first: string) => `Teşekkürün ${dativeName(first)} iletildi.`,
} as const;

export const giftCopy = {
  /** "ADIM 2/3". */
  step: (i: number, n: number) => `ADIM ${i}/${n}`,
  cafeTitle: "Hangi kafede?",
  whoTitle: "Kime ısmarlıyorsun?",
  whatTitle: "Ne ısmarlıyorsun?",
  /** Done: "Mehmet'e 1 çay ısmarladın." */
  doneTitle: (first: string, what: string) => `${dativeName(first)} ${what} ısmarladın.`,
  noBalanceAnywhere: "Ismarlamak için önce bir kafede peni biriktir.",
  noBalanceHere: "Ismarlamak için önce bu kafede peni biriktir.",
  signedOut: "Ismarlamak için giriş yap.",
  recents: "Son ısmarladıkların",
  phoneLabel: "Telefon numarası",
  phoneHint: "Bu kafenin üyesi olmalı.",
  lookingUp: "Bu kafenin üyelerine bakılıyor…",
  lookingUpButton: "Bakılıyor…",
  /** "Mehmet K." + " · bu kafenin üyesi". */
  memberSuffix: `${SEP}bu kafenin üyesi`,
  other: "Başka",
  stepperLabel: "Peni",
  noteLabel: "Notun (isteğe bağlı)",
  notePlaceholder: "Afiyet olsun!",
  to: "Kime",
  dailyRule: `Günde en fazla ${formatPeni(DAILY_GIFT_LIMIT_PENI)} ısmarlayabilirsin.`,
  /** "Bugün 120 peni daha ısmarlayabilirsin." */
  dailyLeft: (peni: number) => `Bugün ${formatPeni(peni)} daha ısmarlayabilirsin.`,
  dailyReached: "Bugünkü ısmarlama sınırına ulaştın. Yarın yine ısmarlayabilirsin.",
  dailyReachedShort: "Bugünkü ısmarlama sınırına ulaştın.",
  returnRule: `Kabul edilmezse peni ${GIFT_EXPIRY_HOURS} saat içinde sana döner.`,
  /** "Ismarla · 30 peni". */
  submit: (peni: number) => `Ismarla${SEP}${formatPeni(peni)}`,
  whatsapp: "WhatsApp'ta haber ver",
  /** "Mehmet K. için · Moda Kahvesi". */
  forWhom: (label: string, cafeName: string) => `${label} için${SEP}${cafeName}`,
} as const;

export const koduCopy = {
  signedOut: "Peni kodunu görmek için giriş yap.",
  empty: "Peni kodun, bir kafeye katılınca burada olur.",
  /** Screen readers: "Moda Kahvesi için Peni kodun: FDY-2GG". */
  spoken: (cafeName: string, code: string) => `${cafeName} için Peni kodun: ${code}`,
  cafes: "Kafe",
} as const;

/* ========================================================================================== */
/* Names                                                                                      */
/* ========================================================================================== */

/** "Ayşe Yılmaz" → "Ayşe". */
export function firstName(displayName: string | null | undefined): string {
  const first = (displayName ?? "").trim().split(/\s+/)[0];
  return first || "Bir üye";
}

/** "Mehmet" + "K" → "Mehmet K.". */
export function shortName(first: string, lastInitial: string | null | undefined): string {
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

/** "Mehmet" + "K" → "MK" (the avatar). */
export function nameInitials(first: string, lastInitial: string | null | undefined): string {
  return trUpper(`${Array.from(first)[0] ?? ""}${lastInitial ?? ""}`);
}

/* ========================================================================================== */
/* Goods                                                                                      */
/* ========================================================================================== */

/** What one reference item costs in peni (1 peni = ₺1, rounded up to whole peni). */
export function itemPeni(item: RefItemDTO): number {
  return Math.ceil(item.priceKurus / 100);
}

/**
 * A gift amount as it is said in a headline: "1 çay", "2 Türk kahvesi" when the amount is
 * exactly whole items of a reference item, otherwise the plain "45 peni". A gift of 45 peni is
 * not "1 çay": headlines never round (§13, never a made-up value).
 */
export function giftWhat(peni: number, refItems: readonly RefItemDTO[] | null | undefined): string {
  for (const item of refItems ?? []) {
    const price = itemPeni(item);
    if (price > 0 && peni % price === 0 && peni / price >= 1) return `${formatNumber(peni / price)} ${goodsName(item.name)}`;
  }
  return formatPeni(peni).replace(" ", " ");
}

/** "1 çay" → "bir çay" (the WhatsApp line). "45 peni" stays in digits. */
export function spokenGoods(what: string): string {
  const m = /^(\d+)[  ](.+)$/.exec(what);
  if (!m) return what;
  return m[2] === "peni" ? what.replace(" ", " ") : `${numberWord(Number(m[1]))} ${m[2]}`;
}

/** Choice chip: "1 çay · 30 peni". */
export function itemChipLabel(item: RefItemDTO): string {
  return `1 ${goodsName(item.name)}${SEP}${formatPeni(itemPeni(item))}`;
}

/* ========================================================================================== */
/* Gift copy                                                                                  */
/* ========================================================================================== */

/** Fiş legend: "ISMARLAMA · MODA KAHVESİ". */
export function giftLegend(cafeName: string): string {
  return `ISMARLAMA${SEP}${trUpper(cafeName)}`;
}

/** h3 on an incoming gift: "Ayşe sana 1 çay ısmarladı". */
export function giftInviteTitle(gift: GiftDTO, refItems: readonly RefItemDTO[] | null | undefined): string {
  return `${firstName(gift.fromName)} sana ${giftWhat(gift.peni, refItems)} ısmarladı`;
}

/** "Yarın 14:30'a kadar kabul edebilirsin." */
export function giftDeadline(expiresAt: string, now: Date = new Date()): string {
  return `${capitalizeTr(relDay(expiresAt, now))} ${dativeTime(formatTime(expiresAt))} kadar kabul edebilirsin.`;
}

/** Done screen: "Kabul edilmezse peni yarın 14:30'da sana döner." */
export function giftReturnNote(expiresAt: string, now: Date = new Date()): string {
  return `Kabul edilmezse peni ${relDay(expiresAt, now)} ${locativeTime(formatTime(expiresAt))} sana döner.`;
}

/** The WhatsApp message (§9.6). */
export function whatsappText(what: string, cafeName: string, link: string): string {
  return `Sana Peni'de ${spokenGoods(what)} ısmarladım (${cafeName}). ${GIFT_EXPIRY_HOURS} saat içinde kabul et: ${link}`;
}

/* ========================================================================================== */
/* Caps                                                                                       */
/* ========================================================================================== */

/** Peni already sent as gifts today at this café (the cafés' day, Europe/Istanbul). */
export function giftedTodayPeni(ledger: readonly LedgerEntryDTO[] | undefined, cafeSlug: string, now: Date = new Date()): number {
  let sum = 0;
  for (const e of ledger ?? []) {
    if (e.cafeSlug === cafeSlug && e.kind === "gift_out" && relDay(e.at, now) === "bugün") sum += Math.abs(e.peni);
  }
  return sum;
}

export interface GiftCaps {
  balance: number;
  /** What is left of today's limit. */
  dailyLeft: number;
  /** The most this gift can be: min(balance, dailyLeft). */
  max: number;
  /** Which cap binds at `max`. */
  binding: "balance" | "daily";
}

export function giftCaps(balance: number, giftedToday: number, limit = DAILY_GIFT_LIMIT_PENI): GiftCaps {
  const b = Math.max(0, Math.floor(balance));
  const dailyLeft = Math.max(0, limit - giftedToday);
  return { balance: b, dailyLeft, max: Math.min(b, dailyLeft), binding: b <= dailyLeft ? "balance" : "daily" };
}

/** Why an amount can't be sent, or null: "Bakiyen 25" / "Günlük sınır 200 peni". */
export function capReason(peni: number, caps: GiftCaps, limit = DAILY_GIFT_LIMIT_PENI): string | null {
  if (peni > caps.balance) return `Bakiyen ${formatNumber(caps.balance)}`;
  if (peni > caps.dailyLeft) return `Günlük sınır ${formatPeni(limit)}`;
  return null;
}

/** Recent recipients at one café, newest first. */
export function recentsFor(recents: readonly RecentRecipientDTO[] | undefined, cafeSlug: string): RecentRecipientDTO[] {
  return (recents ?? []).filter((r) => r.cafeSlug === cafeSlug);
}

/* ========================================================================================== */
/* Phone (step 2)                                                                             */
/* ========================================================================================== */

/**
 * The national digits from whatever was typed or pasted: "+90 532 123 45 67", "0532…",
 * "90532…" all become "5321234567". At most 10 digits.
 */
export function phoneDigits(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("90")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

/** "5321234567" → "532 123 45 67" (as typed: "532 12"). */
export function formatPhoneDigits(digits: string): string {
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
  return parts.filter(Boolean).join(" ");
}

/** A whole Turkish mobile number: 10 digits, starting with 5. */
export function isPhoneComplete(digits: string): boolean {
  return /^5\d{9}$/.test(digits);
}

export function phoneE164(digits: string): string {
  return `+90${digits}`;
}

/* ========================================================================================== */
/* HAREKETLER                                                                                 */
/* ========================================================================================== */

/** A sentence piece: plain words, or a peni amount (drawn in `peniInk`). */
export type Piece = string | { peni: number; signed?: boolean };

export type HistoryChip = {
  label: string;
  tone: "warning" | "success" | "neutral";
  icon: "Clock" | "Check" | "Undo2";
};

export interface HistoryItem {
  id: string;
  at: string;
  cafeSlug: string;
  cafeName: string;
  pieces: Piece[];
  chip: HistoryChip | null;
  /** A second line under the sentence ("Mehmet teşekkür etti."). */
  note: string | null;
  /** Pending gift the viewer sent: "Geri al" [G17]. */
  cancelGiftId: string | null;
  /** The order's fiş, for order lines. */
  orderId: string | null;
}

export interface HistoryDay {
  /** "Bugün", "Dün", "Salı", "12 Eki". */
  label: string;
  items: HistoryItem[];
}

const OUT_CHIP: Record<"pending" | "accepted" | "returned" | "cancelled", HistoryChip> = {
  pending: { label: "bekliyor", tone: "warning", icon: "Clock" },
  accepted: { label: "kabul edildi", tone: "success", icon: "Check" },
  returned: { label: "sana döndü", tone: "neutral", icon: "Undo2" },
  cancelled: { label: "geri aldın", tone: "neutral", icon: "Undo2" },
};

const IN_CHIP: Record<"accepted" | "declined" | "expired", HistoryChip> = {
  accepted: { label: "kabul ettin", tone: "success", icon: "Check" },
  declined: { label: "geri çevirdin", tone: "neutral", icon: "Undo2" },
  expired: { label: "süresi doldu", tone: "neutral", icon: "Undo2" },
};

function giftItem(g: GiftDTO, at: string): HistoryItem {
  const base = { id: `gift:${g.id}`, at, cafeSlug: g.cafeSlug, cafeName: g.cafeName, orderId: null };
  if (g.direction === "out") {
    const to = firstName(g.toName);
    const chip =
      g.status === "pending"
        ? OUT_CHIP.pending
        : g.status === "accepted"
          ? OUT_CHIP.accepted
          : g.cancelledBySender
            ? OUT_CHIP.cancelled
            : OUT_CHIP.returned;
    return {
      ...base,
      pieces: [`${dativeName(to)} `, { peni: g.peni }, " ısmarladın"],
      chip,
      note: g.status === "accepted" && g.thankedAt ? `${to} teşekkür etti.` : null,
      cancelGiftId: g.canCancel ? g.id : null,
    };
  }
  const chip = g.status === "accepted" ? IN_CHIP.accepted : g.status === "declined" ? IN_CHIP.declined : IN_CHIP.expired;
  return {
    ...base,
    pieces: [`${firstName(g.fromName)} sana `, { peni: g.peni }, " ısmarladı"],
    chip,
    note: g.status === "accepted" && g.thankedAt ? "Teşekkür ettin." : null,
    cancelGiftId: null,
  };
}

function ledgerItem(e: LedgerEntryDTO): HistoryItem | null {
  const base = {
    id: `ledger:${e.id}`,
    at: e.at,
    cafeSlug: e.cafeSlug,
    cafeName: e.cafeName,
    chip: null,
    note: null,
    cancelGiftId: null,
    orderId: e.orderId,
  };
  const n = Math.abs(e.peni);
  switch (e.kind) {
    case "earn":
      // "Sipariş P-003 · +6 peni"; a walk-in at the till has no order code.
      return {
        ...base,
        pieces: [e.orderNumber ? `Sipariş ${e.orderNumber}${SEP}` : `Kasada alışveriş${SEP}`, { peni: e.peni, signed: true }],
      };
    case "redeem":
      return { ...base, pieces: ["Siparişte ", { peni: n }, " kullandın"] };
    case "askida_donate":
      return { ...base, pieces: ["Askıya ", { peni: n }, " bıraktın"] };
    case "refund":
      return e.peni >= 0
        ? { ...base, pieces: [e.orderNumber ? `Sipariş ${e.orderNumber}${SEP}` : "", { peni: n }, " sana döndü"] }
        : { ...base, pieces: [e.orderNumber ? `Sipariş ${e.orderNumber}${SEP}` : "", { peni: n }, " geri alındı"] };
    // Gift lines without their gift (should not happen; the gift line normally says it all).
    case "gift_out":
      return {
        ...base,
        pieces: e.counterpartName
          ? [`${dativeName(firstName(e.counterpartName))} `, { peni: n }, " ısmarladın"]
          : [{ peni: n }, " ısmarladın"],
      };
    case "gift_in":
      return {
        ...base,
        pieces: e.counterpartName
          ? [`${firstName(e.counterpartName)} sana `, { peni: n }, " ısmarladı"]
          : ["Sana ", { peni: n }, " ısmarlandı"],
      };
    case "gift_return":
      return { ...base, pieces: [{ peni: n }, " sana döndü"] };
    default:
      return null;
  }
}

/**
 * HAREKETLER (§9.6, [G16]): one line per gift (its state as a chip) plus every other ledger
 * line, newest first. A gift's own ledger lines (send, accept, return) fold into its gift line.
 * Incoming gifts still pending are not history: they sit at the top as fişes. Askı claims never
 * appear (the server never sends them).
 */
export function buildHistory(wallet: Pick<WalletDTO, "gifts" | "ledger">): HistoryItem[] {
  const gifts = new Map(wallet.gifts.map((g) => [g.id, g]));
  const acceptedAt = new Map<string, string>();
  for (const e of wallet.ledger ?? []) if (e.kind === "gift_in" && e.giftId) acceptedAt.set(e.giftId, e.at);

  const items: HistoryItem[] = [];
  for (const g of wallet.gifts) {
    if (g.direction === "in" && g.status === "pending") continue;
    items.push(giftItem(g, g.direction === "in" ? (acceptedAt.get(g.id) ?? g.createdAt) : g.createdAt));
  }
  for (const e of wallet.ledger ?? []) {
    if (e.giftId && gifts.has(e.giftId)) continue;
    const item = ledgerItem(e);
    if (item) items.push(item);
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Groups consecutive items by `relDay` ("Bugün", "Dün", "Salı", "12 Eki"). */
export function groupByDay(items: readonly HistoryItem[], now: Date = new Date()): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const item of items) {
    const label = capitalizeTr(relDay(item.at, now));
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(item);
    else days.push({ label, items: [item] });
  }
  return days;
}

/** The plain sentence, for screen readers: "Mehmet'e 30 peni ısmarladın". */
export function sentence(pieces: readonly Piece[]): string {
  return pieces.map((p) => (typeof p === "string" ? p : formatPeni(p.peni, { signed: p.signed }))).join("");
}
