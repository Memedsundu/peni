import { AiError, ScriptedModel, type AiRequest, type BillReading } from "@peni/ai";
import type { BillDraftDTO, DraftsDTO } from "@peni/api";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: PeniStores;
let now: Date;
let answer: (request: AiRequest<unknown>) => unknown;
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
  kind: "bill",
  supplierName: "MODA SÜT ÜRÜNLERİ GIDA TİC. LTD. ŞTİ.",
  supplierTaxNumber: null,
  number: "MS-0412",
  date: "2026-10-15",
  dueDate: "2026-10-30",
  total: 1260,
  lines: [
    { name: "Süt 1 L", quantity: 24, unit: "adet", total: 960, category: "ingredients", stockItem: null, stockQuantity: null },
    { name: "Krema 1 L", quantity: 4, unit: "adet", total: 300, category: "ingredients", stockItem: null, stockQuantity: null },
  ],
  kdv: [],
  doubts: ["Fatura numarasının son hanesi silik."],
};

/** Uploads and lets the background run, as the route does after answering. */
async function read(ctx: StaffContext, bytes = PDF, name = "sut.pdf", again = false) {
  const reading = await app.assistant.upload(ctx, bytes, name, { again });
  await app.assistant.runSoon();
  return reading;
}

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  answer = () => milk;
  model = new ScriptedModel((r) => answer(r), "test-model");
  stores = inMemoryStores();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on" } }, stores);
  await seed(app, { sales: false, drafts: false });
  [leyla, murat, ece, tarik] = await Promise.all([at("leyla"), at("murat"), at("ece"), at("tarik", "kuzguncuk")]);
});

