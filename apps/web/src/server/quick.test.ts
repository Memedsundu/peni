import { readQuick, ScriptedModel, ScriptedTranscriber, type AiRequest, type QuickReading } from "@peni/ai";
import type { BillDraftDTO, DraftsDTO } from "@peni/api";
import { addDays, localDateKey, QUICK_PER_DAY } from "@peni/core";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_HEARD } from "./assistant";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let answer: (request: AiRequest<unknown>) => unknown;
let model: ScriptedModel;
let ears: ScriptedTranscriber;
let heard: () => string;
let leyla: StaffContext;
let ece: StaffContext;

const at = async (a: PeniApp, who: keyof typeof DEMO_STAFF, slug = "moda") =>
  a.staff.at((await a.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
const day = (n: number) => localDateKey(addDays(now, n), "Europe/Istanbul");
const bills = (l: DraftsDTO) => l.open.filter((d): d is BillDraftDTO => d.kind === "bill");
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

type Expense = QuickReading["expenses"][number];
const expense = (more: Partial<Expense>): Expense => ({
  supplier: null,
  supplierName: null,
  date: day(0),
  dueDate: null,
  paid: "unknown",
  lines: [{ name: "Gider", quantity: null, unit: null, total: 100, category: "other", stockItem: null, stockQuantity: null }],
  ...more,
});

let keys = 0;
async function say(ctx: StaffContext, text: string, voice = false) {
  now = new Date(now.getTime() + 60_000);
  const sent = await app.assistant.quick(ctx, { key: `k${++keys}`, text, voice });
  await app.assistant.runSoon();
  return sent;
}

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  answer = () => ({ expenses: [], doubts: [] });
  model = new ScriptedModel((r) => answer(r), "test-model");
  heard = () => "Simitçiye 120 lira verdim";
  ears = new ScriptedTranscriber(() => heard(), "test-ears");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on", transcriber: ears } }, inMemoryStores());
  await seed(app, { drafts: false });
  [leyla, ece] = await Promise.all([at(app, "leyla"), at(app, "ece")]);
});

