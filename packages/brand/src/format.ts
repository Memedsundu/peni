/**
 * Turkish text helpers (design-system.md §4.6). Pure functions, no platform code, safe on
 * Hermes: every case mapping pre-maps the dotted/dotless i, every Intl formatter is cached.
 *
 * Dates and times are read in the cafés' time zone (`TIME_ZONE`, Europe/Istanbul) unless a
 * `timeZone` is passed, so a server render in UTC and a phone in Kadıköy say the same "bugün".
 *
 * NEVER attach a suffix to a dynamic café name. Rephrase with "için" or put the name in a
 * legend, unless the café has stored name forms [gap G10].
 */
import { cafeHueOrder } from "./tokens";
import type { CafeHue } from "./tokens";
import { deviceOrder } from "./shapes";
import type { DeviceKind } from "./shapes";

/** The cafés' time zone. Turkey has been on UTC+3 all year since 2016. */
export const TIME_ZONE = "Europe/Istanbul";

/** U+2212 MINUS SIGN, for negative amounts ("−₺30", "−90 peni"). Never a hyphen. */
export const MINUS = "−";

/** U+00B7 MIDDLE DOT with its spaces, the one list separator: "3 çay · 1 Türk kahvesi". */
export const SEP = " · ";

/* ========================================================================================== */
/* Case                                                                                       */
/* ========================================================================================== */

/**
 * A cased letter (every letter of the Turkish and Latin alphabets). Deliberately not
 * `/\p{L}/u`: Unicode property escapes are not safe on every Hermes build.
 */
function isLetter(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase();
}

/**
 * Turkish upper case. Use it for every caps string on mobile and inside SVG `<text>` on web
 * (HTML on web may use CSS `uppercase`, because `lang="tr"` is set).
 * `trUpper("sipariş ışık") === "SİPARİŞ IŞIK"`.
 */
export function trUpper(s: string): string {
  return s.replace(/i/g, "İ").replace(/ı/g, "I").toLocaleUpperCase("tr");
}

/** Turkish lower case: `trLower("IŞIK İÇİN") === "ışık için"`. */
export function trLower(s: string): string {
  return s.replace(/I/g, "ı").replace(/İ/g, "i").toLocaleLowerCase("tr");
}

/** Upper-cases the first letter only: `capitalizeTr("yarın 14:30'a kadar") === "Yarın 14:30'a kadar"`. */
export function capitalizeTr(s: string): string {
  const first = String.fromCodePoint(s.codePointAt(0) ?? 0);
  return s ? trUpper(first) + s.slice(first.length) : s;
}

/* ========================================================================================== */
/* Money and numbers                                                                          */
/* ========================================================================================== */

const numberFmt = new Intl.NumberFormat("tr-TR");
const tlWhole = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const tlKurus = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Lira from kuruş: `formatTL(12000) === "₺120"`, `formatTL(3050) === "₺30,50"`,
 * `formatTL(-3000) === "−₺30"` (true minus, U+2212). Replaces `formatKurus` in the UI.
 */
export function formatTL(kurus: number): string {
  const k = Math.round(kurus) + 0; // + 0 turns −0 into 0
  if (k < 0) return MINUS + formatTL(-k);
  return (k % 100 ? tlKurus : tlWhole).format(k / 100);
}

/** tr-TR grouping: `formatNumber(1240) === "1.240"`; negatives use U+2212. */
export function formatNumber(n: number): string {
  const v = Math.round(n) + 0;
  return v < 0 ? MINUS + numberFmt.format(-v) : numberFmt.format(v);
}

/**
 * `formatPeni(1240) === "1.240 peni"`. With `signed`, positives get "+" ("+2 peni");
 * negatives always get U+2212 ("−90 peni").
 */
export function formatPeni(n: number, opts: { signed?: boolean } = {}): string {
  const v = Math.round(n) + 0;
  const sign = v < 0 ? MINUS : opts.signed && v > 0 ? "+" : "";
  return `${sign}${numberFmt.format(Math.abs(v))} peni`;
}

