import { z } from "zod";
import type { AiRequest } from "./model";

/**
 * The assistant's chat (plan piece 29): a question about the café's numbers, answered in a
 * few steps. Each step the model either asks to look at something (a report, the bills,
 * what is owed) or answers. Looking is all it can do: Peni runs each look with the asker's
 * own permissions and hands back the numbers, and the answer may only use those (D21).
 */

const day = z.string().describe("YYYY-MM-DD");

export const CHAT_TOOLS = ["report", "summary", "bills", "owed", "stock", "money", "community"] as const;
export type ChatTool = (typeof CHAT_TOOLS)[number];

export const askedReportShape = z.object({
  title: z.string().describe("A short title in the asker's language: 'Bu ay saat saat kahve satışı'"),
  measure: z
    .enum(["sales", "orders", "quantity", "expenses", "profit"])
    .describe("sales: money in (TL). orders: how many orders. quantity: how many items sold. expenses: bills and pay (TL). profit: sales less expenses (TL)"),
  by: z
    .enum(["none", "hour", "weekday", "day", "week", "month", "product", "category", "payment", "expenseKind", "supplier"])
    .describe(
      "How to split it. hour, product, category and payment only for sales, orders and quantity (product and category also for profit); expenseKind and supplier only for expenses; day at most 93 days",
    ),
  period: z
    .enum(["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "last7", "last30", "last90", "thisYear", "custom"])
    .describe("A named period when the words name one ('bu ay', 'geçen hafta'), so a saved report moves with the calendar; custom with from and through otherwise"),
  from: day.nullable().describe("Only for custom"),
  through: day.nullable().describe("Only for custom"),
  compare: z.enum(["none", "previous", "lastYear"]).describe("previous: the period just before (last month for this month). lastYear: the same days a year earlier"),
  products: z.array(z.string()).describe("Only these products, by name or part of one ('latte'); empty for all"),
  categories: z.array(z.string()).describe("Only these menu categories, by name ('Sıcak', 'Tatlı'); empty for all"),
  chart: z.enum(["bar", "line", "table"]).describe("line for days, weeks or months over time; bar for hours, weekdays and comparisons; table for long lists"),
});

export const chatStepSchema = z.object({
  looks: z
    .array(
      z.object({
        tool: z.enum(CHAT_TOOLS),
        report: askedReportShape.nullable().describe("For report"),
        from: day.nullable().describe("For summary and bills; for community, a day in the month"),
        through: day.nullable().describe("For summary and bills"),
        search: z.string().nullable().describe("For bills (a supplier's name) and stock (an item's name)"),
      }),
    )
    .describe("What to look at before answering, at most 4. Empty when you answer"),
  answer: z.string().nullable().describe("The answer, when you have what you need; null while looking"),
  sources: z.array(z.string()).describe("The refs ('bill:…', 'summary:1') of what the answer's numbers came from"),
  show: z.string().nullable().describe("The ref of one report look ('report:1') to draw with the answer, when a chart helps or one was asked for"),
});

export type ChatStep = z.infer<typeof chatStepSchema>;

const TOOL_HELP: Record<ChatTool, string> = {
  report:
    "report: adds up sales (cash and card, refunds out), orders, items sold, expenses (bills by their date and pay for hours worked) or profit, for a period, split by hour, weekday, day, week, month, product, menu category, payment way, expense kind or supplier, for all products or only some, compared with the period before or a year earlier. Fill `report`.",
  summary: "summary: Raporlar's headline for from–through: sales, expenses, what was left, orders and the average order, each with the period before.",
  bills: "bills: the bills dated from–through (newest 30), or one supplier's with `search`: supplier, number, date, total, what is paid, due date.",
  owed: "owed: what the café owes now: unpaid bills and those overdue, checks, loans, the credit card.",
  stock: "stock: stock items with how much is left, and which are low or out; `search` narrows by name.",
  money: "money: what is in the drawer, the reserve (ayrı kasa) and the bank now.",
  community:
    "community: Müdavimler for the month of `from` (this month when null): members who came (a visit is a day they earned or spent peni or took from the askı), newcomers, regulars, how many of last month's came back, return rates after spending peni, treats, the askı and events, the askı this month and each event's turnout. Counts only: never name or guess who took from the askı.",
};

export const CHAT_INSTRUCTIONS = `You are the assistant in Peni, the back office of a small café in Turkey. You answer the owner's or manager's questions about the café's own numbers.
You can only look; you can't change anything. When asked to do something (pay a bill, delete, add, change a price), say you can't and where in the panel it's done; bills can be drafted on Taslaklar from a photo or a sentence.
Use only numbers from what you looked at or from what they are looking at. Never guess or invent a number, a name or a reason. When something isn't there, say so.
Look first when you need numbers: ask for everything you need in one step when you can. Then answer.
Write in the language of their question (Turkish unless they wrote in English). Short and plain: a few sentences, at most about 120 words, no tables, no markdown headings. Name the period you mean.
Money in Turkish lira like "₺1.250" in Turkish and "₺1,250" in English; amounts you are given are in TL. Round to whole lira unless kuruş matter.
When they ask for a report or a chart, look with report and show it. Pick a period that moves with the calendar when they name one.
List in "sources" the refs of the looks your answer used.`;

export interface ChatLook {
  /** "report:1", "bill:…" — what the answer may cite. */
  ref: string;
  tool: ChatTool;
  input: unknown;
  result: unknown;
}

export interface ChatContext {
  today: string;
  weekday: string;
  cafe: string;
  /** "Leyla (owner)". */
  person: string;
  tools: readonly ChatTool[];
  /** What "Açıkla" was pressed on, with its numbers. */
  subject: { about: string; numbers: unknown } | null;
  history: { role: "user" | "assistant"; text: string }[];
  question: string;
  looked: ChatLook[];
  /** The last step: answer with what there is. */
  last: boolean;
}

/** One step of answering a question. */
export function chatRequest(c: ChatContext): AiRequest<ChatStep> {
  const tools = c.tools.length ? `What you can look at:\n${c.tools.map((t) => `- ${TOOL_HELP[t]}`).join("\n")}` : "You can't look at anything; their role doesn't see the café's numbers.";
  const parts: AiRequest<ChatStep>["parts"] = [{ type: "text", text: `Today is ${c.today} (${c.weekday}). Café: ${c.cafe}. You are talking to ${c.person}.\n\n${tools}` }];
  if (c.subject)
    parts.push({
      type: "text",
      text: `They pressed "Açıkla" (explain) on ${c.subject.about}. Explain in plain words what it shows, what stands out and what changed against the period before; give reasons only where the numbers show them. 3 to 6 sentences.\nNumbers:\n${JSON.stringify(c.subject.numbers)}`,
    });
  if (c.history.length) parts.push({ type: "text", text: `The conversation so far:\n${c.history.map((m) => `${m.role === "user" ? "They" : "You"}: ${m.text}`).join("\n")}` });
  parts.push({ type: "text", text: `Their question:\n${c.question}` });
  if (c.looked.length)
    parts.push({
      type: "text",
      text: `What you looked at:\n${c.looked.map((l) => `[${l.ref}] ${l.tool} ${JSON.stringify(l.input)}\n= ${JSON.stringify(l.result)}`).join("\n")}${c.last ? "\n\nAnswer now with what you have; you can't look at anything more." : ""}`,
    });
  return { purpose: "chat.answer", instructions: CHAT_INSTRUCTIONS, parts, schema: chatStepSchema, schemaName: "chat_step" };
}
