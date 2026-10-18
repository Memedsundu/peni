"use client";

import {
  newIdempotencyKey,
  PeniApiError,
  type TaskAssignDTO,
  type TaskDayDTO,
  type TaskDayListDTO,
  type TaskItemDTO,
  type TaskListDTO,
  type WeekdayDTO,
} from "@peni/api";
import { useEffect, useRef, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { addDaysTo, formatDay } from "../amounts";
import { Field, Segmented, useSave } from "../controls";
import { Progress } from "../bugun/today";
import { field, PanelShell, when, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";

const WEEKDAYS: WeekdayDTO[] = [1, 2, 3, 4, 5, 6, 7];
const ASSIGNS: TaskAssignDTO[] = ["all", "first", "last", "barista", "chef", "manager", "owner"];

export function assignLabel(assign: TaskAssignDTO, t: T): string {
  return t((assign === "all" || assign === "first" || assign === "last" ? `assign_${assign}` : `role_${assign}`) as TextKey);
}

function weekdayShort(day: string, lang: Lang): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "short", timeZone: "UTC" });
}

/** "Her gün", or "Pzt, Çar, Cum". */
function daysText(days: WeekdayDTO[], t: T): string {
  return days.length === 7 ? t("everyDay") : days.map((d) => t(`wd_${d}` as TextKey)).join(", ");
}

/**
 * Görevler (plan piece 22): the day's lists, the viewer's own first. Tap a task to mark it
 * done (tap again to undo); "Atla" skips it with a reason. Those who edit lists also look
 * back over the last week, tick a day that has passed, and set the lists up.
 */
export function Tasks({ cafeSlug, day }: { cafeSlug: string | null; day: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="gorevler">
      {(p) => <TasksPage key={p.cafe.slug} {...p} initialDay={day} />}
    </PanelShell>
  );
}