/** Turkish puts the sign first: `formatPercent(5) === "%5"`. */
export function formatPercent(n: number): string {
  return `%${numberFmt.format(n)}`;
}

/** "+90 532 123 45 67" from "+905321234567", "905321234567" or "5321234567". Anything else is returned as is. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 12 && digits.startsWith("90") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (national.length !== 10) return phone;
  return `+90 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8)}`;
}

const NUMBER_WORDS = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz", "on"];

/** Small counts as words, for sentences: `numberWord(2) === "iki"` ("günde iki tane"). Above 10, digits. */
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 10 ? NUMBER_WORDS[n]! : formatNumber(n);
}

/* ========================================================================================== */
/* Goods: amounts read as goods (principle 2)                                                 */
/* ========================================================================================== */

export interface RefItem {
  name: string;
  priceKurus: number;
}

/**
 * Words that keep their capital inside a lower-cased goods name, because Turkish spells them
 * as proper adjectives: "Türk Kahvesi" → "Türk kahvesi", "Rize Çayı" → "Rize çayı".
 */
const PROPER_WORDS = new Set([
  "türk",
  "rize",
  "antep",
  "gaziantep",
  "osmanlı",
  "arap",
  "italyan",
  "fransız",
  "yunan",
  "kıbrıs",
  "hatay",
  "maraş",
  "trabzon",
  "bursa",
  "izmir",
  "istanbul",
]);

/**
 * A product name as it reads after a number: lower-cased with Turkish rules, proper
 * adjectives kept. `goodsName("Çay") === "çay"`, `goodsName("Türk Kahvesi") === "Türk kahvesi"`.
 */
export function goodsName(name: string): string {
  return name
    .trim()
    .split(/(\s+)/)
    .map((word) => {
      const lower = trLower(word);
      return PROPER_WORDS.has(lower) ? capitalizeTr(lower) : lower;
    })
    .join("");
}

function goodsCounts(peni: number, refItems: readonly RefItem[] | null | undefined): { n: number; name: string }[] {
  if (!refItems?.length || !Number.isFinite(peni)) return [];
  return refItems
    .filter((item) => item.priceKurus > 0)
    .slice()
    .sort((a, b) => a.priceKurus - b.priceKurus)
    .map((item) => ({ n: Math.floor(peni / Math.ceil(item.priceKurus / 100)), name: goodsName(item.name) }));
}

/**
 * What a peni amount buys, in whole items of the cheapest reference item:
 * `n = floor(peni / ceil(priceKurus/100))`. `goods(90, [{name:"Çay", priceKurus:3000}]) === "3 çay"`.
 * Returns null when n < 1. Only whole items, ever (D9).
 *
 * Web renders it after `<Approx/>`, mobile after "≈ "; screen readers read "yaklaşık".
 */
export function goods(peni: number, refItems: readonly RefItem[] | null | undefined): string | null {
  const first = goodsCounts(peni, refItems)[0];
  return first && first.n >= 1 ? `${formatNumber(first.n)} ${first.name}` : null;
}

/**
 * The two-item line: "3 çay · 1 Türk kahvesi" (the second-cheapest item is added when it
 * buys at least one). Null when even the cheapest buys none.
 */
export function goodsLine(peni: number, refItems: readonly RefItem[] | null | undefined): string | null {
  const [first, second] = goodsCounts(peni, refItems);
  if (!first || first.n < 1) return null;
  const a = `${formatNumber(first.n)} ${first.name}`;
  return second && second.n >= 1 ? `${a}${SEP}${formatNumber(second.n)} ${second.name}` : a;
}

/* ========================================================================================== */
/* Suffixes                                                                                   */
/* ========================================================================================== */

const BACK_VOWELS = "aıouâû";
const FRONT_VOWELS = "eiöüî";
const VOWELS = BACK_VOWELS + FRONT_VOWELS;

/**
 * Names whose final "l" is palatal (Arabic loans), so they take front suffixes although the
 * last vowel is "a": Kemal'e, Hilal'e.
 */
