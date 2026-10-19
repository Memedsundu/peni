"use client";

import { newIdempotencyKey, PeniApiError, type ShiftDTO, type ShiftWeekDTO } from "@peni/api";
import { useEffect, useRef, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { addDaysTo, formatDay } from "../amounts";
import { useSave } from "../controls";
import { field, PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T } from "../text";

/** "08:00" from minutes after midnight; 24:00 stays 24:00. */
export function clock(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "7,5 sa" / "7.5 h". */
export function hoursText(minutes: number, lang: Lang): string {
  const n = (minutes / 60).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { maximumFractionDigits: 2 });
  return `${n} ${lang === "tr" ? "sa" : "h"}`;
}

function weekday(day: string, lang: Lang, style: "short" | "long" = "short"): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: style, timeZone: "UTC" });
}

/** The week's Monday for a day. */
function mondayOf(day: string): string {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDaysTo(day, -((wd + 6) % 7));
}

/**
 * Vardiyalar (plan piece 21): the week's plan, a column per day. Those who plan add, change
 * and copy shifts and publish the week; everyone else sees it once it is published, their
 * own shifts marked.
 */
export function Shifts({ cafeSlug, week }: { cafeSlug: string | null; week: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="vardiyalar" wide>
      {(p) => <ShiftsPage key={p.cafe.slug} {...p} initialWeek={week} />}
    </PanelShell>
  );
}

type Editing = { kind: "new"; day: string } | { kind: "edit"; shift: ShiftDTO } | null;

