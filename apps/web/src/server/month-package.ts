import { formatTL } from "@peni/brand/format";
import {
  addMonths,
  localDateKey,
  monthDays,
  startOfLocalDay,
  validMonth,
  type AssistantStore,
  type Bill,
  type BillCategory,
  type BillStore,
  type Cafe,
  type Draft,
  type PaymentStore,
  type PeniDirectory,
  type StoredDocument,
} from "@peni/core";
import { AppError } from "./errors";
import type { MoneyService } from "./money";
import type { StaffContext } from "./staff";
import { xlsxBytes, type Sheet } from "./xlsx";
import { safeName, zipStream, type ZipEntry } from "./zip";

/** Folder names for each kind of spending, as a mali müşavir would sort them. */
const FOLDER: Record<BillCategory, string> = {
  ingredients: "Hammadde",
  supplies: "Malzeme ve ambalaj",
  rent: "Kira",
  utilities: "Elektrik su doğalgaz",
  services: "Hizmet ve tamir",
  wages: "Maaş",
  other: "Diğer",
};

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const DRAFTS_LOOKED_AT = 1000;

const lira = (kurus: number) => Math.round(kurus) / 100;
/** "14.09.2026", as Turkish accounting writes dates. */
const trDate = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** What a bill is mostly for: the kind with the largest share of its lines. */
export function mainCategory(bill: Pick<Bill, "lines">): BillCategory {
  const by = new Map<BillCategory, number>();
  for (const l of bill.lines) by.set(l.category, (by.get(l.category) ?? 0) + l.totalKurus);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}

/** KDV per rate, worked back to the base: at 20%, ₺200 KDV sits on ₺1.000. */
export function kdvBase(amountKurus: number, ratePct: number): number {
  return ratePct > 0 ? Math.round((amountKurus * 100) / ratePct) : 0;
}

/**
 * The month-end package for the mali müşavir (plan piece 30, B11): one ZIP with every bill's
 * document sorted by kind, the month's bank and card statements and Z reports, and an Excel
 * workbook (bills, KDV on both sides, sales day by day, the month in short), plus a note
 * saying what's missing. Read only; downloading it changes nothing.
 */
export class MonthPackageService {
  constructor(
    private readonly bills: BillStore,
    private readonly documents: AssistantStore,
    private readonly payments: PaymentStore,
    private readonly money: MoneyService,
    private readonly directory: PeniDirectory,
    private readonly now: () => Date,
  ) {}

  async build(ctx: StaffContext, month: string): Promise<{ filename: string; stream: ReadableStream<Uint8Array> }> {
    for (const p of ["cash.manage", "bills.view"] as const)
      if (!ctx.permissions.has(p)) throw new AppError("FORBIDDEN", "Your role can't download the month's package", 403);
    const cafe = ctx.cafe;
    const tz = (await this.directory.getSettings(cafe.id)).timeZone;
    const today = localDateKey(this.now(), tz);
    if (!validMonth(month) || month > today.slice(0, 7) || month < addMonths(today.slice(0, 7), -36))
      throw new AppError("PACKAGE_MONTH", "Pick a month that has started, at most three years back", 400);
    const { from, to } = monthDays(month);

    const [allBills, suppliers, drafts, settled, summary] = await Promise.all([
      this.bills.listBills(cafe.id, { from, to, includeVoided: true }),
      this.bills.listSuppliers(cafe.id, { includeArchived: true }),
      this.documents.listDrafts(cafe.id, { status: "confirmed", limit: DRAFTS_LOOKED_AT }),
      this.payments.listSettled(
        cafe.id,
        startOfLocalDay(new Date(`${from}T12:00:00Z`), tz),
        startOfLocalDay(new Date(`${monthDays(addMonths(month, 1)).from}T12:00:00Z`), tz),
      ),
      this.money.summary(cafe.id, month),
    ]);
    const bills = allBills.filter((b) => !b.voidedAt).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime());
    const voided = allBills.length - bills.length;
    const supplier = new Map(suppliers.map((s) => [s.id, s]));
    const inMonth = (d: string | null) => !!d && d >= from && d <= to;
    const zReports = drafts.filter((d): d is Extract<Draft, { kind: "zreport" }> => d.kind === "zreport" && inMonth(d.proposal.date));
    const statements = drafts.filter(
      (d): d is Extract<Draft, { kind: "statement" }> =>
        d.kind === "statement" &&
        (inMonth(d.proposal.to) || inMonth(d.proposal.from) || (!d.proposal.from && !d.proposal.to && inMonth(localDateKey(d.createdAt, tz)))),
    );

