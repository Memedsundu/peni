import { unitCost, type Bill } from "./bills";
import type { Kurus } from "./money";
import { plusDays, weekStartOf } from "./shifts";
import { MILLI, type Recipe, type StockItem } from "./stock";

/**
 * The weekly letter (plan piece 30, B10): every Monday, what changed last week, why it
 * probably changed, and one thing to do. Peni works out the numbers; the assistant only
 * writes them up, and each point links to the records it came from.
 */

/** One point of the letter, and the refs of the facts it rests on ("sales", "item:stk_sut", "bill:…"). */
export interface LetterPoint {
  title: string;
  text: string;
  refs: string[];
}

/** Where a fact can be checked: a bill, a stock item, or a page of the panel (then `label` is its key, "raporlar"). */
export interface LetterLink {
  kind: "bill" | "item" | "page";
  label: string;
  href: string;
}

export interface LetterBody {
  headline: string;
  points: LetterPoint[];
  /** The one thing to do this week. */
  todo: { text: string; refs: string[] };
  /** Each ref the letter may cite, and where it leads. */
  links: Record<string, LetterLink>;
}

export interface WeeklyLetter {
  id: string;
  cafeId: string;
  /** The Monday of the week it is about. */
  weekStart: string;
  /** The numbers it was written from, as the model saw them, with each fact's ref. */
  facts: unknown;
  body: LetterBody;
  /** Which model wrote it, for the log ("demo" for the stand-in). */
  model: string;
  createdAt: Date;
  /** When it went out by email; null until then, or when there was nobody to send it to. */
  emailedAt: Date | null;
}

export interface LetterStore {
  getLetter(cafeId: string, weekStart: string): Promise<WeeklyLetter | null>;
  /** Newest week first. */
  listLetters(cafeId: string, limit: number): Promise<WeeklyLetter[]>;
  /** Adds it, unless the week has one already: then that one comes back. */
  addLetter(letter: WeeklyLetter): Promise<WeeklyLetter>;
  markEmailed(cafeId: string, weekStart: string, at: Date): Promise<void>;
}

export class InMemoryLetterStore implements LetterStore {
  private readonly letters: WeeklyLetter[] = [];

  async getLetter(cafeId: string, weekStart: string) {
    const l = this.letters.find((x) => x.cafeId === cafeId && x.weekStart === weekStart);
    return l ? structuredClone(l) : null;
  }
  async listLetters(cafeId: string, limit: number) {
    return this.letters
      .filter((x) => x.cafeId === cafeId)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, limit)
      .map((l) => structuredClone(l));
  }
  async addLetter(letter: WeeklyLetter) {
    const same = this.letters.find((x) => x.cafeId === letter.cafeId && x.weekStart === letter.weekStart);
    if (same) return structuredClone(same);
    this.letters.push(structuredClone(letter));
    return structuredClone(letter);
  }
  async markEmailed(cafeId: string, weekStart: string, at: Date) {
    const l = this.letters.find((x) => x.cafeId === cafeId && x.weekStart === weekStart);
    if (l) l.emailedAt = at;
  }
}

/** Letters shown on the page, newest first. */
export const LETTERS_SHOWN = 12;
/** A price that moved less than this isn't worth a line. */
export const PRICE_CHANGE_MIN_PCT = 3;

/** The week a letter written today is about: Monday to Sunday, the week before this one. */
export function letterWeek(today: string): { from: string; through: string } {
  const from = plusDays(weekStartOf(today), -7);
  return { from, through: plusDays(from, 6) };
}

/**
 * What one unit of an item cost on a day: the newest priced bill line dated on or before
 * it (bills by their own date, as on Stok), else what was typed in on Stok.
 */
export function costOn(
  itemId: string,
  day: string,
  bills: readonly Pick<Bill, "id" | "date" | "lines" | "voidedAt" | "supplierId">[],
  typed: Kurus | null,
): { costKurus: Kurus | null; billId: string | null; date: string | null; supplierId: string | null } {
  let best: { costKurus: Kurus; billId: string; date: string; supplierId: string | null } | null = null;
  for (const b of bills) {
    if (b.voidedAt || b.date > day || (best && b.date < best.date)) continue;
    for (const l of b.lines) {
      if (l.itemId !== itemId) continue;
      const c = unitCost(l);
      if (c !== null) best = { costKurus: c, billId: b.id, date: b.date, supplierId: b.supplierId };
    }
  }
  return best ?? { costKurus: typed, billId: null, date: null, supplierId: null };
}

export interface PriceChange {
  itemId: string;
  beforeKurus: Kurus;
  nowKurus: Kurus;
  /** Rounded percent; negative when it got cheaper. */
  changePct: number;
  /** The bill that brought the new price. */
  billId: string;
  date: string;
  supplierId: string | null;
  /** Products whose recipe uses it, with their margin before and after (percent of the menu price). */
  products: { productId: string; marginBeforePct: number; marginNowPct: number }[];
}

/**
 * Items whose price moved during the week, by at least PRICE_CHANGE_MIN_PCT, biggest move
 * first, with what it did to the margin of each product made with them.
 */
export function priceChanges(input: {
  from: string;
  through: string;
  bills: readonly Pick<Bill, "id" | "date" | "lines" | "voidedAt" | "supplierId">[];
  items: readonly Pick<StockItem, "id" | "costKurus">[];
  recipes: readonly Pick<Recipe, "productId" | "mode" | "lines">[];
  prices: ReadonlyMap<string, Kurus>;
}): PriceChange[] {
  const { from, through, bills, items, recipes, prices } = input;
  const dayBefore = plusDays(from, -1);
  const before = new Map<string, Kurus | null>();
  const now = new Map<string, Kurus | null>();
  const changes: PriceChange[] = [];
  for (const item of items) {
    const b = costOn(item.id, dayBefore, bills, item.costKurus);
    const n = costOn(item.id, through, bills, item.costKurus);
    before.set(item.id, b.costKurus);
    now.set(item.id, n.costKurus);
    // Only a price a bill of this week brought, against one known before it.
    if (!n.billId || !n.date || n.date < from || b.billId === null || b.costKurus === null || n.costKurus === null || b.costKurus <= 0) continue;
    const pct = Math.round(((n.costKurus - b.costKurus) / b.costKurus) * 100);
    if (Math.abs(pct) < PRICE_CHANGE_MIN_PCT) continue;
    changes.push({
      itemId: item.id,
      beforeKurus: b.costKurus,
      nowKurus: n.costKurus,
      changePct: pct,
      billId: n.billId,
      date: n.date,
      supplierId: n.supplierId,
      products: [],
    });
  }
  const cost = (r: Pick<Recipe, "mode" | "lines">, at: Map<string, Kurus | null>): number | null => {
    if (r.mode === "none" || !r.lines.length) return null;
    let thousandths = 0;
    for (const l of r.lines) {
      const c = at.get(l.itemId);
      if (c === null || c === undefined) return null;
      thousandths += l.qtyMilli * c;
    }
    return thousandths / MILLI;
  };
  for (const change of changes)
    for (const r of recipes) {
      const price = prices.get(r.productId);
      if (!price || !r.lines.some((l) => l.itemId === change.itemId)) continue;
      const b = cost(r, before);
      const n = cost(r, now);
      if (b === null || n === null) continue;
      change.products.push({
        productId: r.productId,
        marginBeforePct: Math.round(((price - b) / price) * 100),
        marginNowPct: Math.round(((price - n) / price) * 100),
      });
    }
  return changes.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}
