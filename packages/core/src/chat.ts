import { addMonths, monthDays } from "./books";
import { daysBetween, previousRange, REPORT_MAX_DAYS, validDay } from "./figures";
import { plusDays, weekStartOf } from "./shifts";

/**
 * The assistant's chat (plan piece 29): questions about the café's numbers, answered from
 * what the café's own records say, read-only. "Açıkla" on Raporlar asks about the part in
 * front of you (B8); "show me this month's coffee sales by hour" draws a report that can
 * be saved for later (B9). The assistant never changes anything from here (D21).
 */

/** What a report adds up. */
export const ASKED_MEASURES = ["sales", "orders", "quantity", "expenses", "profit"] as const;
/** How it splits what it adds up; "none" is one total. */
export const ASKED_GROUPS = ["none", "hour", "weekday", "day", "week", "month", "product", "category", "payment", "expenseKind", "supplier"] as const;
/** Which days: named periods move with the calendar, so a saved report shows them as they are then. */
export const ASKED_PERIODS = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "last7", "last30", "last90", "thisYear", "custom"] as const;
export const ASKED_COMPARES = ["none", "previous", "lastYear"] as const;
export const ASKED_CHARTS = ["bar", "line", "table"] as const;

export type AskedMeasure = (typeof ASKED_MEASURES)[number];
export type AskedGroup = (typeof ASKED_GROUPS)[number];
export type AskedPeriod = (typeof ASKED_PERIODS)[number];
export type AskedCompare = (typeof ASKED_COMPARES)[number];
export type AskedChart = (typeof ASKED_CHARTS)[number];

/** A report someone asked for in words, as the assistant wrote it down: plain data the server runs. */
export interface AskedReport {
  title: string;
  measure: AskedMeasure;
  by: AskedGroup;
  period: AskedPeriod;
  /** Only for "custom". */
  from: string | null;
  through: string | null;
  compare: AskedCompare;
  /** Only these products or menu categories, by name (part of a name will do); empty for all. */
  products: string[];
  categories: string[];
  chart: AskedChart;
}

export const ASKED_TITLE_MAX = 80;
export const ASKED_FILTER_MAX = 10;

/** What each measure can be split by. Hours need a time of day, which bills don't have. */
const ALLOWED: Record<AskedMeasure, readonly AskedGroup[]> = {
  sales: ["none", "hour", "weekday", "day", "week", "month", "product", "category", "payment"],
  orders: ["none", "hour", "weekday", "day", "week", "month", "product", "category", "payment"],
  quantity: ["none", "hour", "weekday", "day", "week", "month", "product", "category", "payment"],
  expenses: ["none", "weekday", "day", "week", "month", "expenseKind", "supplier"],
  profit: ["none", "weekday", "day", "week", "month", "product", "category"],
};

export function canGroup(measure: AskedMeasure, by: AskedGroup): boolean {
  return ALLOWED[measure].includes(by);
}

/** Why a report can't be run, in a word the screen and the model both understand; null when it can. */
export function askedReportProblem(r: AskedReport, today: string): string | null {
  if (!ASKED_MEASURES.includes(r.measure) || !ASKED_GROUPS.includes(r.by)) return "UNKNOWN";
  if (!canGroup(r.measure, r.by)) return "GROUPING";
  if ((r.products.length || r.categories.length) && (r.measure === "expenses" || (r.measure === "profit" && r.by !== "product" && r.by !== "category")))
    return "FILTER";
  if (r.products.length > ASKED_FILTER_MAX || r.categories.length > ASKED_FILTER_MAX) return "FILTER";
  const range = askedRange(r, today);
  if (!range) return "PERIOD";
  if (r.by === "day" && daysBetween(range.from, range.through) > 93) return "TOO_MANY_DAYS";
  return null;
}

/** The days a report covers today: a named period from the calendar, or its own days. */
export function askedRange(r: Pick<AskedReport, "period" | "from" | "through">, today: string): { from: string; through: string } | null {
  const monday = weekStartOf(today);
  const thisMonth = today.slice(0, 7);
  let range: { from: string; through: string };
  switch (r.period) {
    case "today":
      range = { from: today, through: today };
      break;
    case "yesterday":
      range = { from: plusDays(today, -1), through: plusDays(today, -1) };
      break;
    case "thisWeek":
      range = { from: monday, through: today };
      break;
    case "lastWeek":
      range = { from: plusDays(monday, -7), through: plusDays(monday, -1) };
      break;
    case "thisMonth":
      range = { from: `${thisMonth}-01`, through: today };
      break;
    case "lastMonth": {
      const m = monthDays(addMonths(thisMonth, -1));
      range = { from: m.from, through: m.to };
      break;
    }
    case "last7":
    case "last30":
    case "last90": {
      const n = Number(r.period.slice(4));
      range = { from: plusDays(today, -(n - 1)), through: today };
      break;
    }
    case "thisYear":
      range = { from: `${today.slice(0, 4)}-01-01`, through: today };
      break;
    case "custom":
      if (!r.from || !r.through) return null;
      range = { from: r.from, through: r.through > today ? today : r.through };
      break;
    default:
      return null;
  }
  if (!validDay(range.from) || !validDay(range.through) || range.from > range.through || daysBetween(range.from, range.through) > REPORT_MAX_DAYS) return null;
  return range;
}

