import type { BillDraftDTO, StatementDraftDTO, ZReportDraftDTO } from "@peni/api";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { kdvBase, mainCategory } from "./month-package";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";
import { xlsxBytes } from "./xlsx";
import { crc32, safeName, zipBytes } from "./zip";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );

/** A ZIP's files by name, each checked against its CRC. */
function unzip(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true);
    const raw = zip.subarray(start, start + size);
    const data = method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw;
    expect(crc32(data), name).toBe(crc);
    files.set(name, data);
    at += 46 + nameLength;
  }
  return files;
}

/** Python's zipfile, as a second opinion on what we wrote. */
function pythonReads(zip: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), "peni-zip-"));
  const file = join(dir, "x.zip");
  writeFileSync(file, zip);
  const out = execFileSync("python3", [
    "-I",
    "-c",
    "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint('\\n'.join(z.namelist()))",
    file,
  ]);
  return out.toString().trim().split("\n");
}

async function read(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const text = (b: Uint8Array | undefined) => new TextDecoder().decode(b);

describe("The ZIP and Excel writers (plan piece 30)", () => {
  it("writes ZIPs others can open, with Turkish names, squeezing only what helps", async () => {
    const long = new TextEncoder().encode("Süt ".repeat(500));
    const zip = await zipBytes([
      { name: "faturalar/Hammadde/2026-10-13 Moda Süt.txt", data: long },
      { name: "boş.txt", data: new Uint8Array() },
      { name: "a.pdf", data: long },
    ]);
    const files = unzip(zip);
    expect([...files.keys()]).toEqual(["faturalar/Hammadde/2026-10-13 Moda Süt.txt", "boş.txt", "a.pdf"]);
    expect(text(files.get("faturalar/Hammadde/2026-10-13 Moda Süt.txt"))).toBe("Süt ".repeat(500));
    expect(zip.length).toBeLessThan(long.length * 2);
    expect(pythonReads(zip)).toEqual([...files.keys()]);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("makes names safe on any computer", () => {
    expect(safeName("Ambalaj Dünyası Tic. Ltd. Şti.")).toBe("Ambalaj Dünyası Tic. Ltd. Şti");
    expect(safeName("A/B: C*?")).toBe("A B C");
    expect(safeName("...")).toBe("adsız");
  });

  it("writes a workbook with typed cells, escaped text and Excel's sheet name rules", async () => {
    const bytes = await xlsxBytes([
      { name: "Faturalar", columns: [{ title: "Tedarikçi" }, { title: "Toplam", kind: "tl" }], rows: [["Ali & <Veli>", 1234.5]], total: ["Toplam", 1234.5] },
      { name: "Faturalar", columns: [{ title: "x" }], rows: [] },
      { name: "a/b:c*d?e[f]g very long name over thirty-one", columns: [{ title: "x" }], rows: [] },
    ]);
    const files = unzip(bytes);
    expect([...files.keys()]).toContain("xl/worksheets/sheet3.xml");
    const workbook = text(files.get("xl/workbook.xml"));
    expect(workbook).toContain('name="Faturalar"');
    expect(workbook).toContain('name="Faturalar 2"');
    expect(workbook).toMatch(/name="a b c d e f g very long name ov"/);
    const sheet = text(files.get("xl/worksheets/sheet1.xml"));
    expect(sheet).toContain("Ali &amp; &lt;Veli&gt;");
    expect(sheet).toContain('<c r="B2" s="2"><v>1234.5</v></c>');
    expect(sheet).toContain('<c r="B3" s="6"><v>1234.5</v></c>');
    expect(sheet).toContain('state="frozen"');
  });
});

describe("The month-end package (plan piece 30, B11)", () => {
  beforeEach(async () => {
    // Friday 16 October, 12:00 in Istanbul.
    now = new Date("2026-10-16T09:00:00Z");
    app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
    await seed(app, { drafts: false });
    leyla = await at("leyla");
  });

  it("sorts the month's documents by kind, with the bills, KDV and sales in Excel", { timeout: 30_000 }, async () => {
    // A scanned bill, a Z report and a bank statement, each confirmed.
    await app.assistant.upload(leyla, new TextEncoder().encode("%PDF-1.4\n% a bill\n"), "fatura.pdf");
    await app.assistant.sample(leyla, "zreport");
    await app.assistant.sample(leyla, "bank");
    await app.assistant.runSoon();
    const open = (await app.assistant.list(leyla)).open;
    const bill = open.find((d): d is BillDraftDTO => d.kind === "bill")!;
    const p = bill.proposal;
    await app.assistant.confirm(leyla, bill.id, {
      supplierId: p.supplierId,
      number: p.number,
      date: p.date!,
      lines: p.lines.map((l, from) => ({ itemId: l.itemId, name: l.name, category: l.category, qtyMilli: l.qtyMilli, totalKurus: l.totalKurus, from })),
      kdv: p.kdv,
    });
    await app.assistant.check(leyla, open.find((d): d is ZReportDraftDTO => d.kind === "zreport")!.id, { note: "Bozuk para eksik" });
    await app.assistant.check(leyla, open.find((d): d is StatementDraftDTO => d.kind === "statement")!.id, {});

    const { filename, stream } = await app.monthPackage.build(leyla, "2026-10");
    expect(filename).toBe("peni-moda-2026-10.zip");
    const zip = await read(stream);
    const files = unzip(zip);
    const names = [...files.keys()];
    expect(pythonReads(zip)).toEqual(names);
    expect(names.slice(0, 2)).toEqual(["OKU.txt", "moda-2026-10.xlsx"]);
    expect(names).toContain("faturalar/Malzeme ve ambalaj/2026-10-16 Ambalaj Dünyası A-20511.pdf");
    expect(names.find((n) => n.startsWith("z-raporlari/2026-10-15"))).toMatch(/\.pdf$/);
    expect(names.find((n) => n.startsWith("ekstreler/"))).toMatch(/\.csv$/);
    expect(text(files.get("faturalar/Malzeme ve ambalaj/2026-10-16 Ambalaj Dünyası A-20511.pdf"))).toBe("%PDF-1.4\n% a bill\n");

    const readme = text(files.get("OKU.txt"));
    expect(readme).toContain("Moda Kahvesi · Ekim 2026 · mali müşavir paketi");
    expect(readme).toContain("Ay henüz kapanmadı");
    expect(readme).toContain("faturalar/: 1 faturanın belgesi");
    expect(readme).toContain("z-raporlari/: 1 Z raporu.");
    expect(readme).toMatch(/Belgesi olmayan \d+ fatura/);
    expect(readme).toContain("\r\n");

    const book = unzip(files.get("moda-2026-10.xlsx")!);
    expect(text(book.get("xl/workbook.xml"))).toMatch(/name="Özet".*name="Faturalar".*name="KDV".*name="Satışlar"/);
    const bills = text(book.get("xl/worksheets/sheet2.xml"));
    expect(bills).toContain("KDV %20");
    expect(bills).toContain("A-20511");
    expect(bills).toContain("Belge yok");
    const kdv = text(book.get("xl/worksheets/sheet3.xml"));
    expect(kdv).toContain("Alış (faturalar)");
    // ₺301,67 at 20% sits on ₺1.508,35.
    expect(kdv).toContain("<v>301.67</v>");
    expect(kdv).toContain("<v>1508.35</v>");
    const sales = text(book.get("xl/worksheets/sheet4.xml"));
    expect(sales).toContain("15.10.2026");
    expect(sales).toContain("31.10.2026");
    // The Z report day shows the ₺50 the till took beyond it.
    expect(sales).toContain('<c r="G16" s="2"><v>50</v></c>');
  });

  it("is for those who manage money and see bills, for months that have started", async () => {
    expect(await code(app.monthPackage.build(await at("ece"), "2026-09"))).toBe("FORBIDDEN");
    expect(await code(app.monthPackage.build(leyla, "2026-11"))).toBe("PACKAGE_MONTH");
    expect(await code(app.monthPackage.build(leyla, "2023-09"))).toBe("PACKAGE_MONTH");
    expect(await code(app.monthPackage.build(leyla, "2026-9"))).toBe("PACKAGE_MONTH");
    const files = unzip(await read((await app.monthPackage.build(await at("murat"), "2026-09")).stream));
    expect([...files.keys()]).toEqual(["OKU.txt", "moda-2026-09.xlsx"]);
    expect(text(files.get("OKU.txt"))).toContain("faturalar/: 0 faturanın belgesi");
  });

  it("files a bill under what most of it was for, and works KDV back to its base", () => {
    const line = (category: "rent" | "supplies", totalKurus: number) => ({ itemId: null, name: "x", category, qtyMilli: null, totalKurus });
    expect(mainCategory({ lines: [line("supplies", 100), line("rent", 300)] })).toBe("rent");
    expect(mainCategory({ lines: [] })).toBe("other");
    expect(kdvBase(20_000, 20)).toBe(100_000);
    expect(kdvBase(1_248, 1)).toBe(124_800);
    expect(kdvBase(500, 0)).toBe(0);
  });
});