    // Where each bill's document goes in the ZIP, so the sheet can name it.
    const used = new Set<string>();
    const unique = (path: string, ext: string) => {
      let p = `${path}.${ext}`;
      for (let n = 2; used.has(p.toLowerCase()); n++) p = `${path} (${n}).${ext}`;
      used.add(p.toLowerCase());
      return p;
    };
    const docInfo = new Map<string, Omit<StoredDocument, "bytes"> | null>();
    await Promise.all(
      [...bills.map((b) => b.documentId), ...zReports.map((d) => d.documentId), ...statements.map((d) => d.documentId)]
        .filter((id): id is string => !!id)
        .map(async (id) => docInfo.set(id, await this.documents.getDocumentInfo(cafe.id, id))),
    );
    const placed = new Map<string, string>();
    const place = (documentId: string | null, path: string) => {
      const info = documentId ? docInfo.get(documentId) : null;
      if (!documentId || !info || placed.has(documentId)) return documentId ? (placed.get(documentId) ?? null) : null;
      const p = unique(path, EXT[info.contentType] ?? "bin");
      placed.set(documentId, p);
      return p;
    };
    const billRows = bills.map((b) => {
      const s = b.supplierId ? supplier.get(b.supplierId) : undefined;
      const name = s?.name ?? "Tedarikçisiz";
      const file = place(b.documentId, `faturalar/${FOLDER[mainCategory(b)]}/${b.date} ${safeName(name, 50)}${b.number ? ` ${safeName(b.number, 30)}` : ""}`);
      return { b, s, name, file };
    });
    for (const z of zReports) place(z.documentId, `z-raporlari/${z.proposal.date} Z${z.proposal.zNumber ? ` ${safeName(z.proposal.zNumber, 20)}` : ""}`);
    for (const st of statements)
      place(
        st.documentId,
        `ekstreler/${st.proposal.to ?? st.proposal.from ?? month} ${safeName(st.proposal.bankName ?? (st.proposal.account === "card" ? "Kredi kartı" : "Banka"), 40)}${st.proposal.accountHint ? ` ${safeName(st.proposal.accountHint, 10)}` : ""}`,
      );

    const sheets = this.sheets({ month, from, to, cafe, billRows, zReports, settled, summary, tz });
    const missing = billRows.filter((r) => !r.file);
    const noKdv = bills.filter((b) => !b.kdv.length);
    const readme = readmeText({
      cafe: cafe.name,
      month,
      closed: ((await this.money.closedThrough(cafe.id)) ?? "") >= to,
      bills: bills.length,
      withFiles: billRows.length - missing.length,
      missing: missing.map((r) => `${trDate(r.b.date)} ${r.name}${r.b.number ? ` ${r.b.number}` : ""} · ${formatTL(r.b.totalKurus)}`),
      noKdv: noKdv.length,
      voided,
      zReports: zReports.length,
      statements: statements.length,
      at: this.now(),
      tz,
    });