/** What a report is compared with: the period just before (as Raporlar does), or the same days a year earlier. */
export function askedCompareRange(compare: AskedCompare, range: { from: string; through: string }): { from: string; through: string } | null {
  if (compare === "previous") return previousRange(range.from, range.through);
  if (compare === "lastYear") return { from: yearBefore(range.from), through: yearBefore(range.through) };
  return null;
}

/** The same day a year earlier; 29 February becomes the 28th. */
export function yearBefore(day: string): string {
  const y = `${Number(day.slice(0, 4)) - 1}${day.slice(4)}`;
  return validDay(y) ? y : `${y.slice(0, 8)}28`;
}

// ─────────────────────────────────────────────── the conversation

/** What "Açıkla" is about: a part of Raporlar for some days, or a saved report. */
export type ChatSubject =
  | { kind: "report"; section: ReportSection; from: string; through: string }
  | { kind: "saved"; reportId: string };

export const REPORT_SECTIONS = ["headline", "sales", "hours", "weekdays", "months", "spending", "paidWith", "products"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

/**
 * A record an answer leans on, to open and check: a bill ("Ambalaj Dünyası · 3 Eki"), or a
 * page of the panel, whose `label` is then the page's key ("borclar") for the screen to name.
 */
export interface ChatSource {
  kind: "bill" | "page";
  label: string;
  href: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: Date;
  /** The asker's key, so a retry gets the same answer instead of asking twice. */
  key: string | null;
  subject: ChatSubject | null;
  sources: ChatSource[];
  /** A report drawn with the answer: what was asked, and its numbers as they were then. */
  report: { spec: AskedReport; result: unknown } | null;
  /** The assistant couldn't answer (unreachable, off); the question can be asked again. */
  failed: boolean;
}

/** One person's conversation at one café. "Yeni sohbet" starts another. */
export interface Chat {
  id: string;
  cafeId: string;
  memberId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/** A report kept on Raporlar for everyone who sees reports (B9). */
export interface SavedReport {
  id: string;
  cafeId: string;
  /** Who saved it. */
  memberId: string;
  spec: AskedReport;
  createdAt: Date;
  /** The same key twice saves it once. */
  key: string;
}

/** Questions are short; the conversation sent back to the model is the last few turns. */
export const CHAT_TEXT_MAX = 500;
export const CHAT_PER_DAY = 100;
export const SAVED_REPORTS_MAX = 30;

export interface ChatStore {
  getChat(cafeId: string, id: string): Promise<Chat | null>;
  /** The person's newest conversation at the café. */
  latestChat(cafeId: string, memberId: string): Promise<Chat | null>;
  saveChat(chat: Chat): Promise<void>;
  /** Questions the person asked since then, for the daily limit. */
  questionsSince(cafeId: string, memberId: string, since: Date): Promise<number>;

  /** Oldest first. */
  listSavedReports(cafeId: string): Promise<SavedReport[]>;
  /** Adds it, unless one with the same key is there: then that one comes back. */
  addSavedReport(report: SavedReport): Promise<SavedReport>;
  deleteSavedReport(cafeId: string, id: string): Promise<void>;
}

export class InMemoryChatStore implements ChatStore {
  private readonly chats = new Map<string, Chat>();
  private readonly saved: SavedReport[] = [];

  async getChat(cafeId: string, id: string) {
    const c = this.chats.get(id);
    return c && c.cafeId === cafeId ? clone(c) : null;
  }
  async latestChat(cafeId: string, memberId: string) {
    const mine = [...this.chats.values()].filter((c) => c.cafeId === cafeId && c.memberId === memberId);
    mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return mine[0] ? clone(mine[0]) : null;
  }
  async saveChat(chat: Chat) {
    this.chats.set(chat.id, clone(chat));
  }
  async questionsSince(cafeId: string, memberId: string, since: Date) {
    let n = 0;
    for (const c of this.chats.values())
      if (c.cafeId === cafeId && c.memberId === memberId) n += c.messages.filter((m) => m.role === "user" && m.at >= since).length;
    return n;
  }
  async listSavedReports(cafeId: string) {
    return this.saved.filter((r) => r.cafeId === cafeId).map((r) => ({ ...r, spec: { ...r.spec } }));
  }
  async addSavedReport(report: SavedReport) {
    const same = this.saved.find((r) => r.cafeId === report.cafeId && r.key === report.key);
    if (same) return { ...same };
    this.saved.push({ ...report });
    return { ...report };
  }
  async deleteSavedReport(cafeId: string, id: string) {
    const i = this.saved.findIndex((r) => r.cafeId === cafeId && r.id === id);
    if (i >= 0) this.saved.splice(i, 1);
  }
}

const clone = (c: Chat): Chat => ({ ...c, messages: c.messages.map((m) => ({ ...m, sources: [...m.sources] })) });
