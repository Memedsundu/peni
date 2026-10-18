import type { Lang } from "@peni/api/customer-text";

const locale = (lang: Lang) => (lang === "tr" ? "tr-TR" : "en-GB");

/** "19 Ekim 19:00", or "Pazar 19 Ekim 19:00" with the weekday, in the phone's own time. */
export function when(iso: string, lang: Lang, withWeekday = false): string {
  return new Date(iso).toLocaleString(locale(lang), {
    ...(withWeekday ? { weekday: "long" } : {}),
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Cmt 14:20". */
export function shortWhen(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(locale(lang), { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/** "Cmt 19 Eki", for picking a day. */
export function dayLabel(date: Date, lang: Lang): string {
  const weekday = date.toLocaleDateString(locale(lang), { weekday: "short" });
  return `${weekday} ${date.toLocaleDateString(locale(lang), { day: "numeric", month: "short" })}`;
}
