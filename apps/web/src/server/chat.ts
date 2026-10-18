import { chatRequest, isAiError, TURKISH_WEEKDAYS, type AiModel, type ChatLook, type ChatStep, type ChatTool } from "@peni/ai";
import type { AskedResultDTO, ChatDTO, ChatMessageDTO, SalesReportDTO, SavedReportsDTO } from "@peni/api";
import {
  askedReportProblem,
  CHAT_PER_DAY,
  CHAT_TEXT_MAX,
  localDateKey,
  SAVED_REPORTS_MAX,
  startOfLocalDay,
  weekdayOf,
  type AskedReport,
  type AssistantStore,
  type BillStore,
  type Chat,
  type ChatMessage,
  type ChatSource,
  type ChatStore,
  type ChatSubject,
  type Permission,
  type PeniDirectory,
  type ReportSection,
} from "@peni/core";
import { formatTL, trLower } from "@peni/brand/format";
import { randomUUID } from "node:crypto";
import type { AskedReportService } from "./asked-reports";
import type { AiMode } from "./assistant";
import { eventId } from "./assistant";
import type { DebtService } from "./debts";
import { AppError } from "./errors";
import type { MoneyService } from "./money";
import type { SalesReportService } from "./sales-report";
import type { StaffContext } from "./staff";
import type { StockService } from "./stock";

const CHAT = "chat.answer";
/** Look, look again, answer: a question takes at most this many calls to the model. */
const STEPS = 3;
const LOOKS_PER_STEP = 4;
/** The conversation sent back with each question: the last few turns. */
const HISTORY = 8;
const ANSWER_MAX = 2000;
const BILLS_SHOWN = 30;
const STOCK_SHOWN = 80;
const PRODUCTS_SHOWN = 15;

/** Which permission each look needs: the asker sees through the assistant only what they see in the panel. */
const TOOL_NEEDS: Record<ChatTool, Permission> = {
  report: "reports.view",
  summary: "reports.view",
  bills: "bills.view",
  owed: "debts.view",
  stock: "stock.view",
  money: "cash.manage",
};

const SECTION_ABOUT: Record<ReportSection, string> = {
  headline: "the headline numbers of Raporlar (sales, expenses, what was left, orders)",
  sales: "the sales chart of Raporlar",
  hours: "Raporlar's orders by hour of day",
  weekdays: "Raporlar's average sales by weekday",
  months: "Raporlar's month by month sales, expenses and what was left",
  spending: "Raporlar's spending by kind",
  paidWith: "Raporlar's 'how it was paid'",
  products: "Raporlar's products ranked by profit",
};

const ROLE_WORD = { owner: "owner", manager: "manager", chef: "chef", barista: "barista" } as const;

const tl = (kurus: number) => Math.round(kurus) / 100;

/**
 * The assistant's chat (plan piece 29, with B8 and B9). A question goes to the model with
 * what the asker may look at; the model asks to look (a report, the bills, what is owed),
 * Peni runs each look with the asker's own permissions, and the model answers from those
 * numbers alone. Nothing here writes anything but the conversation (D21).
 *
 * "Açıkla" on Raporlar asks the same way, with the part of the page it was pressed on.
 * A report the model draws can be kept on Raporlar: what to add up is kept, not the
 * numbers, so it shows today's.
 */
export class ChatService {
  constructor(
    private readonly store: ChatStore,
    private readonly log: AssistantStore,
    private readonly asked: AskedReportService,
    private readonly sales: SalesReportService,
    private readonly bills: BillStore,
    private readonly debts: DebtService,
    private readonly stock: StockService,
    private readonly money: MoneyService,
    private readonly directory: PeniDirectory,
    private readonly names: (ids: string[]) => Promise<Map<string, string>>,
    private readonly ai: { model: AiModel | null; mode: AiMode },
    private readonly now: () => Date,
  ) {}

  /** The person's newest conversation here, or an empty one. */
  async current(ctx: StaffContext): Promise<ChatDTO> {
    this.require(ctx, "assistant.use");
    return this.dto(ctx, await this.store.latestChat(ctx.cafe.id, ctx.member.id));
  }

