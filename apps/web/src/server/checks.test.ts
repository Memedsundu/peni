import { ScriptedModel, type AiRequest, type BillReading, type StatementReading, type ZReading } from "@peni/ai";
import type { DraftsDTO, StatementDraftDTO, ZReportDraftDTO } from "@peni/api";
import { addDays, localDateKey, type Payment, type StatementRecord } from "@peni/core";
import { deflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import { csvRows, decodeText, excelDay, sheetRows } from "./sheet";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: PeniStores;
let now: Date;
let answer: (request: AiRequest<unknown>) => unknown;
let model: ScriptedModel;
let leyla: StaffContext;
let murat: StaffContext;
let ece: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );

const PDF = new TextEncoder().encode("%PDF-1.4\n% a statement\n");
const CAFE = "cafe_moda";
const day = (n: number) => localDateKey(addDays(now, n), "Europe/Istanbul");

const nothingElse: Omit<BillReading, "kind"> = {
  supplierName: null,
  supplierTaxNumber: null,
  number: null,
  date: null,
  dueDate: null,
  total: null,
  lines: [],
  kdv: [],
  doubts: [],
};

/** The model says what the document is, then reads it as `statement` or `z`. */
function reads(statement: StatementReading | null, z: ZReading | null = null) {
  answer = (r) => {
    if (r.purpose === "statement.read") return statement;
    if (r.purpose === "zreport.read") return z;
    return { ...nothingElse, kind: statement ? (statement.account === "card" ? "cardStatement" : "bankStatement") : z ? "zReport" : "other" };
  };
}

async function upload(ctx: StaffContext, bytes: Uint8Array = PDF, name = "ekstre.pdf") {
  now = new Date(now.getTime() + 60_000);
  await app.assistant.upload(ctx, bytes, name, { again: true });
  await app.assistant.runSoon();
}

const statements = (l: DraftsDTO) => l.open.filter((d): d is StatementDraftDTO => d.kind === "statement");
const zreports = (l: DraftsDTO) => l.open.filter((d): d is ZReportDraftDTO => d.kind === "zreport");

const statement = (lines: StatementReading["lines"], more: Partial<StatementReading> = {}): StatementReading => ({
  isStatement: true,
  account: "bank",
  bankName: "Garanti BBVA",
  accountHint: "4471",
  from: day(-10),
  to: day(-1),
  opening: null,
  closing: null,
  lines,
  doubts: [],
  ...more,
});

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  answer = () => ({});
  model = new ScriptedModel((r) => answer(r), "test-model");
  stores = inMemoryStores();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on" } }, stores);
  await seed(app, { drafts: false });
  [leyla, murat, ece] = await Promise.all([at("leyla"), at("murat"), at("ece")]);
});

