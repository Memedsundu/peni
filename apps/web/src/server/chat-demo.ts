import type { ChatStep } from "@peni/ai";
import type { AskedReport } from "@peni/core";
import { formatTL, trLower } from "@peni/brand/format";

/**
 * The demo's stand-in for the chat (piece 29), with no OpenAI key: it picks what to look
 * at from a few words in the question, and answers by reading the numbers back. The real
 * assistant writes its own answers from the same looks.
 */
export function demoChat(parts: string[]): ChatStep {
  const find = (start: string) => parts.find((p) => p.startsWith(start));
  const question = trLower(find("Their question:\n")?.slice("Their question:\n".length) ?? "");
  const subject = find('They pressed "Açıkla"');
  const looked = find("What you looked at:\n");
  const tools = new Set([...(parts[0] ?? "").matchAll(/^- (\w+):/gm)].map((m) => m[1]));
  const done = (answer: string, sources: string[] = [], show: string | null = null): ChatStep => ({ looks: [], answer, sources, show });

  if (subject && !looked) {
    const numbers = JSON.parse(subject.slice(subject.indexOf("Numbers:\n") + 9)) as Record<string, unknown>;
    return done(`${explain(numbers)} (Demo: gerçek asistan bu açıklamayı kendi sözleriyle yazar.)`);
  }
  if (!looked) {
    const look = route(question, tools);
    if (!look) return done("Demo: bunu yanıtlayamıyorum. Satışları, giderleri, borçları, stoğu ya da kasayı sorabilirsin.");
    return { looks: [{ tool: look.tool, report: look.report ?? null, from: null, through: null, search: null }], answer: null, sources: [], show: null };
  }

  // "[report:1] report {...}\n= {...}"
  const first = /^\[([^\]]+)\] (\w+) [^\n]*\n= (.*)$/m.exec(looked);
  if (!first) return done("Demo: bir şey bulamadım.");
  const [, ref, tool, json] = first as unknown as [string, string, string, string];
  const r = JSON.parse(json) as Record<string, unknown>;
  if (typeof r.error === "string") return done(`Demo: buna bakamadım. ${r.error}`);
  return done(`${readBack(tool, r)} (Demo yanıtı.)`, [ref], tool === "report" ? ref : null);
}

// Whole lira, as the real assistant is told to write.
const lira = (n: unknown) => formatTL(Math.round(Number(n)) * 100);

function period(words: string): AskedReport["period"] {
  // "geçen ayla karşılaştır" names what it's compared with, not the period.
  const q = words.replace(/geçen (ay|hafta|yıl)(la|a göre|ile)/g, "");
  if (q.includes("bugün")) return "today";
  if (q.includes("dün")) return "yesterday";
  if (q.includes("geçen hafta")) return "lastWeek";
  if (q.includes("bu hafta")) return "thisWeek";
  if (q.includes("geçen ay")) return "lastMonth";
  if (q.includes("bu yıl") || q.includes("bu sene")) return "thisYear";
  if (q.includes("son 30")) return "last30";
  return "thisMonth";
}

function route(q: string, tools: Set<string | undefined>): { tool: ChatStep["looks"][number]["tool"]; report?: AskedReport } | null {
  const products = ["kahve", "latte", "çay", "simit"].filter((w) => q.includes(w));
  const report = (measure: AskedReport["measure"], by: AskedReport["by"], title: string, chart: AskedReport["chart"] = "bar") => ({
    tool: "report" as const,
    report: {
      title,
      measure,
      by,
      period: period(q),
      from: null,
      through: null,
      compare: "previous" as const,
      products: measure === "expenses" ? [] : products,
      categories: [],
      chart,
    },
  });
  if (/stok|bitti|azal/.test(q) && tools.has("stock")) return { tool: "stock" };
  if (/borç|borc|vade|çek/.test(q) && tools.has("owed")) return { tool: "owed" };
  if (/kasa|banka|bakiye/.test(q) && tools.has("money")) return { tool: "money" };
  if (/fatura/.test(q) && tools.has("bills")) return { tool: "bills" };
  if (!tools.has("report")) return null;
  if (/gider|harca|masraf/.test(q)) return report("expenses", /tedarik/.test(q) ? "supplier" : "expenseKind", "Giderler");
  if (/saat/.test(q)) return report("sales", "hour", products.length ? `Saat saat ${products.join(", ")} satışı` : "Saat saat satış");
  if (/kâr|kar\b|kazan/.test(q)) return report("profit", "product", "Ürünlerin kârı", "table");
  if (/en çok|ürün|kaç tane|adet/.test(q)) return report("quantity", "product", "En çok satan ürünler", "table");
  if (/hangi gün|günler/.test(q)) return report("sales", "weekday", "Haftanın günlerine göre satış");
  if (/ay ay|aylara/.test(q)) return report("sales", "month", "Ay ay satış", "line");
  return { tool: "summary" };
}

