import type { StaffRole } from "./staff";

/**
 * Görevler and Uyarılar (plan piece 22).
 *
 * A task list ("Açılış", "Kapanış", "Temizlik") is a set of things to do, each on the
 * weekdays it's for. Nothing is generated ahead: what is due on a day follows from the
 * items, and only what someone did (or skipped) is stored, with the words as they were
 * then. A day that passed with something left undone is late.
 *
 * Shelby gave each item one weekday, so a daily task was seven items; here an item has
 * its days. Shelby gave a list either to a role or to whoever had the day's first shift;
 * here a list can also go to the day's last shift (closing) or to everyone.
 *
 * Alerts are worked out from the café's own numbers whenever someone looks, so they are
 * never stale. Only the morning email is remembered, so it goes once a day.
 */

export const TASK_LIST_NAME_MAX = 60;
export const TASK_TITLE_MAX = 120;
export const TASK_NOTE_MAX = 300;
export const TASK_ITEMS_MAX = 60;
/** Late tasks are looked for this many days back; older ones are history. */
export const TASK_LATE_DAYS = 7;

/** Who a list is for: everyone, a role, or whoever has the day's first or last shift. */
export type TaskAssign = "all" | "first" | "last" | StaffRole;

/** Monday 1 … Sunday 7. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const EVERY_DAY: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export interface TaskList {
  id: string;
  cafeId: string;
  name: string;
  assign: TaskAssign;
  sortOrder: number;
  /** "Listeyi kaldır": kept for history, not due any more. */
  archivedAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskItem {
  id: string;
  cafeId: string;
  listId: string;
  title: string;
  note: string | null;
  days: Weekday[];
  sortOrder: number;
  /** The first day it is due ("YYYY-MM-DD", the café's time zone). */
  fromDay: string;
  /** Not due from this day on; null while it's on the list. */
  untilDay: string | null;
}

export type TaskStatus = "done" | "skipped";

/** Someone did an item on a day, or skipped it. Undoing removes it. */
export interface TaskCheck {
  cafeId: string;
  itemId: string;
  day: string;
  status: TaskStatus;
  note: string | null;
  /** The words when it was done, so later edits don't rewrite history. */
  title: string;
  listName: string;
  byId: string;
  at: Date;
}

/** The morning alert email went out for this café on this day. */
export interface AlertDigest {
  cafeId: string;
  day: string;
  sentAt: Date;
  /** People it went to. */
  recipients: number;
}

export interface TaskStore {
  /** By sortOrder, then name. */
  listLists(cafeId: string, opts?: { includeArchived?: boolean }): Promise<TaskList[]>;
  getList(cafeId: string, id: string): Promise<TaskList | null>;
  saveList(list: TaskList): Promise<void>;
  /** By list, then sortOrder. Items taken off a list stay, with their untilDay. */
  listItems(cafeId: string): Promise<TaskItem[]>;
  /** Saves a list's items together. */
  saveItems(items: TaskItem[]): Promise<void>;

  /** Days from and through, inclusive. */
  listChecks(cafeId: string, from: string, through: string): Promise<TaskCheck[]>;
  /** One per item and day: a second replaces the first. */
  saveCheck(check: TaskCheck): Promise<void>;
  removeCheck(cafeId: string, itemId: string, day: string): Promise<void>;

  getDigest(cafeId: string, day: string): Promise<AlertDigest | null>;
  /** False when that day's email was already recorded. */
  addDigest(digest: AlertDigest): Promise<boolean>;
  /** Staff members who turned the morning email off. */
  listMuted(cafeId: string): Promise<string[]>;
  setMuted(cafeId: string, memberId: string, muted: boolean): Promise<void>;
}

// ─────────────────────────────────────────────── what is due

export function weekdayOf(day: string): Weekday {
  return (((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1) as Weekday;
}

export function isWeekday(n: number): n is Weekday {
  return Number.isInteger(n) && n >= 1 && n <= 7;
}

/** The item is due on that day: on the list then, and the day is one of its days. */
export function dueOn(item: TaskItem, day: string): boolean {
  return item.fromDay <= day && (!item.untilDay || day < item.untilDay) && item.days.includes(weekdayOf(day));
}

/** The day's first and last shifts' people, for lists that go to them. */
export function shiftEnds(shifts: { startMinutes: number; endMinutes: number; memberIds: string[] }[]): { first: string[]; last: string[] } {
  if (!shifts.length) return { first: [], last: [] };
  const start = Math.min(...shifts.map((s) => s.startMinutes));
  const end = Math.max(...shifts.map((s) => s.endMinutes));
  const people = (pick: (s: (typeof shifts)[number]) => boolean) => [...new Set(shifts.filter(pick).flatMap((s) => s.memberIds))];
  return { first: people((s) => s.startMinutes === start), last: people((s) => s.endMinutes === end) };
}

export class InMemoryTaskStore implements TaskStore {
  private readonly lists = new Map<string, TaskList>();
  private readonly items = new Map<string, TaskItem>();
  private readonly checks = new Map<string, TaskCheck>();
  private readonly digests = new Map<string, AlertDigest>();
  private readonly muted = new Set<string>();

  async listLists(cafeId: string, opts: { includeArchived?: boolean } = {}) {
    return [...this.lists.values()]
      .filter((l) => l.cafeId === cafeId && (opts.includeArchived || !l.archivedAt))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "tr"))
      .map((l) => ({ ...l }));
  }

  async getList(cafeId: string, id: string) {
    const l = this.lists.get(id);
    return l && l.cafeId === cafeId ? { ...l } : null;
  }

  async saveList(list: TaskList) {
    this.lists.set(list.id, { ...list });
  }

  async listItems(cafeId: string) {
    return [...this.items.values()]
      .filter((i) => i.cafeId === cafeId)
      .sort((a, b) => a.listId.localeCompare(b.listId) || a.sortOrder - b.sortOrder)
      .map((i) => ({ ...i, days: [...i.days] }));
  }

  async saveItems(items: TaskItem[]) {
    for (const i of items) this.items.set(i.id, { ...i, days: [...i.days] });
  }

  async listChecks(cafeId: string, from: string, through: string) {
    return [...this.checks.values()]
      .filter((c) => c.cafeId === cafeId && c.day >= from && c.day <= through)
      .sort((a, b) => a.day.localeCompare(b.day) || a.at.getTime() - b.at.getTime())
      .map((c) => ({ ...c }));
  }

  async saveCheck(check: TaskCheck) {
    this.checks.set(`${check.cafeId}|${check.itemId}|${check.day}`, { ...check });
  }

  async removeCheck(cafeId: string, itemId: string, day: string) {
    this.checks.delete(`${cafeId}|${itemId}|${day}`);
  }

  async getDigest(cafeId: string, day: string) {
    const d = this.digests.get(`${cafeId}|${day}`);
    return d ? { ...d } : null;
  }

  async addDigest(digest: AlertDigest) {
    const key = `${digest.cafeId}|${digest.day}`;
    if (this.digests.has(key)) return false;
    this.digests.set(key, { ...digest });
    return true;
  }

  async listMuted(cafeId: string) {
    return [...this.muted].filter((k) => k.startsWith(`${cafeId}|`)).map((k) => k.slice(cafeId.length + 1));
  }

  async setMuted(cafeId: string, memberId: string, muted: boolean) {
    if (muted) this.muted.add(`${cafeId}|${memberId}`);
    else this.muted.delete(`${cafeId}|${memberId}`);
  }
}
