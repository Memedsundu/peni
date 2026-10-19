import type { AlertDTO, TodayDTO } from "@peni/api";
import { alertWords } from "@peni/api/alert-text";
import { formatTL } from "@peni/brand/format";
import { localDateKey, permissionsFor, plusDays, type Cafe, type PeniDirectory, type Permission, type StaffStore, type TaskStore } from "@peni/core";
import type { EmailMessage, EmailSender } from "./customer-auth";
import type { DebtService } from "./debts";
import type { PayService } from "./pay";
import type { StaffContext } from "./staff";
import type { StockService } from "./stock";
import type { SalesReportService } from "./sales-report";
import type { TaskService } from "./tasks";

/** The morning email goes from this hour on, the café's own time. */
export const DIGEST_HOUR = 8;
const NAMES = 5;

const ORDER: AlertDTO["type"][] = [
  "cardDue",
  "debtsOverdue",
  "stockOut",
  "payClose",
  "payLeft",
  "hoursMissing",
  "debtsSoon",
  "stockLow",
  "tasksLate",
  "stockNoCost",
];

export interface AlertDeps {
  stock: StockService;
  debts: DebtService;
  pay: PayService;
  tasks: TaskService;
  sales: SalesReportService;
  store: TaskStore;
  staff: StaffStore;
  directory: PeniDirectory;
  cafes: () => Promise<Cafe[]>;
  email: () => EmailSender | null;
  publicUrl: () => string | null;
  now: () => Date;
}

/**
 * Uyarılar (plan piece 22). Shelby had a page of alerts kept in a table and refreshed by a
 * job; here they are worked out from the café's own numbers whenever Bugün opens, so they
 * are never stale and clear themselves once the thing is done. Each person sees the ones
 * their role covers, one card per kind with one thing to do about it. The same list goes
 * out each morning by email to those who see any, unless they turned it off.
 */
export class AlertService {
  constructor(private readonly d: AlertDeps) {}

