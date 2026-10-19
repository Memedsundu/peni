import { AiError, ScriptedModel, type BillReading } from "@peni/ai";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: PeniStores;
let now: Date;
let answer: () => unknown;
let model: ScriptedModel;
let leyla: StaffContext;
let murat: StaffContext;
let ece: StaffContext;
let tarik: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );

const PDF = new TextEncoder().encode("%PDF-1.4\n% a bill\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const milk: BillReading = {
  isBill: true,
  supplierName: "MODA SÜT ÜRÜNLERİ GIDA TİC. LTD. ŞTİ.",
  supplierTaxNumber: null,
  number: "MS-0412",
  date: "2026-10-15",
  dueDate: "2026-10-30",
  total: 1260,
  lines: [
    { name: "Süt 1 L", quantity: 24, unit: "adet", total: 960, category: "ingredients" },
    { name: "Krema 1 L", quantity: 4, unit: "adet", total: 300, category: "ingredients" },
  ],
  doubts: ["Fatura numarasının son hanesi silik."],
};

/** Uploads and lets the background run, as the route does after answering. */
async function read(ctx: StaffContext, bytes = PDF, name = "sut.pdf") {
  const reading = await app.assistant.upload(ctx, bytes, name);
  await app.assistant.runSoon();
  return reading;
}

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  answer = () => milk;
  model = new ScriptedModel(() => answer(), "test-model");
  stores = inMemoryStores();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on" } }, stores);
  await seed(app, { sales: false, drafts: false });
  [leyla, murat, ece, tarik] = await Promise.all([at("leyla"), at("murat"), at("ece"), at("tarik", "kuzguncuk")]);
});

