import { ScriptedModel, type AiRequest, type ChatStep } from "@peni/ai";
import { CHAT_PER_DAY, SAVED_REPORTS_MAX, type AskedReport } from "@peni/core";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { demoChat } from "./chat-demo";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: ReturnType<typeof inMemoryStores>;
let now: Date;
let steps: ((r: AiRequest<unknown>) => ChatStep)[];
let model: ScriptedModel;
let leyla: StaffContext;
let ece: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
const spec = (more: Partial<AskedReport>): AskedReport => ({
  title: "Rapor",
  measure: "sales",
  by: "none",
  period: "thisMonth",
  from: null,
  through: null,
  compare: "previous",
  products: [],
  categories: [],
  chart: "bar",
  ...more,
});
const step = (more: Partial<ChatStep>): ChatStep => ({ looks: [], answer: null, sources: [], show: null, ...more });
const look = (more: Partial<ChatStep["looks"][number]>): ChatStep["looks"][number] => ({
  tool: "summary",
  report: null,
  from: null,
  through: null,
  search: null,
  ...more,
});
const text = (r: AiRequest<unknown>) => r.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n\n");
let keys = 0;
const ask = (ctx: StaffContext, q: string, more: { subject?: Parameters<PeniApp["chat"]["ask"]>[1]["subject"]; chatId?: string } = {}) =>
  app.chat.ask(ctx, { key: `key-${++keys}`, text: q, ...more });

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  steps = [];
  model = new ScriptedModel((r) => {
    const next = steps.shift();
    if (!next) throw new Error("no more steps");
    return next(r);
  }, "test-model");
  stores = inMemoryStores();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on" } }, stores);
  await seed(app, { drafts: false });
  [leyla, ece] = await Promise.all([at("leyla"), at("ece")]);
});