const PALATAL_L_NAMES = new Set(["kemal", "cemal", "celal", "bilal", "hilal", "hayal", "nihal", "iclal"]);

/**
 * Dative of a first name: `'a` or `'e` from the last vowel (a ı o u → a; e i ö ü → e), with a
 * "y" buffer after a final vowel. Mehmet'e, Ayşe'ye, Can'a, Öykü'ye.
 */
export function dativeName(first: string): string {
  const name = first.trim();
  if (!name) return name;
  const letters = [...trLower(name)].filter(isLetter);
  const lastLetter = letters[letters.length - 1];
  const lastVowel = [...letters].reverse().find((c) => VOWELS.includes(c));
  if (!lastVowel) return `${name}'ye`; // spelled out as letters: "Ş" → "şe" → Ş'ye
  const front = FRONT_VOWELS.includes(lastVowel) || PALATAL_L_NAMES.has(letters.join(""));
  const buffer = lastLetter && VOWELS.includes(lastLetter) ? "y" : "";
  return `${name}'${buffer}${front ? "e" : "a"}`;
}

type SuffixTable = { units: Record<number, string>; tens: Record<number, string>; zero: string };

/** Dative ('e/'a) by the last spoken number: 1 bire, 2 ikiye, 6 altıya, 9 dokuza, 10 ona, 20 yirmiye, 0 sıfıra. */
const DATIVE: SuffixTable = {
  units: { 1: "e", 2: "ye", 3: "e", 4: "e", 5: "e", 6: "ya", 7: "ye", 8: "e", 9: "a" },
  tens: { 10: "a", 20: "ye", 30: "a", 40: "a", 50: "ye", 60: "a", 70: "e", 80: "e", 90: "a" },
  zero: "a",
};

/** Locative ('de/'da/'te/'ta): 3, 4, 5 and 40 harden to t. üçte, dörtte, beşte, kırkta. */
const LOCATIVE: SuffixTable = {
  units: { 1: "de", 2: "de", 3: "te", 4: "te", 5: "te", 6: "da", 7: "de", 8: "de", 9: "da" },
  tens: { 10: "da", 20: "de", 30: "da", 40: "ta", 50: "de", 60: "ta", 70: "te", 80: "de", 90: "da" },
  zero: "da",
};

/** The last number read aloud in "14:30" (minutes when non-zero, otherwise the hour). */
function lastSpokenNumber(time: string): number | null {
  const m = /(\d{1,2})[:.](\d{2})(?!.*\d)/.exec(time);
  if (m) {
    const minutes = Number(m[2]);
    return minutes !== 0 ? minutes : Number(m[1]);
  }
  const n = /(\d+)(?!.*\d)/.exec(time);
  return n ? Number(n[1]) : null;
}

function suffixFor(n: number, table: SuffixTable): string {
  if (n === 0) return table.zero;
  const unit = n % 10;
  if (unit !== 0) return table.units[unit]!;
  const tens = n % 100;
  if (tens !== 0) return table.tens[tens]!;
  return table === DATIVE ? "e" : "de"; // yüz, bin: yüze / yüzde
}

function withSuffix(time: string | Date, table: SuffixTable): string {
  const t = typeof time === "string" ? time.trim() : formatTime(time);
  const n = lastSpokenNumber(t);
  return n === null ? t : `${t}'${suffixFor(n, table)}`;
}

/**
 * "14:30" → "14:30'a", "18:00" → "18:00'e", "12:00" → "12:00'ye", "16:00" → "16:00'ya",
 * "10:00" → "10:00'a". A Date is formatted with `formatTime` first.
 */
export function dativeTime(time: string | Date): string {
  return withSuffix(time, DATIVE);
}

/**
 * "14:30" → "14:30'da", "15:00" → "15:00'te", "13:00" → "13:00'te", "18:00" → "18:00'de",
 * "16:00" → "16:00'da", "09:40" → "09:40'ta".
 */
