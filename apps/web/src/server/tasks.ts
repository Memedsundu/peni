import type { TaskDayDTO, TaskDayListDTO, TaskItemDTO, TaskListDTO, TaskListsDTO } from "@peni/api";
import {
  dueOn,
  localDateKey,
  plusDays,
  shiftEnds,
  TASK_LATE_DAYS,
  validDate,
  type PeniDirectory,
  type Permission,
  type ShiftStore,
  type StaffRole,
  type StaffStore,
  type TaskAssign,
  type TaskCheck,
  type TaskItem,
  type TaskList,
  type TaskStore,
  type Weekday,
} from "@peni/core";
import { keyHash } from "./bills";
import { AppError } from "./errors";
import { requirePermission, type StaffContext } from "./staff";

export interface TaskListInput {
  name: string;
  assign: TaskAssign;
  items: { id?: string; title: string; note?: string | null; days: Weekday[] }[];
}

/** A list as one day sees it, before it is shaped for anyone. */
interface DayList {
  list: TaskList;
  items: TaskItem[];
  checks: Map<string, TaskCheck>;
  people: string[];
}

/**
 * Görevler (plan piece 22). Anyone with "tasks.view" (baristas at the till too) sees
 * today's lists and ticks them, whoever the list is for: everyone signs in as themselves,
 * so who did what is kept. "tasks.edit" sets up the lists, looks back over the last days,
 * and ticks a day that has passed.
 */
export class TaskService {
  constructor(
    private readonly store: TaskStore,
    private readonly shifts: ShiftStore,
    private readonly staff: StaffStore,
    private readonly directory: PeniDirectory,
    private readonly now: () => Date,
  ) {}

  async day(ctx: StaffContext, day?: string): Promise<TaskDayDTO> {
    this.require(ctx, "tasks.view");
    const today = await this.today(ctx.cafe.id);
    const shown = day ?? today;
    if (!validDate(shown)) throw new AppError("DATE_INVALID", "Check the date", 400);
    const canEdit = ctx.permissions.has("tasks.edit");
    if (shown !== today && !canEdit) throw new AppError("TASK_DAY", "Only today's tasks", 403);

    const lists = await this.dayLists(ctx.cafe.id, shown);
    const names = await this.names(lists.flatMap((l) => [...l.people, ...[...l.checks.values()].map((c) => c.byId)]));
    const dtos = lists
      .map((l): TaskDayListDTO => {
        const items = l.items.map((i): TaskItemDTO => {
          const c = l.checks.get(i.id);
          return {
            id: i.id,
            title: c?.title ?? i.title,
            note: i.note,
            status: c?.status ?? "open",
            checkNote: c?.note ?? null,
            by: c ? (names.get(c.byId) ?? null) : null,
            at: c?.at.toISOString() ?? null,
          };
        });
        return {
          id: l.list.id,
          name: l.list.name,
          assign: l.list.assign,
          mine: this.mine(l.list.assign, l.people, ctx.member.id, ctx.role),
          people: l.people.map((id) => (names.get(id) ?? "").split(" ")[0]!).filter(Boolean),
          items,
          done: items.filter((i) => i.status !== "open").length,
          total: items.length,
        };
      })
      .sort((a, b) => Number(b.mine) - Number(a.mine));

    const week: TaskDayDTO["week"] = [];
    if (canEdit) {
      const counts = await this.counts(ctx.cafe.id, plusDays(today, -TASK_LATE_DAYS), plusDays(today, -1));
      for (const [d, c] of counts) week.push({ day: d, ...c });
    }
    return {
      day: shown,
      today,
      lists: dtos,
      canCheck: shown === today || (canEdit && shown < today),
      canEdit,
      week,
    };
  }

  /** Done, skipped (with why), or back to not done. */
  async check(ctx: StaffContext, input: { itemId: string; day: string; status: "done" | "skipped" | "open"; note?: string | null }): Promise<TaskDayDTO> {
    this.require(ctx, "tasks.view");
    const cafeId = ctx.cafe.id;
    const today = await this.today(cafeId);
    if (input.day > today) throw new AppError("TASK_FUTURE", "That day hasn't come yet", 409);
    if (input.day !== today && !ctx.permissions.has("tasks.edit")) throw new AppError("TASK_DAY", "Only today's tasks", 403);
    const item = (await this.store.listItems(cafeId)).find((i) => i.id === input.itemId);
    if (!item) throw new AppError("TASK_NOT_FOUND", "No such task", 404);
    const list = await this.store.getList(cafeId, item.listId);
    if (!list) throw new AppError("TASK_NOT_FOUND", "No such task", 404);
    const checked = (await this.store.listChecks(cafeId, input.day, input.day)).some((c) => c.itemId === item.id);
    if (!dueOn(item, input.day) && !checked) throw new AppError("TASK_NOT_DUE", "Not a task for that day", 409);

    if (input.status === "open") await this.store.removeCheck(cafeId, item.id, input.day);
    else
      await this.store.saveCheck({
        cafeId,
        itemId: item.id,
        day: input.day,
        status: input.status,
        note: input.status === "skipped" ? input.note?.trim() || null : null,
        title: item.title,
        listName: list.name,
        byId: ctx.member.id,
        at: this.now(),
      });
    return this.day(ctx, input.day);
  }