    const docs = this.documents;
    const workbook = `${safeName(cafe.slug)}-${month}.xlsx`;
    async function* entries(): AsyncGenerator<ZipEntry> {
      yield { name: "OKU.txt", data: new TextEncoder().encode(readme) };
      yield { name: workbook, data: await xlsxBytes(sheets) };
      // One document at a time, straight into the stream.
      for (const [documentId, path] of placed) {
        const doc = await docs.getDocument(cafe.id, documentId);
        if (doc) yield { name: path, data: doc.bytes };
      }
    }
    return { filename: `peni-${safeName(cafe.slug)}-${month}.zip`, stream: zipStream(entries(), this.now()) };
  }

  private sheets(input: {
    month: string;
    from: string;
    to: string;
    cafe: Cafe;
    billRows: { b: Bill; s: { taxNo: string | null } | undefined; name: string; file: string | null }[];
    zReports: Extract<Draft, { kind: "zreport" }>[];
    settled: Awaited<ReturnType<PaymentStore["listSettled"]>>;
    summary: Awaited<ReturnType<MoneyService["summary"]>>;
    tz: string;
  }): Sheet[] {
    const { from, to, billRows, zReports, settled, summary, tz } = input;

    // Bills, one row each, with the KDV split by rate.
    const rates = [...new Set(billRows.flatMap((r) => r.b.kdv.map((k) => k.ratePct)))].sort((a, b) => a - b);
    const billSheet: Sheet = {
      name: "Faturalar",
      columns: [
        { title: "Tarih", width: 12 },
        { title: "Tedarikçi", width: 28 },
        { title: "VKN/TCKN", width: 13 },
        { title: "Fatura no", width: 16 },
        { title: "Tür", width: 20 },
        { title: "Açıklama", width: 36 },
        ...rates.map((r) => ({ title: `KDV %${r}`, kind: "tl" as const, width: 12 })),
        { title: "KDV toplam", kind: "tl", width: 12 },
        { title: "Toplam (KDV dahil)", kind: "tl", width: 18 },
        { title: "Ödenen", kind: "tl", width: 12 },
        { title: "Ödeme", width: 18 },
        { title: "Belge", width: 50 },
      ],
      rows: billRows.map(({ b, s, name, file }) => {
        const kdv = b.kdv.reduce((n, k) => n + k.amountKurus, 0);
        return [
          trDate(b.date),
          name,
          s?.taxNo ?? null,
          b.number,
          FOLDER[mainCategory(b)],
          b.lines.map((l) => l.name).join(", "),
          ...rates.map((r) => {
            const k = b.kdv.find((x) => x.ratePct === r);
            return k ? lira(k.amountKurus) : null;
          }),
          b.kdv.length ? lira(kdv) : null,
          lira(b.totalKurus),
          lira(b.paidKurus),
          [...new Set(b.payments.map((p) => PAY_WORD[p.method] ?? p.method))].join(", ") || (b.paidKurus ? "" : "Ödenmedi"),
          file ?? "Belge yok",
        ];
      }),
      total: [
        "Toplam",
        `${billRows.length} fatura`,
        null,
        null,
        null,
        null,
        ...rates.map((r) => lira(billRows.reduce((n, { b }) => n + (b.kdv.find((x) => x.ratePct === r)?.amountKurus ?? 0), 0))),
        lira(billRows.reduce((n, { b }) => n + b.kdv.reduce((m, k) => m + k.amountKurus, 0), 0)),
        lira(billRows.reduce((n, { b }) => n + b.totalKurus, 0)),
        lira(billRows.reduce((n, { b }) => n + b.paidKurus, 0)),
        null,
        null,
      ],
    };

    // KDV: bought (bills) and sold (Z reports), per rate.
    const kdvRows: (string | number | null)[][] = [];
    const side = (label: string, entries: { ratePct: number; amountKurus: number }[]) => {
      const by = new Map<number, number>();
      for (const k of entries) by.set(k.ratePct, (by.get(k.ratePct) ?? 0) + k.amountKurus);
      for (const [rate, amount] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
        const base = kdvBase(amount, rate);
        kdvRows.push([label, rate, lira(base), lira(amount), lira(base + amount)]);
      }
    };
    side(
      "Alış (faturalar)",
      billRows.flatMap(({ b }) => b.kdv),
    );
    side(
      "Satış (Z raporları)",
      zReports.flatMap((z) => z.proposal.kdv),
    );
    const noKdv = billRows.filter(({ b }) => !b.kdv.length);
    if (noKdv.length) kdvRows.push([`KDV girilmemiş ${noKdv.length} fatura`, null, null, null, lira(noKdv.reduce((n, { b }) => n + b.totalKurus, 0))]);
    const kdvSheet: Sheet = {
      name: "KDV",
      columns: [
        { title: "Taraf", width: 26 },
        { title: "Oran %", kind: "int", width: 8 },
        { title: "Matrah", kind: "tl", width: 14 },
        { title: "KDV", kind: "tl", width: 14 },
        { title: "Toplam", kind: "tl", width: 14 },
      ],
      rows: kdvRows,
    };

    // Sales day by day, as the till took them, next to the Z report when there is one.
    const days = new Map<string, { cash: number; card: number; refunds: number; peni: number; askida: number }>();
    for (let d = from; d <= to; d = nextDay(d)) days.set(d, { cash: 0, card: 0, refunds: 0, peni: 0, askida: 0 });
    for (const p of settled) {
      if (!p.settledAt) continue;
      const row = days.get(localDateKey(p.settledAt, tz));
      if (!row) continue;
      if (p.kind === "refund") {
        if (p.method === "cash" || p.method === "card") row.refunds += p.amountKurus;
        continue;
      }
      if (p.method === "cash") row.cash += p.amountKurus;
      else if (p.method === "card") row.card += p.amountKurus;
      else if (p.method === "peni") row.peni += p.amountKurus;
      else row.askida += p.amountKurus;
    }
    const zByDay = new Map(zReports.map((z) => [z.proposal.date!, z.proposal]));
    const salesRows = [...days.entries()].map(([d, r]) => {
      const net = r.cash + r.card - r.refunds;
      const z = zByDay.get(d);
      return [
        trDate(d),
        lira(r.cash),
        lira(r.card),
        lira(r.refunds),
        lira(net),
        z?.totalKurus == null ? null : lira(z.totalKurus),
        z?.totalKurus == null ? null : lira(net - z.totalKurus),
        lira(r.peni),
        lira(r.askida),
      ];
    });
    const sum = (i: number) => Math.round(salesRows.reduce((n, r) => n + (typeof r[i] === "number" ? (r[i] as number) : 0), 0) * 100) / 100;
    const salesSheet: Sheet = {
      name: "Satışlar",
      columns: [
        { title: "Gün", width: 12 },
        { title: "Nakit", kind: "tl", width: 12 },
        { title: "Kart", kind: "tl", width: 12 },
        { title: "İade", kind: "tl", width: 12 },
        { title: "Net (nakit+kart−iade)", kind: "tl", width: 20 },
        { title: "Z raporu", kind: "tl", width: 12 },
        { title: "Fark", kind: "tl", width: 10 },
        { title: "Penny ile", kind: "tl", width: 12 },
        { title: "Askıdan", kind: "tl", width: 12 },
      ],
      rows: salesRows,
      total: ["Toplam", sum(1), sum(2), sum(3), sum(4), zReports.length ? sum(5) : null, zReports.length ? sum(6) : null, sum(7), sum(8)],
    };

    // The month in short, as Ay kapanışı shows it.
    const s = summary;
    const summarySheet: Sheet = {
      name: "Özet",
      columns: [
        { title: "Kalem", width: 40 },
        { title: "Tutar", kind: "tl", width: 16 },
      ],
      rows: [
        ["Satış: nakit (iadeler düşülmüş)", lira(s.sales.cashKurus)],
        ["Satış: kart (iadeler düşülmüş)", lira(s.sales.cardKurus)],
        ["Satış toplamı", lira(s.sales.totalKurus)],
        [`Faturalar (${s.bills.count} adet, KDV dahil)`, lira(s.bills.totalKurus)],
        ["Çalışılan saatlerin maaşı", lira(s.wages.earnedKurus)],
        ["Ay içinde ödenen maaş", lira(s.wages.paidKurus)],
        ["Ay sonu kasa", s.money.drawerKurus === null ? null : lira(s.money.drawerKurus)],
        ["Ay sonu ayrı kasa", s.money.reserveKurus === null ? null : lira(s.money.reserveKurus)],
        ["Ay sonu banka", s.money.bankKurus === null ? null : lira(s.money.bankKurus)],
        ["Ay sonu borç: faturalar", lira(s.owed.billsKurus)],
        ["Ay sonu borç: çekler", lira(s.owed.checksKurus)],
        ["Ay sonu borç: krediler", lira(s.owed.loansKurus)],
        ["Ay sonu borç: kredi kartı", lira(s.owed.cardKurus)],
        ["Ay sonu borç: maaşlar", lira(s.owed.wagesKurus)],
        ["Ay sonu borç toplamı", lira(s.owed.totalKurus)],
      ],
    };
    return [summarySheet, billSheet, kdvSheet, salesSheet];
  }
}