describe("Quick entry (plan piece 28, A7)", () => {
  it("turns a typed line into a bill draft, with the café's suppliers and stock to match, and what was typed beside it", async () => {
    answer = (r) => {
      const context = (r.parts[0] as { text: string }).text;
      const simit = /^(\d+)\. Simit \(adet\)$/m.exec(context)![1];
      return {
        expenses: [
          expense({
            supplier: 4,
            date: day(-1),
            paid: "cash",
            lines: [{ name: "Simit", quantity: 40, unit: "adet", total: 400, category: "ingredients", stockItem: Number(simit), stockQuantity: 40 }],
          }),
        ],
        doubts: [],
      } satisfies QuickReading;
    };
    const sent = await say(ece, "Dün Fırıncı Hasan'a 40 simit için 400 lira nakit verdim");
    expect(sent.reading).toMatchObject({ source: "note", documentName: "Dün Fırıncı Hasan'a 40 simit için 400 lira nakit verdim", state: "reading" });

    const request = model.calls[0]!;
    expect(request.purpose).toBe("note.read");
    const context = (request.parts[0] as { text: string }).text;
    expect(context).toContain(`Today is ${day(0)} (Cuma).`);
    // Suppliers in the café's order: the model answers with their numbers.
    expect(context).toContain("Suppliers:\n1. Ali Rıza Bey (mal sahibi)\n2. Ambalaj Dünyası\n3. Boğaziçi Elektrik\n4. Fırıncı Hasan");
    expect((request.parts[1] as { text: string }).text).toBe("What they wrote:\nDün Fırıncı Hasan'a 40 simit için 400 lira nakit verdim");

    const list = await app.assistant.list(leyla);
    expect(list.reading).toEqual([]);
    const [draft] = bills(list);
    expect(draft).toMatchObject({
      title: "Fırıncı Hasan · ₺400",
      document: null,
      entry: { text: "Dün Fırıncı Hasan'a 40 simit için 400 lira nakit verdim", voice: false },
      proposal: {
        supplierId: "sup_seed_firin",
        date: day(-1),
        paid: { method: "cash" },
        lines: [{ itemId: "stk_simit", qtyMilli: 40_000, totalKurus: 40_000 }],
      },
    });
    // Ece sees it waiting at the till.
    expect((await app.assistant.mine(ece)).uploads[0]).toMatchObject({ source: "note", state: "waiting", title: "Fırıncı Hasan · ₺400" });

    // Leyla confirms it as said: paid in cash from the reserve, on the day it was paid.
    const confirmed = await app.assistant.confirm(leyla, draft!.id, {
      supplierId: "sup_seed_firin",
      date: day(-1),
      lines: [{ itemId: "stk_simit", qtyMilli: 40_000, totalKurus: 40_000, from: 0 }],
      paid: { method: "cash", from: "reserve" },
    });
    expect([confirmed.status, confirmed.changed]).toEqual(["confirmed", []]);
    const bill = await app.bills.get(leyla, confirmed.resultId!);
    expect([bill.state, bill.createdBy, bill.payments.map((p) => [p.method, p.paidOn, p.amountKurus])]).toEqual([
      "paid",
      "Leyla Kara",
      [["cash", day(-1), 40_000]],
    ]);
    const reserve = (await app.money.get(leyla)).lines.find((l) => l.billId === bill.id);
    expect(reserve).toMatchObject({ account: "reserve", day: day(-1), amountKurus: -40_000 });
    // Confirming again adds and pays it once.
    expect(
      (
        await app.assistant.confirm(leyla, draft!.id, {
          supplierId: "sup_seed_firin",
          date: day(-1),
          lines: [{ itemId: "stk_simit", qtyMilli: 40_000, totalKurus: 40_000 }],
          paid: { method: "cash", from: "reserve" },
        })
      ).resultId,
    ).toBe(bill.id);
    expect((await app.bills.get(leyla, bill.id)).payments).toHaveLength(1);

    const log = (await app.assistant.log(leyla)).events.map((e) => [e.kind, e.purpose]);
    // Newest first: confirmed, then what the assistant did with what Ece sent.
    expect(log.slice(1, 4)).toEqual([
      ["draft.created", "note.read"],
      ["ai.call", "note.read"],
      ["note.sent", null],
    ]);
  });

  it("makes a draft per expense; a new name is offered as a supplier, an unpaid one keeps when it's due", async () => {
    answer = () =>
      ({
        expenses: [
          expense({
            supplierName: "Tesisatçı Ahmet",
            paid: "unpaid",
            dueDate: day(10),
            lines: [{ name: "Musluk tamiri", quantity: null, unit: null, total: 450, category: "services", stockItem: null, stockQuantity: null }],
          }),
          expense({ supplier: 99, supplierName: null, paid: "credit", date: day(5) }),
        ],
        doubts: ["İkinci giderin kime ödendiği söylenmedi."],
      }) satisfies QuickReading;
    await say(leyla, "Tesisatçı Ahmet'e 450 borçlandık, ayın 26'sında ödenecek; bir de kredi kartıyla 100 lira bir şey aldık");
    const drafts = bills(await app.assistant.list(leyla)).sort((a, b) => a.title.localeCompare(b.title, "tr"));
    expect(drafts.map((d) => [d.title, d.proposal.supplierId, d.proposal.supplierName, d.proposal.paid, d.proposal.dueDate, d.proposal.date])).toEqual([
      ["Gider · ₺100", null, null, { method: "credit" }, null, day(0)],
      ["Tesisatçı Ahmet · ₺450", null, "Tesisatçı Ahmet", null, day(10), day(0)],
    ]);
    // A day in the future is today, with a note; the note on the whole entry is on each.
    expect(drafts[0]!.doubts).toEqual(["İkinci giderin kime ödendiği söylenmedi.", "Tarih ileride göründü; bugün yazıldı."]);

    // Paid by the café's credit card as it's confirmed (piece 19's card).
    const done = await app.assistant.confirm(leyla, drafts[0]!.id, {
      supplierId: null,
      date: day(0),
      lines: [{ itemId: null, name: "Gider", category: "other", totalKurus: 10_000 }],
      paid: { method: "credit" },
    });
    expect((await app.bills.get(leyla, done.resultId!)).payments.map((p) => p.method)).toEqual(["credit"]);
    // Changing how it was paid is logged.
    const other = await app.assistant.confirm(leyla, drafts[1]!.id, {
      supplierId: null,
      date: day(0),
      dueDate: day(10),
      lines: [{ itemId: null, name: "Musluk tamiri", category: "services", totalKurus: 45_000 }],
      paid: { method: "bank" },
    });
    expect(other.changed).toEqual(["paid"]);
  });

  it("drafts nothing from words that aren't an expense, and says why", async () => {
    answer = () => ({ expenses: [], doubts: ["Bu bir gider değil, satış gibi görünüyor."] }) satisfies QuickReading;
    await say(leyla, "Bugün 3 bin liralık satış yaptık");
    const list = await app.assistant.list(leyla);
    expect(list.open).toEqual([]);
    expect(list.reading).toEqual([expect.objectContaining({ source: "note", state: "notBill", error: "Bu bir gider değil, satış gibi görünüyor." })]);
  });

  it("sends the same entry once, keeps to a daily limit, and is for people who add bills", async () => {
    const one = await app.assistant.quick(ece, { key: "same", text: "Simitçiye 120" });
    const two = await app.assistant.quick(ece, { key: "same", text: "Simitçiye 120" });
    expect(two.reading!.jobId).toBe(one.reading!.jobId);
    for (let i = 1; i < QUICK_PER_DAY; i++) await app.assistant.quick(leyla, { key: `n${i}`, text: `Gider ${i}` });
    expect(await code(app.assistant.quick(leyla, { key: "over", text: "Bir tane daha" }))).toBe("QUICK_LIMIT");
    // The next day starts again.
    now = new Date(now.getTime() + 24 * 3_600_000);
    expect(await code(app.assistant.quick(leyla, { key: "tomorrow", text: "Yarın" }))).toBe("ok");
    const tarik = await at(app, "tarik", "kuzguncuk");
    expect(await code(app.assistant.quick(await at(app, "leyla", "kuzguncuk"), { key: "x", text: "y" }))).toBe("ok");
    expect(await code(app.assistant.quick(tarik, { key: "x", text: "   " }))).toBe("VALIDATION");
  });

  it("turns a short recording into text to read before sending, keeping nothing but the log", async () => {
    expect(await app.assistant.hear(ece, WEBM, "tr")).toEqual({ text: "Simitçiye 120 lira verdim" });
    expect(ears.calls[0]).toMatchObject({ language: "tr", clip: { contentType: "audio/webm" } });
    expect(ears.calls[0]!.prompt).toContain("Fırıncı Hasan");
    expect((await app.assistant.log(leyla)).events[0]).toMatchObject({ kind: "ai.call", purpose: "voice.hear", model: "test-ears", ok: true });
    expect((await app.assistant.list(leyla)).canSpeak).toBe(true);

    expect(await code(app.assistant.hear(ece, new TextEncoder().encode("not audio"), "tr"))).toBe("AUDIO_TYPE");
    expect(await code(app.assistant.hear(ece, new Uint8Array(6 * 1024 * 1024).fill(0x1a), "tr"))).toBe("AUDIO_TOO_LARGE");
    heard = () => "  ";
    expect(await code(app.assistant.hear(ece, WEBM, "tr"))).toBe("VOICE_EMPTY");
    heard = () => {
      throw new Error("down");
    };
    expect(await code(app.assistant.hear(ece, WEBM, "en"))).toBe("VOICE_FAILED");
    expect((await app.assistant.log(leyla)).events[0]).toMatchObject({ kind: "ai.call", purpose: "voice.hear", ok: false, detail: "down" });

    // Said, then sent: the draft knows it was said.
    answer = () => ({ expenses: [expense({ supplierName: "Simitçi" })], doubts: [] }) satisfies QuickReading;
    await say(ece, "Simitçiye 120 lira verdim", true);
    expect((model.calls.at(-1)!.parts[1] as { text: string }).text).toBe("What they said:\nSimitçiye 120 lira verdim");
    expect(bills(await app.assistant.list(leyla))[0]!.entry).toEqual({ text: "Simitçiye 120 lira verdim", voice: true });

    // Without speech to text, typing still works.
    const plain = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on" } }, inMemoryStores());
    await seed(plain, { drafts: false });
    const owner = await at(plain, "leyla");
    expect((await plain.assistant.list(owner)).canSpeak).toBe(false);
    expect(await code(plain.assistant.hear(owner, WEBM, "tr"))).toBe("VOICE_OFF");
  });

  it("checks what was read: days, suppliers, amounts, and at most a few expenses", () => {
    const r = readQuick(
      {
        expenses: [expense({ date: "2026-02-30", supplier: 0 }), expense({ lines: [] }), ...Array.from({ length: 6 }, (_, i) => expense({ supplier: i + 1 }))],
        doubts: [],
      },
      { today: "2026-10-16", suppliers: 3, items: 0, max: 5 },
    );
    expect(r.expenses).toHaveLength(5);
    expect(r.expenses[0]).toMatchObject({ date: "2026-10-16", supplierIndex: null, doubts: ["Tarih anlaşılamadı; bugün yazıldı."] });
    expect(r.expenses.slice(1).map((e) => e.supplierIndex)).toEqual([0, 1, 2, null]);
    expect(r.doubts).toEqual(["İlk 5 gider yazıldı; gerisini ayrıca gönder."]);
  });
});

describe("Quick entry in the demo (plan piece 28)", () => {
  it("picks out amounts, the day, how it was paid and who it went to, and hears a sample sentence", async () => {
    const demo = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
    await seed(demo, { drafts: false });
    const owner = await at(demo, "leyla");
    expect(await demo.assistant.hear(owner, WEBM, "tr")).toEqual({ text: DEMO_HEARD });
    await demo.assistant.quick(owner, { key: "d1", text: "Dün tesisatçıya 450 lira nakit, Fırıncı Hasan'a 2 bin lira havale" });
    await demo.assistant.runSoon();
    const drafts = bills(await demo.assistant.list(owner)).sort((a, b) => a.title.localeCompare(b.title, "tr"));
    expect(drafts.map((d) => [d.title, d.proposal.supplierId, d.proposal.date, d.proposal.paid?.method, d.proposal.lines[0]!.category])).toEqual([
      ["Fırıncı Hasan · ₺2.000", "sup_seed_firin", day(-1), "bank", "other"],
      ["Tesisatçı · ₺450", null, day(-1), "cash", "services"],
    ]);
  });
});