  async lists(ctx: StaffContext): Promise<TaskListsDTO> {
    this.require(ctx, "tasks.edit");
    const cafeId = ctx.cafe.id;
    const today = await this.today(cafeId);
    const [lists, items] = await Promise.all([this.store.listLists(cafeId), this.store.listItems(cafeId)]);
    return { lists: lists.map((l) => this.listDto(l, items, today)) };
  }

  /** "Yeni liste". The same `key` twice makes one. */
  async addList(ctx: StaffContext, input: TaskListInput & { key: string }): Promise<TaskListDTO> {
    this.require(ctx, "tasks.edit");
    const cafeId = ctx.cafe.id;
    const id = `tsl_${keyHash(cafeId, input.key)}`;
    if (!(await this.store.getList(cafeId, id))) {
      const lists = await this.store.listLists(cafeId);
      await this.store.saveList({
        id,
        cafeId,
        name: input.name.trim(),
        assign: input.assign,
        sortOrder: Math.max(-1, ...lists.map((l) => l.sortOrder)) + 1,
        archivedAt: null,
        createdById: ctx.member.id,
        createdAt: this.now(),
        updatedAt: this.now(),
      });
      await this.saveItems(cafeId, id, input.items);
    }
    return this.oneList(cafeId, id);
  }

  /**
   * The whole list at once: its name, who it's for, and its items in order. Items left
   * out come off it from today; what was done before stays in the history.
   */
  async saveList(ctx: StaffContext, listId: string, input: TaskListInput): Promise<TaskListDTO> {
    this.require(ctx, "tasks.edit");
    const cafeId = ctx.cafe.id;
    const list = await this.list(cafeId, listId);
    await this.store.saveList({ ...list, name: input.name.trim(), assign: input.assign, updatedAt: this.now() });
    await this.saveItems(cafeId, listId, input.items);
    return this.oneList(cafeId, listId);
  }

  /** "Listeyi kaldır": nothing on it is due from today; its history stays. */
  async removeList(ctx: StaffContext, listId: string): Promise<TaskListsDTO> {
    this.require(ctx, "tasks.edit");
    const cafeId = ctx.cafe.id;
    const list = await this.list(cafeId, listId);
    await this.saveItems(cafeId, listId, []);
    await this.store.saveList({ ...list, archivedAt: this.now(), updatedAt: this.now() });
    return this.lists(ctx);
  }

  /** Bugün's short view of today: how far each list is. */
  async summary(
    ctx: StaffContext,
  ): Promise<{ done: number; total: number; lists: { id: string; name: string; mine: boolean; done: number; total: number }[] } | null> {
    if (!ctx.permissions.has("tasks.view")) return null;
    const view = await this.day(ctx);
    return {
      done: view.lists.reduce((s, l) => s + l.done, 0),
      total: view.lists.reduce((s, l) => s + l.total, 0),
      lists: view.lists.map((l) => ({ id: l.id, name: l.name, mine: l.mine, done: l.done, total: l.total })),
    };
  }

  /** For alerts: what was left undone in the last days, by list. */
  async late(cafeId: string): Promise<{ count: number; lists: { name: string; count: number }[] }> {
    const today = await this.today(cafeId);
    const byList = new Map<string, number>();
    for (let d = plusDays(today, -TASK_LATE_DAYS); d < today; d = plusDays(d, 1)) {
      for (const l of await this.dayLists(cafeId, d, false)) {
        const open = l.items.filter((i) => !l.checks.has(i.id)).length;
        if (open) byList.set(l.list.name, (byList.get(l.list.name) ?? 0) + open);
      }
    }
    const lists = [...byList].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr"));
    return { count: lists.reduce((s, l) => s + l.count, 0), lists };
  }

  // ─────────────────────────────────────────────── helpers

