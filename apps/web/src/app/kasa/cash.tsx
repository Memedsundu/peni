"use client";

import { newIdempotencyKey, type CashSessionDTO, type CashStateDTO } from "@peni/api";
import { formatTL, formatTime } from "@peni/brand/format";
import { useRef, useState } from "react";
import { api } from "./api";
import type { TillProps } from "./till";
import { Button, Keypad, Notice, Sheet } from "./ui";

type Panel = null | { kind: "count"; closing: boolean } | { kind: "move"; direction: "in" | "out" };

/**
 * Kasa (plan piece 9): the drawer's session at a glance, what should be in it, and the
 * three things a barista does with it: count it open, put cash in or take it out with a
 * reason, and count it closed.
 */
export function Cash({ t, slug, onError, state, onChanged }: TillProps & { state: CashStateDTO | null; onChanged: (s: CashStateDTO) => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  if (!state) return <div className="flex-1" />;
  const open = state.open;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-4xl font-normal">{open ? t("drawerOpen") : t("drawerClosed")}</h1>
          {open && (
            <p className="text-muted">
              {t("since")} {formatTime(open.opening.at)} · {t("openedBy")}: {open.opening.by}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {open ? (
            <>
              <Button onClick={() => setPanel({ kind: "move", direction: "in" })}>{t("moveIn")}</Button>
              <Button onClick={() => setPanel({ kind: "move", direction: "out" })}>{t("moveOut")}</Button>
              <Button kind="primary" onClick={() => setPanel({ kind: "count", closing: true })}>
                {t("closeDrawer")}
              </Button>
            </>
          ) : (
            <Button kind="primary" size="lg" onClick={() => setPanel({ kind: "count", closing: false })}>
              {t("openDrawer")}
            </Button>
          )}
        </div>
      </div>

      {open && <Session t={t} session={open} />}
      {!open && state.last && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm text-muted">
            {t("lastClosed")}: {formatTime(state.last.closing!.at)} · {t("closedBy")}: {state.last.closing!.by}
          </h2>
          <Session t={t} session={state.last} />
        </section>
      )}
      {!open && !state.last && <p className="py-10 text-muted">{t("neverOpened")}</p>}

      {panel?.kind === "count" && (
        <CountSheet
          t={t}
          closing={panel.closing}
          expectedKurus={panel.closing ? (open?.totals.expectedKurus ?? null) : (state.last?.closing?.countKurus ?? null)}
          denominations={state.denominations}
          onClose={() => setPanel(null)}
          onSave={async (counts, note, key) => {
            const next = panel.closing
              ? await api.staff.cash.close(slug, { key, sessionId: open!.id, counts, note })
              : await api.staff.cash.open(slug, { key, counts, note });
            onChanged(next);
            setPanel(null);
          }}
          onError={onError}
        />
      )}
      {panel?.kind === "move" && (
        <MoveSheet
          t={t}
          direction={panel.direction}
          onClose={() => setPanel(null)}
          onSave={async (amountKurus, reason, key) => {
            onChanged(await api.staff.cash.move(slug, { key, kind: panel.direction, amountKurus, reason }));
            setPanel(null);
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

function Session({ t, session }: { t: TillProps["t"]; session: CashSessionDTO }) {
  const s = session.totals;
  const closing = session.closing;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("openingCount")} value={formatTL(session.opening.countKurus)} />
        <Stat label={t("cashSales")} value={formatTL(s.cashSalesKurus)} />
        <Stat label={t("cashRefunds")} value={formatTL(-s.cashRefundsKurus)} />
        <Stat label={t("putIn")} value={formatTL(s.inKurus)} />
        <Stat label={t("takenOut")} value={formatTL(-s.outKurus)} />
        <Stat label={t("expected")} value={formatTL(s.expectedKurus)} strong />
      </div>
      {closing && (
        <Notice tone={closing.differenceKurus === 0 ? "muted" : "red"}>
          {t("counted")} {formatTL(closing.countKurus)} · {t("difference")}{" "}
          {closing.differenceKurus === 0 ? t("matches").toLocaleLowerCase("tr") : formatTL(closing.differenceKurus)}
          {closing.note && `. ${closing.note}`}
        </Notice>
      )}
      {session.opening.differenceKurus !== 0 && (
        <Notice tone="red">
          {t("openingCount")}: {t("difference")} {formatTL(session.opening.differenceKurus)}. {session.opening.note}
        </Notice>
      )}
      <div className="flex items-baseline justify-between gap-4 rounded-2xl border border-line p-4">
        <span className="flex flex-col gap-1">
          <span className="text-sm text-muted">{t("cardTotal")}</span>
          <span className="text-sm text-muted">{t("cardTotalHelp")}</span>
        </span>
        <span className="tabular font-serif text-3xl">{formatTL(s.cardSalesKurus - s.cardRefundsKurus)}</span>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm text-muted">{t("moves")}</h2>
        {session.moves.length === 0 && <p className="text-muted">{t("noMoves")}</p>}
        <ul className="flex flex-col">
          {session.moves.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-4 border-b border-line-soft py-3">
              <span>
                {m.reason}
                <span className="text-muted">
                  {" "}
                  · {formatTime(m.at)} · {m.by}
                </span>
              </span>
              <span className="tabular text-lg">{formatTL(m.kind === "in" ? m.amountKurus : -m.amountKurus)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl border p-4 ${strong ? "border-ink" : "border-line"}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className="tabular font-serif text-3xl">{value}</span>
    </div>
  );
}

/** Lira for a note or coin: "₺200", "50 kr". */
function denominationLabel(kurus: number): string {
  return kurus >= 100 ? formatTL(kurus) : `${kurus} kr`;
}

function CountSheet({
  t,
  closing,
  expectedKurus,
  denominations,
  onClose,
  onSave,
  onError,
}: {
  t: TillProps["t"];
  closing: boolean;
  expectedKurus: number | null;
  denominations: number[];
  onClose: () => void;
  onSave: (counts: Record<string, number>, note: string | undefined, key: string) => Promise<void>;
  onError: TillProps["onError"];
}) {
  const [pieces, setPieces] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per count shown, so a retried save counts once.
  const key = useRef(newIdempotencyKey());
  const total = denominations.reduce((s, d) => s + d * (pieces[String(d)] ?? 0), 0);
  const difference = expectedKurus === null ? 0 : total - expectedKurus;
  const set = (d: number, n: number) => setPieces((p) => ({ ...p, [String(d)]: Math.max(0, Math.min(10_000, n)) }));

  const save = async () => {
    if (busy || (difference !== 0 && !note.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const counts = Object.fromEntries(Object.entries(pieces).filter(([, n]) => n > 0));
      await onSave(counts, note.trim() || undefined, key.current);
    } catch (e) {
      setError(onError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={closing ? t("countTitleClose") : t("countTitleOpen")} onClose={onClose} labelClose={t("close")} wide>
      <p className="-mt-2 text-sm text-muted">{t("countHelp")}</p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {denominations.map((d) => {
          const n = pieces[String(d)] ?? 0;
          const label = denominationLabel(d);
          return (
            <div key={d} className="flex items-center gap-2 border-b border-line-soft py-1.5">
              <span className="tabular w-16 font-medium">{label}</span>
              <Step label={`${label} ${t("less")}`} onClick={() => set(d, n - 1)}>
                −
              </Step>
              <input
                inputMode="numeric"
                aria-label={label}
                value={n === 0 ? "" : String(n)}
                placeholder="0"
                onChange={(e) => set(d, Number(e.target.value.replace(/\D/g, "").slice(0, 5)) || 0)}
                className="tabular h-11 w-16 rounded-xl border border-line bg-paper text-center text-lg outline-none focus:border-ink"
              />
              <Step label={`${label} ${t("more")}`} onClick={() => set(d, n + 1)}>
                +
              </Step>
              <span className="tabular ml-auto text-muted">{n > 0 ? formatTL(d * n) : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line pt-4">
        {expectedKurus !== null && (
          <div className="flex justify-between text-muted">
            <span>{t("expected")}</span>
            <span className="tabular">{formatTL(expectedKurus)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">{t("counted")}</span>
          <span className="tabular font-serif text-4xl">{formatTL(total)}</span>
        </div>
        {expectedKurus === null ? (
          <p className="text-sm text-muted">{t("firstOpening")}</p>
        ) : (
          <div className="flex justify-between">
            <span className="text-muted">{t("difference")}</span>
            <span className={`tabular font-semibold ${difference === 0 ? "text-green" : "text-red"}`}>
              {difference === 0 ? t("matches") : formatTL(difference)}
            </span>
          </div>
        )}
      </div>
      {difference !== 0 && (
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("differenceReason")}
          <textarea
            rows={2}
            maxLength={200}
            value={note}
            placeholder={t("differencePlaceholder")}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-ink"
          />
        </label>
      )}
      {error && <Notice tone="red">{error}</Notice>}
      <Button kind="primary" size="lg" disabled={busy || (difference !== 0 && !note.trim())} onClick={() => void save()}>
        {closing ? t("closeDrawer") : t("openDrawer")}
      </Button>
    </Sheet>
  );
}

function Step({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="h-11 w-11 shrink-0 cursor-pointer rounded-full border border-line bg-paper text-xl active:bg-tile">
      {children}
    </button>
  );
}

function MoveSheet({
  t,
  direction,
  onClose,
  onSave,
  onError,
}: {
  t: TillProps["t"];
  direction: "in" | "out";
  onClose: () => void;
  onSave: (amountKurus: number, reason: string, key: string) => Promise<void>;
  onError: TillProps["onError"];
}) {
  /** Whole lira typed on the pad. */
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const amountKurus = Number(typed || "0") * 100;
  const ready = amountKurus > 0 && reason.trim().length > 0 && !busy;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(amountKurus, reason.trim(), key.current);
    } catch (e) {
      setError(onError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={direction === "in" ? t("moveInTitle") : t("moveOutTitle")} onClose={onClose} labelClose={t("close")}>
      <div className="flex items-baseline justify-between">
        <span className="text-muted">{t("amount")}</span>
        <span className="tabular font-serif text-4xl">{typed ? formatTL(amountKurus) : "—"}</span>
      </div>
      <Keypad onKey={(k) => setTyped((v) => (k === "back" ? v.slice(0, -1) : v.length < 6 ? (v === "0" ? k : v + k) : v))} eraseLabel={t("erase")} />
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("reason")}
        <textarea
          rows={2}
          maxLength={200}
          value={reason}
          placeholder={direction === "in" ? t("movePlaceholderIn") : t("movePlaceholderOut")}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-ink"
        />
      </label>
      {error && <Notice tone="red">{error}</Notice>}
      <Button kind="primary" size="lg" disabled={!ready} onClick={() => void save()}>
        {t("save")}
      </Button>
    </Sheet>
  );
}