  /** "Yeni sohbet": the next question starts a new conversation. Nothing is removed. */
  async fresh(ctx: StaffContext): Promise<ChatDTO> {
    this.require(ctx, "assistant.use");
    const chat = await this.store.latestChat(ctx.cafe.id, ctx.member.id);
    if (chat && chat.messages.length) {
      // Newer than the last one, even within the same millisecond.
      const next = this.newChat(ctx);
      if (next.createdAt <= chat.createdAt) next.createdAt = next.updatedAt = new Date(chat.createdAt.getTime() + 1);
      await this.store.saveChat(next);
    }
    return this.dto(ctx, await this.store.latestChat(ctx.cafe.id, ctx.member.id));
  }

  /** Asks and waits for the answer. The same key twice asks once. */
  async ask(ctx: StaffContext, input: { key: string; text: string; chatId?: string | null; subject?: ChatSubject | null }): Promise<ChatDTO> {
    this.require(ctx, "assistant.use");
    const model = this.ai.model;
    if (!model) throw new AppError("AI_OFF", "The assistant is off", 409);
    const cafeId = ctx.cafe.id;
    const text = input.text.replace(/\s+/g, " ").trim().slice(0, CHAT_TEXT_MAX);
    if (!text) throw new AppError("VALIDATION", "Ask something", 400);

    let chat = input.chatId ? await this.store.getChat(cafeId, input.chatId) : await this.store.latestChat(cafeId, ctx.member.id);
    if (input.chatId && (!chat || chat.memberId !== ctx.member.id)) throw new AppError("CHAT_NOT_FOUND", "No such conversation", 404);
    if (chat?.messages.some((m) => m.key === input.key)) return this.dto(ctx, chat);
    if ((await this.askedToday(ctx)) >= CHAT_PER_DAY) throw new AppError("CHAT_LIMIT", "That's all the questions for today", 429);
    chat ??= this.newChat(ctx);

    const tz = (await this.directory.getSettings(cafeId)).timeZone;
    const today = localDateKey(this.now(), tz);
    const subject = input.subject ?? null;
    const asked: ChatMessage = { id: messageId(), role: "user", text, at: this.now(), key: input.key, subject, sources: [], report: null, failed: false };
    const reply = await this.answer(ctx, model, chat, asked, today);
    chat.messages.push(asked, reply);
    chat.updatedAt = this.now();
    await this.store.saveChat(chat);
    return this.dto(ctx, chat);
  }

  private async answer(ctx: StaffContext, model: AiModel, chat: Chat, asked: ChatMessage, today: string): Promise<ChatMessage> {
    const tools = (Object.keys(TOOL_NEEDS) as ChatTool[]).filter((t) => ctx.permissions.has(TOOL_NEEDS[t]));
    const reply = (text: string, more: Partial<ChatMessage> = {}): ChatMessage => ({
      id: messageId(),
      role: "assistant",
      text,
      at: this.now(),
      key: null,
      subject: null,
      sources: [],
      report: null,
      failed: false,
      ...more,
    });

    let subject: { about: string; numbers: unknown } | null = null;
    try {
      subject = asked.subject ? await this.subjectOf(ctx, asked.subject) : null;
    } catch (e) {
      return reply(e instanceof AppError ? e.message : "That can't be explained.", { failed: true });
    }
    const history = chat.messages.slice(-HISTORY).map((m) => ({
      role: m.role,
      text: m.report ? `${m.text} [drew a chart: ${m.report.spec.title}]` : m.text,
    }));
    const looked: ChatLook[] = [];
    const results = new Map<string, { tool: ChatTool; input: unknown; data: unknown }>();
    const counter = new Map<string, number>();

    for (let step = 1; step <= STEPS; step++) {
      const request = chatRequest({
        today,
        weekday: TURKISH_WEEKDAYS[weekdayOf(today) % 7]!,
        cafe: ctx.cafe.name,
        person: `${ctx.account.name} (${ROLE_WORD[ctx.role]})`,
        tools,
        subject,
        history,
        question: asked.text,
        looked,
        last: step === STEPS,
      });
      let out: ChatStep;
      const started = Date.now();
      try {
        const r = await model.run(request);
        await this.record(ctx, { model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms });
        out = r.output;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.record(ctx, {
          model: model.name,
          ...(isAiError(error) ? error.usage : {}),
          ms: Date.now() - started,
          ok: false,
          detail: message.slice(0, 300),
        });
        return reply("Asistan şu an yanıt veremedi. Biraz sonra yeniden sor.", { failed: true });
      }

      const looks = step < STEPS ? out.looks.slice(0, LOOKS_PER_STEP) : [];
      if (!looks.length || out.answer) {
        const answer = (out.answer ?? "").trim().slice(0, ANSWER_MAX);
        if (!answer) return reply("Bunu şu an yanıtlayamadım. Başka türlü sormayı dene.", { failed: true });
        const shown = out.show ? results.get(out.show) : undefined;
        return reply(answer, {
          sources: this.sources(ctx, out.sources, results),
          report: shown?.tool === "report" ? { spec: shown.input as AskedReport, result: shown.data } : null,
        });
      }
      for (const look of looks) {
        const n = (counter.get(look.tool) ?? 0) + 1;
        counter.set(look.tool, n);
        const ref = `${look.tool}:${n}`;
        const { input, result, data } = await this.look(ctx, look, today);
        looked.push({ ref, tool: look.tool, input, result });
        results.set(ref, { tool: look.tool, input, data });
        // Each bill can be cited by its own ref.
        if (look.tool === "bills" && Array.isArray((result as { bills?: unknown[] }).bills))
          for (const b of (result as { bills: { ref: string; supplier: string | null; date: string; total: number }[] }).bills)
            results.set(b.ref, { tool: "bills", input: null, data: b });
      }
    }
    return reply("Bunu şu an yanıtlayamadım. Başka türlü sormayı dene.", { failed: true });
  }