  /** The lists with something due (or done) on the day, each with its items in order. */
  private async dayLists(cafeId: string, day: string, withPeople = true): Promise<DayList[]> {
    const [lists, items, checks, shifts] = await Promise.all([
      this.store.listLists(cafeId, { includeArchived: true }),
      this.store.listItems(cafeId),
      this.store.listChecks(cafeId, day, day),
      withPeople ? this.shifts.listShifts(cafeId, day, day) : [],
    ]);
    const checked = new Map(checks.map((c) => [c.itemId, c]));
    const ends = shiftEnds(shifts);
    const out: DayList[] = [];
    for (const list of lists) {
      const mine = items.filter((i) => i.listId === list.id && (dueOn(i, day) || checked.has(i.id)));
      if (!mine.length) continue;
      out.push({
        list,
        items: mine,
        checks: new Map(mine.filter((i) => checked.has(i.id)).map((i) => [i.id, checked.get(i.id)!])),
        people: list.assign === "first" ? ends.first : list.assign === "last" ? ends.last : [],
      });
    }
    return out;
  }

  /** Done and due per day, oldest first. */
  private async counts(cafeId: string, from: string, through: string): Promise<Map<string, { done: number; total: number }>> {
    const out = new Map<string, { done: number; total: number }>();
    for (let d = from; d <= through; d = plusDays(d, 1)) {
      const lists = await this.dayLists(cafeId, d, false);
      out.set(d, {
        done: lists.reduce((s, l) => s + l.checks.size, 0),
        total: lists.reduce((s, l) => s + l.items.length, 0),
      });
    }
    return out;
  }

  private mine(assign: TaskAssign, people: string[], memberId: string, role: StaffRole): boolean {
    if (assign === "all") return true;
    if (assign === "first" || assign === "last") return people.includes(memberId);
    return assign === role;
  }

  /** Items in the order given: new ones are added, changed ones saved, missing ones come off from today. */
  private async saveItems(cafeId: string, listId: string, input: TaskListInput["items"]): Promise<void> {
    const today = await this.today(cafeId);
    const current = (await this.store.listItems(cafeId)).filter((i) => i.listId === listId && (!i.untilDay || i.untilDay > today));
    const kept = new Set<string>();
    const out: TaskItem[] = [];
    input.forEach((x, n) => {
      // A new item comes with the client's own "new:…" id, so sending the same list twice adds it once.
      const id = x.id?.startsWith("new:")
        ? `tsi_${keyHash(cafeId, `${listId}:${x.id}`)}`
        : (x.id ?? `tsi_${keyHash(cafeId, `${listId}:${n}:${this.now().getTime()}`)}`);
      const old = current.find((i) => i.id === id);
      if (x.id && !x.id.startsWith("new:") && !old) throw new AppError("TASK_NOT_FOUND", "That task is no longer on the list", 409);
      if (old) kept.add(old.id);
      out.push({
        id,
        cafeId,
        listId,
        title: x.title.trim(),
        note: x.note?.trim() || null,
        days: [...new Set(x.days)].sort(),
        sortOrder: n,
        fromDay: old?.fromDay ?? today,
        untilDay: null,
      });
    });
    for (const i of current) if (!kept.has(i.id)) out.push({ ...i, untilDay: today });
    await this.store.saveItems(out);
  }

  private listDto(l: TaskList, items: TaskItem[], today: string): TaskListDTO {
    return {
      id: l.id,
      name: l.name,
      assign: l.assign,
      items: items
        .filter((i) => i.listId === l.id && (!i.untilDay || i.untilDay > today))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({ id: i.id, title: i.title, note: i.note, days: i.days })),
    };
  }

  private async oneList(cafeId: string, listId: string): Promise<TaskListDTO> {
    const [list, items, today] = await Promise.all([this.list(cafeId, listId), this.store.listItems(cafeId), this.today(cafeId)]);
    return this.listDto(list, items, today);
  }

  private async list(cafeId: string, listId: string): Promise<TaskList> {
    const list = await this.store.getList(cafeId, listId);
    if (!list || list.archivedAt) throw new AppError("TASK_LIST_NOT_FOUND", "No such list", 404);
    return list;
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of new Set(ids)) {
      const member = await this.staff.getMember(id);
      const account = member && (await this.staff.getAccount(member.accountId));
      if (account) out.set(id, account.name);
    }
    return out;
  }

  private async today(cafeId: string): Promise<string> {
    return localDateKey(this.now(), (await this.directory.getSettings(cafeId)).timeZone);
  }

  private require(ctx: StaffContext, permission: Permission): void {
    requirePermission(ctx, permission);
  }
}
