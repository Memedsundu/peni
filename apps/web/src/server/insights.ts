import type { InsightEffectDTO, InsightEventDTO, InsightsDTO } from "@peni/api";
import {
  addMonths,
  eventTurnout,
  INSIGHT_EFFECT_DAYS,
  INSIGHT_RETURN_DAYS,
  INSIGHT_USUAL_WEEKS,
  INSIGHT_WEEKS,
  localDateKey,
  monthDays,
  monthNumbers,
  ordersAgainstUsual,
  plusDays,
  returnAfter,
  validMonth,
  visitDays,
  weeklyVisitors,
  type CommunityStore,
  type LedgerStore,
  type MemberDay,
  type OrderStore,
  type PeniDirectory,
} from "@peni/core";
import { AppError } from "./errors";
import type { StaffContext } from "./staff";

const ALL = 100_000;
/** Months a café can look back on. */
const MONTHS_BACK = 24;

export interface InsightsDeps {
  ledger: LedgerStore;
  directory: PeniDirectory;
  community: CommunityStore;
  orders: OrderStore;
  now: () => Date;
}

/**
 * Müdavimler (plan piece 32): who came back, what brings people back and which events
 * brought people in. It sees members only through Peni (earning, spending, the askı), so
 * customers who never use the app aren't counted. Counts only: nobody is named, and a
 * share for fewer than three people isn't shown.
 */
export class InsightsService {
  constructor(private readonly d: InsightsDeps) {}

  async get(ctx: StaffContext, month?: string): Promise<InsightsDTO> {
    if (!ctx.permissions.has("reports.view")) throw new AppError("FORBIDDEN", "Your role can't see Müdavimler", 403);
    const cafeId = ctx.cafe.id;
    const tz = (await this.d.directory.getSettings(cafeId)).timeZone;
    const today = localDateKey(this.d.now(), tz);
    const thisMonth = today.slice(0, 7);
    const m = month ?? thisMonth;
    if (!validMonth(m) || m > thisMonth || m < addMonths(thisMonth, -MONTHS_BACK)) throw new AppError("VALIDATION", "Pick one of the last 24 months", 400);
    const through = m === thisMonth ? today : monthDays(m).to;

    const [txs, memberships, posts] = await Promise.all([
      this.d.ledger.query({ cafeId, kinds: ["earn", "redeem", "askida_claim", "gift_accept", "askida_donate", "askida_till", "askida_match"] }),
      this.d.directory.listMemberships({ cafeId }),
      this.d.community.listPosts(cafeId),
    ]);
    const day = (at: Date) => localDateKey(at, tz);
    const memberOf = (tx: (typeof txs)[number]) => tx.entries.find((e) => e.account.startsWith("member:"))?.account.slice("member:".length) ?? null;

    // Visits, and the moments that might bring someone back.
    const visits: MemberDay[] = [];
    const spent: MemberDay[] = [];
    const treats: MemberDay[] = [];
    const took: MemberDay[] = [];
    const gave: MemberDay[] = [];
    const askida = { given: 0, donatedKurus: 0, donors: new Set<string>() };
    const { from: monthFrom } = monthDays(m);
    for (const tx of txs) {
      const d = day(tx.createdAt);
      if (d > through) continue;
      const inMonth = d >= monthFrom;
      if (tx.kind === "earn" || tx.kind === "redeem") {
        const id = memberOf(tx);
        if (!id) continue;
        visits.push({ membershipId: id, day: d });
        if (tx.kind === "redeem") spent.push({ membershipId: id, day: d });
      } else if (tx.kind === "askida_claim") {
        if (inMonth) askida.given++;
        const id = typeof tx.meta.claimantMembershipId === "string" ? tx.meta.claimantMembershipId : null;
        if (!id) continue;
        visits.push({ membershipId: id, day: d });
        took.push({ membershipId: id, day: d });
      } else if (tx.kind === "gift_accept") {
        const id = memberOf(tx);
        if (id) treats.push({ membershipId: id, day: d });
      } else {
        // Put on the askı: from a member's peni, at the till, or matched by the café.
        const onAskida = tx.entries.find((e) => e.account.startsWith("askida:"))?.delta ?? 0;
        if (inMonth && onAskida > 0) askida.donatedKurus += onAskida * 100;
        const id = tx.kind === "askida_donate" ? memberOf(tx) : null;
        if (id) {
          gave.push({ membershipId: id, day: d });
          if (inMonth) askida.donors.add(id);
        }
      }
    }
    const days = visitDays(visits);
    const numbers = monthNumbers(days, m, through);

    // Events of the month that have happened, and who said they'd go.
    const byCustomer = new Map(memberships.map((x) => [x.customerId, x.id]));
    const events = posts
      .filter((p) => p.kind === "event" && p.eventStartsAt)
      .map((p) => ({ post: p, day: day(p.eventStartsAt!) }))
      .filter((e) => e.day >= monthFrom && e.day <= through)
      .sort((a, b) => b.day.localeCompare(a.day));
    const goingTo = (rsvps: string[]) => rsvps.map((c) => byCustomer.get(c)).filter((x): x is string => !!x);
    const wentToEvent: MemberDay[] = [];
    for (const p of posts)
      if (p.kind === "event" && p.eventStartsAt) {
        const d = day(p.eventStartsAt);
        for (const id of goingTo(p.rsvps)) if (days.get(id)?.includes(d)) wentToEvent.push({ membershipId: id, day: d });
      }

    const ordersByDay = new Map<string, number>();
    if (events.length) {
      const orders = await this.d.orders.listOrders(cafeId, { from: plusDays(events.at(-1)!.day, -7 * INSIGHT_USUAL_WEEKS), through, limit: ALL });
      for (const o of orders) if (o.status === "paid" || o.status === "refunded") ordersByDay.set(o.businessDay, (ordersByDay.get(o.businessDay) ?? 0) + 1);
    }
    const eventRows: InsightEventDTO[] = events.map(({ post, day: d }) => {
      const usual = ordersAgainstUsual(d, ordersByDay);
      return {
        id: post.id,
        title: post.title ?? post.body.slice(0, 60),
        day: d,
        byMember: !!post.hostCustomerId,
        ...eventTurnout(d, goingTo(post.rsvps), days, through),
        orders: usual.orders,
        usualOrders: usual.usual,
        liftPct: usual.liftPct,
      };
    });

    // First visits in the 90 days before the last 30, so everyone had 30 days to come back.
    const effectThrough = plusDays(through, -INSIGHT_RETURN_DAYS);
    const effectFrom = plusDays(through, -(INSIGHT_EFFECT_DAYS + INSIGHT_RETURN_DAYS - 1));
    const effects: InsightEffectDTO[] = (
      [
        ["spentPeni", spent],
        ["gotTreat", treats],
        ["tookAskida", took],
        ["gaveAskida", gave],
        ["wentToEvent", wentToEvent],
      ] as const
    ).map(([kind, group]) => ({ kind, ...returnAfter(group, days, effectFrom, through) }));

    return {
      month: m,
      thisMonth,
      through,
      members: memberships.filter((x) => !x.blocked && day(x.joinedAt) <= through).length,
      joined: memberships.filter((x) => !x.blocked && day(x.joinedAt) >= monthFrom && day(x.joinedAt) <= through).length,
      ...numbers,
      weeks: weeklyVisitors(days, through, INSIGHT_WEEKS),
      effectFrom,
      effectThrough,
      effects,
      askida: { given: askida.given, donatedKurus: askida.donatedKurus, donors: askida.donors.size },
      events: eventRows,
    };
  }
}
