import type { Shift } from "@peni/core";
import type { EmailMessage } from "./customer-auth";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "Pazartesi 19 Ekim". */
const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("tr-TR", { ...o, timeZone: "UTC" });
  return `${part({ weekday: "long" })} ${part({ day: "numeric", month: "long" })}`;
};

/**
 * "Bu haftaki vardiyaların" (plan piece 21): sent to each person when a week is published.
 * Shelby sent this in English; here it is Turkish, short, with a link to the week.
 */
export function shiftEmail(input: { to: string; name: string; cafeName: string; shifts: Shift[]; link: string }): EmailMessage {
  const { to, name, cafeName, shifts, link } = input;
  const first = name.split(" ")[0] ?? name;
  const headline = `${first}, bu haftaki vardiyaların`;
  const lines = shifts.map((s) => `${dayLabel(s.day)} · ${clock(s.startMinutes)}–${clock(s.endMinutes)}${s.note ? ` · ${s.note}` : ""}`);
  return {
    to,
    subject: `Vardiyaların · ${cafeName}`,
    text: [`${headline}:`, lines.join("\n"), `Haftanın tamamı: ${link}`].join("\n\n"),
    html: `<p style="font-family:system-ui,sans-serif;font-size:18px">${escape(headline)}:</p>
<p style="font-family:system-ui,sans-serif;font-size:16px;color:#555">${escape(cafeName)}</p>
<ul style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;padding-left:20px">${lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
<p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111;color:#fff;font-family:system-ui,sans-serif;text-decoration:none">Haftanın tamamı</a></p>`,
  };
}
