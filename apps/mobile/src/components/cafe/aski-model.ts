/**
 * The askı module's arithmetic and states (design-system.md §6.2, §9.3, D7–D9, §17), shared by
 * the panel and both sheets so they read the café the same way. Mirrors the web
 * `components/cafe/aski-model.tsx`.
 *
 * Dignity rules this file enforces (review blockers, §17):
 * - Claims never reach the UI: only named member donations become donor lines; till donations
 *   and café matches stay in the weekly line.
 * - Only whole items are counted or drawn (D9).
 */
import type { AskidaDTO, AskidaWallEventDTO, CafeDetailDTO, MenuItemDTO } from "@peni/api";
import { askiCopy } from "@peni/brand/copy";
import { formatNumber, formatPeni, goodsName, relDay } from "@peni/brand/format";
import type { Donation } from "./cafe-store";

/** What one askı item costs from the pool, in whole peni (the server rounds up). */
export function itemPeni(item: { priceKurus: number }): number {
  return Math.max(1, Math.ceil(item.priceKurus / 100));
}

/** The café's askı items, in menu order. */
export function askiItems(cafe: Pick<CafeDetailDTO, "menu">): MenuItemDTO[] {
  return cafe.menu.filter((m) => m.askida);
}

/** The reference item the rail and caption count in ("Askıda 7 çay"). */
export function referenceItem(cafe: Pick<CafeDetailDTO, "menu" | "askida">): MenuItemDTO | null {
  const name = cafe.askida.referenceItemName;
  return askiItems(cafe).find((m) => m.name === name) ?? null;
}

/* ------------------------------------------------------------------------------------------ */
/* Donor lines                                                                                */
/* ------------------------------------------------------------------------------------------ */

export interface DonorLine {
  key: string;
  name: string;
  /** "1 çay", "2 simit", "45 peni". */
  what: string;
  /** "bugün", "dün", "Pazartesi", "10 Eki". */
  day: string;
}

/**
 * What a donation reads as: whole items of the reference item first ("2 çay"), then whole items
 * of another askı item ("1 simit"), otherwise plain peni ("45 peni"). Never a fraction (§11).
 */
export function donationWhat(peni: number, items: readonly MenuItemDTO[], reference: MenuItemDTO | null): string {
  const ordered = reference ? [reference, ...items.filter((i) => i !== reference)] : items;
  for (const item of ordered) {
    const unit = itemPeni(item);
    if (peni >= unit && peni % unit === 0) return `${formatNumber(peni / unit)} ${goodsName(item.name)}`;
  }
  return formatPeni(peni);
}

/**
 * "Ayşe K. 1 çay bıraktı · bugün": only members who chose to be named, newest first, max 3.
 * Till donations and café matches are never listed per event; claims are never listed at all.
 */
export function donorLines(cafe: Pick<CafeDetailDTO, "menu" | "askida">, now: Date = new Date(), max = 3): DonorLine[] {
  const items = askiItems(cafe);
  const reference = referenceItem(cafe);
  return cafe.askida.wall
    .filter((e): e is Extract<AskidaWallEventDTO, { type: "donation" }> => e.type === "donation" && Boolean(e.donorName))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, max)
    .map((e, i) => ({
      key: `${e.at}-${i}`,
      name: e.donorName!,
      what: donationWhat(e.peni, items, reference),
      day: relDay(e.at, now),
    }));
}

/* ------------------------------------------------------------------------------------------ */
/* Ordering                                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** Why the café can't take an app order from this viewer right now (§9.3 banners). */
export type OrderingBlocked = null | "closed" | "preorder_off";

export function orderingBlocked(cafe: Pick<CafeDetailDTO, "acceptingOrders" | "membership">): OrderingBlocked {
  if (!cafe.acceptingOrders) return "closed";
  if (cafe.membership && !cafe.membership.preorderEnabled) return "preorder_off";
  return null;
}

/* ------------------------------------------------------------------------------------------ */
/* Take states [G3]                                                                           */
/* ------------------------------------------------------------------------------------------ */

export type TakeState =
  | { kind: "ok" }
  | { kind: "non_member" }
  | { kind: "blocked" }
  | { kind: "claimed_today" }
  | { kind: "too_new"; daysLeft: number }
  | { kind: "empty" }
  | { kind: "ordering_blocked" };

/**
 * What the take sheet shows instead of the chips and the primary, from `askida.myEligibility`
 * and the café's state. Personal reasons first (they hold whatever the pool does), then the
 * pool, then ordering. A member whose pre-ordering is off reads as "blocked" ("Kasaya
 * sorabilirsin"): the café-closed sentence would be untrue for them.
 */
export function takeState(input: { askida: AskidaDTO; member: boolean; blocked: OrderingBlocked; coverable: number }): TakeState {
  const e = input.askida.myEligibility;
  if (!input.member || e.status === "not_member") return { kind: "non_member" };
  if (e.status === "blocked") return { kind: "blocked" };
  if (e.status === "claimed_today") return { kind: "claimed_today" };
  if (e.status === "too_new") return { kind: "too_new", daysLeft: Math.max(1, e.daysLeft ?? 1) };
  if (input.coverable === 0) return { kind: "empty" };
  if (input.blocked === "preorder_off") return { kind: "blocked" };
  if (input.blocked === "closed") return { kind: "ordering_blocked" };
  return { kind: "ok" };
}

export function takeStateText(s: Exclude<TakeState, { kind: "ok" }>): string {
  const c = askiCopy.takeStates;
  switch (s.kind) {
    case "non_member":
      return c.nonMember;
    case "blocked":
      return c.blocked;
    case "claimed_today":
      return c.claimedToday;
    case "too_new":
      return c.tooNew(s.daysLeft);
    case "empty":
      return c.empty;
    case "ordering_blocked":
      return c.orderingBlocked;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* A8 after one's own donation                                                                */
/* ------------------------------------------------------------------------------------------ */

/**
 * The pool right after one's own donation, before the refetch lands: how many whole reference
 * items there are now, how many of them are the donor's own, and whether the café match
 * completed one more (it hangs 120ms later, A8). Null when the reference price is unknown.
 */
export function afterDonation(
  askida: Pick<AskidaDTO, "balancePeni">,
  reference: MenuItemDTO | null,
  d: Pick<Donation, "peni" | "matchedPeni">,
): { itemsAvailable: number; balancePeni: number; own: number; match: boolean } | null {
  if (!reference) return null;
  const unit = itemPeni(reference);
  const before = Math.floor(askida.balancePeni / unit);
  const withOwn = Math.floor((askida.balancePeni + d.peni) / unit);
  const balancePeni = askida.balancePeni + d.peni + d.matchedPeni;
  const after = Math.floor(balancePeni / unit);
  return { itemsAvailable: after, balancePeni, own: Math.max(0, withOwn - before), match: after > withOwn };
}

/**
 * The success toast, one line: "1 çay askıya asıldı." (custom amounts: "45 peni askıya
 * bırakıldı."), plus "Kafe de 15 peni ekledi." with a match.
 */
export function donationToast(d: Donation): string {
  const title = d.item ? askiCopy.hungToast(1, d.item.name) : `${formatPeni(d.peni)} askıya bırakıldı.`;
  return d.matchedPeni > 0 ? `${title} ${askiCopy.matchToast(d.matchedPeni)}` : title;
}