export function locativeTime(time: string | Date): string {
  return withSuffix(time, LOCATIVE);
}

/* ========================================================================================== */
/* Dates                                                                                      */
/* ========================================================================================== */

type DateInput = Date | string | number;

function toDate(d: DateInput): Date {
  return d instanceof Date ? d : new Date(d);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    fmtCache.set(key, f);
  }
  return f;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zoned(date: Date, timeZone: string): ZonedParts {
  const f = dtf("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  if (typeof f.formatToParts === "function") {
    const p: Record<string, string> = {};
    for (const part of f.formatToParts(date)) p[part.type] = part.value;
    return {
      year: Number(p.year),
      month: Number(p.month),
      day: Number(p.day),
      hour: Number(p.hour) % 24,
      minute: Number(p.minute),
    };
  }
  // Engines without formatToParts: Istanbul is a fixed UTC+3.
  const shifted = new Date(date.getTime() + (timeZone === TIME_ZONE ? 3 * 3600_000 : -date.getTimezoneOffset() * 60_000));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function dayNumber(p: ZonedParts): number {
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
}

/** "14:30" (24-hour, tabular-friendly). */
export function formatTime(date: DateInput, timeZone: string = TIME_ZONE): string {
  const p = zoned(toDate(date), timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** "16 Ekim 2026". */
export function formatLongDate(date: DateInput, timeZone: string = TIME_ZONE): string {
  return dtf("tr-TR", { timeZone, day: "numeric", month: "long", year: "numeric" }).format(toDate(date));
}

/**
 * Relative day: "bugün", "dün", "yarın", a weekday name within a week ("Pazartesi"),
 * otherwise "12 Eki" (with the year when it isn't this year: "12 Eki 2025").
 * "Yarın" is needed for gift deadlines ("Yarın 14:30'a kadar …"; `capitalizeTr` for a sentence start).
 */
export function relDay(iso: DateInput, now: DateInput = new Date(), timeZone: string = TIME_ZONE): string {
  const date = toDate(iso);
  const a = zoned(date, timeZone);
  const b = zoned(toDate(now), timeZone);
  const diff = dayNumber(a) - dayNumber(b);
  if (diff === 0) return "bugün";
  if (diff === -1) return "dün";
  if (diff === 1) return "yarın";
  if (Math.abs(diff) < 7) return dtf("tr-TR", { timeZone, weekday: "long" }).format(date);
  return a.year === b.year
    ? dtf("tr-TR", { timeZone, day: "numeric", month: "short" }).format(date)
    : dtf("tr-TR", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(date);
}

/**
 * The date block's three lines (§6.5): weekday "PER", day "22", month "EKİ"; plus `short`
 * ("22 Eki Per") for the mobile event line "22 Eki Per · 19:00".
 */
export function dateBlock(date: DateInput, timeZone: string = TIME_ZONE): { weekday: string; day: string; month: string; short: string } {
  const d = toDate(date);
  const weekday = dtf("tr-TR", { timeZone, weekday: "short" }).format(d);
  const month = dtf("tr-TR", { timeZone, month: "short" }).format(d);
  const day = String(zoned(d, timeZone).day);
  return { weekday: trUpper(weekday), day, month: trUpper(month), short: `${day} ${month} ${weekday}` };
}

/** 05–11 "Günaydın", 11–17 "İyi günler", 17–22 "İyi akşamlar", 22–05 "İyi geceler". */
export function greeting(date: DateInput = new Date(), timeZone: string = TIME_ZONE): string {
  const h = zoned(toDate(date), timeZone).hour;
  if (h >= 5 && h < 11) return "Günaydın";
  if (h >= 11 && h < 17) return "İyi günler";
  if (h >= 17 && h < 22) return "İyi akşamlar";
  return "İyi geceler";
}

/**
 * The masthead dateline (§6.4): "MODA KAHVESİ GAZETESİ · 16 EKİM 2026 · KADIKÖY".
 * `compact` (top of Masa) drops the district: "MODA KAHVESİ GAZETESİ · 16 EKİM 2026".
 */
export function dateline(
  cafe: { name: string; district?: string | null },
  date: DateInput = new Date(),
  opts: { compact?: boolean; timeZone?: string } = {},
): string {
  const parts = [`${trUpper(cafe.name.trim())} GAZETESİ`, trUpper(formatLongDate(date, opts.timeZone ?? TIME_ZONE))];
  if (!opts.compact && cafe.district?.trim()) parts.push(trUpper(cafe.district.trim()));
  return parts.join(SEP);
}

/* ========================================================================================== */
/* Names and initials                                                                         */
/* ========================================================================================== */

function firstLetter(word: string): string | null {
  for (const ch of word) if (isLetter(ch)) return ch;
  return null;
}

/** Up to two initials, Turkish upper case: "Ayşe Kaya" → "AK", "ismail" → "İ". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const picks = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words;
  return trUpper(picks.map(firstLetter).filter((c): c is string => c !== null).join(""));
}

/**
 * The coin's initials triad (§6.1): the café initial on top, district and city below ("M" over
 * "K · İ"). If district or city is missing, only the top initial.
 */
export function coinInitials(cafe: { name: string; district?: string | null; city?: string | null }): { top: string; bottom: string | null } {
  const top = trUpper(firstLetter(cafe.name) ?? "");
  const d = cafe.district ? firstLetter(cafe.district) : null;
  const c = cafe.city ? firstLetter(cafe.city) : null;
  return { top, bottom: d && c ? `${trUpper(d)}${SEP}${trUpper(c)}` : null };
}

/**
 * The 96px rim legend (§6.1): "MODA KAHVESİ · KADIKÖY". Over 30 characters, the name only;
 * over 30 again, truncated with "…". Always `aria-hidden`.
 */
export function coinLegend(name: string, district?: string | null, max = 30): string {
  const n = trUpper(name.trim());
  const full = district?.trim() ? `${n}${SEP}${trUpper(district.trim())}` : n;
  if ([...full].length <= max) return full;
  const chars = [...n];
  return chars.length <= max ? n : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

/* ========================================================================================== */
/* Café identity                                                                              */
/* ========================================================================================== */

/** djb2 over code points: `h = 5381; h = ((h << 5) + h + c) >>> 0`. */
export function djb2(s: string): number {
  let h = 5381;
  for (const ch of s) h = ((h << 5) + h + ch.codePointAt(0)!) >>> 0;
  return h;
}

/** The café colourway until the café chooses one [gap G9]: moda → murekkep, kuzguncuk → zeytin. */
export function cafeHue(slug: string): CafeHue {
  return cafeHueOrder[djb2(slug) % 4]!;
}

/** The café device: moda → glass, kuzguncuk → fincan. */
export function cafeDevice(slug: string): DeviceKind {
  return deviceOrder[(djb2(slug) >>> 2) % 3]!;
}

/* ========================================================================================== */
/* Peni arithmetic (D12, D13)                                                                 */
/* ========================================================================================== */

/** Peni earned on what is paid at the till: `floor(dueKurus × rate / 10000)`. `earnPreview(5500, 5) === 2`. */
export function earnPreview(dueKurus: number, earnRatePercent: number): number {
  return Math.max(0, Math.floor((dueKurus * earnRatePercent) / 10000));
}

/**
 * The capped peni the toggle offers: `min(balance, floor((subtotal − askida) × share / 10000))`,
 * never more than `(subtotal − askida) / 100` (the due amount in lira), never negative.
 */
export function usablePeni(input: {
  balance: number;
  subtotalKurus: number;
  askidaKurus: number;
  maxRedeemSharePercent: number;
}): number {
  const payable = Math.max(0, input.subtotalKurus - input.askidaKurus);
  const byShare = Math.floor((payable * input.maxRedeemSharePercent) / 10000);
  const byDue = Math.floor(payable / 100);
  return Math.max(0, Math.min(Math.floor(input.balance), byShare, byDue));
}