function ShiftsPage({ cafe, t, lang, signedOut, initialWeek }: PanelProps & { initialWeek: string | null }) {
  const [week, setWeek] = useState<string | null>(initialWeek && /^\d{4}-\d{2}-\d{2}$/.test(initialWeek) ? mondayOf(initialWeek) : null);
  const [data, setData] = useState<ShiftWeekDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const save = useSave<ShiftWeekDTO>(lang, setData);

  useEffect(() => {
    api.staff.shifts.week(cafe.slug, week ?? undefined).then(
      (d) => {
        setData(d);
        setError(null);
        // A reload stays on this week.
        window.history.replaceState(null, "", `?kafe=${encodeURIComponent(cafe.slug)}&hafta=${d.weekStart}`);
      },
      (e: unknown) => {
        if (e instanceof PeniApiError && e.status === 401) signedOut();
        else setError(errorText(e, lang));
      },
    );
    // When the week changes.
  }, [cafe.slug, week]);

  const go = (by: number) => data && setWeek(addDaysTo(data.weekStart, by * 7));
  const thisWeek = data ? mondayOf(data.today) : null;

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("shifts")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("shiftsHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button kind="quiet" size="sm" onClick={() => go(-1)} aria-label={t("prevWeek")}>
                ←
              </Button>
              <div className="flex min-w-44 flex-col items-center">
                <span className="text-lg font-semibold">
                  {formatDay(data.days[0]!, lang)} – {formatDay(data.days[6]!, lang)}
                </span>
                <span className={`text-xs font-semibold ${data.published ? "text-green" : "text-muted"}`}>
                  {data.published ? t("weekPublished") : t("weekDraft")}
                </span>
              </div>
              <Button kind="quiet" size="sm" onClick={() => go(1)} aria-label={t("nextWeek")}>
                →
              </Button>
              {data.weekStart !== thisWeek && (
                <Button kind="bare" size="sm" onClick={() => setWeek(thisWeek)}>
                  {t("thisWeek")}
                </Button>
              )}
            </div>
            {data.canEdit && (
              <div className="flex flex-wrap gap-2">
                {data.canCopy && (
                  <Button kind="quiet" disabled={save.busy} onClick={() => save.run(() => api.staff.shifts.copy(cafe.slug, { week: data.weekStart }))}>
                    {t("copyLastWeek")}
                  </Button>
                )}
                {data.shifts.length > 0 && (
                  <Button
                    kind={data.published ? "quiet" : "primary"}
                    disabled={save.busy}
                    onClick={() => save.run(() => api.staff.shifts.publish(cafe.slug, { week: data.weekStart, published: !data.published }))}
                  >
                    {data.published ? t("unpublish") : t("publishWeek")}
                  </Button>
                )}
              </div>
            )}
          </section>
          {save.error && <Notice tone="red">{save.error}</Notice>}
          {data.canEdit && !data.published && data.shifts.length > 0 && <p className="-mt-4 text-sm text-muted">{t("draftHelp")}</p>}

          {!data.visible ? (
            <p className="rounded-3xl bg-panel p-6 text-muted">{t("weekNotPublished")}</p>
          ) : (
            <Week t={t} lang={lang} data={data} onAdd={(day) => setEditing({ kind: "new", day })} onOpen={(shift) => setEditing({ kind: "edit", shift })} />
          )}

          {data.visible && data.totals.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm text-muted">{t("weekHours")}</h2>
              <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                {data.totals.map((p) => (
                  <li key={p.memberId} className="flex items-center justify-between gap-4 py-3">
                    <span className={p.memberId === data.me ? "font-semibold" : ""}>
                      {p.name}
                      <span className="ml-2 text-sm text-muted">{t(`role_${p.role}`)}</span>
                    </span>
                    <span className="tabular">{hoursText(p.minutes, lang)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {data && editing && (
        <ShiftSheet
          t={t}
          lang={lang}
          slug={cafe.slug}
          data={data}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            setData(d);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

/** Seven columns on a wide screen, the days one under another on a phone. */
function Week({ t, lang, data, onAdd, onOpen }: { t: T; lang: Lang; data: ShiftWeekDTO; onAdd: (day: string) => void; onOpen: (s: ShiftDTO) => void }) {
  const closed = (day: string) => !!data.closedThrough && day <= data.closedThrough;
  return (
    <section className="grid gap-3 md:grid-cols-7 md:gap-2">
      {data.days.map((day) => {
        const shifts = data.shifts.filter((s) => s.day === day);
        const today = day === data.today;
        return (
          <div key={day} className="flex flex-col gap-2">
            <div
              className={`flex items-baseline justify-between gap-2 border-b pb-1 md:flex-col md:items-start md:gap-0 ${today ? "border-ink" : "border-line-soft"}`}
            >
              <span className={`text-sm font-semibold capitalize ${today ? "" : "text-muted"}`}>{weekday(day, lang)}</span>
              <span className={`text-sm ${today ? "font-semibold" : "text-muted"}`}>{formatDay(day, lang)}</span>
            </div>
            {shifts.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={!data.canEdit || closed(day)}
                onClick={() => onOpen(s)}
                className={`flex cursor-pointer flex-col gap-1 rounded-2xl p-3 text-left disabled:cursor-default ${s.mine ? "bg-green-soft" : "bg-panel"}`}
              >
                <span className="text-sm font-semibold tabular">
                  {clock(s.start)}–{clock(s.end)}
                </span>
                {s.people.map((p) => (
                  <span key={p.memberId} className={`text-sm leading-snug ${p.memberId === data.me ? "font-semibold" : ""}`}>
                    {p.name.split(" ")[0]}
                  </span>
                ))}
                {s.note && <span className="text-xs leading-snug text-muted">{s.note}</span>}
              </button>
            ))}
            {shifts.length === 0 && <span className="text-sm text-muted md:py-3">{t("noShifts")}</span>}
            {data.canEdit && !closed(day) && (
              <Button
                kind="bare"
                size="sm"
                className="justify-start px-2"
                onClick={() => onAdd(day)}
                aria-label={fill(t("addShiftOn"), { day: formatDay(day, lang) })}
              >
                + {t("addShift")}
              </Button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function ShiftSheet({
  t,
  lang,
  slug,
  data,
  editing,
  onClose,
  onSaved,
}: {
  t: T;
  lang: Lang;
  slug: string;
  data: ShiftWeekDTO;
  editing: NonNullable<Editing>;
  onClose: () => void;
  onSaved: (d: ShiftWeekDTO) => void;
}) {
  const key = useRef(newIdempotencyKey());
  const old = editing.kind === "edit" ? editing.shift : null;
  const [day, setDay] = useState(old?.day ?? (editing.kind === "new" ? editing.day : data.days[0]!));
  const [start, setStart] = useState(clock(old?.start ?? 8 * 60));
  const [end, setEnd] = useState(clock(old?.end ?? 16 * 60).replace("24:00", "00:00"));
  const [people, setPeople] = useState<string[]>(old?.people.map((p) => p.memberId) ?? []);
  const [note, setNote] = useState(old?.note ?? "");
  const save = useSave<ShiftWeekDTO>(lang, onSaved);

  const minutes = (v: string) => {
    const m = /^(\d{2}):(\d{2})$/.exec(v);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const s = minutes(start);
  // Ending at midnight reads as 00:00 on the clock.
  const e = minutes(end) === 0 ? 24 * 60 : minutes(end);
  const ok = s !== null && e !== null && e > s && people.length > 0 && !!day;
  // Someone taken off the team still shows on the shifts they had.
  const team = [...data.team, ...(old?.people.filter((p) => !data.team.some((x) => x.memberId === p.memberId)) ?? [])];
  const toggle = (id: string) => setPeople((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Sheet title={old ? t("editShift") : t("newShift")} onClose={onClose} labelClose={t("close")}>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("shiftDay")}
        <input
          type="date"
          className={`${field} min-h-12`}
          value={day}
          min={data.closedThrough ? addDaysTo(data.closedThrough, 1) : undefined}
          onChange={(ev) => setDay(ev.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("shiftStart")}
          <input type="time" step={900} className={`${field} min-h-12`} value={start} onChange={(ev) => setStart(ev.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("shiftEnd")}
          <input type="time" step={900} className={`${field} min-h-12`} value={end} onChange={(ev) => setEnd(ev.target.value)} />
        </label>
      </div>
      {s !== null && e !== null && e > s && <p className="-mt-2 text-sm text-muted">{hoursText(e - s, lang)}</p>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-muted">{t("shiftWho")}</legend>
        <div className="flex flex-wrap gap-2">
          {team.map((p) => (
            <button
              key={p.memberId}
              type="button"
              aria-pressed={people.includes(p.memberId)}
              onClick={() => toggle(p.memberId)}
              className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold ${
                people.includes(p.memberId) ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("moneyNoteOptional")}
        <input
          className={`${field} min-h-12`}
          value={note}
          maxLength={200}
          placeholder={t("shiftNotePlaceholder")}
          onChange={(ev) => setNote(ev.target.value)}
        />
      </label>
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button
          kind="primary"
          disabled={!ok || save.busy}
          onClick={() => {
            const input = { day, start: s!, end: e!, memberIds: people, note: note.trim() || null };
            save.run(() => (old ? api.staff.shifts.update(slug, old.id, input) : api.staff.shifts.add(slug, { key: key.current, ...input })));
          }}
        >
          {t("save")}
        </Button>
        {old && (
          <Button kind="bare" disabled={save.busy} onClick={() => save.run(() => api.staff.shifts.remove(slug, old.id))}>
            {t("removeShift")}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
