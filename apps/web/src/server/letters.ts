import { isAiError, letterRequest, type AiModel, type LetterOutput } from "@peni/ai";
import type { AlertDTO, LetterDTO, LettersDTO } from "@peni/api";
import { alertWords } from "@peni/api/alert-text";
import { formatTL } from "@peni/brand/format";
import {
  letterWeek,
  LETTERS_SHOWN,
  localDateKey,
  permissionsFor,
  plusDays,
  priceChanges,
  validDay,
  weekStartOf,
  type AssistantStore,
  type BillStore,
  type Cafe,
  type Job,
  type LetterBody,
  type LetterLink,
  type LetterStore,
  type MenuStore,
  type PeniDirectory,
  type StaffStore,
  type StockStore,
  type TaskStore,
  type WeeklyLetter,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import { DIGEST_HOUR, type AlertService } from "./alerts";
import type { AiMode } from "./assistant";
import { eventId } from "./assistant";
import type { EmailMessage, EmailSender } from "./customer-auth";
import { AppError } from "./errors";
import type { JobOutcome, JobRunner } from "./jobs";
import type { SalesReportService } from "./sales-report";
import type { StaffContext } from "./staff";

export const LETTER = "letter.write";
/** How far back a bill can set the price a week started with. */
const PRICE_HISTORY_DAYS = 180;
const MOVERS = 5;
const BIGGEST_BILLS = 3;
const PRICES = 5;

const KIND_WORD: Record<string, string> = {
  ingredients: "Hammadde",
  supplies: "Malzeme",
  rent: "Kira",
  utilities: "Elektrik, su, doğalgaz",
  services: "Hizmet ve tamir",
  wages: "Maaş",
  other: "Diğer",
};

const UNIT_WORD = { kg: "kg", l: "L", adet: "adet" } as const;

const tl = (kurus: number) => Math.round(kurus / 100);
/** "13.10.2026". */
const dotted = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

export interface LetterDeps {
  store: LetterStore;
  log: AssistantStore;
  jobs: JobRunner;
  sales: SalesReportService;
  alerts: AlertService;
  bills: BillStore;
  stock: StockStore;
  menu: MenuStore;
  staff: StaffStore;
  /** Who turned the morning email off; the letter goes with it. */
  muted: Pick<TaskStore, "listMuted">;
  directory: PeniDirectory;
  cafes: () => Promise<Cafe[]>;
  email: () => EmailSender | null;
  publicUrl: () => string | null;
  ai: { model: AiModel | null; mode: AiMode };
  now: () => Date;
}

/**
 * The weekly letter (plan piece 30, B10). On Monday morning the cron starts last week's
 * letter for every café with the assistant on; opening the letter page starts it too, if the
 * cron didn't. Peni works out what changed (sales against the week before and the four
 * before that, prices on the week's bills and what they did to margins, the biggest
 * spending, what is open today) and the assistant writes it up. It goes by email to those
 * who see reports, with the morning email's switch.
 */
export class LetterService {
  constructor(private readonly d: LetterDeps) {
    d.jobs.handle(LETTER, (job) => this.write(job));
  }

  /** The letter page: the week asked for, else the newest, and whether last week's is coming. */
  async get(ctx: StaffContext, week?: string | null): Promise<LettersDTO> {
    if (!ctx.permissions.has("reports.view")) throw new AppError("FORBIDDEN", "Your role can't see reports", 403);
    const cafeId = ctx.cafe.id;
    const today = await this.today(cafeId);
    const last = letterWeek(today);
    const [letters, mine] = await Promise.all([this.d.store.listLetters(cafeId, LETTERS_SHOWN), this.d.store.getLetter(cafeId, last.from)]);
    const state = mine ? "ready" : await this.start(ctx.cafe, last.from);
    let shown: WeeklyLetter | null = letters[0] ?? null;
    if (week) {
      if (!validDay(week) || weekStartOf(week) !== week) throw new AppError("VALIDATION", "A week starts on a Monday", 400);
      shown = await this.d.store.getLetter(cafeId, week);
      if (!shown) throw new AppError("LETTER_NOT_FOUND", "No letter for that week", 404);
    }
    return {
      lastWeek: last,
      state,
      letter: shown ? letterDto(shown, this.d.ai.mode) : null,
      weeks: letters.map((l) => ({ weekStart: l.weekStart, weekEnd: plusDays(l.weekStart, 6), headline: l.body.headline })),
    };
  }

  /** Bugün's card: last week's letter, once it's there. */
  async latest(cafeId: string): Promise<{ weekStart: string; weekEnd: string; headline: string } | null> {
    const last = letterWeek(await this.today(cafeId));
    const l = await this.d.store.getLetter(cafeId, last.from);
    return l ? { weekStart: l.weekStart, weekEnd: last.through, headline: l.body.headline } : null;
  }

  /**
   * The cron's part: every café whose Monday morning has come (or later in the week, when
   * it was missed) gets last week's letter started. Safe to run as often as you like.
   */
  async startDue(): Promise<{ cafeId: string; weekStart: string; state: LettersDTO["state"] }[]> {
    const out: { cafeId: string; weekStart: string; state: LettersDTO["state"] }[] = [];
    for (const cafe of await this.d.cafes()) {
      const { timeZone } = await this.d.directory.getSettings(cafe.id);
      const now = this.d.now();
      const today = localDateKey(now, timeZone);
      const last = letterWeek(today);
      if (today === weekStartOf(today) && localHour(now, timeZone) < DIGEST_HOUR) continue;
      if (await this.d.store.getLetter(cafe.id, last.from)) continue;
      out.push({ cafeId: cafe.id, weekStart: last.from, state: await this.start(cafe, last.from) });
    }
    return out;
  }

  /** Queues the week's letter unless it's on its way, failed for good, or there is nothing to write about. */
  private async start(cafe: Cafe, weekStart: string): Promise<LettersDTO["state"]> {
    if (!this.d.ai.model) return "off";
    const jobs = (await this.d.log.listJobs(cafe.id, { kinds: [LETTER], since: new Date(`${weekStart}T00:00:00Z`) })).filter(
      (j) => j.payload.weekStart === weekStart,
    );
    if (jobs.some((j) => j.status === "queued" || j.status === "running")) return "writing";
    if (jobs.some((j) => j.status === "failed")) return "failed";
    if (jobs.some((j) => j.status === "done")) return (await this.d.store.getLetter(cafe.id, weekStart)) ? "ready" : "quiet";
    await this.d.jobs.add(cafe.id, LETTER, { weekStart });
    return "writing";
  }

  /** The job: the week's facts, the assistant's letter, then the email. */
  private async write(job: Job): Promise<JobOutcome> {
    const weekStart = String(job.payload.weekStart ?? "");
    const cafe = (await this.d.cafes()).find((c) => c.id === job.cafeId);
    if (!cafe || !validDay(weekStart)) return { error: "No such café or week", retry: false };
    const existing = await this.d.store.getLetter(cafe.id, weekStart);
    if (existing) return { result: { letterId: existing.id } };
    const model = this.d.ai.model;
    if (!model) return { error: "The assistant is off", retry: false };
    const ctx = await this.ownerContext(cafe);
    if (!ctx) return { error: "The café has no owner", retry: false };

    const { facts, links } = await this.facts(ctx, weekStart);
    if (!facts) return { result: { quiet: true } };
    const started = Date.now();
    let output: LetterOutput;
    try {
      const r = await model.run(letterRequest({ cafe: cafe.name, week: weekWords(weekStart), facts }));
      await this.record(cafe.id, job.id, { model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms });
      output = r.output;
    } catch (error) {
      await this.record(cafe.id, job.id, {
        model: model.name,
        ...(isAiError(error) ? error.usage : {}),
        ms: Date.now() - started,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      return { error: error instanceof Error ? error.message : String(error), retry: !isAiError(error) || error.code === "AI_UNAVAILABLE" };
    }

    const body = cleanBody(output, links);
    if (!body) return { error: "The letter came back empty", retry: true };
    const letter = await this.d.store.addLetter({
      id: `ltr_${randomUUID()}`,
      cafeId: cafe.id,
      weekStart,
      facts,
      body,
      model: model.name,
      createdAt: this.d.now(),
      emailedAt: null,
    });
    const sent = await this.send(cafe, letter);
    return { result: { letterId: letter.id, sent } };
  }

  /**
   * What happened in the week, in TL, each fact with the ref a point may cite; null when
   * nothing sold (a closed week isn't worth a letter).
   */
  async facts(ctx: StaffContext, weekStart: string): Promise<{ facts: Record<string, unknown> | null; links: Record<string, LetterLink> }> {
    const cafeId = ctx.cafe.id;
    const slug = encodeURIComponent(ctx.cafe.slug);
    const through = plusDays(weekStart, 6);
    const before = { from: plusDays(weekStart, -7), through: plusDays(weekStart, -1) };
    const [now, prev, four, bills, items, recipes, menu, suppliers, alerts] = await Promise.all([
      this.d.sales.get(ctx, { from: weekStart, through }),
      this.d.sales.get(ctx, before),
      this.d.sales.get(ctx, { from: plusDays(weekStart, -28), through: plusDays(weekStart, -1) }),
      this.d.bills.listBills(cafeId, { from: plusDays(weekStart, -PRICE_HISTORY_DAYS), to: through }),
      this.d.stock.listItems(cafeId, { includeArchived: true }),
      this.d.stock.listRecipes(cafeId),
      this.d.menu.listMenu(cafeId, { includeArchived: true }),
      this.d.bills.listSuppliers(cafeId, { includeArchived: true }),
      this.d.alerts.list(cafeId, ctx.permissions),
    ]);
    const links: Record<string, LetterLink> = {};
    const reports = `/panel/raporlar?kafe=${slug}&from=${weekStart}&through=${through}`;
    if (now.totals.orders === 0 && now.totals.salesKurus === 0) return { facts: null, links };

    links.sales = { kind: "page", label: "raporlar", href: reports };
    links.expenses = { kind: "page", label: "raporlar", href: reports };
    links.products = { kind: "page", label: "raporlar", href: reports };
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
    const itemById = new Map(items.map((i) => [i.id, i]));
    const productName = new Map(menu.map((m) => [m.productId, m.name]));
    const billLink = (id: string, label: string) => {
      links[`bill:${id}`] = { kind: "bill", label, href: `/panel/faturalar?kafe=${slug}&fatura=${encodeURIComponent(id)}` };
      return `bill:${id}`;
    };

    // Sales, day by day against the same weekday the week before.
    const prevDays = new Map(prev.series.points.map((p) => [p.key, p.salesKurus]));
    const days = now.series.points.map((p) => ({
      day: p.key,
      weekday: WEEKDAY_TR[new Date(`${p.key}T12:00:00Z`).getUTCDay()],
      sales: tl(p.salesKurus),
      before: tl(p.previousKurus ?? prevDays.get(plusDays(p.key, -7)) ?? 0),
    }));

    // Products that sold most differently from the week before.
    const soldBefore = new Map(prev.products.map((p) => [p.productId, p.quantity]));
    const soldNow = new Map(now.products.map((p) => [p.productId, p.quantity]));
    const movers = [...new Set([...soldNow.keys(), ...soldBefore.keys()])]
      .map((id) => ({ id, sold: soldNow.get(id) ?? 0, soldBefore: soldBefore.get(id) ?? 0 }))
      .filter((m) => m.sold !== m.soldBefore)
      .sort((a, b) => Math.abs(b.sold - b.soldBefore) - Math.abs(a.sold - a.soldBefore))
      .slice(0, MOVERS)
      .map((m) => {
        links[`product:${m.id}`] = links.products!;
        return { ref: `product:${m.id}`, name: productName.get(m.id) ?? m.id, sold: m.sold, soldBefore: m.soldBefore };
      });

    // Prices on the week's bills, and what they did to margins.
    const prices = new Map(menu.map((m) => [m.productId, m.priceKurus]));
    const priceMoves = priceChanges({ from: weekStart, through, bills, items, recipes, prices })
      .slice(0, PRICES)
      .map((c) => {
        const item = itemById.get(c.itemId)!;
        links[`item:${c.itemId}`] = { kind: "item", label: item.name, href: `/panel/stok?kafe=${slug}` };
        const supplier = c.supplierId ? (supplierName.get(c.supplierId) ?? null) : null;
        return {
          ref: `item:${c.itemId}`,
          item: item.name,
          per: UNIT_WORD[item.unit],
          before: c.beforeKurus / 100,
          now: c.nowKurus / 100,
          changePct: c.changePct,
          since: c.date,
          supplier,
          bill: billLink(c.billId, `${supplier ?? "Fatura"} · ${dotted(c.date)}`),
          products: c.products.map((p) => {
            links[`product:${p.productId}`] = links.products!;
            return {
              ref: `product:${p.productId}`,
              name: productName.get(p.productId) ?? p.productId,
              marginBeforePct: p.marginBeforePct,
              marginNowPct: p.marginNowPct,
            };
          }),
        };
      });

    // The week's spending, by kind against the week before, and its biggest bills.
    const kindsBefore = new Map(prev.expenses.map((e) => [e.kind, e.kurus]));
    const kinds = [...new Set([...now.expenses.map((e) => e.kind), ...prev.expenses.map((e) => e.kind)])].map((k) => ({
      kind: KIND_WORD[k] ?? k,
      now: tl(now.expenses.find((e) => e.kind === k)?.kurus ?? 0),
      before: tl(kindsBefore.get(k) ?? 0),
    }));
    const biggest = bills
      .filter((b) => !b.voidedAt && b.date >= weekStart && b.date <= through)
      .sort((a, b) => b.totalKurus - a.totalKurus)
      .slice(0, BIGGEST_BILLS)
      .map((b) => {
        const supplier = b.supplierId ? (supplierName.get(b.supplierId) ?? null) : null;
        return {
          ref: billLink(b.id, `${supplier ?? "Fatura"} · ${dotted(b.date)}`),
          supplier,
          date: b.date,
          total: tl(b.totalKurus),
          what: b.lines.map((l) => l.name).slice(0, 3),
        };
      });

    // What is open today, as Bugün shows it.
    const today = await this.today(cafeId);
    const open = alerts.map((a: AlertDTO) => {
      const ref = `alert:${a.type}`;
      const words = alertWords(a, "tr", formatTL, today);
      links[ref] = { kind: "page", label: a.href.split("/").pop() ?? "bugun", href: `${a.href}?kafe=${slug}` };
      return { ref, text: words.detail ? `${words.title} (${words.detail})` : words.title };
    });

    const n = now.totals;
    const p = now.previousTotals;
    return {
      links,
      facts: {
        week: { from: weekStart, through },
        sales: {
          ref: "sales",
          total: tl(n.salesKurus),
          weekBefore: tl(p.salesKurus),
          averageOfFourWeeksBefore: tl(four.totals.salesKurus / 4),
          orders: n.orders,
          ordersWeekBefore: p.orders,
          averageOrder: n.avgOrderKurus === null ? null : tl(n.avgOrderKurus),
          averageOrderWeekBefore: p.avgOrderKurus === null ? null : tl(p.avgOrderKurus),
          days,
        },
        products: { ref: "products", soldMostDifferently: movers },
        priceChanges: priceMoves,
        spending: { ref: "expenses", total: tl(n.expensesKurus), weekBefore: tl(p.expensesKurus), byKind: kinds, biggestBills: biggest },
        leftOver: { ref: "sales", now: tl(n.profitKurus), weekBefore: tl(p.profitKurus) },
        openToday: open,
      },
    };
  }

  // ───────────────────────────────────────────────

  /** The letter by email to those who see reports and haven't turned the morning email off. */
  private async send(cafe: Cafe, letter: WeeklyLetter): Promise<number> {
    const email = this.d.email();
    if (!email) return 0;
    const base = this.d.publicUrl()?.replace(/\/+$/, "") ?? null;
    const [members, overrides, muted] = await Promise.all([
      this.d.staff.listMembers(cafe.id),
      this.d.staff.listOverrides(cafe.id),
      this.d.muted.listMuted(cafe.id),
    ]);
    let sent = 0;
    for (const m of members) {
      if (m.removedAt || muted.includes(m.id) || !permissionsFor(m.role, overrides).has("reports.view")) continue;
      const account = await this.d.staff.getAccount(m.accountId);
      if (!account?.email) continue;
      try {
        await email.send(
          letterEmail({
            to: account.email,
            name: account.name,
            cafeName: cafe.name,
            letter,
            link: base ? `${base}/panel/mektup?kafe=${encodeURIComponent(cafe.slug)}&hafta=${letter.weekStart}` : null,
          }),
        );
        sent++;
      } catch (error) {
        console.error("Letter email not sent", cafe.id, letter.weekStart, error);
      }
    }
    if (sent) await this.d.store.markEmailed(cafe.id, letter.weekStart, this.d.now());
    return sent;
  }

  /** The café as its owner sees it: the letter is written with everything they could look at. */
  private async ownerContext(cafe: Cafe): Promise<StaffContext | null> {
    const [members, overrides] = await Promise.all([this.d.staff.listMembers(cafe.id), this.d.staff.listOverrides(cafe.id)]);
    const owner = members.find((m) => m.role === "owner" && !m.removedAt);
    const account = owner ? await this.d.staff.getAccount(owner.accountId) : null;
    if (!owner || !account) return null;
    const permissions = permissionsFor("owner", overrides);
    return { account, member: owner, cafe, role: "owner", permissions, rolePermissions: permissions, tokenHash: "", method: "password", deviceId: null };
  }

  private async today(cafeId: string): Promise<string> {
    return localDateKey(this.d.now(), (await this.d.directory.getSettings(cafeId)).timeZone);
  }

  private async record(
    cafeId: string,
    jobId: string,
    e: { model: string; inputTokens?: number; outputTokens?: number; ms: number; ok?: boolean; detail?: string },
  ) {
    await this.d.log.addEvent({
      id: eventId(),
      cafeId,
      at: this.d.now(),
      kind: "ai.call",
      memberId: null,
      purpose: LETTER,
      model: e.model,
      inputTokens: e.inputTokens ?? 0,
      outputTokens: e.outputTokens ?? 0,
      ms: e.ms,
      ok: e.ok ?? true,
      detail: e.detail?.slice(0, 300) ?? null,
      draftId: null,
      documentId: null,
      jobId,
    });
  }
}

const WEEKDAY_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"] as const;

function localHour(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(at));
}

/** "12–18 Ekim", "29 Eylül – 5 Ekim". */
export function weekWords(weekStart: string): string {
  const end = plusDays(weekStart, 6);
  const month = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", timeZone: "UTC" });
  const day = (d: string) => Number(d.slice(8));
  return month(weekStart) === month(end) ? `${day(weekStart)}–${day(end)} ${month(end)}` : `${day(weekStart)} ${month(weekStart)} – ${day(end)} ${month(end)}`;
}

/** What the model wrote, tidied: trimmed, at most four points, refs it was given only. */
function cleanBody(o: LetterOutput, links: Record<string, LetterLink>): LetterBody | null {
  const refs = (r: string[]) => [...new Set(r.filter((x) => x in links))];
  const headline = o.headline.trim().slice(0, 160);
  const points = o.points
    .map((p) => ({ title: p.title.trim().slice(0, 80), text: p.text.trim().slice(0, 600), refs: refs(p.refs) }))
    .filter((p) => p.title && p.text)
    .slice(0, 4);
  const todo = { text: o.todo.text.trim().slice(0, 400), refs: refs(o.todo.refs) };
  if (!headline || !points.length) return null;
  const used = new Set([...points.flatMap((p) => p.refs), ...todo.refs]);
  return { headline, points, todo, links: Object.fromEntries(Object.entries(links).filter(([k]) => used.has(k))) };
}

export function letterDto(l: WeeklyLetter, mode: AiMode): LetterDTO {
  const linksOf = (refs: string[]) => {
    const seen = new Set<string>();
    return refs
      .map((r) => l.body.links[r])
      .filter((x): x is LetterLink => !!x && !seen.has(x.href) && !!seen.add(x.href))
      .map((x) => ({ ...x }));
  };
  return {
    weekStart: l.weekStart,
    weekEnd: plusDays(l.weekStart, 6),
    headline: l.body.headline,
    points: l.body.points.map((p) => ({ title: p.title, text: p.text, links: linksOf(p.refs) })),
    todo: { text: l.body.todo.text, links: linksOf(l.body.todo.refs) },
    writtenAt: l.createdAt.toISOString(),
    demo: mode === "demo" || l.model === "demo",
  };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The letter as an email, in Turkish like the other staff emails. */
export function letterEmail(input: { to: string; name: string; cafeName: string; letter: WeeklyLetter; link: string | null }): EmailMessage {
  const { to, name, cafeName, letter, link } = input;
  const first = name.split(" ")[0] || name;
  const b = letter.body;
  const week = weekWords(letter.weekStart);
  const font = "font-family:system-ui,sans-serif";
  return {
    to,
    subject: `Haftalık mektup · ${week} · ${cafeName}`,
    text: [
      `Günaydın ${first}, ${cafeName} için geçen hafta (${week}):`,
      b.headline,
      ...b.points.map((p) => `${p.title}\n${p.text}`),
      `Bu hafta: ${b.todo.text}`,
      link ? `Mektubu panelde aç: ${link}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: `<p style="${font};font-size:16px;color:#555">Günaydın ${escape(first)}, ${escape(cafeName)} için geçen hafta (${escape(week)}):</p>
<p style="font-family:Georgia,serif;font-size:26px;line-height:1.25;margin:16px 0">${escape(b.headline)}</p>
${b.points.map((p) => `<p style="${font};font-size:16px;line-height:1.55"><strong>${escape(p.title)}</strong><br>${escape(p.text)}</p>`).join("\n")}
<p style="${font};font-size:16px;line-height:1.55;padding:14px 16px;border-radius:14px;background:#e8efeb;color:#1e4d3b"><strong>Bu hafta:</strong> ${escape(b.todo.text)}</p>${
      link
        ? `\n<p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111;color:#fff;${font};text-decoration:none">Mektubu aç</a></p>`
        : ""
    }
<p style="${font};font-size:13px;color:#888">Rakamlar Peni'nin kayıtlarından, yazı asistandan. Bu e-postayı Bugün sayfasından kapatabilirsin.</p>`,
  };
}
