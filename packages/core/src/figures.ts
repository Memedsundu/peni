import { addMonths, monthDays } from "./books";
import { plusDays, weekStartOf } from "./shifts";

/**
 * Raporlar's periods and buckets (plan piece 23). A report covers local days `from`
 * through `through`, both included, and is compared with the period just before it.
 */

/** The longest period a report covers: a year and a bit. */
export const REPORT_MAX_DAYS = 400;

/** How the sales chart groups days: hours for one day, then days, weeks, months. */
export type ReportStep = "hour" | "day" | "week" | "month";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validDay(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Days from `from` to `through`, both counted. */
export function daysBetween(from: string, through: string): number {
  return Math.round((Date.parse(`${through}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
}

/**
 * What a period is compared with. One day goes against the same weekday a week before, as
 * cafés think in weeks ("last Saturday"). A month so far, from the 1st, goes against the
 * same days of the month before. Anything else against as many days just before it.
 */
export function previousRange(from: string, through: string): { from: string; through: string } {
  const n = daysBetween(from, through);
  if (n === 1) return { from: plusDays(from, -7), through: plusDays(through, -7) };
  const month = from.slice(0, 7);
  if (from.endsWith("-01") && through.slice(0, 7) === month) {
    const prev = monthDays(addMonths(month, -1));
    const last = `${prev.from.slice(0, 8)}${through.slice(8)}`;
    return { from: prev.from, through: last > prev.to || !validDay(last) ? prev.to : last };
  }
  return { from: plusDays(from, -n), through: plusDays(from, -1) };
}

export function reportStep(from: string, through: string): ReportStep {
  const n = daysBetween(from, through);
  if (n === 1) return "hour";
  if (n <= 62) return "day";
  if (n <= 190) return "week";
  return "month";
}

/** The bucket a day falls in: the day itself, its week's Monday, or its month. */
export function bucketOf(day: string, step: Exclude<ReportStep, "hour">): string {
  return step === "day" ? day : step === "week" ? weekStartOf(day) : day.slice(0, 7);
}

/** Every bucket in the period, in order; for hours, "00" to "23". */
export function bucketsOf(from: string, through: string, step: ReportStep): string[] {
  if (step === "hour") return Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
  const out: string[] = [];
  for (let d = from; d <= through; d = plusDays(d, 1)) {
    const b = bucketOf(d, step);
    if (out[out.length - 1] !== b) out.push(b);
  }
  return out;
}

/** The months from `first` through `last`, "YYYY-MM", in order. */
export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) out.push(m);
  return out;
}
