import type { FiscalSaleDTO, ZReportDataDTO } from "@peni/api";

const WIDTH = 40;

const tl = (kurus: number) => {
  const sign = kurus < 0 ? "-" : "";
  const abs = Math.abs(kurus);
  return `${sign}${Math.floor(abs / 100).toLocaleString("tr-TR")},${String(abs % 100).padStart(2, "0")}`;
};
const row = (left: string, right: string) => {
  const room = WIDTH - right.length - 1;
  return `${left.length > room ? left.slice(0, room) : left.padEnd(room)} ${right}`;
};
const center = (s: string) => s.padStart(Math.floor((WIDTH + s.length) / 2)).padEnd(WIDTH);
const rule = "-".repeat(WIDTH);

/** A sale as a 40-column slip, the way a yazarkasa prints one. The practice yazarkasa prints this. */
export function saleText(
  sale: FiscalSaleDTO,
  info: { header: string[]; receiptNo: string; zNo: string; at: Date; card?: { scheme: string; last4: string; authCode: string } | null },
): string {
  const out: string[] = [...info.header.map(center), rule];
  out.push(row(`${info.at.toLocaleDateString("tr-TR")} ${info.at.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`, `FİŞ NO: ${info.receiptNo}`));
  out.push(row(`Sipariş #${sale.orderNumber}`, `Kasiyer: ${sale.cashier}`), rule);
  for (const l of sale.lines) {
    out.push(row(l.name, `%${l.kdvPercent} ${tl(l.unitPriceKurus * l.quantity)}`));
    if (l.quantity > 1) out.push(`  ${l.quantity} x ${tl(l.unitPriceKurus)}`);
    if (l.discountKurus > 0) out.push(row("  İndirim", `-${tl(l.discountKurus)}`));
  }
  const linesKurus = sale.lines.reduce((s, l) => s + l.totalKurus, 0);
  out.push(rule, row("ARA TOPLAM", tl(linesKurus)));
  for (const d of sale.discounts) out.push(row(d.label, `-${tl(d.amountKurus)}`));
  const total = linesKurus - sale.discounts.reduce((s, d) => s + d.amountKurus, 0);
  out.push(row("TOPLAM", tl(total)), rule);
  for (const p of sale.paidBefore) out.push(row(p.label, tl(p.amountKurus)));
  out.push(row(sale.take.method === "card" ? "KREDİ KARTI" : "NAKİT", tl(sale.take.amountKurus)));
  if (sale.take.tenderedKurus) out.push(row("  Verilen", tl(sale.take.tenderedKurus)), row("  Para üstü", tl(sale.take.changeKurus ?? 0)));
  if (info.card) out.push(row(`  ${info.card.scheme} **** ${info.card.last4}`, `ONAY ${info.card.authCode}`));
  out.push(rule, row(`Z NO: ${info.zNo}`, "DENEME · MALİ DEĞERİ YOKTUR"));
  return out.join("\n");
}

/** An X or Z report as a slip. */
export function reportText(kind: "x" | "z", z: ZReportDataDTO, header: string[]): string {
  const out = [...header.map(center), rule, center(kind === "z" ? `Z RAPORU · Z NO ${z.zNumber}` : "X RAPORU (ARA)"), center(z.date ?? ""), rule];
  out.push(row("Fiş sayısı", String(z.receipts ?? 0)));
  out.push(row("GENEL TOPLAM", tl(z.totalKurus ?? 0)));
  out.push(row("  Nakit", tl(z.cashKurus ?? 0)), row("  Kredi kartı", tl(z.cardKurus ?? 0)), row("  Diğer", tl(z.otherKurus ?? 0)));
  for (const k of z.kdv) out.push(row(`  KDV %${k.ratePct}`, tl(k.amountKurus)));
  out.push(rule, center("DENEME · MALİ DEĞERİ YOKTUR"));
  return out.join("\n");
}