function readBack(tool: string, r: Record<string, unknown>): string {
  if (tool === "report") {
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    const unit = r.unit === "TL" ? lira : (n: unknown) => String(n);
    const top = [...rows].sort((a, b) => Number(b.value) - Number(a.value))[0];
    const name = top ? String(Object.values(top)[0]) : null;
    const change = r.totalBefore ? Math.round(((Number(r.total) - Number(r.totalBefore)) / Number(r.totalBefore)) * 100) : null;
    return [
      `${r.title}: ${r.from} – ${r.through} toplamı ${unit(r.total)}.`,
      top && Number(top.value) ? `En yüksek: ${name} (${unit(top.value)}).` : "",
      change !== null ? `Önceki döneme göre %${change}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (tool === "summary") return `${r.from} – ${r.through}: satış ${lira(r.sales)}, gider ${lira(r.expenses)}, kalan ${lira(r.leftOver)}; ${r.orders} sipariş.`;
  if (tool === "owed") return `Toplam borç ${lira(r.total)}; bunun ${lira(r.overdue)} kadarı gecikmiş, bu hafta ödenecek ${lira(r.dueThisWeek)}.`;
  if (tool === "money")
    return r.notStarted ? "Nakit ve banka henüz başlatılmamış." : `Kasada ${lira(r.drawer ?? 0)}, ayrı kasada ${lira(r.reserve)}, bankada ${lira(r.bank)} var.`;
  if (tool === "stock") {
    const items = (r.items as { name: string; level: string }[]) ?? [];
    const low = items.filter((i) => i.level !== "ok").map((i) => i.name);
    return low.length ? `Azalan ya da biten: ${low.slice(0, 6).join(", ")}.` : "Stokta azalan bir şey yok.";
  }
  if (tool === "bills") {
    const bills = (r.bills as { supplier: string | null; total: number }[]) ?? [];
    const sum = bills.reduce((s, b) => s + b.total, 0);
    return bills.length
      ? `Bu dönemde ${bills.length} fatura var, toplam ${lira(sum)}. En yenisi: ${bills[0]!.supplier ?? "tedarikçisiz"}, ${lira(bills[0]!.total)}.`
      : "Bu dönemde fatura yok.";
  }
  return "Baktım.";
}

/** Reads back the first numbers it finds: the headline totals, or the largest of a list. */
function explain(n: Record<string, unknown>): string {
  const now = (n.now ?? null) as Record<string, number> | null;
  const before = (n.before ?? null) as Record<string, number> | null;
  if (now && typeof now.sales === "number") {
    const c = before?.sales ? Math.round(((now.sales - before.sales) / before.sales) * 100) : null;
    return `Bu dönemde satış ${lira(now.sales)}${c !== null ? `, önceki döneme göre %${c}` : ""}; gider ${lira(now.expenses)}, kalan ${lira(now.leftOver)}.`;
  }
  const list = Object.values(n).find((v) => Array.isArray(v) && v.length) as Record<string, unknown>[] | undefined;
  if (list) {
    const key = Object.keys(list[0]!).find((k) => typeof list[0]![k] === "number" && k !== "before") ?? "";
    const top = [...list].sort((a, b) => Number(b[key]) - Number(a[key]))[0]!;
    return `En yüksek: ${String(Object.values(top)[0])} (${key === "orders" || key === "sold" ? top[key] : lira(top[key])}).`;
  }
  return "Bu bölümde gösterilecek bir şey yok.";
}