const PAY_WORD: Record<string, string> = { cash: "Nakit", card: "Kart", bank: "Havale/EFT", credit: "Kredi kartı", check: "Çek", loan: "Borç" };

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function readmeText(r: {
  cafe: string;
  month: string;
  closed: boolean;
  bills: number;
  withFiles: number;
  missing: string[];
  noKdv: number;
  voided: number;
  zReports: number;
  statements: number;
  at: Date;
  tz: string;
}): string {
  const monthName = new Date(`${r.month}-15T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });
  const at = r.at.toLocaleString("tr-TR", { timeZone: r.tz, dateStyle: "long", timeStyle: "short" });
  return [
    `${r.cafe} · ${monthName} · mali müşavir paketi`,
    `Penny'den ${at} tarihinde hazırlandı.${r.closed ? " Ay kapanmış; rakamlar kilitli." : " Ay henüz kapanmadı; rakamlar değişebilir."}`,
    "",
    "İçindekiler:",
    `- Excel dosyası: Özet, Faturalar (KDV oranlarına göre), KDV (alış ve satış), Satışlar (gün gün, Z raporuyla).`,
    `- faturalar/: ${r.withFiles} faturanın belgesi, türüne göre klasörlerde.`,
    `- z-raporlari/: ${r.zReports} Z raporu.`,
    `- ekstreler/: ${r.statements} banka ve kart ekstresi.`,
    "",
    `Faturalar: ${r.bills} adet${r.voided ? ` (iptal edilen ${r.voided} fatura dahil değil)` : ""}.`,
    r.noKdv ? `KDV'si girilmemiş ${r.noKdv} fatura var; Excel'de KDV sütunu boş.` : "Her faturanın KDV'si girilmiş.",
    r.missing.length
      ? `Belgesi olmayan ${r.missing.length} fatura (elle girilmiş):\n${r.missing.map((m) => `  - ${m}`).join("\n")}`
      : "Her faturanın belgesi var.",
    "",
    "Satış KDV'si Z raporlarından okunur; Z raporu taranmamış günler Satışlar sayfasında boş görünür.",
  ].join("\r\n");
}