describe("Reports on request (plan piece 29, B9)", () => {
  it("adds up the same money as Raporlar, compared the same way", async () => {
    const page = await app.salesReports.get(leyla);
    const sales = await app.askedReports.run(leyla, spec({}));
    expect(sales).toMatchObject({ from: "2026-10-01", through: "2026-10-16", compareFrom: "2026-09-01", compareThrough: "2026-09-16", unit: "kurus" });
    expect([sales.total, sales.previousTotal]).toEqual([page.totals.salesKurus, page.previousTotals.salesKurus]);

    const byDay = await app.askedReports.run(leyla, spec({ by: "day" }));
    expect(byDay.rows.map((r) => r.key)).toEqual(Array.from({ length: 16 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`));
    expect(byDay.rows.reduce((s, r) => s + r.value, 0)).toBe(page.totals.salesKurus);

    const spending = await app.askedReports.run(leyla, spec({ measure: "expenses", by: "expenseKind" }));
    expect(spending.total).toBe(page.totals.expensesKurus);
    expect(spending.rows.find((r) => r.key === "rent")!.value).toBe(page.expenses.find((e) => e.kind === "rent")!.kurus);
    const profit = await app.askedReports.run(leyla, spec({ measure: "profit" }));
    expect(profit.total).toBe(page.totals.profitKurus);

    const orders = await app.askedReports.run(leyla, spec({ measure: "orders" }));
    expect(orders).toMatchObject({ unit: "count", total: page.totals.orders });
  });

  it("splits by product and narrows to some products by part of their name, from the orders", async () => {
    const page = await app.salesReports.get(leyla);
    const qty = await app.askedReports.run(leyla, spec({ measure: "quantity", by: "product", compare: "none" }));
    const latte = page.products.find((p) => p.name === "Latte")!;
    expect(qty.rows.find((r) => r.label === "Latte")!.value).toBe(latte.quantity);
    expect(qty.previousTotal).toBeNull();

    const kahve = await app.askedReports.run(leyla, spec({ by: "hour", products: ["kahve"] }));
    expect(kahve.matched.sort()).toEqual(["Filtre Kahve", "Türk Kahvesi"]);
    expect(kahve.notes).toContain("orders");
    const fromProducts = page.products.filter((p) => p.name.includes("Kahve")).reduce((s, p) => s + p.salesKurus, 0);
    expect(kahve.total).toBe(fromProducts);
    expect(kahve.rows.every((r) => /^\d\d$/.test(r.key))).toBe(true);

    const profit = await app.askedReports.run(leyla, spec({ measure: "profit", by: "product", compare: "none" }));
    for (const p of page.products.filter((x) => x.profitKurus !== null)) expect(profit.rows.find((r) => r.key === p.productId)?.value).toBe(p.profitKurus);
    expect(profit.noCost).toBe(page.unpriced);

    const none = await app.askedReports.run(leyla, spec({ products: ["pizza"] }));
    expect([none.total, none.notes]).toEqual([0, ["noMatch", "orders"]]);
  });

  it("refuses what can't be added up, and anyone who doesn't see reports", async () => {
    expect(await code(app.askedReports.run(leyla, spec({ measure: "expenses", by: "hour" })))).toBe("ASKED_REPORT");
    expect(await code(app.askedReports.run(leyla, spec({ by: "day", period: "thisYear" })))).toBe("ASKED_REPORT");
    expect(await code(app.askedReports.run(leyla, spec({ period: "custom", from: "2026-10-10", through: "2026-10-01" })))).toBe("ASKED_REPORT");
    expect(await code(app.askedReports.run(ece, spec({})))).toBe("FORBIDDEN");
  });

  it("keeps a report on Raporlar once per key, runs it for today, and takes it off", { timeout: 60_000 }, async () => {
    const s = spec({ title: "Saat saat kahve", by: "hour", products: ["kahve"] });
    const saved = await app.chat.save(leyla, { key: "save-key-1", spec: s });
    expect(saved.reports).toHaveLength(1);
    expect(saved.reports[0]).toMatchObject({ spec: { title: "Saat saat kahve" }, by: "Leyla Kara", problem: null });
    expect(saved.reports[0]!.result!.matched.length).toBe(2);
    expect((await app.chat.save(leyla, { key: "save-key-1", spec: s })).reports).toHaveLength(1);

    // A named period moves with the calendar.
    now = new Date("2026-11-03T09:00:00Z");
    expect((await app.chat.saved(leyla)).reports[0]!.result).toMatchObject({ from: "2026-11-01", through: "2026-11-03" });

    expect(await code(app.chat.saved(ece))).toBe("FORBIDDEN");
    expect(await code(app.chat.save(leyla, { key: "save-key-2", spec: spec({ measure: "expenses", by: "product" }) }))).toBe("ASKED_REPORT");
    for (let i = 1; i < SAVED_REPORTS_MAX; i++)
      await stores.chat.addSavedReport({
        id: `srp_fill_${i}`,
        cafeId: "cafe_moda",
        memberId: leyla.member.id,
        spec: spec({ by: "none" }),
        createdAt: now,
        key: `fill-key-${i}`,
      });
    expect(await code(app.chat.save(leyla, { key: "one-too-many", spec: s }))).toBe("SAVED_REPORTS_FULL");
    const left = await app.chat.remove(leyla, saved.reports[0]!.id);
    expect(left.reports).toHaveLength(SAVED_REPORTS_MAX - 1);
    expect(await code(app.chat.remove(leyla, saved.reports[0]!.id))).toBe("SAVED_REPORT_NOT_FOUND");
  });
});

describe("The assistant's chat (plan piece 29)", () => {
  it("looks first, answers from what it saw, links what it cites and draws the report it asked for", async () => {
    let billId = "";
    steps = [
      (r) => {
        const t = text(r);
        expect(t).toContain("Today is 2026-10-16 (Cuma). Café: Moda Kahvesi. You are talking to Leyla Kara (owner).");
        for (const tool of ["report", "summary", "bills", "owed", "stock", "money"]) expect(t).toContain(`- ${tool}:`);
        expect(t).toContain("Their question:\nBu ay kahve satışları saat saat nasıl?");
        return step({
          looks: [look({ tool: "report", report: spec({ title: "Saat saat kahve", by: "hour", products: ["kahve"] }) }), look({ tool: "bills" })],
        });
      },
      (r) => {
        const t = text(r);
        expect(t).toMatch(/\[report:1\] report .*\n= .*"unit":"TL"/);
        expect(t).toContain('"hour":"');
        billId = /"ref":"bill:([^"]+)"/.exec(t)![1]!;
        return step({ answer: "En çok öğlen satıyor.", sources: ["report:1", `bill:${billId}`, "bill:made-up"], show: "report:1" });
      },
    ];
    const chat = await ask(leyla, "Bu ay kahve satışları saat saat nasıl?");
    expect(chat.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "Bu ay kahve satışları saat saat nasıl?"],
      ["assistant", "En çok öğlen satıyor."],
    ]);
    const reply = chat.messages[1]!;
    // The report's days open on Raporlar; each bill opens itself.
    expect(reply.sources).toEqual([
      { kind: "page", label: "raporlar", href: "/panel/raporlar?kafe=moda&from=2026-10-01&through=2026-10-16" },
      { kind: "bill", label: expect.stringMatching(/ · 2026-10-\d\d · ₺/), href: `/panel/faturalar?kafe=moda&fatura=${billId}` },
    ]);
    expect(reply.report?.spec.title).toBe("Saat saat kahve");
    expect(reply.report?.result.matched.length).toBe(2);
    expect(chat.left).toBe(CHAT_PER_DAY - 1);

    const log = await app.assistant.log(leyla);
    expect(log.events.slice(0, 2).map((e) => [e.kind, e.purpose, e.model, e.who])).toEqual([
      ["ai.call", "chat.answer", "test-model", "Leyla Kara"],
      ["ai.call", "chat.answer", "test-model", "Leyla Kara"],
    ]);

    // The same key again doesn't ask again.
    expect((await app.chat.ask(leyla, { key: `key-${keys}`, text: "Bu ay kahve satışları saat saat nasıl?" })).messages).toHaveLength(2);
    expect(model.calls).toHaveLength(2);

    // The next question carries the conversation; "Yeni sohbet" starts over.
    steps = [(r) => (expect(text(r)).toContain("You: En çok öğlen satıyor. [drew a chart: Saat saat kahve]"), step({ answer: "Tamam." }))];
    expect((await ask(leyla, "Peki ya geçen ay?")).messages).toHaveLength(4);
    const fresh = await app.chat.fresh(leyla);
    expect([fresh.messages.length, fresh.chatId === chat.chatId]).toEqual([0, false]);
    expect((await app.chat.current(leyla)).chatId).toBe(fresh.chatId);
  });

  it("explains a part of Raporlar from the numbers Peni works out, not the page's", async () => {
    const page = await app.salesReports.get(leyla, { from: "2026-10-01", through: "2026-10-15" });
    steps = [
      (r) => {
        const t = text(r);
        expect(t).toContain('They pressed "Açıkla" (explain) on the headline numbers of Raporlar');
        const numbers = JSON.parse(t.slice(t.indexOf("Numbers:\n") + 9, t.indexOf("\n\nTheir question")));
        expect(numbers.now.sales).toBe(page.totals.salesKurus / 100);
        expect(numbers.before).toMatchObject({ orders: page.previousTotals.orders });
        return step({ answer: "Satışlar geçen aya göre arttı." });
      },
    ];
    const chat = await ask(leyla, "Açıkla: Özet · 1–15 Eki", { subject: { kind: "report", section: "headline", from: "2026-10-01", through: "2026-10-15" } });
    expect(chat.messages[0]!.subject).toEqual({ kind: "report", section: "headline", from: "2026-10-01", through: "2026-10-15" });
    expect(chat.messages[1]!.text).toBe("Satışlar geçen aya göre arttı.");
  });

  it("stops looking after three steps, and says so when the model can't be reached", async () => {
    const forever = () => step({ looks: [look({ tool: "summary" })] });
    steps = [forever, forever, forever];
    const chat = await ask(leyla, "Döngü");
    expect(model.calls).toHaveLength(3);
    expect(text(model.calls[2]!)).toContain("Answer now with what you have");
    expect(chat.messages[1]).toMatchObject({ failed: true, text: "Bunu şu an yanıtlayamadım. Başka türlü sormayı dene." });

    steps = [];
    const down = await ask(leyla, "Satış?");
    expect(down.messages[3]).toMatchObject({ failed: true, text: "Asistan şu an yanıt veremedi. Biraz sonra yeniden sor." });
    expect((await app.assistant.log(leyla)).events[0]).toMatchObject({ kind: "ai.call", purpose: "chat.answer", ok: false });
  });

  it("is for those who use the assistant, sees only what they see, and has a daily limit", async () => {
    expect(await code(app.chat.current(ece))).toBe("FORBIDDEN");
    expect(await code(ask(ece, "Satış?"))).toBe("FORBIDDEN");

    // Murat, the manager, doesn't keep the money; a look at it is refused for him.
    const murat = await at("murat");
    if (!murat.permissions.has("cash.manage")) {
      steps = [
        (r) => (expect(text(r)).not.toContain("- money:"), step({ looks: [look({ tool: "money" })] })),
        (r) => (expect(text(r)).toContain("Their role can't see this."), step({ answer: "Göremiyorum." })),
      ];
      await ask(murat, "Kasada ne var?");
    }

    steps = Array.from({ length: CHAT_PER_DAY }, () => () => step({ answer: "Evet." }));
    const first = await app.chat.current(leyla);
    for (let i = first.left; i > 0; i--) await ask(leyla, "Soru");
    expect(await code(ask(leyla, "Bir tane daha"))).toBe("CHAT_LIMIT");
    now = new Date("2026-10-17T09:00:00Z");
    expect((await app.chat.current(leyla)).left).toBe(CHAT_PER_DAY);
  });

  it("is off without a model", async () => {
    const off = new PeniApp({ demo: false, bcryptRounds: 4, clock: () => now, ai: { model: null, mode: "off" } }, inMemoryStores());
    await seed(off, { drafts: false });
    const ctx = await off.staff.at((await off.staff.signIn(DEMO_STAFF.leyla.email, DEMO_STAFF_PASSWORD)).token, "moda");
    expect((await off.chat.current(ctx)).ai).toBe("off");
    expect(await code(off.chat.ask(ctx, { key: "key-off-1", text: "Satış?" }))).toBe("AI_OFF");
    expect((await off.chat.saved(ctx)).canAsk).toBe(false);
  });

  it("in the demo, picks a look from the question's words and reads the numbers back", async () => {
    const demo = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
    await seed(demo, { drafts: false });
    const ctx = await demo.staff.at((await demo.staff.signIn(DEMO_STAFF.leyla.email, DEMO_STAFF_PASSWORD)).token, "moda");
    const chat = await demo.chat.ask(ctx, { key: "demo-key-1", text: "Bu ay saat saat kahve satışı" });
    expect(chat.messages[1]!.report?.spec).toMatchObject({ measure: "sales", by: "hour", products: ["kahve"], period: "thisMonth" });
    expect(chat.messages[1]!.text).toMatch(/^Saat saat kahve satışı: 2026-10-01 – 2026-10-16 toplamı ₺/);

    const owed = await demo.chat.ask(ctx, { key: "demo-key-2", text: "Ne kadar borcumuz var?" });
    expect(owed.messages[3]!.text).toMatch(/^Toplam borç ₺/);
    expect(owed.messages[3]!.sources).toEqual([{ kind: "page", label: "borclar", href: "/panel/borclar?kafe=moda" }]);

    const explained = await demo.chat.ask(ctx, {
      key: "demo-key-3",
      text: "Açıkla",
      subject: { kind: "report", section: "headline", from: "2026-10-01", through: "2026-10-16" },
    });
    expect(explained.messages[5]!.text).toMatch(/^Bu dönemde satış ₺.*önceki döneme göre %/);
    expect(demoChat(["", "Their question:\nmerhaba"]).answer).toMatch(/^Demo: bunu yanıtlayamıyorum/);
  });
});
