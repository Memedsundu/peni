/**
 * Pure wallet logic for Cüzdan (design-system.md §9.6): names, goods, the HAREKETLER
 * sentences, gift caps. No React, no fetch; covered by wallet-model.test.ts.
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
 * The café's daily gift cap and expiry. The wallet DTO does not carry the café settings yet,
 * so these are the defaults every café runs with today (`defaultSettings` in @peni/core).
 * The server still enforces the real value (GIFT_LIMIT is shown inline if it differs).
 */
export const DAILY_GIFT_LIMIT_PENI = 200;
export const GIFT_EXPIRY_HOURS = 24;
export const NOTE_MAX = 140;

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

/** "Ayşe Yılmaz" → "Ayşe Y.". */
export function shortDisplayName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  const first = parts[0] ?? displayName;
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const initial = last ? Array.from(last)[0] : undefined;
  return shortName(first, initial ? initial.toLocaleUpperCase("tr") : null);
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
 * exactly whole items of a reference item, otherwise the plain "45 peni". A gift of 45 peni
 * is not "1 çay": headlines never round (§13, never a made-up value).
 */
export function giftWhat(peni: number, refItems: readonly RefItemDTO[] | null | undefined): string {
  for (const item of refItems ?? []) {
    const price = itemPeni(item);
    if (price > 0 && peni % price === 0 && peni / price >= 1) return `${formatNumber(peni / price)}\u00A0${goodsName(item.name)}`;
  }
  return formatPeni(peni).replace(" ", "\u00A0");
}

/** "1 çay" → "bir çay", "2 çay" → "iki çay" (the WhatsApp line). Anything else as it is. */
export function spokenGoods(what: string): string {
  const m = /^(\d+)[ \u00A0](.+)$/.exec(what);
  if (!m) return what;
  const n = Number(m[1]);
  // "45 peni" stays in digits; only goods read as words.
  return m[2] === "peni" ? what.replace("\u00A0", " ") : `${numberWord(n)} ${m[2]}`;
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

export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/* ========================================================================================== */
/* Caps                                                                                       */
/* ========================================================================================== */

/** Peni already sent as gifts today at this café (the day is the cafés' day, Europe/Istanbul). */
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
/* HAREKETLER                                                                                 */
/* ========================================================================================== */

/** A sentence piece: plain words, or a peni amount (drawn in `peni-ink`). */
export type Piece = string | { peni: number; signed?: boolean; suffix?: string };

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
      return { ...base, pieces: [e.orderNumber ? `Sipariş ${e.orderNumber}${SEP}` : `Kasada alışveriş${SEP}`, { peni: e.peni, signed: true }] };
    case "redeem":
      return { ...base, pieces: ["Siparişte ", { peni: n }, " kullandın"] };
    case "askida_donate":
      return { ...base, pieces: ["Askıya ", { peni: n }, " bıraktın"] };
    case "refund":
      return e.peni >= 0
        ? { ...base, pieces: [e.orderNumber ? `Sipariş ${e.orderNumber}${SEP}` : "", { peni: n, suffix: "n" }, " döndü"] }
        : { ...base, pieces: [e.orderNumber ? `Sipariş ${e.orderNumber}${SEP}` : "", { peni: n }, " geri alındı"] };
    // Gift lines without their gift (should not happen; the gift line normally says it all).
    case "gift_out":
      return { ...base, pieces: e.counterpartName ? [`${dativeName(firstName(e.counterpartName))} `, { peni: n }, " ısmarladın"] : [{ peni: n }, " ısmarladın"] };
    case "gift_in":
      return { ...base, pieces: e.counterpartName ? [`${firstName(e.counterpartName)} sana `, { peni: n }, " ısmarladı"] : ["Sana ", { peni: n }, " ısmarlandı"] };
    case "gift_return":
      return { ...base, pieces: [{ peni: n }, " sana döndü"] };
    default:
      return null;
  }
}

/**
 * HAREKETLER (§9.6, [G16]): one line per gift (its state as a chip) plus every other ledger
 * line, newest first. A gift's own ledger lines (send, accept, return) are folded into its
 * gift line. Incoming gifts that are still pending are not history: they sit at the top as
 * fişes. Askı claims never appear (the server never sends them).
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

/** The plain sentence, for tests and screen readers: "Mehmet'e 30 peni ısmarladın". */
export function sentence(pieces: readonly Piece[]): string {
  return pieces.map((p) => (typeof p === "string" ? p : `${formatPeni(p.peni, { signed: p.signed })}${p.suffix ?? ""}`)).join("");
}