describe("The assistant's ground (plan piece 24)", () => {
  it("reads an uploaded bill in the background into a draft, with the supplier it knows and what it wasn't sure of", async () => {
    const reading = await app.assistant.upload(murat, PDF, "sut.pdf");
    expect(reading).toMatchObject({ documentName: "sut.pdf", state: "reading", error: null });
    expect((await app.assistant.list(leyla)).reading.map((r) => r.state)).toEqual(["reading"]);
    expect(model.calls).toHaveLength(0);

    await app.assistant.runSoon();
    expect(model.calls[0]!.purpose).toBe("document.read");
    expect(model.calls[0]!.parts[1]).toMatchObject({ type: "pdf", name: "sut.pdf" });

    const drafts = await app.assistant.list(leyla);
    expect(drafts).toMatchObject({ ai: "on", canUpload: true, canConfirm: true, reading: [], recent: [] });
    const [draft] = drafts.open;
    expect(draft).toMatchObject({
      kind: "bill",
      status: "open",
      title: "MODA SÜT ÜRÜNLERİ GIDA TİC. LTD. ŞTİ. · ₺1.260",
      doubts: ["Fatura numarasının son hanesi silik."],
      proposal: { supplierId: "sup_seed_sut", number: "MS-0412", date: "2026-10-15", dueDate: "2026-10-30", totalKurus: 126_000 },
      document: { name: "sut.pdf", contentType: "application/pdf", size: PDF.length },
    });
    expect(draft!.proposal.lines).toEqual([
      { itemId: null, name: "Süt 1 L", category: "ingredients", qtyMilli: null, totalKurus: 96_000 },
      { itemId: null, name: "Krema 1 L", category: "ingredients", qtyMilli: null, totalKurus: 30_000 },
    ]);
    expect(draft!.document!.url).toBe(`/api/v1/staff/moda/documents/${draft!.document!.id}`);

    // Bugün says it's waiting, to those who use the assistant.
    expect((await app.alerts.today(leyla)).alerts.find((a) => a.type === "draftsOpen")).toMatchObject({
      count: 1,
      names: [draft!.title],
      href: "/panel/taslaklar",
    });
    expect((await app.alerts.today(ece)).alerts.some((a) => a.type === "draftsOpen")).toBe(false);

    // Everything is in the log, with who started it.
    const log = await app.assistant.log(leyla);
    expect(log.events.map((e) => [e.kind, e.who, e.ok])).toEqual([
      ["draft.created", "Murat Aksu", true],
      ["ai.call", "Murat Aksu", true],
      ["document.uploaded", "Murat Aksu", true],
    ]);
    expect(log.events[1]).toMatchObject({ purpose: "document.read", model: "test-model" });
    expect(log.month.calls).toBe(1);
  });

  it("adds the bill as the person checked it, in their name, once; the draft remembers what was changed", async () => {
    await read(murat);
    const [draft] = (await app.assistant.list(leyla)).open;
    const before = (await app.bills.list(leyla, { month: "2026-10" })).bills.length;
    const input = {
      supplierId: draft!.proposal.supplierId,
      number: "MS-0413",
      date: "2026-10-15",
      dueDate: "2026-10-30",
      lines: draft!.proposal.lines.map((l) => ({ itemId: null, name: l.name, category: l.category, totalKurus: l.totalKurus })),
    };
    const done = await app.assistant.confirm(leyla, draft!.id, input);
    expect(done).toMatchObject({ status: "confirmed", decidedBy: "Leyla Kara", changed: ["number"] });
    const bill = await app.bills.get(leyla, done.resultId!);
    expect(bill).toMatchObject({ supplierId: "sup_seed_sut", number: "MS-0413", totalKurus: 126_000, paidKurus: 0 });
    expect(bill.createdBy).toBe("Leyla Kara");

    // Again: the same bill, nothing new.
    expect((await app.assistant.confirm(leyla, draft!.id, input)).resultId).toBe(done.resultId);
    expect((await app.bills.list(leyla, { month: "2026-10" })).bills).toHaveLength(before + 1);
    expect(await code(app.assistant.dismiss(leyla, draft!.id, {}))).toBe("DRAFT_DECIDED");

    const list = await app.assistant.list(leyla);
    expect([list.open.length, list.recent.map((d) => d.status)]).toEqual([0, ["confirmed"]]);
    expect((await app.assistant.log(leyla)).events[0]).toMatchObject({ kind: "draft.confirmed", who: "Leyla Kara", detail: "number" });
  });

  it("keeps a dismissed draft with its reason and adds nothing", async () => {
    await read(murat);
    const [draft] = (await app.assistant.list(murat)).open;
    expect(await app.assistant.dismiss(murat, draft!.id, { reason: "Zaten girilmişti" })).toMatchObject({
      status: "dismissed",
      dismissReason: "Zaten girilmişti",
      decidedBy: "Murat Aksu",
    });
    expect(
      await code(
        app.assistant.confirm(murat, draft!.id, {
          supplierId: null,
          date: "2026-10-15",
          lines: [{ itemId: null, name: "x", category: "other", totalKurus: 100 }],
        }),
      ),
    ).toBe("DRAFT_DECIDED");
    expect((await app.assistant.log(murat)).events[0]).toMatchObject({ kind: "draft.dismissed", detail: "Zaten girilmişti" });
  });

  it("says when a document isn't a bill, and makes no draft", async () => {
    answer = () => ({ ...milk, isBill: false, lines: [], doubts: [] });
    await read(murat, PNG, "");
    const list = await app.assistant.list(leyla);
    expect([list.open.length, list.reading.map((r) => r.state)]).toEqual([0, ["notBill"]]);
    expect(model.calls[0]!.parts[1]).toMatchObject({ type: "image", contentType: "image/png" });
  });

  it("tries again later when the model can't be reached, gives up after three tries, and logs each call", async () => {
    answer = () => {
      throw new AiError("AI_UNAVAILABLE", "OpenAI answered 503", { inputTokens: 10, outputTokens: 0 });
    };
    await read(murat);
    const [job] = await stores.assistant.listJobs("cafe_moda", { kinds: ["document.read"], since: new Date(0) });
    expect(job).toMatchObject({ status: "queued", attempts: 1, lastError: "AI_UNAVAILABLE: OpenAI answered 503" });
    expect(job!.runAt.getTime() - now.getTime()).toBe(60_000);
    expect(await app.assistant.runSoon()).toBe(0);

    now = new Date(now.getTime() + 60_000);
    await app.assistant.runSoon();
    now = new Date(now.getTime() + 10 * 60_000);
    await app.assistant.runSoon();
    expect(model.calls).toHaveLength(3);
    const list = await app.assistant.list(leyla);
    expect(list.reading).toMatchObject([{ state: "failed", error: "Asistana şu an ulaşılamadı." }]);
    const log = await app.assistant.log(leyla);
    expect(log.events.map((e) => [e.kind, e.ok])).toEqual([
      ["job.failed", false],
      ["ai.call", false],
      ["ai.call", false],
      ["ai.call", false],
      ["document.uploaded", true],
    ]);
    expect(log.month).toEqual({ calls: 3, inputTokens: 30, outputTokens: 0 });

    // A bad answer isn't tried again.
    answer = () => ({ nonsense: true });
    await read(murat);
    expect(model.calls).toHaveLength(4);
    expect((await app.assistant.list(leyla)).reading.map((r) => r.state)).toEqual(["failed", "failed"]);
  });

  it("takes only photos and PDFs, only from those who add bills, and keeps each café's documents to itself", async () => {
    expect(await code(app.assistant.upload(murat, new TextEncoder().encode("<html>"), "x.html"))).toBe("DOCUMENT_TYPE");
    expect(await code(app.assistant.upload(murat, new Uint8Array(10 * 1024 * 1024 + 1).fill(0x25), "big.pdf"))).toBe("DOCUMENT_TOO_LARGE");

    // Ece adds bills at the till but doesn't use the assistant.
    const reading = await read(ece, PNG, "");
    expect(reading.state).toBe("reading");
    expect(await code(app.assistant.list(ece))).toBe("FORBIDDEN");
    const [draft] = (await app.assistant.list(leyla)).open;
    expect(
      await code(
        app.assistant.confirm(ece, draft!.id, { supplierId: null, date: "2026-10-15", lines: [{ itemId: null, name: "x", category: "other", totalKurus: 1 }] }),
      ),
    ).toBe("FORBIDDEN");
    // Ece sees bills, so she can see the document; another café can't.
    expect((await app.assistant.document(ece, draft!.document!.id)).bytes).toEqual(PNG);
    expect(await code(app.assistant.document(tarik, draft!.document!.id))).toBe("DOCUMENT_NOT_FOUND");
    expect(await code(app.assistant.dismiss(tarik, draft!.id, {}))).toBe("DRAFT_NOT_FOUND");
  });

  it("is off without a model: nothing can be uploaded, and Taslaklar says so", async () => {
    const off = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model: null, mode: "off" } }, inMemoryStores());
    await seed(off, { sales: false, drafts: false });
    const ctx = await off.staff.at((await off.staff.signIn(DEMO_STAFF.leyla.email, DEMO_STAFF_PASSWORD)).token, "moda");
    expect(await code(off.assistant.upload(ctx, PDF, ""))).toBe("AI_OFF");
    expect(await off.assistant.list(ctx)).toMatchObject({ ai: "off", canUpload: false, canConfirm: true });
  });
});
