import { addMonths, monthDays } from "./books";
import { plusDays, weekStartOf } from "./shifts";

/**
 * Community insights (plan piece 32, D17 in ai-ideas.md): how many neighbours came back, what
 * peni, treats and the askı do to return visits, and which events brought people in. Only
 * members who used Peni are seen, a visit being a day they earned or spent peni or took from
 * the askı. Everything here is a count: no one is ever named, askı takers least of all, and
 * a share is only shown for a group of at least INSIGHT_MIN_GROUP people.
 */

/** Fewer people than this and a group's share isn't shown: it would point at someone. */
export const INSIGHT_MIN_GROUP = 3;
/** Days with a visit in a month that make someone a regular (about once a week). */
export const INSIGHT_REGULAR_DAYS = 4;
/** How many days of visits "what brings people back" starts from (they end a return window before today). */
export const INSIGHT_EFFECT_DAYS = 90;
/** Coming back means another visit within this many days. */
export const INSIGHT_RETURN_DAYS = 30;
/** After an event, coming back means a visit within this many days. */
export const INSIGHT_EVENT_RETURN_DAYS = 14;
/** The weekly chart's length. */
export const INSIGHT_WEEKS = 12;
/** An event's orders are set against the same weekday over this many weeks before. */
export const INSIGHT_USUAL_WEEKS = 4;

/** A member at the café on a day. */
export interface MemberDay {
  membershipId: string;
  /** YYYY-MM-DD, the café's day. */
  day: string;
}

/** Each member's visit days, sorted. */
export function visitDays(visits: MemberDay[]): Map<string, string[]> {
  const by = new Map<string, Set<string>>();
  for (const v of visits) {
    const days = by.get(v.membershipId) ?? new Set<string>();
    days.add(v.day);
    by.set(v.membershipId, days);
  }
  return new Map([...by].map(([id, days]) => [id, [...days].sort()]));
}

/** Came back: of `people`, how many; the share only when the group is big enough. */
export interface ReturnRate {
  people: number;
  cameBack: number;
  pct: number | null;
}

export function rate(people: number, cameBack: number): ReturnRate {
  return { people, cameBack, pct: people >= INSIGHT_MIN_GROUP ? Math.round((cameBack * 100) / people) : null };
}

const inRange = (day: string, from: string, through: string) => day >= from && day <= through;

export interface MonthNumbers {
  /** Members with a visit this month (so far). */
  visitors: number;
  /** The same, last month over the same days (1st to this month's day). */
  visitorsBefore: number;
  /** First visit ever this month. */
  newcomers: number;
  newcomersBefore: number;
  /** INSIGHT_REGULAR_DAYS or more visit days this month. */
  regulars: number;
  regularsBefore: number;
  /** Of everyone who came last month (all of it), how many came this month. */
  cameBack: ReturnRate;
  /** Last month's regulars (all of it) with no visit this month yet. */
  regularsAway: number;
}

/** A month (through `through`, its last day or today) against the month before. */
export function monthNumbers(days: Map<string, string[]>, month: string, through: string): MonthNumbers {
  const now = monthDays(month);
  const last = monthDays(addMonths(month, -1));
  // The month before over the same days, so a month so far compares fairly.
  const sameDay = `${last.from.slice(0, 8)}${through.slice(8)}`;
  const lastSame = sameDay < last.to ? sameDay : last.to;

  const count = (from: string, to: string) => {
    let visitors = 0;
    let newcomers = 0;
    let regulars = 0;
    for (const list of days.values()) {
      const here = list.filter((d) => inRange(d, from, to));
      if (!here.length) continue;
      visitors++;
      if (list[0]! >= from) newcomers++;
      if (here.length >= INSIGHT_REGULAR_DAYS) regulars++;
    }
    return { visitors, newcomers, regulars };
  };
  const a = count(now.from, through);
  const b = count(last.from, lastSame);

  let lastMonth = 0;
  let back = 0;
  let regularsAway = 0;
  for (const list of days.values()) {
    const before = list.filter((d) => inRange(d, last.from, last.to)).length;
    if (!before) continue;
    lastMonth++;
    const came = list.some((d) => inRange(d, now.from, through));
    if (came) back++;
    else if (before >= INSIGHT_REGULAR_DAYS) regularsAway++;
  }
  return {
    visitors: a.visitors,
    visitorsBefore: b.visitors,
    newcomers: a.newcomers,
    newcomersBefore: b.newcomers,
    regulars: a.regulars,
    regularsBefore: b.regulars,
    cameBack: rate(lastMonth, back),
    regularsAway,
  };
}

