import type { LetterOutput } from "@peni/ai";
import { formatTL } from "@peni/brand/format";

type Facts = {
  sales: {
    total: number;
    weekBefore: number;
    averageOfFourWeeksBefore: number;
    orders: number;
    ordersWeekBefore: number;
    days: { weekday: string; sales: number; before: number }[];
  };
  products: { soldMostDifferently: { ref: string; name: string; sold: number; soldBefore: number }[] };
  priceChanges: {
    ref: string;
    item: string;
    per: string;
    before: number;
    now: number;
    changePct: number;
    since: string;
    bill: string;
    products: { ref: string; name: string; marginBeforePct: number; marginNowPct: number }[];
  }[];
  spending: { total: number; weekBefore: number; biggestBills: { ref: string; supplier: string | null; total: number }[] };
  openToday: { ref: string; text: string }[];
};

const lira = (n: number) => formatTL(Math.round(n) * 100);
const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
const trDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" });
const signed = (n: number) => (n > 0 ? `%${n} arttı` : n < 0 ? `%${-n} düştü` : "aynı kaldı");

/**
 * The demo's stand-in for the weekly letter (piece 30), with no OpenAI key: it reads the
 * facts back in a fixed shape. The real assistant picks what matters and writes it itself.
 */
export function demoLetter(parts: string[]): LetterOutput {
  const text = parts.join("\n");
  const f = JSON.parse(text.slice(text.indexOf("\n", text.indexOf("Facts")) + 1)) as Facts;
  const s = f.sales;
  const c = pct(s.total, s.weekBefore);
  const best = [...s.days].sort((a, b) => b.sales - a.sales)[0];
  const points: LetterOutput["points"] = [
    {
      title: c === null ? "Satışlar" : c >= 0 ? "Satışlar arttı" : "Satışlar düştü",
      text: `Geçen hafta satış ${lira(s.total)}${c === null ? "" : `, bir önceki haftaya göre ${signed(c)}`}; son dört haftanın ortalaması ${lira(s.averageOfFourWeeksBefore)}. ${s.orders} sipariş vardı.${best ? ` En iyi gün ${best.weekday} (${lira(best.sales)}).` : ""}`,
      refs: ["sales"],
    },
  ];
  const price = f.priceChanges[0];
  if (price) {
    const p = price.products[0];
    points.push({
      title: `${price.item} ${price.changePct > 0 ? "pahalandı" : "ucuzladı"}`,
      text: `${price.item} ${trDay(price.since)} faturasıyla ${price.per} başına ${lira(price.before)} yerine ${lira(price.now)} (%${Math.abs(price.changePct)}).${
        !p
          ? ""
          : p.marginNowPct === p.marginBeforePct
            ? ` ${p.name} marjı neredeyse aynı kaldı (%${p.marginNowPct}).`
            : ` ${p.name} marjı %${p.marginBeforePct} yerine %${p.marginNowPct}.`
      }`,
      refs: [price.ref, price.bill, ...(p ? [p.ref] : [])],
    });
  }
  const mover = f.products.soldMostDifferently[0];
  if (mover)
    points.push({
      title: `${mover.name}: ${mover.sold} adet`,
      text: `${mover.name} bir önceki hafta ${mover.soldBefore} adet satmıştı, geçen hafta ${mover.sold}.`,
      refs: [mover.ref],
    });
  const sc = pct(f.spending.total, f.spending.weekBefore);
  const big = f.spending.biggestBills[0];
  points.push({
    title: "Giderler",
    text: `Gider ${lira(f.spending.total)}${sc === null ? "" : `, bir önceki haftaya göre ${signed(sc)}`}.${big ? ` En büyük fatura ${big.supplier ?? "tedarikçisiz"} (${lira(big.total)}).` : ""}`,
    refs: ["expenses", ...(big ? [big.ref] : [])],
  });
  const open = f.openToday[0];
  const todo =
    price && price.changePct > 0 && price.products[0] && price.products[0].marginNowPct < price.products[0].marginBeforePct
      ? {
          text: `${price.products[0].name} fiyatına bir bak: ${price.item} pahalandıktan sonra marjı %${price.products[0].marginNowPct}.`,
          refs: [price.products[0].ref, price.ref],
        }
      : open
        ? { text: `Bugün ilk iş: ${open.text}.`, refs: [open.ref] }
        : { text: "Bu hafta en çok satan ürünlerin stoğunu kontrol et.", refs: ["products"] };
  return { headline: `${points[0]!.title}${price ? `, ${points[1]!.title.toLocaleLowerCase("tr")}` : ""} (demo mektubu)`, points: points.slice(0, 4), todo };
}
