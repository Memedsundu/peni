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