export interface WeekVisitors {
  /** Monday. */
  week: string;
  /** People whose first visit was this week. */
  newcomers: number;
  /** People who had come before. */
  returning: number;
}

/** People each week for the `weeks` weeks through `through`'s week. */
export function weeklyVisitors(days: Map<string, string[]>, through: string, weeks = INSIGHT_WEEKS): WeekVisitors[] {
  const lastWeek = weekStartOf(through);
  return Array.from({ length: weeks }, (_, i) => {
    const week = plusDays(lastWeek, -7 * (weeks - 1 - i));
    const end = plusDays(week, 6) < through ? plusDays(week, 6) : through;
    let newcomers = 0;
    let returning = 0;
    for (const list of days.values()) {
      if (!list.some((d) => inRange(d, week, end))) continue;
      if (list[0]! >= week) newcomers++;
      else returning++;
    }
    return { week, newcomers, returning };
  });
}

/**
 * Did people come back after something (spending peni, a treat, the askı)? For each person
 * in `group`, from their first such day in the range: another visit on a later day within
 * INSIGHT_RETURN_DAYS. The others are everyone with a visit in the range who never did it,
 * from their first visit there. The range ends INSIGHT_RETURN_DAYS before `through`, so
 * everyone counted has had the whole time to come back.
 */
export function returnAfter(group: MemberDay[], days: Map<string, string[]>, from: string, through: string): { with: ReturnRate; without: ReturnRate } {
  const last = plusDays(through, -INSIGHT_RETURN_DAYS);
  const first = new Map<string, string>();
  for (const g of group) {
    if (!inRange(g.day, from, last)) continue;
    const had = first.get(g.membershipId);
    if (!had || g.day < had) first.set(g.membershipId, g.day);
  }
  const cameAfter = (id: string, day: string) => {
    const until = plusDays(day, INSIGHT_RETURN_DAYS);
    return (days.get(id) ?? []).some((d) => d > day && d <= until && d <= through);
  };
  let withBack = 0;
  for (const [id, day] of first) if (cameAfter(id, day)) withBack++;
  let others = 0;
  let othersBack = 0;
  for (const [id, list] of days) {
    if (first.has(id)) continue;
    const day = list.find((d) => inRange(d, from, last));
    if (!day) continue;
    others++;
    if (cameAfter(id, day)) othersBack++;
  }
  return { with: rate(first.size, withBack), without: rate(others, othersBack) };
}

export interface EventTurnout {
  /** Members who said they're going. */
  going: number;
  /** Of them, how many came on the day. */
  came: number;
  /** People whose first visit ever was the event's day (going or not). */
  newcomers: number;
  /** Of those who came, how many came again within INSIGHT_EVENT_RETURN_DAYS. */
  cameBackAfter: number;
}

export function eventTurnout(day: string, going: string[], days: Map<string, string[]>, through: string): EventTurnout {
  const until = plusDays(day, INSIGHT_EVENT_RETURN_DAYS);
  let came = 0;
  let cameBackAfter = 0;
  for (const id of new Set(going)) {
    const list = days.get(id) ?? [];
    if (!list.includes(day)) continue;
    came++;
    if (list.some((d) => d > day && d <= until && d <= through)) cameBackAfter++;
  }
  let newcomers = 0;
  for (const list of days.values()) if (list[0] === day) newcomers++;
  return { going: new Set(going).size, came, cameBackAfter, newcomers };
}

/** A day's orders against the same weekday's average over the weeks before; null without history. */
export function ordersAgainstUsual(day: string, ordersByDay: Map<string, number>): { orders: number; usual: number | null; liftPct: number | null } {
  const before = Array.from({ length: INSIGHT_USUAL_WEEKS }, (_, i) => plusDays(day, -7 * (i + 1)));
  const known = before.filter((d) => ordersByDay.has(d));
  const orders = ordersByDay.get(day) ?? 0;
  if (!known.length) return { orders, usual: null, liftPct: null };
  const usual = Math.round((known.reduce((s, d) => s + ordersByDay.get(d)!, 0) / known.length) * 10) / 10;
  return { orders, usual, liftPct: usual > 0 ? Math.round(((orders - usual) * 100) / usual) : null };
}
