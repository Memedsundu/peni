import type { FulfillmentStatus, MenuItemDTO, OrderDTO } from "@peni/api";
import { askiCopy, staffCopy } from "@peni/brand/copy";
import { formatNumber, formatPeni, goodsName, locativeTime, SEP } from "@peni/brand/format";

/*
 * Pure logic for the café panel (design-system.md §9.10), kept out of the components so it
 * can be tested: which column a ticket sits in, what its buttons say, how old it is, the
 * optimistic "bump" overlay, the till summary and the report trends.
 */

export type BoardColumn = "submitted" | "accepted" | "ready";
export const BOARD_COLUMNS: readonly BoardColumn[] = ["submitted", "accepted", "ready"];

/** The four bumps that wait 5s for "Geri al" before they are sent. Reject is sent at once. */
export type BumpAction = "accept" | "ready" | "collect" | "no_show";
export type StaffAction = BumpAction | "reject";

/** `staffCopy.columns` / `columnEmpty` key for each column. */
export const COLUMN_KEY = { submitted: "new", accepted: "accepted", ready: "ready" } as const;

export function isBoardStatus(status: FulfillmentStatus): status is BoardColumn {
  return status === "submitted" || status === "accepted" || status === "ready";
}

/** Where an action takes the order. */
export function statusAfter(action: StaffAction): FulfillmentStatus {
  switch (action) {
    case "accept":
      return "accepted";
    case "ready":
      return "ready";
    case "collect":
      return "collected";
    case "no_show":
      return "no_show";
    case "reject":
      return "rejected";
  }
}

/**
 * The 56px primary action at the foot of a ticket: "Kabul et" → "Hazır" → "Ödendi, teslim
 * edildi". On Shelby boards a ready order closes at the till (D18): the ticket shows the
 * "Kasada kapanacak" row instead of a button.
 */
export function primaryAction(
  status: FulfillmentStatus,
  posKind: "standalone" | "shelby",
): { action: BumpAction; label: string } | { action: null; label: string } | null {
  if (status === "submitted") return { action: "accept", label: staffCopy.action.submitted };
  if (status === "accepted") return { action: "ready", label: staffCopy.action.accepted };
  if (status === "ready") {
    return posKind === "shelby"
      ? { action: null, label: staffCopy.action.closesAtTill }
      : { action: "collect", label: staffCopy.action.ready };
  }
  return null;
}

/**
 * What the elapsed chip measures from: `submittedAt`, then `acceptedAt` once accepted
 * (§9.10). A ready ticket counts from `readyAt`: how long it has waited on the counter, which
 * is also what "Gelmedi" (≥10 min after `readyAt`) is measured against.
 */
export function elapsedSince(order: Pick<OrderDTO, "status" | "submittedAt" | "acceptedAt" | "readyAt">): string {
  if (order.status === "ready") return order.readyAt ?? order.acceptedAt ?? order.submittedAt;
  if (order.status === "accepted") return order.acceptedAt ?? order.submittedAt;
  return order.submittedAt;
}

export function elapsedMinutes(order: Pick<OrderDTO, "status" | "submittedAt" | "acceptedAt" | "readyAt">, now: number): number {
  const from = Date.parse(elapsedSince(order));
  return Number.isFinite(from) ? Math.max(0, Math.floor((now - from) / 60_000)) : 0;
}

/** "Gelmedi" shows only on Hazır tickets, 10 minutes or more after `readyAt`. */
export const NO_SHOW_AFTER_MIN = 10;

export function canMarkNoShow(order: Pick<OrderDTO, "status" | "readyAt">, now: number): boolean {
  if (order.status !== "ready" || !order.readyAt) return false;
  const ready = Date.parse(order.readyAt);
  return Number.isFinite(ready) && now - ready >= NO_SHOW_AFTER_MIN * 60_000;
}

/** "Zeynep Demir" → "Zeynep". The ticket shows the first name only. */
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || name.trim();
}