describe("The assistant's ground (plan piece 24)", () => {
  it("reads an uploaded bill in the background into a draft, with the supplier it knows and what it wasn't sure of", async () => {
    const { reading } = await app.assistant.upload(murat, PDF, "sut.pdf");
    expect(reading).toMatchObject({ documentName: "sut.pdf", state: "reading", error: null });
    expect((await app.assistant.list(leyla)).reading.map((r) => r.state)).toEqual(["reading"]);
    expect(model.calls).toHaveLength(0);

    await app.assistant.runSoon();
    expect(model.calls[0]!.purpose).toBe("document.read");
    expect(model.calls[0]!.parts[1]).toMatchObject({ type: "pdf", name: "sut.pdf" });

    const drafts = await app.assistant.list(leyla);
    expect(drafts).toMatchObject({ ai: "on", canUpload: true, canConfirm: true, reading: [], recent: [] });
    const [draft] = billDrafts(drafts);
    expect(draft).toMatchObject({
      kind: "bill",
      status: "open",
      title: "MODA SÜT ÜRÜNLERİ GIDA TİC. LTD. ŞTİ. · ₺1.260",
      doubts: ["Fatura numarasının son hanesi silik."],
      proposal: { supplierId: "sup_seed_sut", number: "MS-0412", date: "2026-10-15", dueDate: "2026-10-30", totalKurus: 126_000 },
      document: { name: "sut.pdf", contentType: "application/pdf", size: PDF.length },
    });
    expect(draft!.proposal.lines).toEqual([
      {
        itemId: null,
        name: "Süt 1 L",
        category: "ingredients",
        qtyMilli: null,
        totalKurus: 96_000,
        readName: "Süt 1 L",
        readQtyMilli: 24_000,
        readUnit: "adet",
        matchedBy: null,
      },
      {
        itemId: null,
        name: "Krema 1 L",
        category: "ingredients",
        qtyMilli: null,
        totalKurus: 30_000,
        readName: "Krema 1 L",
        readQtyMilli: 4_000,
        readUnit: "adet",
        matchedBy: null,
      },
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
    const [draft] = billDrafts(await app.assistant.list(leyla));
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
    const [draft] = billDrafts(await app.assistant.list(murat));
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
    answer = () => ({ ...milk, kind: "other", lines: [], doubts: [] });
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
    const { reading } = await read(ece, PNG, "");
    expect(reading!.state).toBe("reading");
    expect(await code(app.assistant.list(ece))).toBe("FORBIDDEN");
    const [draft] = billDrafts(await app.assistant.list(leyla));
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

/** The number the model was shown for a stock item, as the model would answer it. */
const shown = (request: AiRequest<unknown>, name: string) => {
  const text = request.parts.find((p) => p.type === "text")?.text ?? "";
  const m = new RegExp(`^(\\d+)\\. ${name} \\(`, "m").exec(text);
  if (!m) throw new Error(`${name} not in the stock list`);
  return Number(m[1]);
};
const bytes = (n: number) => new TextEncoder().encode(`%PDF-1.4\n% bill ${n}\n`);
const asInput = (d: {
  proposal: {
    supplierId: string | null;
    number: string | null;
    date: string | null;
    lines: { itemId: string | null; name: string; category: string; qtyMilli: number | null; totalKurus: number }[];
  };
}) => ({
  supplierId: d.proposal.supplierId,
  number: d.proposal.number,
  date: d.proposal.date!,
  lines: d.proposal.lines.map((l, from) => ({
    itemId: l.itemId,
    name: l.name,
    category: l.category as "ingredients",
    qtyMilli: l.qtyMilli,
    totalKurus: l.totalKurus,
    from,
  })),
});

describe("Scanning bills (plan piece 25)", () => {
  it("links read lines to stock items, carries the KDV, and learns each supplier's lines from what people confirm", async () => {
    answer = (r) => ({
      ...milk,
      lines: [{ ...milk.lines[0]!, stockItem: shown(r, "Süt"), stockQuantity: 24 }, milk.lines[1]!],
      kdv: [{ rate: 1, amount: 12.48 }],
    });
    await read(murat);
    expect(model.calls[0]!.parts.find((p) => p.type === "text")!.text).toContain("Stock items:\n");
    const [first] = billDrafts(await app.assistant.list(leyla));
    expect(first!.proposal.lines[0]).toMatchObject({
      itemId: "stk_sut",
      name: "Süt",
      category: "ingredients",
      qtyMilli: 24_000,
      readName: "Süt 1 L",
      matchedBy: "model",
    });
    expect(first!.proposal.kdv).toEqual([{ ratePct: 1, amountKurus: 1_248 }]);

    const stockBefore = (await app.stock.view(leyla)).items.find((i) => i.id === "stk_sut")!.qtyMilli;
    const done = await app.assistant.confirm(leyla, first!.id, { ...asInput(first!), kdv: first!.proposal.kdv });
    const bill = await app.bills.get(leyla, done.resultId!);
    expect(bill.kdv).toEqual([{ ratePct: 1, amountKurus: 1_248 }]);
    expect(bill.document).toMatchObject({ name: "sut.pdf", url: first!.document!.url });
    expect(bill.lines[0]).toMatchObject({ itemId: "stk_sut", qtyMilli: 24_000 });
    expect((await app.stock.view(leyla)).items.find((i) => i.id === "stk_sut")!.qtyMilli).toBe(stockBefore + 24_000);

    // The next milk bill: the model didn't link it, but Leyla did last time; 12 bottles is 12 litres.
    answer = () => ({ ...milk, number: "MS-0450", lines: [{ ...milk.lines[0]!, quantity: 12, total: 480 }], total: 480 });
    await read(murat, bytes(2), "sut2.pdf");
    const [second] = billDrafts(await app.assistant.list(leyla));
    expect(second!.proposal.lines[0]).toMatchObject({ itemId: "stk_sut", qtyMilli: 12_000, matchedBy: "learned" });
    expect(second!.doubts).toEqual(milk.doubts);

    // Murat says it isn't stock after all: it's forgotten.
    await app.assistant.confirm(murat, second!.id, { ...asInput(second!), lines: [{ ...asInput(second!).lines[0]!, itemId: null, qtyMilli: null }] });
    answer = () => ({ ...milk, number: "MS-0470", lines: [milk.lines[0]!] });
    await read(murat, bytes(3), "sut3.pdf");
    expect(billDrafts(await app.assistant.list(leyla))[0]!.proposal.lines[0]).toMatchObject({ itemId: null, matchedBy: null });
  });

  it("links one stock item once, and asks for the amount when the model didn't give one", async () => {
    answer = (r) => ({
      ...milk,
      lines: [
        { ...milk.lines[0]!, stockItem: shown(r, "Süt"), stockQuantity: null },
        { ...milk.lines[1]!, stockItem: shown(r, "Süt"), stockQuantity: 4 },
        { ...milk.lines[1]!, name: "Yoğurt", stockItem: 999, stockQuantity: 1 },
      ],
      total: 1560,
      doubts: [],
    });
    await read(murat);
    const [draft] = billDrafts(await app.assistant.list(leyla));
    expect(draft!.proposal.lines.map((l) => [l.itemId, l.qtyMilli])).toEqual([
      ["stk_sut", null],
      [null, null],
      [null, null],
    ]);
    expect(draft!.doubts).toEqual(["Süt için gelen miktarı yaz.", '"Krema 1 L" satırını stoğa bağlamadım: Süt başka bir satırda var.']);
  });

  it("doesn't read the same file twice unless asked, and says what became of the first one", async () => {
    const first = await read(murat);
    expect(first.duplicate).toBeNull();
    const again = await app.assistant.upload(ece, PDF, "IMG_2231.pdf");
    const [draft] = billDrafts(await app.assistant.list(leyla));
    expect(again).toEqual({ reading: null, duplicate: { at: now.toISOString(), name: "sut.pdf", title: draft!.title, draftId: draft!.id, billId: null } });
    expect(model.calls).toHaveLength(1);

    // While the first is still being read, too.
    await app.assistant.upload(murat, PNG, "a.png");
    expect((await app.assistant.upload(murat, PNG, "b.png")).duplicate).toMatchObject({ name: "a.png", draftId: null });
    await app.assistant.runSoon();

    // "Yine de oku" reads it again, and the two drafts point at each other's bill.
    const forced = await read(murat, PDF, "sut.pdf", true);
    expect(forced.reading!.state).toBe("reading");
    const open = billDrafts(await app.assistant.list(leyla));
    expect(open.find((d) => d.id !== draft!.id && d.duplicateOf?.id === draft!.id)?.duplicateOf).toMatchObject({ kind: "draft", why: "number" });

    // Once confirmed, the same file points at the bill; once dismissed, it can be read anew.
    const done = await app.assistant.confirm(leyla, draft!.id, asInput(draft!));
    expect((await app.assistant.upload(murat, PDF, "x.pdf")).duplicate).toMatchObject({ billId: done.resultId });
    for (const d of billDrafts(await app.assistant.list(leyla))) await app.assistant.dismiss(leyla, d.id, {});
    const png = await app.assistant.upload(murat, PNG, "c.png");
    expect(png.reading?.state).toBe("reading");
  });

  it("marks a draft that looks like a bill already entered, and confirming it needs a yes", async () => {
    // The seeded Ambalaj Dünyası bill A-20418, read with different punctuation.
    answer = () => ({
      ...milk,
      supplierName: "Ambalaj Dünyası",
      number: "a 20418",
      lines: [{ ...milk.lines[0]!, name: "Bardak", category: "supplies" }],
      total: 960,
    });
    await read(murat);
    const [draft] = billDrafts(await app.assistant.list(leyla));
    expect(draft!.duplicateOf).toEqual({ kind: "bill", id: "bil_seed_ambalaj", title: "Ambalaj Dünyası · #A-20418 · ₺3.700", why: "number" });
    expect(await code(app.assistant.confirm(leyla, draft!.id, asInput(draft!)))).toBe("BILL_DUPLICATE");
    expect((await app.assistant.confirm(leyla, draft!.id, { ...asInput(draft!), allowDuplicate: true })).status).toBe("confirmed");

    // No number: the same supplier, day and total (within a lira) is enough.
    const sut1 = await app.bills.get(leyla, "bil_seed_sut1");
    answer = () => ({ ...milk, number: null, date: sut1.date, lines: [{ ...milk.lines[0]!, total: 860.5 }], total: 860.5 });
    await read(murat, bytes(2));
    expect(billDrafts(await app.assistant.list(leyla))[0]!.duplicateOf).toMatchObject({ kind: "bill", id: "bil_seed_sut1", why: "dayTotal" });
  });

  it("stops a hand-entered bill with a number the supplier already has, and checks the KDV", async () => {
    const bill = {
      supplierId: "sup_seed_ambalaj",
      date: "2026-10-15",
      lines: [{ itemId: null, name: "Peçete", category: "supplies" as const, totalKurus: 36_000 }],
    };
    expect(await code(app.bills.add(ece, { ...bill, number: "A20418", key: "k1" }))).toBe("BILL_DUPLICATE");
    expect(await code(app.bills.add(ece, { ...bill, number: "A20418", key: "k1", allowDuplicate: true }))).toBe("ok");
    expect(await code(app.bills.add(ece, { ...bill, key: "k2", kdv: [{ ratePct: 7, amountKurus: 100 }] }))).toBe("KDV_INVALID");
    expect(await code(app.bills.add(ece, { ...bill, key: "k3", kdv: [{ ratePct: 20, amountKurus: 36_000 }] }))).toBe("KDV_INVALID");
    expect(await code(app.bills.add(ece, { ...bill, key: "k4", kdv: [{ ratePct: 20, amountKurus: 6_000 }] }))).toBe("ok");
  });

  it("shows each person what they sent and what became of it, for the till", async () => {
    await read(ece, PNG, "");
    answer = () => ({ ...milk, kind: "other", lines: [], doubts: [] });
    now = new Date(now.getTime() + 60_000);
    await read(ece, bytes(2), "menu.pdf");
    now = new Date(now.getTime() + 60_000);
    await app.assistant.upload(ece, bytes(3), "fis.pdf");
    expect((await app.assistant.mine(ece)).uploads.map((u) => [u.documentName, u.state, u.title])).toEqual([
      ["fis.pdf", "reading", null],
      ["menu.pdf", "notBill", null],
      ["", "waiting", "MODA SÜT ÜRÜNLERİ GIDA TİC. LTD. ŞTİ. · ₺1.260"],
    ]);
    const [draft] = billDrafts(await app.assistant.list(leyla));
    await app.assistant.confirm(leyla, draft!.id, asInput(draft!));
    expect((await app.assistant.mine(ece)).uploads[2]!.state).toBe("saved");
    expect((await app.assistant.mine(murat)).uploads).toEqual([]);
  });
});

/** The bill drafts waiting (piece 27 adds statements and Z reports). */
function billDrafts(list: DraftsDTO): BillDraftDTO[] {
  return list.open.filter((d): d is BillDraftDTO => d.kind === "bill");
}