  /** Runs one look with the asker's permissions; what the model sees and what Peni keeps. */
  private async look(ctx: StaffContext, look: ChatStep["looks"][number], today: string): Promise<{ input: unknown; result: unknown; data: unknown }> {
    if (!ctx.permissions.has(TOOL_NEEDS[look.tool])) return { input: null, result: { error: "Their role can't see this." }, data: null };
    try {
      switch (look.tool) {
        case "report": {
          if (!look.report) return { input: null, result: { error: "Fill in report." }, data: null };
          const spec = cleanSpec(look.report);
          const problem = askedReportProblem(spec, today);
          if (problem) return { input: spec, result: { error: `This report can't be made (${problem}). Pick another split or period.` }, data: null };
          const data = await this.asked.run(ctx, spec);
          return { input: spec, result: forModel(data, spec), data };
        }
        case "summary": {
          const from = look.from ?? `${today.slice(0, 7)}-01`;
          const through = look.through && look.through < today ? look.through : today;
          const r = await this.sales.get(ctx, { from, through });
          const totals = (x: SalesReportDTO["totals"]) => ({
            sales: tl(x.salesKurus),
            expenses: tl(x.expensesKurus),
            leftOver: tl(x.profitKurus),
            orders: x.orders,
            averageOrder: x.avgOrderKurus === null ? null : tl(x.avgOrderKurus),
          });
          const result = {
            from: r.from,
            through: r.through,
            ...totals(r.totals),
            before: { from: r.previous.from, through: r.previous.through, ...totals(r.previousTotals) },
          };
          return { input: { from, through }, result, data: { from: r.from, through: r.through } };
        }
        case "bills": {
          const from = look.from ?? `${today.slice(0, 7)}-01`;
          const through = look.through ?? today;
          const [bills, suppliers] = await Promise.all([
            this.bills.listBills(ctx.cafe.id, { from }),
            this.bills.listSuppliers(ctx.cafe.id, { includeArchived: true }),
          ]);
          const name = new Map(suppliers.map((s) => [s.id, s.name]));
          const q = look.search ? trLower(look.search.trim()) : "";
          const rows = bills
            .filter((b) => !b.voidedAt && b.date <= through && (!q || trLower(name.get(b.supplierId ?? "") ?? "").includes(q)))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, BILLS_SHOWN)
            .map((b) => ({
              ref: `bill:${b.id}`,
              supplier: b.supplierId ? (name.get(b.supplierId) ?? null) : null,
              number: b.number,
              date: b.date,
              total: tl(b.totalKurus),
              paid: tl(b.paidKurus),
              dueDate: b.dueDate,
              overdue: b.paidKurus < b.totalKurus && !!b.dueDate && b.dueDate < today,
              lines: b.lines.slice(0, 5).map((l) => l.name),
            }));
          return { input: { from, through, search: look.search }, result: { bills: rows }, data: null };
        }
        case "owed": {
          const d = await this.debts.get(ctx);
          const result = {
            total: tl(d.totals.totalKurus),
            overdue: tl(d.totals.overdueKurus),
            dueThisWeek: tl(d.totals.weekKurus),
            rows: d.rows.slice(0, 20).map((r) => ({ kind: r.kind, name: r.name, amount: tl(r.amountKurus), dueDate: r.dueDate, overdue: r.overdue })),
            card: d.card ? { balance: tl(d.card.balanceKurus), statement: tl(d.card.statementKurus), dueDate: d.card.dueDate } : null,
          };
          return { input: {}, result, data: null };
        }
        case "stock": {
          const s = await this.stock.view(ctx);
          const q = look.search ? trLower(look.search.trim()) : "";
          const items = s.items
            .filter((i) => !q || trLower(i.name).includes(q))
            .slice(0, STOCK_SHOWN)
            .map((i) => ({ name: i.name, left: i.qtyMilli / 1000, unit: i.unit, warnAt: i.minMilli / 1000 || null, level: i.level }));
          return { input: { search: look.search }, result: { items, wasteLast30Days: tl(s.wasteKurus) }, data: null };
        }
        case "money": {
          const m = await this.money.get(ctx);
          const result = m.started
            ? {
                drawer: m.drawer.balanceKurus === null ? null : tl(m.drawer.balanceKurus),
                drawerOpen: m.drawer.open,
                reserve: tl(m.reserveKurus ?? 0),
                bank: tl(m.bankKurus ?? 0),
              }
            : { notStarted: "Nakit ve banka hasn't been started, so balances aren't kept yet." };
          return { input: {}, result, data: null };
        }
      }
    } catch (e) {
      return { input: null, result: { error: e instanceof AppError ? e.message : "That couldn't be looked at." }, data: null };
    }
  }

  /** What "Açıkla" was pressed on, with its numbers, worked out here rather than taken from the page. */
  private async subjectOf(ctx: StaffContext, subject: ChatSubject): Promise<{ about: string; numbers: unknown }> {
    if (subject.kind === "saved") {
      const saved = (await this.store.listSavedReports(ctx.cafe.id)).find((r) => r.id === subject.reportId);
      if (!saved) throw new AppError("SAVED_REPORT_NOT_FOUND", "No such report", 404);
      const result = await this.asked.run(ctx, saved.spec);
      return { about: `the saved report "${saved.spec.title}"`, numbers: forModel(result, saved.spec) };
    }
    const r = await this.sales.get(ctx, { from: subject.from, through: subject.through });
    const totals = (x: SalesReportDTO["totals"]) => ({ sales: tl(x.salesKurus), expenses: tl(x.expensesKurus), leftOver: tl(x.profitKurus), orders: x.orders });
    const period = { from: r.from, through: r.through, before: { from: r.previous.from, through: r.previous.through, untilTime: r.previous.untilTime } };
    const pick: Record<ReportSection, () => unknown> = {
      headline: () => ({
        now: totals(r.totals),
        before: totals(r.previousTotals),
        averageOrder: r.totals.avgOrderKurus === null ? null : tl(r.totals.avgOrderKurus),
      }),
      sales: () => ({
        step: r.series.step,
        points: r.series.points.map((p) => ({ at: p.key, sales: tl(p.salesKurus), before: p.previousKurus === null ? null : tl(p.previousKurus) })),
        now: totals(r.totals),
        before: totals(r.previousTotals),
      }),
      hours: () => ({ ordersByHour: r.hours }),
      weekdays: () => ({ averageSalesByWeekday: r.weekdays.map((w) => ({ weekday: TURKISH_WEEKDAYS[w.weekday % 7], average: tl(w.avgKurus) })) }),
      months: () => ({
        months: r.months.map((m) => ({ month: m.month, sales: tl(m.salesKurus), expenses: tl(m.expensesKurus), leftOver: tl(m.profitKurus) })),
      }),
      spending: () => ({
        byKind: r.expenses.map((e) => ({ kind: e.kind, amount: tl(e.kurus) })),
        total: tl(r.totals.expensesKurus),
        before: tl(r.previousTotals.expensesKurus),
      }),
      paidWith: () => ({ cash: tl(r.paidWith.cashKurus), card: tl(r.paidWith.cardKurus), peni: tl(r.paidWith.peniKurus), askida: tl(r.paidWith.askidaKurus) }),
      products: () => ({
        products: r.products.slice(0, PRODUCTS_SHOWN).map((p) => ({
          name: p.name,
          sold: p.quantity,
          sales: tl(p.salesKurus),
          unitCost: p.unitCostKurus === null ? null : tl(p.unitCostKurus),
          profit: p.profitKurus === null ? null : tl(p.profitKurus),
          marginPercent: p.marginPercent,
        })),
        productsWithoutCost: r.unpriced,
      }),
    };
    return { about: `${SECTION_ABOUT[subject.section]} for ${r.from} to ${r.through}`, numbers: { ...period, ...(pick[subject.section]() as object) } };
  }

  /** The refs the answer cited, as links: each bill, or the page a look came from. Refs it never looked at are dropped. */
  private sources(ctx: StaffContext, refs: string[], results: Map<string, { tool: ChatTool; input: unknown; data: unknown }>): ChatSource[] {
    const slug = encodeURIComponent(ctx.cafe.slug);
    const out: ChatSource[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
      const r = results.get(ref);
      if (!r) continue;
      let source: ChatSource | null = null;
      if (ref.startsWith("bill:")) {
        const b = r.data as { supplier: string | null; date: string; total: number };
        source = {
          kind: "bill",
          label: `${b.supplier ?? "Fatura"} · ${b.date} · ${formatTL(Math.round(b.total * 100))}`,
          href: `/panel/faturalar?kafe=${slug}&fatura=${encodeURIComponent(ref.slice(5))}`,
        };
      } else if (r.tool === "summary" || r.tool === "report") {
        // A report's days open on Raporlar, where the same sales and spending can be checked.
        const d = r.data as { from?: string; through?: string } | null;
        if (d?.from && d.through) source = { kind: "page", label: "raporlar", href: `/panel/raporlar?kafe=${slug}&from=${d.from}&through=${d.through}` };
      } else if (r.tool === "bills") source = { kind: "page", label: "faturalar", href: `/panel/faturalar?kafe=${slug}` };
      else if (r.tool === "owed") source = { kind: "page", label: "borclar", href: `/panel/borclar?kafe=${slug}` };
      else if (r.tool === "stock") source = { kind: "page", label: "stok", href: `/panel/stok?kafe=${slug}` };
      else if (r.tool === "money") source = { kind: "page", label: "nakit", href: `/panel/nakit?kafe=${slug}` };
      if (source && !seen.has(source.href)) {
        seen.add(source.href);
        out.push(source);
      }
    }
    return out;
  }

  // ─────────────────────────────────────────────── saved reports (B9)

  /** Reports kept on Raporlar, each run for today. */
  async saved(ctx: StaffContext): Promise<SavedReportsDTO> {
    this.require(ctx, "reports.view");
    const list = await this.store.listSavedReports(ctx.cafe.id);
    const names = await this.names(list.map((r) => r.memberId));
    const reports: SavedReportsDTO["reports"] = await Promise.all(
      list.map(async (r) => {
        let result: AskedResultDTO | null = null;
        let problem: string | null = null;
        try {
          result = await this.asked.run(ctx, r.spec);
        } catch (e) {
          problem = e instanceof AppError ? e.code : "UNKNOWN";
        }
        return { id: r.id, spec: r.spec, by: names.get(r.memberId) ?? null, createdAt: r.createdAt.toISOString(), result, problem };
      }),
    );
    return { reports, canAsk: ctx.permissions.has("assistant.use") && this.ai.model !== null };
  }

  /** "Raporlara kaydet". The same key twice keeps it once. */
  async save(ctx: StaffContext, input: { key: string; spec: AskedReport }): Promise<SavedReportsDTO> {
    this.require(ctx, "reports.view");
    const spec = cleanSpec(input.spec);
    const tz = (await this.directory.getSettings(ctx.cafe.id)).timeZone;
    if (askedReportProblem(spec, localDateKey(this.now(), tz))) throw new AppError("ASKED_REPORT", "This report can't be made", 400);
    const list = await this.store.listSavedReports(ctx.cafe.id);
    if (!list.some((r) => r.key === input.key) && list.length >= SAVED_REPORTS_MAX) throw new AppError("SAVED_REPORTS_FULL", "Remove a report first", 409);
    await this.store.addSavedReport({ id: `srp_${randomUUID()}`, cafeId: ctx.cafe.id, memberId: ctx.member.id, spec, createdAt: this.now(), key: input.key });
    return this.saved(ctx);
  }

  async remove(ctx: StaffContext, id: string): Promise<SavedReportsDTO> {
    this.require(ctx, "reports.view");
    if (!(await this.store.listSavedReports(ctx.cafe.id)).some((r) => r.id === id)) throw new AppError("SAVED_REPORT_NOT_FOUND", "No such report", 404);
    await this.store.deleteSavedReport(ctx.cafe.id, id);
    return this.saved(ctx);
  }

  // ───────────────────────────────────────────────

  private async askedToday(ctx: StaffContext): Promise<number> {
    const tz = (await this.directory.getSettings(ctx.cafe.id)).timeZone;
    return this.store.questionsSince(ctx.cafe.id, ctx.member.id, startOfLocalDay(this.now(), tz));
  }

  private newChat(ctx: StaffContext): Chat {
    return { id: `cht_${randomUUID()}`, cafeId: ctx.cafe.id, memberId: ctx.member.id, messages: [], createdAt: this.now(), updatedAt: this.now() };
  }

  private async dto(ctx: StaffContext, chat: Chat | null): Promise<ChatDTO> {
    const left = Math.max(0, CHAT_PER_DAY - (await this.askedToday(ctx)));
    return {
      chatId: chat?.id ?? null,
      messages: (chat?.messages ?? []).map(messageDto),
      ai: this.ai.model ? this.ai.mode : "off",
      left,
      canSaveReports: ctx.permissions.has("reports.view"),
    };
  }

  private async record(ctx: StaffContext, e: { model: string; inputTokens?: number; outputTokens?: number; ms: number; ok?: boolean; detail?: string }) {
    await this.log.addEvent({
      id: eventId(),
      cafeId: ctx.cafe.id,
      at: this.now(),
      kind: "ai.call",
      memberId: ctx.member.id,
      purpose: CHAT,
      model: e.model,
      inputTokens: e.inputTokens ?? 0,
      outputTokens: e.outputTokens ?? 0,
      ms: e.ms,
      ok: e.ok ?? true,
      detail: e.detail ?? null,
      draftId: null,
      documentId: null,
      jobId: null,
    });
  }

  private require(ctx: StaffContext, permission: Permission): void {
    if (ctx.permissions.has(permission)) return;
    if (ctx.rolePermissions.has(permission)) throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    throw new AppError("FORBIDDEN", "Your role can't do this", 403);
  }
}