describe("Bank and card statements (plan piece 27, A5)", () => {
  it("matches each line to a payment, a transfer or card sales less commission, and lists what's on neither side", async () => {
    const records = (await app.money.bankRecords(CAFE, day(-10), day(-1)))!;
    // The demo's money in those days: card sales, a transfer from the reserve.
    const bill = records.find((r) => r.kind !== "sales" && r.day >= day(-10))!;
    const sales = records.filter((r) => r.kind === "sales" && r.amountKurus > 0 && r.day < day(-2)).sort((a, b) => a.day.localeCompare(b.day));
    const [one, two, three] = sales.slice(-3) as [StatementRecord, StatementRecord, StatementRecord];
    const net = (k: number) => k - Math.round(k * 0.018);
    reads(
      statement([
        { date: day(-1), description: "MASRAF", amount: -12.5, balance: null, kind: "fee" },
        { date: bill.day, description: `EFT ${bill.label}`, amount: bill.amountKurus / 100, balance: null, kind: "supplier" },
        { date: one.day, description: "POS", amount: net(one.amountKurus) / 100, balance: null, kind: "cardSales" },
        { date: three.day, description: "POS", amount: net(two.amountKurus + three.amountKurus) / 100, balance: null, kind: "cardSales" },
      ]),
    );
    await upload(murat);
    expect(model.calls.map((c) => c.purpose)).toEqual(["document.read", "statement.read"]);

    const [draft] = statements(await app.assistant.list(leyla));
    expect(draft).toMatchObject({ kind: "statement", title: `Banka ekstresi · Garanti BBVA …4471 · ${short(day(-10))}–${short(day(-1))}` });
    const s = draft!.statement!;
    expect(s.followed).toBe(true);
    expect(s.lines.map((l) => l.match && [l.match.kind, l.match.days])).toEqual([null, ["transfer", 1], ["sales", 1], ["sales", 2]]);
    expect(s.lines[1]!.match).toMatchObject({ label: bill.label, amountKurus: bill.amountKurus });
    expect(s.lines[2]!.match!.feeKurus).toBe(Math.round(one.amountKurus * 0.018));
    expect(s.feesKurus).toBe(one.amountKurus - net(one.amountKurus) + two.amountKurus + three.amountKurus - net(two.amountKurus + three.amountKurus));
    // What Peni has in those days and the statement doesn't: every other record.
    const key = (r: { day: string; kind: string; amountKurus: number }) => `${r.day} ${r.kind} ${r.amountKurus}`;
    // Card sales of the last four days may still be on their way to the bank.
    const transit = (r: StatementRecord) => r.kind === "sales" && r.day >= day(-4) && r.day <= day(-1) && ![two, three].includes(r);
    expect(s.missing.map(key)).toEqual(
      records.filter((r) => r.day >= day(-10) && r.day <= day(-1) && ![bill, one, two, three].includes(r) && !transit(r)).map(key),
    );
    expect(s.inTransitKurus).toBe(records.filter(transit).reduce((sum, r) => sum + r.amountKurus, 0));
  });

  it("sets Penny's bank balance to the statement's only when asked, once, by someone who manages the money", async () => {
    // Peni's balance less the card sales of the last days, which reach the bank after the statement.
    const transit = (await app.money.bankRecords(CAFE, day(-4), day(-1)))!.filter((r) => r.kind === "sales").reduce((sum, r) => sum + r.amountKurus, 0);
    const peni = (await app.money.bankBalanceThrough(CAFE, day(-1)))! - transit;
    reads(statement([{ date: day(-1), description: "HESAP İŞLETİM ÜCRETİ", amount: -47.5, balance: null, kind: "fee" }], { closing: (peni - 4_750) / 100 }));
    await upload(leyla);
    const [draft] = statements(await app.assistant.list(leyla));
    expect(draft!.statement).toMatchObject({ peniBalanceKurus: peni, differenceKurus: -4_750, canFix: true });
    expect(await code(app.assistant.check(ece, draft!.id, { fixBalance: true }))).toBe("FORBIDDEN");

    const bankBefore = (await app.money.get(leyla)).bankKurus!;
    const done = await app.assistant.check(leyla, draft!.id, { fixBalance: true, note: "Aylık ücret" });
    expect(done).toMatchObject({
      status: "confirmed",
      statement: null,
      outcome: { matched: 0, unmatched: 1, differenceKurus: -4_750, correctionKurus: -4_750, note: "Aylık ücret" },
    });
    await app.assistant.check(leyla, draft!.id, { fixBalance: true });
    const money = await app.money.get(leyla);
    expect(money.bankKurus).toBe(bankBefore - 4_750);
    expect(money.lines.find((l) => l.kind === "correction" && l.amountKurus === -4_750)).toMatchObject({
      account: "bank",
      note: `Garanti BBVA ${short(day(-1))} ekstresine göre: Aylık ücret`,
      undoId: null,
    });
    const list = await app.assistant.list(leyla);
    expect(list.recent[0]).toMatchObject({ kind: "statement", status: "confirmed", decidedBy: "Leyla Kara" });
    const log = await app.assistant.log(leyla);
    expect(log.events[0]).toMatchObject({ kind: "draft.confirmed", detail: "0/1 satır eşleşti · banka bakiyesi −₺47,50 düzeltildi · “Aylık ücret”" });
  });

  it("matches a credit card's statement to bills paid by card and payments towards it", async () => {
    const charges = await stores.bills.listPayments(CAFE, { method: "credit" });
    const [payment] = await stores.debts.listCardPayments(CAFE);
    expect(charges.length).toBeGreaterThan(0);
    const charge = charges.at(-1)!;
    reads(
      statement(
        [
          { date: charge.paidOn, description: "MARKET", amount: -charge.amountKurus / 100, balance: null, kind: "supplier" },
          { date: payment!.paidOn, description: "HESAPTAN ÖDEME", amount: payment!.amountKurus / 100, balance: null, kind: "cardPayment" },
          { date: day(-2), description: "GOOGLE WORKSPACE", amount: -252, balance: null, kind: "other" },
        ],
        { account: "card", accountHint: "8812", from: day(-30), to: day(-1), closing: 1_000 },
      ),
    );
    await upload(leyla, PDF, "kart.pdf");
    const s = statements(await app.assistant.list(leyla))[0]!.statement!;
    expect(s.lines.map((l) => l.match?.kind ?? null)).toEqual(["charge", "cardPayment", null]);
    expect(s.canFix).toBe(false);
    expect(s.differenceKurus).not.toBeNull();
  });

  it("reads a spreadsheet as a statement without asking what it is, and an Excel file too", async () => {
    reads(statement([{ date: day(-3), description: "MASRAF", amount: -5, balance: null, kind: "fee" }]));
    const csv = new TextEncoder().encode("Tarih;Açıklama;Tutar\r\n13.10.2026;MASRAF;-5,00\r\n");
    await upload(leyla, csv, "hareketler.csv");
    expect(model.calls.map((c) => c.purpose)).toEqual(["statement.read"]);
    expect(model.calls[0]!.parts).toEqual([{ type: "text", text: expect.stringContaining("Tarih | Açıklama | Tutar\n13.10.2026 | MASRAF | -5,00") }]);

    await upload(leyla, xlsx(), "hareketler.xlsx");
    expect(model.calls.map((c) => c.purpose)).toEqual(["statement.read", "statement.read"]);
    expect((model.calls[1]!.parts[0] as { text: string }).text).toContain("Tarih | Açıklama | Tutar\n2026-10-13 | POS ÜYE İŞYERİ | 1234.5");
    expect(statements(await app.assistant.list(leyla))).toHaveLength(2);
    // The second is the same statement as the first.
    expect(statements(await app.assistant.list(leyla))[0]!.duplicateOf).toMatchObject({ kind: "draft", why: "dayTotal" });
  });

  it("takes a statement emailed to the café's address (piece 26)", async () => {
    reads(statement([{ date: day(-3), description: "MASRAF", amount: -5, balance: null, kind: "fee" }]));
    const { address } = await app.inbox.view(leyla);
    const csv = new TextEncoder().encode("Tarih;Açıklama;Tutar\r\n13.10.2026;MASRAF;-5,00\r\n");
    const taken = await app.inbox.receive({
      providerId: "em_1",
      from: "Garanti BBVA <ekstre@garanti.test>",
      recipients: [address!],
      subject: "Hesap ekstreniz",
      files: async () => [{ name: "ekstre.csv", contentType: "text/csv", size: csv.length, read: async () => csv }],
    });
    expect(taken).toBe(1);
    await app.assistant.runSoon();
    expect(statements(await app.assistant.list(leyla))[0]!.document).toMatchObject({ name: "ekstre.csv", sender: "ekstre@garanti.test" });
  });

  it("leaves something that isn't a statement, and keeps bills and statements apart", async () => {
    reads({ ...statement([]), isStatement: false });
    await upload(leyla, new TextEncoder().encode("ad;soyad\nAli;Veli\n"), "liste.csv");
    const list = await app.assistant.list(leyla);
    expect([list.open.length, list.reading.map((r) => r.state)]).toEqual([0, ["notBill"]]);

    reads(statement([{ date: day(-3), description: "MASRAF", amount: -5, balance: null, kind: "fee" }]));
    await upload(leyla);
    const [draft] = statements(await app.assistant.list(leyla));
    expect(
      await code(
        app.assistant.confirm(leyla, draft!.id, { supplierId: null, date: day(0), lines: [{ itemId: null, name: "x", category: "other", totalKurus: 1 }] }),
      ),
    ).toBe("DRAFT_KIND");
  });
});

