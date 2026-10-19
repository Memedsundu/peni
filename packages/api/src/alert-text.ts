import type { AlertDTO } from "./dto";

/**
 * Bugün's alerts in words (plan piece 22), shared by the panel and the morning email so
 * both say the same thing. Turkish is the default.
 */
export type AlertLang = "tr" | "en";

export interface AlertWords {
  title: string;
  detail: string;
  action: string;
}

const list = (names: string[], count: number, lang: AlertLang) => {
  const more = count - names.length;
  return more > 0 ? `${names.join(", ")} ${lang === "tr" ? `ve ${more} tane daha` : `and ${more} more`}` : names.join(", ");
};

const monthName = (month: string, lang: AlertLang) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

const dayName = (day: string, lang: AlertLang) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** `money` formats kuruş, e.g. "₺1.250". `today` is the café's day, for "bugün". */
export function alertWords(a: AlertDTO, lang: AlertLang, money: (kurus: number) => string, today: string): AlertWords {
  const tr = lang === "tr";
  const names = list(a.names, a.count, lang);
  const amount = a.amountKurus === null ? "" : money(a.amountKurus);
  switch (a.type) {
    case "stockOut":
      return {
        title: tr ? `${a.count} malzeme bitti` : `${a.count} ${a.count === 1 ? "item is" : "items are"} out`,
        detail: names,
        action: tr ? "Stoğa bak" : "Open stock",
      };
    case "stockLow":
      return {
        title: tr ? `${a.count} malzeme azaldı` : `${a.count} ${a.count === 1 ? "item is" : "items are"} running low`,
        detail: names,
        action: tr ? "Stoğa bak" : "Open stock",
      };
    case "stockNoCost":
      return {
        title: tr ? `${a.count} malzemenin fiyatı yok` : `${a.count} ${a.count === 1 ? "item has" : "items have"} no price`,
        detail: tr ? `Ürün maliyeti eksik çıkar: ${names}` : `Product costs come out short: ${names}`,
        action: tr ? "Fiyat gir" : "Add prices",
      };
    case "debtsOverdue":
      return {
        title: tr ? `${amount} gecikmiş borç` : `${amount} overdue`,
        detail: names,
        action: tr ? "Borçlara bak" : "Open debts",
      };
    case "debtsSoon":
      return {
        title: tr ? `Bu hafta ${amount} ödenecek` : `${amount} due this week`,
        detail: names,
        action: tr ? "Borçlara bak" : "Open debts",
      };
    case "cardDue": {
      const card = a.names[0] ?? (tr ? "Kart" : "Card");
      const when = a.level === "critical" && a.day && a.day < today ? "late" : a.day === today ? "today" : "soon";
      return {
        title: tr ? `${card} ekstresi: ${amount}` : `${card} statement: ${amount}`,
        detail:
          when === "late"
            ? tr
              ? `Son ödeme günü ${dayName(a.day!, lang)} geçti.`
              : `It was due on ${dayName(a.day!, lang)}.`
            : when === "today"
              ? tr
                ? "Son ödeme günü bugün."
                : "It's due today."
              : tr
                ? `Son ödeme günü ${dayName(a.day!, lang)}.`
                : `Due on ${dayName(a.day!, lang)}.`,
        action: tr ? "Kartı öde" : "Pay the card",
      };
    }
    case "hoursMissing":
      // The count is days; the names are the people.
      return {
        title: tr ? `${a.count} günün saati girilmedi` : `Hours missing for ${a.count} ${a.count === 1 ? "day" : "days"}`,
        detail: a.names.join(", "),
        action: tr ? "Puantajı tamamla" : "Fill in hours",
      };
    case "payClose":
      return {
        title: tr ? `${monthName(a.month!, lang)} maaş ayı kapanmadı` : `${monthName(a.month!, lang)} pay isn't closed`,
        detail: tr ? "Saatler tamamsa ayı kapat; muhasebeye öyle gider." : "If the hours are all in, close the month for the accountant.",
        action: tr ? "Ayı kapat" : "Close the month",
      };
    case "payLeft":
      return {
        title: tr ? `${monthName(a.month!, lang)} maaşından ${amount} ödenmedi` : `${amount} of ${monthName(a.month!, lang)} pay is unpaid`,
        detail: names,
        action: tr ? "Maaşı öde" : "Pay it",
      };
    case "tasksLate":
      return {
        title: tr ? `${a.count} görev yapılmadı` : `${a.count} ${a.count === 1 ? "task was" : "tasks were"} missed`,
        detail: tr ? `Son 7 günde: ${a.names.join(", ")}` : `In the last 7 days: ${a.names.join(", ")}`,
        action: tr ? "Görevlere bak" : "Open tasks",
      };
    case "draftsOpen":
      return {
        title: tr ? `${a.count} taslak onay bekliyor` : `${a.count} ${a.count === 1 ? "draft is" : "drafts are"} waiting for you`,
        detail: names,
        action: tr ? "Taslaklara bak" : "Open drafts",
      };
    case "watch":
      return {
        title: tr ? `Gözcü ${a.count} şey buldu` : `Watch found ${a.count} ${a.count === 1 ? "thing" : "things"}`,
        detail: names,
        action: tr ? "Gözcüye bak" : "Open Watch",
      };
    case "cashShort":
      return {
        title: tr ? `Para ${dayName(a.day!, lang)} gününe yetmeyebilir` : `Money may run short by ${dayName(a.day!, lang)}`,
        detail: tr
          ? `O gün beklenen bakiye ${amount}. Ödemelere ve satış tahminine göre.`
          : `Expected balance that day: ${amount}, from what's owed and usual sales.`,
        action: tr ? "Tahmine bak" : "See the forecast",
      };
  }
}