const messageId = () => `msg_${randomUUID()}`;

function messageDto(m: ChatMessage): ChatMessageDTO {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    at: m.at.toISOString(),
    subject: m.subject,
    sources: m.sources,
    report: m.report ? { spec: m.report.spec, result: m.report.result as AskedResultDTO } : null,
    failed: m.failed,
  };
}

/** What the model wrote, tidied: trimmed names, a title that fits, no stray days on a named period. */
export function cleanSpec(s: AskedReport): AskedReport {
  const names = (list: string[]) => [...new Set(list.map((x) => x.trim()).filter(Boolean))].slice(0, 10);
  return {
    ...s,
    title: (s.title.trim() || "Rapor").slice(0, 80),
    from: s.period === "custom" ? s.from : null,
    through: s.period === "custom" ? s.through : null,
    products: names(s.products),
    categories: names(s.categories),
  };
}

/** A row as the model reads it: a weekday's name, "08:00", a product's name. */
function rowName(by: AskedReport["by"], x: AskedResultDTO["rows"][number]): string {
  if (x.label) return x.label;
  if (by === "weekday") return TURKISH_WEEKDAYS[Number(x.key) % 7]!;
  if (by === "hour") return `${x.key}:00`;
  if (x.key === "_none") return by === "supplier" ? "no supplier" : "no category";
  return x.key;
}

/** A report's numbers as the model reads them: lira, not kuruş, and only what it needs. */
function forModel(r: AskedResultDTO, spec: AskedReport) {
  const v = (n: number | null) => (n === null ? null : r.unit === "kurus" ? tl(n) : n);
  return {
    title: spec.title,
    from: r.from,
    through: r.through,
    comparedWith: r.compareFrom ? { from: r.compareFrom, through: r.compareThrough } : null,
    unit: r.unit === "kurus" ? "TL" : spec.measure === "orders" ? "orders" : "items",
    total: v(r.total),
    totalBefore: v(r.previousTotal),
    rows: r.rows.map((x) => ({ [spec.by]: rowName(spec.by, x), value: v(x.value), before: v(x.previous) })),
    rest: r.rest ? { rows: r.rest.rows, value: v(r.rest.value) } : null,
    notes: r.notes.map((n) =>
      n === "orders"
        ? "Sales by product come from the orders after discounts, however they were paid."
        : n === "noCost"
          ? `${r.noCost} products have no recipe cost and aren't in the profit.`
          : "No product or category has that name.",
    ),
    matched: r.matched,
  };
}