/* ------------------------------------------------------------------------------------------ */
/* Optimistic bumps                                                                           */
/* ------------------------------------------------------------------------------------------ */

/** A bump the screen already shows but the server may not know yet. */
export interface Override {
  status: FulfillmentStatus;
  /** When it was tapped (ISO): the new stage's timestamp until the server sends its own. */
  at: string;
  /** Which bump put it there, so a settled earlier bump never clears a newer one. */
  token?: number;
}

/** The order as the board should draw it, with a pending bump applied. */
export function applyOverride(order: OrderDTO, override: Override | undefined): OrderDTO {
  if (!override || override.status === order.status) return order;
  const o = { ...order, status: override.status };
  if (override.status === "accepted") o.acceptedAt = order.acceptedAt ?? override.at;
  if (override.status === "ready") {
    o.acceptedAt = order.acceptedAt ?? override.at;
    o.readyAt = order.readyAt ?? override.at;
  }
  if (!isBoardStatus(override.status)) o.closedAt = order.closedAt ?? override.at;
  return o;
}

/**
 * The three columns, each oldest first by the time its stage began (so a ticket that has just
 * moved lands at the bottom of its new column). Closed orders are not on the board.
 */
export function boardColumns(
  orders: readonly OrderDTO[],
  overrides: ReadonlyMap<string, Override> = new Map(),
): Record<BoardColumn, OrderDTO[]> {
  const cols: Record<BoardColumn, OrderDTO[]> = { submitted: [], accepted: [], ready: [] };
  for (const raw of orders) {
    const order = applyOverride(raw, overrides.get(raw.id));
    if (isBoardStatus(order.status)) cols[order.status].push(order);
  }
  for (const key of BOARD_COLUMNS) {
    cols[key].sort((a, b) => Date.parse(elapsedSince(a)) - Date.parse(elapsedSince(b)) || a.id.localeCompare(b.id));
  }
  return cols;
}

/** Undo toast: "P-004 · Hazır" (the new status word). */
export function bumpToastText(order: Pick<OrderDTO, "orderNumber" | "customerName">, action: BumpAction): string {
  const word = { accept: "Hazırlanıyor", ready: "Hazır", collect: "Teslim edildi", no_show: "Teslim alınmadı" }[action];
  return staffCopy.bumpToast(order.orderNumber ?? firstName(order.customerName), word);
}

