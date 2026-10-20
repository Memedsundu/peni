"use client";

import { newIdempotencyKey, PeniApiError, type MoneyAccountDTO, type MoneyDTO, type MoneyLineDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useRef, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { formatDay, parseTL, tlInput } from "../amounts";
import { Field, Segmented, useSave } from "../controls";
import { billHref } from "../faturalar/bills";
import { PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";

type MoveKind = "transfer" | "deposit" | "withdraw" | "correction";
type Filter = "all" | MoneyAccountDTO;

export const ACCOUNT: Record<MoneyAccountDTO, TextKey> = { drawer: "accDrawer", reserve: "accReserve", bank: "accBank" };
const TO: Record<MoneyAccountDTO, TextKey> = { drawer: "toDrawer", reserve: "toReserve", bank: "toBank" };
const FROM: Record<MoneyAccountDTO, TextKey> = { drawer: "fromDrawer", reserve: "fromReserve", bank: "fromBank" };
const ACCOUNTS: MoneyAccountDTO[] = ["drawer", "reserve", "bank"];
const MOVES: { kind: MoveKind; label: TextKey }[] = [
  { kind: "transfer", label: "transfer" },
  { kind: "deposit", label: "deposit" },
  { kind: "withdraw", label: "withdraw" },
  { kind: "correction", label: "correct" },
];

const capital = (s: string) => s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1);

/**
 * Nakit ve banka (plan piece 20): what the drawer, the reserve and the bank hold, the
 * ways to move money between them, and everything that moved it.
 */
export function Money({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="nakit" wide>
      {(p) => <MoneyPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function MoneyPage({ cafe, t, lang, signedOut }: PanelProps) {
  const [data, setData] = useState<MoneyDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<MoveKind | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const save = useSave<MoneyDTO>(lang, setData);

  useEffect(() => {
    api.staff.money.get(cafe.slug).then(setData, (e: unknown) => {
      if (e instanceof PeniApiError && e.status === 401) signedOut();
      else setError(errorText(e, lang));
    });
    // Once per café.
  }, [cafe.slug]);

  const lines = data?.lines.filter((l) => filter === "all" || l.account === filter) ?? [];
  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("money")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("moneyHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <AccountCard
              label={t("accDrawer")}
              value={data.drawer.balanceKurus}
              sub={data.drawer.balanceKurus === null ? t("drawerNever") : t(data.drawer.open ? "drawerOpenSub" : "drawerClosedSub")}
              dot={data.drawer.open}
            />
            <AccountCard label={t("accReserve")} value={data.reserveKurus} />
            <AccountCard label={t("accBank")} value={data.bankKurus} />
          </section>
          {data.started ? (
            <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted">{t("moneyTotal")}</p>
                <p className="text-2xl font-semibold tabular">{formatTL(data.totalKurus ?? 0)}</p>
                <p className="text-xs text-muted">{fill(t("startedOn"), { day: formatDay(data.started.on, lang), by: data.started.by ?? "" })}</p>
                {/* Piece 27: the bank's statement is checked against these movements in Taslaklar. */}
                <a className="text-sm font-semibold underline underline-offset-4" href={`/panel/taslaklar?kafe=${encodeURIComponent(cafe.slug)}`}>
                  {t("ckFromMoney")}
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                {MOVES.map((m) => (
                  <Button key={m.kind} kind={m.kind === "transfer" ? "primary" : "quiet"} onClick={() => setMoving(m.kind)}>
                    {t(m.label)}
                  </Button>
                ))}
              </div>
            </section>
          ) : (
            <StartForm t={t} lang={lang} slug={cafe.slug} onDone={setData} />
          )}
          {data.closedThrough && (
            <p className="text-sm text-muted">
              {fill(t("closedThroughNotice"), { day: formatDay(data.closedThrough, lang, { year: true }) })}{" "}
              <a className="underline underline-offset-4" href={`/panel/kapanis?kafe=${encodeURIComponent(cafe.slug)}`}>
                {t("months")}
              </a>
            </p>
          )}

          {data.started && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-serif text-3xl">{t("movements")}</h2>
                <p className="text-sm text-muted">{t("movementsHelp")}</p>
              </div>
              <Segmented
                label={t("whichAccount")}
                value={filter}
                onChange={setFilter}
                options={[{ value: "all" as Filter, label: t("filterAll") }, ...ACCOUNTS.map((a) => ({ value: a as Filter, label: t(ACCOUNT[a]) }))]}
              />
              {lines.length === 0 ? (
                <p className="rounded-3xl bg-panel p-6 text-muted">{t("noMovements")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                  {lines.map((l) => (
                    <li key={`${l.account}:${l.id}`}>
                      <Line
                        t={t}
                        lang={lang}
                        slug={cafe.slug}
                        line={l}
                        busy={save.busy}
                        onUndo={l.undoId ? () => save.run(() => api.staff.money.undo(cafe.slug, l.undoId!)) : null}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {save.error && <Notice tone="red">{save.error}</Notice>}
            </section>
          )}
        </>
      )}
      {data && moving && (
        <MoveSheet
          t={t}
          lang={lang}
          slug={cafe.slug}
          data={data}
          kind={moving}
          onClose={() => setMoving(null)}
          onDone={(d) => {
            setData(d);
            setMoving(null);
          }}
        />
      )}
    </>
  );
}

function AccountCard({ label, value, sub, dot = false }: { label: string; value: number | null; sub?: string; dot?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-3xl bg-panel p-5">
      <p className="flex items-center gap-2 text-sm text-muted">
        {label}
        {dot && <span className="size-2 rounded-full bg-chart-accent" aria-hidden />}
      </p>
      <p className={`text-3xl font-semibold tabular ${value !== null && value < 0 ? "text-red" : ""}`}>{value === null ? "—" : formatTL(value)}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** One movement: what it was, which account, in green when money came in. */
function Line({ t, lang, slug, line: l, busy, onUndo }: { t: T; lang: Lang; slug: string; line: MoneyLineDTO; busy: boolean; onUndo: (() => void) | null }) {
  const title = (() => {
    switch (l.kind) {
      case "opening":
        return t("lineOpening");
      case "transfer":
        return capital(
          l.amountKurus < 0
            ? fill(t("lineTransferOut"), { to: l.counterpart ? t(TO[l.counterpart]) : "" })
            : fill(t("lineTransferIn"), { from: l.counterpart ? t(FROM[l.counterpart]) : "" }),
        );
      case "deposit":
        return t("lineDeposit");
      case "withdraw":
        return t("lineWithdraw");
      case "correction":
        return t("lineCorrection");
      case "bill":
        return t("lineBill");
      case "check":
        return t("lineCheck");
      case "repayment":
        return t("lineRepayment");
      case "card":
        return t("lineCard");
      case "wages":
        return t("lineWages");
      case "sales":
        return t(l.account === "bank" ? "lineSalesCard" : "lineSalesCash");
      case "drawer":
        return t(l.amountKurus > 0 ? "lineDrawerIn" : "lineDrawerOut");
      case "difference":
        return t("lineDifference");
    }
  })();
  const what = l.billId ? (
    <a className="underline underline-offset-4" href={billHref(slug, l.billId)}>
      {l.label}
    </a>
  ) : (
    l.label
  );
  const details = [l.note, formatDay(l.day, lang), l.by].filter(Boolean).join(" · ");
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>
          {title}
          {l.label && <> · {what}</>}
          {l.reversal && <span className="ml-2 rounded-full bg-tile px-2 py-0.5 text-xs font-semibold">{t("lineReversal")}</span>}
        </span>
        <span className="truncate text-sm text-muted">{details}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className="flex flex-col items-end gap-0.5">
          <span className={`font-semibold tabular ${l.amountKurus > 0 ? "text-green" : ""}`}>
            {l.amountKurus > 0 ? "+" : "−"}
            {formatTL(Math.abs(l.amountKurus))}
          </span>
          <span className="text-xs text-muted">{t(ACCOUNT[l.account])}</span>
        </span>
        {onUndo && (
          <Button kind="bare" size="sm" disabled={busy} onClick={onUndo}>
            {t("undo")}
          </Button>
        )}
      </span>
    </div>
  );
}

/** "Başla": the reserve's and the bank's amounts today. */
function StartForm({ t, lang, slug, onDone }: { t: T; lang: Lang; slug: string; onDone: (d: MoneyDTO) => void }) {
  const [reserve, setReserve] = useState("");
  const [bank, setBank] = useState("");
  const save = useSave<MoneyDTO>(lang, onDone);
  const reserveKurus = parseTL(reserve || "0");
  const bankKurus = parseTL(bank || "0");
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-line p-5">
      <h2 className="font-semibold">{t("startTitle")}</h2>
      <p className="text-sm leading-normal text-muted">{t("startHelp")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("accReserve")} value={reserve} onChange={setReserve} inputMode="decimal" suffix="₺" placeholder="0" />
        <Field label={t("accBank")} value={bank} onChange={setBank} inputMode="decimal" suffix="₺" placeholder="0" />
      </div>
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <div>
        <Button
          kind="primary"
          disabled={reserveKurus === null || bankKurus === null || save.busy}
          onClick={() => save.run(() => api.staff.money.start(slug, { reserveKurus: reserveKurus!, bankKurus: bankKurus! }))}
        >
          {t("startButton")}
        </Button>
      </div>
    </section>
  );
}

function MoveSheet({
  t,
  lang,
  slug,
  data,
  kind,
  onClose,
  onDone,
}: {
  t: T;
  lang: Lang;
  slug: string;
  data: MoneyDTO;
  kind: MoveKind;
  onClose: () => void;
  onDone: (d: MoneyDTO) => void;
}) {
  const key = useRef(newIdempotencyKey());
  const [from, setFrom] = useState<MoneyAccountDTO>(data.drawer.open ? "drawer" : "reserve");
  const [to, setTo] = useState<MoneyAccountDTO>(data.drawer.open ? "reserve" : "bank");
  const [account, setAccount] = useState<"reserve" | "bank">("bank");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const save = useSave<MoneyDTO>(lang, onDone);

  const amountKurus = parseTL(amount);
  const balance = (a: MoneyAccountDTO) => (a === "drawer" ? data.drawer.balanceKurus : a === "reserve" ? data.reserveKurus : data.bankKurus) ?? 0;
  const pickFrom = (a: MoneyAccountDTO) => {
    setFrom(a);
    if (a === to) setTo(ACCOUNTS.find((x) => x !== a)!);
  };
  const drawerClosed = kind === "transfer" && !data.drawer.open && (from === "drawer" || to === "drawer");
  const ready =
    amountKurus !== null &&
    (kind === "correction" ? amountKurus >= 0 && amountKurus !== balance(account) : amountKurus > 0) &&
    (kind === "transfer" || !!note.trim()) &&
    !drawerClosed;
  const title = t(MOVES.find((m) => m.kind === kind)!.label);
  const placeholder: Record<MoveKind, TextKey> = {
    transfer: "transferPlaceholder",
    deposit: "depositPlaceholder",
    withdraw: "withdrawPlaceholder",
    correction: "correctPlaceholder",
  };
  const help: Partial<Record<MoveKind, TextKey>> = { deposit: "depositHelp", withdraw: "withdrawHelp", correction: "correctBalanceHelp" };

  const submit = () =>
    save.run(() =>
      api.staff.money.move(slug, {
        key: key.current,
        kind,
        account: kind === "transfer" ? from : account,
        ...(kind === "transfer" ? { to } : {}),
        amountKurus: amountKurus!,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    );

  return (
    <Sheet title={title} onClose={onClose} labelClose={t("close")}>
      {help[kind] && <p className="-mt-2 text-sm leading-normal text-muted">{t(help[kind]!)}</p>}
      {kind === "transfer" ? (
        <>
          <Segmented
            label={t("fromWhere")}
            value={from}
            onChange={pickFrom}
            options={ACCOUNTS.map((a) => ({ value: a, label: `${t(ACCOUNT[a])} · ${formatTL(balance(a))}` }))}
          />
          <Segmented
            label={t("toWhere")}
            value={to}
            onChange={setTo}
            options={ACCOUNTS.filter((a) => a !== from).map((a) => ({ value: a, label: t(ACCOUNT[a]) }))}
          />
          {drawerClosed && <Notice>{t("transferDrawerClosed")}</Notice>}
        </>
      ) : (
        <Segmented
          label={t("whichAccount")}
          value={account}
          onChange={setAccount}
          options={(["reserve", "bank"] as const).map((a) => ({ value: a, label: `${t(ACCOUNT[a])} · ${formatTL(balance(a))}` }))}
        />
      )}
      <Field
        label={kind === "correction" ? t("correctTo") : t("payAmount")}
        value={amount}
        onChange={setAmount}
        inputMode="decimal"
        suffix="₺"
        placeholder={kind === "correction" ? tlInput(balance(account)) : undefined}
        hint={
          kind === "correction"
            ? amountKurus !== null
              ? fill(t("correctDiff"), { tl: `${amountKurus - balance(account) >= 0 ? "+" : "−"}${formatTL(Math.abs(amountKurus - balance(account)))}` })
              : fill(t("correctNow"), { tl: formatTL(balance(account)) })
            : undefined
        }
      />
      <Field
        label={kind === "transfer" ? t("moneyNoteOptional") : t("moneyNote")}
        value={note}
        onChange={setNote}
        placeholder={t(placeholder[kind])}
        maxLength={200}
      />
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <div>
        <Button kind="primary" disabled={!ready || save.busy} onClick={submit}>
          {kind === "correction" ? title : `${title} · ${formatTL(amountKurus !== null && amountKurus > 0 ? amountKurus : 0)}`}
        </Button>
      </div>
    </Sheet>
  );
}