  /** What needs doing, as someone with these permissions sees it; most pressing first. */
  async list(cafeId: string, permissions: ReadonlySet<Permission>): Promise<AlertDTO[]> {
    const today = await this.dayOf(cafeId);
    const out: AlertDTO[] = [];
    const add = (a: Omit<AlertDTO, "names" | "day" | "month"> & Partial<Pick<AlertDTO, "names" | "day" | "month">>) =>
      out.push({ names: [], day: null, month: null, ...a, ...(a.names ? { names: a.names.slice(0, NAMES) } : {}) });

    if (permissions.has("stock.view")) {
      const low = await this.d.stock.lowStock(cafeId);
      const out_ = low.filter((i) => i.level === "out");
      const short = low.filter((i) => i.level === "low");
      if (out_.length) add({ type: "stockOut", level: "critical", count: out_.length, amountKurus: null, names: out_.map((i) => i.name), href: "/panel/stok" });
      if (short.length)
        add({ type: "stockLow", level: "warning", count: short.length, amountKurus: null, names: short.map((i) => i.name), href: "/panel/stok" });
      const noCost = await this.d.stock.noCost(cafeId);
      if (noCost.length)
        add({ type: "stockNoCost", level: "warning", count: noCost.length, amountKurus: null, names: noCost.map((i) => i.name), href: "/panel/stok" });
    }

    if (permissions.has("debts.view")) {
      const debts = await this.d.debts.overview(cafeId, permissions);
      const rows = debts.rows.filter((r) => r.kind !== "card" && r.kind !== "wages");
      const overdue = rows.filter((r) => r.overdue);
      const weekEnd = plusDays(today, 7);
      const soon = rows.filter((r) => !r.overdue && r.dueDate && r.dueDate >= today && r.dueDate <= weekEnd);
      const sum = (xs: typeof rows) => xs.reduce((s, r) => s + r.amountKurus, 0);
      if (overdue.length)
        add({
          type: "debtsOverdue",
          level: "critical",
          count: overdue.length,
          amountKurus: sum(overdue),
          names: overdue.map((r) => r.name),
          href: "/panel/borclar",
        });
      if (soon.length)
        add({ type: "debtsSoon", level: "warning", count: soon.length, amountKurus: sum(soon), names: soon.map((r) => r.name), href: "/panel/borclar" });
      const card = debts.card;
      if (card && card.overdueKurus > 0) {
        add({ type: "cardDue", level: "critical", count: 1, amountKurus: card.overdueKurus, names: [card.name], day: card.dueDate, href: "/panel/borclar" });
      } else if (card && card.statementKurus > 0 && card.dueDate >= today && card.dueDate <= weekEnd) {
        const level = card.dueDate === today ? "critical" : "warning";
        add({ type: "cardDue", level, count: 1, amountKurus: card.statementKurus, names: [card.name], day: card.dueDate, href: "/panel/borclar" });
      }
    }

    const hours = permissions.has("pay.hours");
    const close = permissions.has("pay.close");
    const payouts = permissions.has("pay.payouts");
    if (hours || close || payouts) {
      const pay = await this.d.pay.attention(cafeId);
      if (hours && pay.missing.count)
        add({
          type: "hoursMissing",
          level: "warning",
          count: pay.missing.count,
          amountKurus: null,
          names: pay.missing.names,
          month: pay.missing.month,
          href: `/panel/puantaj?ay=${pay.missing.month}`,
        });
      if (close && pay.closeDue)
        add({ type: "payClose", level: "critical", count: 1, amountKurus: null, month: pay.closeDue, href: `/panel/puantaj?ay=${pay.closeDue}` });
      if (payouts)
        for (const m of pay.left)
          add({
            type: "payLeft",
            level: "warning",
            count: m.names.length,
            amountKurus: m.kurus,
            names: m.names,
            month: m.month,
            href: `/panel/puantaj?ay=${m.month}`,
          });
    }

    if (permissions.has("tasks.edit")) {
      const late = await this.d.tasks.late(cafeId);
      if (late.count)
        add({
          type: "tasksLate",
          level: "warning",
          count: late.count,
          amountKurus: null,
          names: late.lists.map((l) => `${l.name} (${l.count})`),
          href: "/panel/gorevler",
        });
    }

    return out.sort((a, b) => Number(b.level === "critical") - Number(a.level === "critical") || ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  }

  /** Bugün: the viewer's alerts and today's tasks. */
  async today(ctx: StaffContext): Promise<TodayDTO> {
    const cafeId = ctx.cafe.id;
    const [alerts, tasks, muted, sales] = await Promise.all([
      this.list(cafeId, ctx.permissions),
      this.d.tasks.summary(ctx),
      this.d.store.listMuted(cafeId),
      this.d.sales.today(ctx),
    ]);
    return {
      cafe: { slug: ctx.cafe.slug, name: ctx.cafe.name },
      today: await this.dayOf(cafeId),
      me: { name: ctx.account.name },
      alerts,
      tasks,
      email: { eligible: this.mayEmail(ctx.rolePermissions), on: !muted.includes(ctx.member.id) },
      sales,
    };
  }

  async setEmail(ctx: StaffContext, on: boolean): Promise<TodayDTO> {
    await this.d.store.setMuted(ctx.cafe.id, ctx.member.id, !on);
    return this.today(ctx);
  }

  /**
   * The morning email, for every café whose morning has come and that hasn't had it today:
   * each person who sees an alert gets theirs. Safe to run as often as you like.
   */
  async sendDigests(): Promise<{ cafeId: string; day: string; sent: number }[]> {
    const email = this.d.email();
    const base = this.d.publicUrl()?.replace(/\/+$/, "") ?? null;
    const results: { cafeId: string; day: string; sent: number }[] = [];
    for (const cafe of await this.d.cafes()) {
      const { timeZone } = await this.d.directory.getSettings(cafe.id);
      const now = this.d.now();
      const day = localDateKey(now, timeZone);
      if (localHour(now, timeZone) < DIGEST_HOUR || (await this.d.store.getDigest(cafe.id, day))) continue;

      const [members, overrides, muted] = await Promise.all([
        this.d.staff.listMembers(cafe.id),
        this.d.staff.listOverrides(cafe.id),
        this.d.store.listMuted(cafe.id),
      ]);
      const letters: EmailMessage[] = [];
      for (const m of members) {
        if (m.removedAt || muted.includes(m.id)) continue;
        const permissions = permissionsFor(m.role, overrides);
        if (!this.mayEmail(permissions)) continue;
        const account = await this.d.staff.getAccount(m.accountId);
        if (!account?.email) continue;
        const alerts = await this.list(cafe.id, permissions);
        if (!alerts.length) continue;
        letters.push(
          digestEmail({
            to: account.email,
            name: account.name,
            cafeName: cafe.name,
            alerts,
            today: day,
            link: base ? `${base}/panel/bugun?kafe=${encodeURIComponent(cafe.slug)}` : null,
          }),
        );
      }
      // Recorded before sending, so two runs at once can't both send.
      if (!(await this.d.store.addDigest({ cafeId: cafe.id, day, sentAt: now, recipients: email ? letters.length : 0 }))) continue;
      let sent = 0;
      if (email)
        for (const letter of letters) {
          try {
            await email.send(letter);
            sent++;
          } catch (error) {
            console.error("Alert email not sent", cafe.id, day, error);
          }
        }
      results.push({ cafeId: cafe.id, day, sent });
    }
    return results;
  }

  /** Only roles that see some alert get the email. */
  private mayEmail(permissions: ReadonlySet<Permission>): boolean {
    return (["stock.view", "debts.view", "pay.hours", "pay.close", "pay.payouts", "tasks.edit"] as Permission[]).some((p) => permissions.has(p));
  }

  private async dayOf(cafeId: string): Promise<string> {
    return localDateKey(this.d.now(), (await this.d.directory.getSettings(cafeId)).timeZone);
  }
}

function localHour(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(at));
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** "Bugün 4 konu var": the morning email, in Turkish like the other staff emails. */
export function digestEmail(input: { to: string; name: string; cafeName: string; alerts: AlertDTO[]; today: string; link: string | null }): EmailMessage {
  const { to, name, cafeName, alerts, today, link } = input;
  const first = name.split(" ")[0] || name;
  const lines = alerts.map((a) => ({ ...alertWords(a, "tr", formatTL, today), critical: a.level === "critical" }));
  const headline = `Günaydın ${first}, bugün ${alerts.length} konu var`;
  return {
    to,
    subject: `Bugün ${alerts.length} konu · ${cafeName}`,
    text: [`${headline}:`, lines.map((l) => `• ${l.title}${l.detail ? ` (${l.detail})` : ""}`).join("\n"), link ? `Bugün sayfası: ${link}` : ""]
      .filter(Boolean)
      .join("\n\n"),
    html: `<p style="font-family:system-ui,sans-serif;font-size:18px">${escape(headline)}:</p>
<p style="font-family:system-ui,sans-serif;font-size:16px;color:#555">${escape(cafeName)}</p>
<ul style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;padding-left:20px">${lines
      .map(
        (l) =>
          `<li><strong${l.critical ? ' style="color:#b42318"' : ""}>${escape(l.title)}</strong>${l.detail ? `<br><span style="color:#555">${escape(l.detail)}</span>` : ""}</li>`,
      )
      .join("")}</ul>${
      link
        ? `\n<p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111;color:#fff;font-family:system-ui,sans-serif;text-decoration:none">Bugün'e git</a></p>`
        : ""
    }
<p style="font-family:system-ui,sans-serif;font-size:13px;color:#888">Bu e-postayı Bugün sayfasından kapatabilirsin.</p>`,
  };
}