/** The notes block: line notes as "Latte: yulaf sütlü", then the order note as "Not: az şekerli". */
export function ticketNotes(order: Pick<OrderDTO, "lines" | "customerNote">): string[] {
  const out: string[] = [];
  for (const line of order.lines) if (line.note?.trim()) out.push(`${line.name}: ${line.note.trim()}`);
  if (order.customerNote?.trim()) out.push(staffCopy.note(order.customerNote.trim()));
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* Pause                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** Whole minutes until `pausedUntil`, rounded up (never below 1 while it is in the future). */
export function minutesLeft(pausedUntil: string | null | undefined, now: number): number | null {
  if (!pausedUntil) return null;
  const until = Date.parse(pausedUntil);
  if (!Number.isFinite(until)) return null;
  return Math.max(1, Math.ceil((until - now) / 60_000));
}

/** Longer pauses read as the resume time, not "597 dk kaldı". */
export const COUNTDOWN_MAX_MIN = 90;

/**
 * "Uygulama siparişleri durdu · 12 dk kaldı" [G20]; for a long pause ("Gün sonuna kadar")
 * "Uygulama siparişleri durdu · 00:00'da açılır"; with no end, "Uygulama siparişleri durdu".
 */
export function pausedBannerText(pausedUntil: string | null | undefined, now: number): string {
  const left = minutesLeft(pausedUntil, now);
  if (left == null) return staffCopy.pausedBanner(null);
  if (left <= COUNTDOWN_MAX_MIN) return staffCopy.pausedBanner(left);
  return `${staffCopy.pausedBanner(null)}${SEP}${locativeTime(new Date(pausedUntil!))} açılır`;
}

/* ------------------------------------------------------------------------------------------ */
/* Till (Askı tab)                                                                            */
/* ------------------------------------------------------------------------------------------ */

export interface TillItem {
  productId: string;
  name: string;
  /** Price in peni (1 peni = ₺1), rounded up like the goods helpers. */
  peni: number;
}

/** The askı items a guest can pay for at the till, cheapest first. */
export function tillItems(menu: readonly MenuItemDTO[]): TillItem[] {
  return menu
    .filter((m) => m.askida && m.priceKurus > 0)
    .map((m) => ({ productId: m.productId, name: m.name, peni: Math.ceil(m.priceKurus / 100) }))
    .sort((a, b) => a.peni - b.peni || a.name.localeCompare(b.name, "tr"));
}

export interface TillSelection {
  /** Items chosen, in menu order. */
  parts: { item: TillItem; count: number }[];
  count: number;
  peni: number;
}

export function tillSelection(items: readonly TillItem[], counts: Readonly<Record<string, number>>): TillSelection {
  const parts = items.map((item) => ({ item, count: Math.max(0, Math.floor(counts[item.productId] ?? 0)) })).filter((p) => p.count > 0);
  return {
    parts,
    count: parts.reduce((n, p) => n + p.count, 0),
    peni: parts.reduce((n, p) => n + p.count * p.item.peni, 0),
  };
}

/** "1 çay", "1 çay ve 1 simit", "2 çay, 1 simit ve 1 filtre kahve". */
function goodsList(sel: TillSelection): string {
  const words = sel.parts.map((p) => `${formatNumber(p.count)} ${goodsName(p.item.name)}`);
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} ve ${words[words.length - 1]}`;
}

/** "Askıya ekle · 2 çay (60 peni)"; mixed: "Askıya ekle · 1 çay ve 1 simit (55 peni)"; none: "Askıya ekle". */
export function tillSubmitLabel(sel: TillSelection): string {
  if (sel.count === 0) return "Askıya ekle";
  if (sel.parts.length === 1) return askiCopy.till.submit(sel.count, sel.parts[0]!.item.name, sel.peni);
  return `Askıya ekle${SEP}${goodsList(sel)} (${formatPeni(sel.peni)})`;
}

/** "Askıya 2 çay eklendi." / "Askıya 1 çay ve 1 simit eklendi." */
export function tillToastText(sel: TillSelection): string {
  if (sel.parts.length === 1) return askiCopy.till.toast(sel.count, sel.parts[0]!.item.name);
  return `Askıya ${goodsList(sel)} eklendi.`;
}

/** Whole reference items a pool of peni holds (the rail draws only whole items, D9). */
export function itemsFor(balancePeni: number, referencePeni: number | null): number | null {
  if (!referencePeni || referencePeni <= 0) return null;
  return Math.max(0, Math.floor(balancePeni / referencePeni));
}

/* ------------------------------------------------------------------------------------------ */
/* Report                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export interface Trend {
  /** Whole percent, always ≥ 0; read with `direction`. */
  percent: number;
  direction: "up" | "down" | "flat";
}

/** Change against the previous 30 days [G21]. None when there is nothing to compare with. */
export function trend(current: number, previous: number | null | undefined): Trend | null {
  if (previous == null || !Number.isFinite(previous) || previous <= 0 || !Number.isFinite(current)) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { percent: 0, direction: "flat" };
  return { percent: Math.abs(pct), direction: pct > 0 ? "up" : "down" };
}

/** Screen-reader sentence for a trend: "önceki 30 güne göre %12 arttı". */
export function trendSpoken(t: Trend): string {
  if (t.direction === "flat") return "önceki 30 güne göre aynı";
  return `önceki 30 güne göre %${formatNumber(t.percent)} ${t.direction === "up" ? "arttı" : "azaldı"}`;
}