describe("Z report check (plan piece 27, A6)", () => {
  const z = (more: Partial<ZReading>): ZReading => ({
    isZReport: true,
    date: "2026-10-12",
    zNumber: "0412",
    total: null,
    cash: null,
    card: null,
    other: null,
    receipts: null,
    refunds: null,
    kdv: [],
    doubts: [],
    ...more,
  });

  it("sets the Z report beside the till's day; a difference needs a note", async () => {
    // A quiet day the till knows exactly: ₺400 cash, ₺600 card, ₺100 back in cash, ₺50 in peni.
    const at = (h: number) => new Date(`2025-03-03T${String(h).padStart(2, "0")}:00:00Z`);
    for (const [i, [kind, method, tl]] of (
      [
        ["sale", "cash", 400],
        ["sale", "card", 600],
        ["refund", "cash", 100],
        ["sale", "peni", 50],
      ] as const
    ).entries())
      await stores.payments.savePayment(payment(`pay_z_${i}`, kind, method, tl * 100, at(8 + i)));
    reads(null, z({ date: "2025-03-03", total: 900, cash: 300, card: 600, receipts: 2, kdv: [{ rate: 10, amount: 81.82 }] }));
    await upload(murat, PDF, "z.jpg");
    const [draft] = zreports(await app.assistant.list(leyla));
    expect(draft!.title).toBe("Z raporu · 03.03 · ₺900");
    expect(draft!.zreport).toEqual({
      date: "2025-03-03",
      zNumber: "0412",
      receipts: 2,
      refundsKurus: null,
      otherKurus: null,
      kdv: [{ ratePct: 10, amountKurus: 8_182 }],
      rows: [
        { key: "cash", zKurus: 30_000, tillKurus: 30_000, differenceKurus: 0 },
        { key: "card", zKurus: 60_000, tillKurus: 60_000, differenceKurus: 0 },
        { key: "total", zKurus: 90_000, tillKurus: 90_000, differenceKurus: 0 },
      ],
      till: { peniKurus: 5_000, askiKurus: 0, payments: 2 },
      differs: false,
    });
    expect(await app.assistant.check(leyla, draft!.id, {})).toMatchObject({ status: "confirmed", outcome: { matched: 3, unmatched: 0, differenceKurus: 0 } });

    // The next one is ₺50 short in cash.
    reads(null, z({ date: "2025-03-03", zNumber: "413", total: 850, cash: 250, card: 600 }));
    await upload(murat, PDF, "z2.jpg");
    const [short] = zreports(await app.assistant.list(leyla));
    // Two Z reports of one day look like the same one; checking it is still allowed.
    expect(short!.duplicateOf).toMatchObject({ why: "dayTotal" });
    expect(short!.zreport!.differs).toBe(true);
    expect(await code(app.assistant.check(leyla, short!.id, {}))).toBe("CHECK_NOTE_REQUIRED");
    expect(((await app.assistant.check(leyla, short!.id, { note: "Bir iade kasaya girilmedi" })) as ZReportDraftDTO).outcome).toEqual({
      note: "Bir iade kasaya girilmedi",
      matched: 1,
      unmatched: 2,
      differenceKurus: -5_000,
      correctionKurus: null,
    });
    // The same Z number again is the same report.
    reads(null, z({ date: "2025-03-04", zNumber: "0413" }));
    await upload(murat, PDF, "z3.jpg");
    expect(zreports(await app.assistant.list(leyla))[0]!.duplicateOf).toMatchObject({ why: "number", id: short!.id });
  });
});