function TasksPage({ cafe, t, lang, signedOut, initialDay }: PanelProps & { initialDay: string | null }) {
  const [day, setDay] = useState<string | null>(initialDay && /^\d{4}-\d{2}-\d{2}$/.test(initialDay) ? initialDay : null);
  const [data, setData] = useState<TaskDayDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<TaskItemDTO | null>(null);
  const [editing, setEditing] = useState(false);
  const save = useSave<TaskDayDTO>(lang, (d) => {
    setData(d);
    setSkipping(null);
  });

  const load = () =>
    api.staff.tasks.day(cafe.slug, day ?? undefined).then(
      (d) => {
        setData(d);
        setError(null);
        window.history.replaceState(null, "", `?kafe=${encodeURIComponent(cafe.slug)}${d.day !== d.today ? `&gun=${d.day}` : ""}`);
      },
      (e: unknown) => {
        if (e instanceof PeniApiError && e.status === 401) signedOut();
        else setError(errorText(e, lang));
      },
    );
  useEffect(() => {
    void load();
    // When the day changes.
  }, [cafe.slug, day]);

  const check = (item: TaskItemDTO, status: "done" | "skipped" | "open", note?: string) =>
    data && save.run(() => api.staff.tasks.check(cafe.slug, { itemId: item.id, day: data.day, status, note: note ?? null }));

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("tasks")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("tasksHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          {data.canEdit && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button kind="quiet" size="sm" onClick={() => setDay(addDaysTo(data.day, -1))} aria-label={t("prevDay")}>
                    ←
                  </Button>
                  <span className="min-w-36 text-center text-lg font-semibold capitalize">
                    {data.day === data.today ? t("navToday") : `${weekdayShort(data.day, lang)} ${formatDay(data.day, lang)}`}
                  </span>
                  <Button kind="quiet" size="sm" disabled={data.day >= data.today} onClick={() => setDay(addDaysTo(data.day, 1))} aria-label={t("nextDay")}>
                    →
                  </Button>
                  {data.day !== data.today && (
                    <Button kind="bare" size="sm" onClick={() => setDay(null)}>
                      {t("backToToday")}
                    </Button>
                  )}
                </div>
                <Button kind="quiet" size="sm" onClick={() => setEditing(true)}>
                  {t("editLists")}
                </Button>
              </div>
              {data.week.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted">{t("lastDays")}</p>
                  <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
                    {data.week.map((w) => {
                      const short = w.done < w.total;
                      return (
                        <button
                          key={w.day}
                          type="button"
                          aria-pressed={w.day === data.day}
                          onClick={() => setDay(w.day)}
                          className={`flex min-h-14 min-w-14 shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl border px-2 text-xs ${
                            w.day === data.day ? "border-ink" : "border-line"
                          } ${short ? "bg-red-soft" : "bg-paper"}`}
                        >
                          <span className="text-muted capitalize">{weekdayShort(w.day, lang)}</span>
                          <span className={`font-semibold tabular ${short ? "text-red" : ""}`}>
                            {w.done}/{w.total}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {save.error && !skipping && <Notice tone="red">{save.error}</Notice>}
          {data.lists.length === 0 ? (
            <p className="rounded-3xl bg-panel px-5 py-6 leading-normal">{data.canEdit ? t("noListsEdit") : t("noTasksDay")}</p>
          ) : (
            data.lists.map((l) => (
              <ListCard key={l.id} list={l} t={t} lang={lang} canCheck={data.canCheck} busy={save.busy} onCheck={check} onSkip={setSkipping} />
            ))
          )}
          {data.canEdit && data.lists.length === 0 && (
            <Button kind="primary" className="self-start" onClick={() => setEditing(true)}>
              {t("newList")}
            </Button>
          )}
        </>
      )}
      {skipping && (
        <SkipSheet
          t={t}
          item={skipping}
          busy={save.busy}
          error={save.error}
          onClose={() => {
            setSkipping(null);
            save.setError(null);
          }}
          onSkip={(note) => check(skipping, "skipped", note)}
        />
      )}
      {editing && (
        <ListsSheet
          t={t}
          lang={lang}
          slug={cafe.slug}
          onClose={() => {
            setEditing(false);
            void load();
          }}
        />
      )}
    </>
  );
}

export function ListCard({
  list: l,
  t,
  lang,
  canCheck,
  busy,
  onCheck,
  onSkip,
}: {
  list: TaskDayListDTO;
  t: T;
  lang: Lang;
  canCheck: boolean;
  busy: boolean;
  onCheck: (item: TaskItemDTO, status: "done" | "skipped" | "open") => void;
  onSkip: (item: TaskItemDTO) => void;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={l.name}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 font-serif text-3xl">
            {l.name}
            {l.mine && <span className="rounded-full bg-green-soft px-2.5 py-0.5 font-sans text-xs font-semibold text-green">{t("yours")}</span>}
          </h2>
          <p className="text-sm text-muted">
            {assignLabel(l.assign, t)}
            {l.people.length > 0 && ` · ${l.people.join(", ")}`}
          </p>
        </div>
        <Progress done={l.done} total={l.total} />
      </div>
      <ul className="flex flex-col gap-2">
        {l.items.map((i) => {
          const done = i.status === "done";
          const skipped = i.status === "skipped";
          return (
            <li
              key={i.id}
              className={`flex items-stretch gap-2 rounded-2xl border ${done ? "border-green-soft bg-green-soft" : skipped ? "border-line bg-panel" : "border-line bg-paper"}`}
            >
              <button
                type="button"
                disabled={!canCheck || busy}
                aria-pressed={done}
                aria-label={`${i.title}: ${done || skipped ? t("markOpen") : t("markDone")}`}
                onClick={() => onCheck(i, done || skipped ? "open" : "done")}
                className="flex min-h-14 flex-1 cursor-pointer items-center gap-4 px-4 py-3 text-left disabled:cursor-default"
              >
                <span
                  aria-hidden="true"
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${done ? "border-green bg-green text-paper" : skipped ? "border-muted text-muted" : "border-ink"}`}
                >
                  {done && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                  {skipped && <span className="text-sm leading-none font-bold">–</span>}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className={`text-base ${skipped ? "text-muted line-through" : ""}`}>{i.title}</span>
                  {i.note && !done && !skipped && <span className="text-sm leading-normal text-muted">{i.note}</span>}
                  {(done || skipped) && (
                    <span className="text-xs text-muted">
                      {skipped ? `${t("skipped")}${i.checkNote ? `: ${i.checkNote}` : ""} · ` : ""}
                      {i.by}
                      {i.at && ` · ${when(i.at, lang)}`}
                    </span>
                  )}
                </span>
              </button>
              {canCheck && i.status === "open" && (
                <Button kind="bare" size="sm" className="self-center" disabled={busy} onClick={() => onSkip(i)} aria-label={`${i.title}: ${t("skip")}`}>
                  {t("skip")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SkipSheet({
  t,
  item,
  busy,
  error,
  onClose,
  onSkip,
}: {
  t: T;
  item: TaskItemDTO;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSkip: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Sheet title={t("skipTitle")} onClose={onClose} labelClose={t("close")}>
      <p className="text-lg">{item.title}</p>
      <Field label={t("skipWhy")} value={note} onChange={setNote} placeholder={t("skipPlaceholder")} maxLength={300} autoFocus />
      {error && <Notice tone="red">{error}</Notice>}
      <Button kind="primary" disabled={busy} onClick={() => onSkip(note)}>
        {t("skip")}
      </Button>
    </Sheet>
  );
}

// ─────────────────────────────────────────────── setting the lists up

function ListsSheet({ t, lang, slug, onClose }: { t: T; lang: Lang; slug: string; onClose: () => void }) {
  const [lists, setLists] = useState<TaskListDTO[] | null>(null);
  const [open, setOpen] = useState<TaskListDTO | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api.staff.tasks.lists(slug).then(
      (d) => setLists(d.lists),
      (e: unknown) => setError(errorText(e, lang)),
    );
  useEffect(() => {
    void load();
  }, [slug]);

  if (open)
    return (
      <ListEditor
        t={t}
        lang={lang}
        slug={slug}
        list={open === "new" ? null : open}
        onClose={() => setOpen(null)}
        onSaved={() => {
          setOpen(null);
          void load();
        }}
      />
    );
  return (
    <Sheet title={t("editLists")} onClose={onClose} labelClose={t("close")} wide>
      <p className="-mt-2 text-sm leading-normal text-muted">{t("listsHelp")}</p>
      {error && <Notice tone="red">{error}</Notice>}
      {lists && lists.length === 0 && <p className="text-muted">{t("noLists")}</p>}
      {lists && lists.length > 0 && (
        <ul className="flex flex-col">
          {lists.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-3 last:border-b-0">
              <span className="flex flex-col">
                <span className="text-lg">{l.name}</span>
                <span className="text-sm text-muted">
                  {assignLabel(l.assign, t)} · {fill(lang === "tr" ? "{n} görev" : "{n} tasks", { n: l.items.length })}
                </span>
              </span>
              <Button kind="quiet" size="sm" onClick={() => setOpen(l)} aria-label={`${l.name}: ${t("edit")}`}>
                {t("edit")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button kind="primary" className="self-start" onClick={() => setOpen("new")}>
        {t("newList")}
      </Button>
    </Sheet>
  );
}

type Draft = { id: string; title: string; note: string; days: WeekdayDTO[] };
let drafts = 0;
const newDraft = (): Draft => ({
  id: `new:${Date.now().toString(36)}${(++drafts).toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  title: "",
  note: "",
  days: [...WEEKDAYS],
});

function ListEditor({
  t,
  lang,
  slug,
  list,
  onClose,
  onSaved,
}: {
  t: T;
  lang: Lang;
  slug: string;
  list: TaskListDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(list?.name ?? "");
  const [assign, setAssign] = useState<TaskAssignDTO>(list?.assign ?? "all");
  const [items, setItems] = useState<Draft[]>(list ? list.items.map((i) => ({ id: i.id, title: i.title, note: i.note ?? "", days: i.days })) : [newDraft()]);
  const [removing, setRemoving] = useState(false);
  const key = useRef(newIdempotencyKey());
  const save = useSave<unknown>(lang, onSaved);

  const set = (n: number, patch: Partial<Draft>) => setItems((xs) => xs.map((x, i) => (i === n ? { ...x, ...patch } : x)));
  const move = (n: number, by: number) =>
    setItems((xs) => {
      const next = [...xs];
      const [x] = next.splice(n, 1);
      next.splice(n + by, 0, x!);
      return next;
    });
  const filled = items.filter((i) => i.title.trim());
  const ok = name.trim().length > 0 && filled.every((i) => i.days.length > 0);
  const input = { name, assign, items: filled.map((i) => ({ id: i.id, title: i.title, note: i.note.trim() || null, days: i.days })) };

  return (
    <Sheet title={list ? t("editList") : t("newList")} onClose={onClose} labelClose={t("close")} wide>
      <Field label={t("listName")} value={name} onChange={setName} placeholder={t("listNamePlaceholder")} maxLength={60} autoFocus={!list} />
      <div className="flex flex-col gap-2">
        <Segmented label={t("forWhom")} value={assign} options={ASSIGNS.map((a) => ({ value: a, label: assignLabel(a, t) }))} onChange={setAssign} />
        <p className="text-xs leading-normal text-muted">{t("assignHint")}</p>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm text-muted">{t("taskItems")}</legend>
        {items.map((x, n) => (
          <div key={x.id} className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <div className="flex items-start gap-2">
              <input
                className={`${field} min-h-12`}
                value={x.title}
                onChange={(e) => set(n, { title: e.target.value })}
                placeholder={t("taskPlaceholder")}
                aria-label={`${t("taskTitle")} ${n + 1}`}
                maxLength={120}
              />
              <Button kind="bare" size="sm" disabled={n === 0} onClick={() => move(n, -1)} aria-label={`${t("moveUp")}: ${x.title || n + 1}`}>
                ↑
              </Button>
              <Button kind="bare" size="sm" disabled={n === items.length - 1} onClick={() => move(n, 1)} aria-label={`${t("moveDown")}: ${x.title || n + 1}`}>
                ↓
              </Button>
              <Button
                kind="bare"
                size="sm"
                onClick={() => setItems((xs) => xs.filter((_, i) => i !== n))}
                aria-label={`${t("removeTask")}: ${x.title || n + 1}`}
              >
                ✕
              </Button>
            </div>
            <input
              className={`${field} min-h-11 text-sm`}
              value={x.note}
              onChange={(e) => set(n, { note: e.target.value })}
              placeholder={t("taskNote")}
              aria-label={`${t("taskNote")} ${n + 1}`}
              maxLength={300}
            />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${daysText(x.days, t)} · ${x.title || n + 1}`}>
              {WEEKDAYS.map((d) => {
                const on = x.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set(n, { days: on ? x.days.filter((y) => y !== d) : [...x.days, d].sort() })}
                    className={`min-h-10 min-w-11 cursor-pointer rounded-full border px-2 text-xs font-semibold ${on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-muted"}`}
                  >
                    {t(`wd_${d}` as TextKey)}
                  </button>
                );
              })}
              {x.days.length < 7 && (
                <Button kind="bare" size="sm" onClick={() => set(n, { days: [...WEEKDAYS] })}>
                  {t("everyDay")}
                </Button>
              )}
            </div>
          </div>
        ))}
        <Button kind="quiet" className="self-start" disabled={items.length >= 60} onClick={() => setItems((xs) => [...xs, newDraft()])}>
          {t("addTask")}
        </Button>
      </fieldset>
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button
          kind="primary"
          disabled={!ok || save.busy}
          onClick={() =>
            save.run(() => (list ? api.staff.tasks.saveList(slug, list.id, input) : api.staff.tasks.addList(slug, { key: key.current, ...input })))
          }
        >
          {t("save")}
        </Button>
        {list && !removing && (
          <Button kind="bare" onClick={() => setRemoving(true)}>
            {t("removeList")}
          </Button>
        )}
      </div>
      {list && removing && (
        <div className="flex flex-col gap-3 rounded-2xl bg-red-soft p-4">
          <p className="text-sm leading-normal">{t("removeListConfirm")}</p>
          <div className="flex gap-2">
            <Button kind="danger" size="sm" disabled={save.busy} onClick={() => save.run(() => api.staff.tasks.removeList(slug, list.id))}>
              {t("removeList")}
            </Button>
            <Button kind="quiet" size="sm" onClick={() => setRemoving(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
