import type { StockUnitDTO } from "@peni/api";
import type { Lang } from "./text";

/**
 * Stock amounts are thousandths of the unit (grams, ml, 1000 per piece). On screen, a kg
 * item under 1 kg reads in grams ("850 g") and over it in kg ("2,4 kg"); litres the same
 * with ml; pieces as pieces ("12 adet").
 */
const MINUS = "−";

function num(n: number, lang: Lang, maxDigits = 2): string {
  return new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-GB", { maximumFractionDigits: maxDigits }).format(n);
}

export function formatQty(milli: number, unit: StockUnitDTO, lang: Lang): string {
  if (milli < 0) return MINUS + formatQty(-milli, unit, lang);
  if (unit === "adet") return `${num(milli / 1000, lang)} ${lang === "tr" ? "adet" : "pcs"}`;
  const [big, small] = unit === "kg" ? ["kg", "g"] : ["L", "ml"];
  if (milli > 0 && milli < 1000) return `${num(milli, lang, 0)} ${small}`;
  return `${num(milli / 1000, lang)} ${big}`;
}

/** A change, with its sign: "+2 L", "−150 g". */
export function formatChange(milli: number, unit: StockUnitDTO, lang: Lang): string {
  return milli > 0 ? `+${formatQty(milli, unit, lang)}` : formatQty(milli, unit, lang);
}

/** What the user types amounts in on Stok: kg, L or pieces. */
export function bigUnit(unit: StockUnitDTO, lang: Lang): string {
  return unit === "kg" ? "kg" : unit === "l" ? "L" : lang === "tr" ? "adet" : "pcs";
}

/** What a recipe's amounts are typed in: g, ml or pieces. */
export function smallUnit(unit: StockUnitDTO, lang: Lang): string {
  return unit === "kg" ? "g" : unit === "l" ? "ml" : lang === "tr" ? "adet" : "pcs";
}

/** "2,5" or "2.5" → 2.5; null for anything that isn't a plain non-negative number. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  // Turkish writes 1.250,5; a lone comma or dot is the decimal point.
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  return Number(normal);
}

/** An amount typed in kg, L or pieces, as thousandths. */
export function parseBig(raw: string): number | null {
  const n = parseNumber(raw);
  return n === null ? null : Math.round(n * 1000);
}

/** An amount typed in g or ml (or pieces, for a piece item), as thousandths. */
export function parseSmall(raw: string, unit: StockUnitDTO): number | null {
  const n = parseNumber(raw);
  if (n === null) return null;
  return unit === "adet" ? Math.round(n * 1000) : Math.round(n);
}

/** Thousandths back to what the user typed: in kg/L/pieces, or g/ml for a recipe. */
export function bigInput(milli: number): string {
  return String(milli / 1000).replace(".", ",");
}
export function smallInput(milli: number, unit: StockUnitDTO): string {
  return unit === "adet" ? bigInput(milli) : String(milli);
}

/** Lira typed as "45" or "45,50" → kuruş. */
export function parseTL(raw: string): number | null {
  const n = parseNumber(raw);
  return n === null ? null : Math.round(n * 100);
}
export function tlInput(kurus: number | null): string {
  return kurus === null ? "" : String(kurus / 100).replace(".", ",");
}

/** A calendar day "2026-10-16" as "16 Eki" (with the year when it isn't this one). */
export function formatDay(day: string, lang: Lang, opts: { year?: boolean } = {}): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", {
    day: "numeric",
    month: "short",
    ...(opts.year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "2026-10" as "Ekim 2026". */
export function formatMonth(month: string, lang: Lang): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The month before or after "2026-10". */
export function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

/** A day "2026-10-16" plus some days. */
export function addDaysTo(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "1–18 Eki", "18 Eki", "1 Eyl – 15 Eki". */
export function rangeLabel(r: { from: string; through: string }, lang: Lang): string {
  if (r.from === r.through) return formatDay(r.from, lang, { year: r.from.slice(0, 4) !== new Date().toISOString().slice(0, 4) });
  if (r.from.slice(0, 7) === r.through.slice(0, 7)) return `${Number(r.from.slice(8))}–${formatDay(r.through, lang)}`;
  return `${formatDay(r.from, lang)} – ${formatDay(r.through, lang)}`;
}