describe("The demo's samples (plan piece 27)", () => {
  beforeEach(async () => {
    stores = inMemoryStores();
    app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, stores);
    await seed(app, { drafts: false });
    leyla = await at("leyla");
  });

  it("sends a bank statement made from the café's own records: card sales match less commission, a fee and SGK don't", async () => {
    await app.assistant.sample(leyla, "bank");
    await app.assistant.runSoon();
    const [draft] = statements(await app.assistant.list(leyla));
    expect(draft!.document).toMatchObject({ name: `banka-ekstresi-${day(-1)}.csv`, contentType: "text/csv" });
    const s = draft!.statement!;
    expect(s.lines.filter((l) => !l.match).map((l) => l.description)).toEqual(["SGK PRİM ÖDEMESİ", "HESAP İŞLETİM ÜCRETİ"]);
    expect(s.lines.filter((l) => l.match?.kind === "sales").length).toBeGreaterThan(3);
    // The fee is already in Peni as a correction; SGK and the commission aren't.
    expect(s.differenceKurus).toBe(-(845_000 + s.feesKurus));

    await app.assistant.sample(leyla, "zreport");
    await app.assistant.sample(leyla, "card");
    await app.assistant.runSoon();
    const [zr] = zreports(await app.assistant.list(leyla));
    expect(zr!.zreport!.rows[0]!.differenceKurus).toBe(-5_000);
    const card = statements(await app.assistant.list(leyla)).find((d) => d.statement?.account === "card")!;
    expect(card.statement!.lines.filter((l) => !l.match).map((l) => l.description)).toEqual(["GOOGLE WORKSPACE"]);
    expect(card.statement!.differenceKurus).toBe(-25_200);
  });

  it("only in the demo", async () => {
    stores = inMemoryStores();
    app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on" } }, stores);
    await seed(app, { drafts: false });
    expect(await code(app.assistant.sample(await at("leyla"), "bank"))).toBe("CHECK_SAMPLE_DEMO");
  });
});

