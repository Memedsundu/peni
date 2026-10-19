import type { EmailMessage } from "./customer-auth";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * "Ayşe sana 20 peni ısmarladı" (plan piece 12): Turkish, sen, short, with the gift's
 * link to accept it. No suffixes after names, which Turkish would bend. The sender's
 * note is theirs, so it is escaped.
 */
export function giftEmail(input: { to: string; fromName: string; peni: number; cafeName: string; message: string | null; link: string; expiresInHours: number }): EmailMessage {
  const { to, fromName, peni, cafeName, message, link, expiresInHours } = input;
  const headline = `${fromName} sana ${peni} peni ısmarladı`;
  const note = message ? `“${message}”` : null;
  const after = `${expiresInHours} saat içinde kabul etmezsen peni gönderene geri döner.`;
  return {
    to,
    subject: `${headline} · ${cafeName}`,
    text: [`${headline}.`, `Kafe: ${cafeName}`, note, `Kabul et: ${link}`, after].filter(Boolean).join("\n\n"),
    html: `<p style="font-family:system-ui,sans-serif;font-size:18px">${escape(headline)}.</p>
<p style="font-family:system-ui,sans-serif;font-size:16px;color:#555">${escape(cafeName)}</p>
${note ? `<p style="font-family:Georgia,serif;font-size:18px">${escape(note)}</p>` : ""}
<p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111;color:#fff;font-family:system-ui,sans-serif;text-decoration:none">Kabul et</a></p>
<p style="font-family:system-ui,sans-serif;font-size:14px;color:#777">${escape(after)}</p>`,
  };
}