describe("Spreadsheets (plan piece 27)", () => {
  it("reads CSV with quotes, in UTF-8 or Windows-1254", () => {
    expect(csvRows('Tarih;"Açıklama; uzun";Tutar\n01.10.2026;"Kira ""Ekim""";-35.000,00\n', 10)).toEqual([
      ["Tarih", "Açıklama; uzun", "Tutar"],
      ["01.10.2026", 'Kira "Ekim"', "-35.000,00"],
    ]);
    // "İŞLETİM" in Windows-1254.
    expect(decodeText(new Uint8Array([0xdd, 0xde, 0x4c, 0x45, 0x54, 0xdd, 0x4d]))).toBe("İŞLETİM");
    expect(decodeText(new TextEncoder().encode("﻿İŞLETİM"))).toBe("İŞLETİM");
  });

  it("reads the first sheet of an .xlsx with its shared strings and dates", () => {
    expect(sheetRows(xlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toEqual([
      ["Tarih", "Açıklama", "Tutar"],
      ["2026-10-13", "POS ÜYE İŞYERİ", "1234.5"],
      ["2026-10-14", "Kira & aidat", "-35000"],
    ]);
    expect([excelDay(45_580), excelDay(46_308.75)]).toEqual(["2024-10-15", "2026-10-13"]);
  });
});

/** "2026-10-06" → "06.10". */
const short = (d: string) => d.slice(5).split("-").reverse().join(".");

function payment(id: string, kind: "sale" | "refund", method: Payment["method"], amountKurus: number, at: Date): Payment {
  return {
    id,
    cafeId: CAFE,
    orderId: `ord_${id}`,
    kind,
    method,
    amountKurus,
    tenderedKurus: null,
    changeKurus: null,
    status: "approved",
    terminal: "manual",
    deviceId: null,
    cashSessionId: null,
    key: id,
    reason: null,
    startedAt: at,
    startedByMemberId: "x",
    settledAt: at,
    settledByMemberId: "x",
    reference: null,
    receiptNo: null,
    failure: null,
  };
}

/** A small .xlsx as Excel writes one: shared strings, a date style, a deflated sheet. */
function xlsx(): Uint8Array {
  const files: [string, string, boolean][] = [
    ["xl/workbook.xml", '<workbook><sheets><sheet name="Hareketler" sheetId="1" r:id="rId1"/></sheets></workbook>', false],
    ["xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>', false],
    [
      "xl/sharedStrings.xml",
      "<sst><si><t>Tarih</t></si><si><t>Açıklama</t></si><si><r><t>POS </t></r><r><t>ÜYE İŞYERİ</t></r></si><si><t>Tutar</t></si></sst>",
      false,
    ],
    [
      "xl/styles.xml",
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
      false,
    ],
    [
      "xl/worksheets/sheet1.xml",
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>3</v></c></row>' +
        '<row r="2"><c r="A2" s="1"><v>46308</v></c><c r="B2" t="s"><v>2</v></c><c r="C2"><v>1234.5</v></c></row>' +
        '<row r="3"><c r="A3" s="1"><v>46309</v></c><c r="B3" t="inlineStr"><is><t>Kira &amp; aidat</t></is></c><c r="C3"><v>-35000</v></c></row></sheetData></worksheet>',
      true,
    ],
  ];
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text, deflate] of files) {
    const raw = new TextEncoder().encode(text);
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const n = new TextEncoder().encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, n.length, true);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(10, deflate ? 8 : 0, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, raw.length, true);
    dir.setUint16(28, n.length, true);
    dir.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    central.push(new Uint8Array(dir.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let i = 0;
  for (const b of all) {
    out.set(b, i);
    i += b.length;
  }
  return out;
}
