"use client";

import {
  newIdempotencyKey,
  PeniApiError,
  type BillCategoryDTO,
  type BillDTO,
  type BillPayMethodDTO,
  type BillsDTO,
  type BillStateDTO,
  type BillSummaryDTO,
  type StockUnitDTO,
} from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useRef, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { bigInput, bigUnit, formatDay, formatMonth, formatQty, parseBig, parseTL, shiftMonth, tlInput } from "../amounts";
import { Field, Segmented, Stat, useSave } from "../controls";
import { METHOD, PaymentLine, PayForm } from "../pay";
import { field, PanelShell, when, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";

type View = { show: "month"; month: string | null } | { show: "owed" };
type Open = { kind: "add" } | { kind: "bill"; id: string } | { kind: "correct"; bill: BillDTO } | null;

export const CATEGORY: Record<BillCategoryDTO, TextKey> = {
  ingredients: "catIngredients",
  supplies: "catSupplies",
  rent: "catRent",
  utilities: "catUtilities",
  services: "catServices",
  wages: "catWages",
  other: "catOther",
};
/** What a line that isn't stock can be: the stock kinds come from the item. */
const EXPENSE_CATEGORIES: BillCategoryDTO[] = ["rent", "utilities", "services", "wages", "ingredients", "supplies", "other"];
/** "Paid?" on a new bill: settled on the spot. Card, check and pocket come after, with "Öde". */
const QUICK_METHODS = ["cash", "card", "bank"] as const satisfies readonly BillPayMethodDTO[];

/**
 * Faturalar (plan piece 18): every bill and receipt, one kind of record whether it brought
 * stock or not. A month at a time, or everything still to pay; a bill opens to its lines,
 * its payments, and (for the manager) "Öde", "Düzelt" and "İptal et".
 */
export function Bills({ cafeSlug, billId, adding }: { cafeSlug: string | null; billId: string | null; adding: boolean }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="faturalar" wide>
      {(p) => <BillsPage key={p.cafe.slug} {...p} billId={billId} adding={adding} />}
    </PanelShell>
  );
}

function BillsPage({ cafe, t, lang, signedOut, billId, adding }: PanelProps & { billId: string | null; adding: boolean }) {
  const [view, setView] = useState<View>({ show: "month", month: null });
  const [data, setData] = useState<BillsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(billId ? { kind: "bill", id: billId } : adding ? { kind: "add" } : null);

  const load = () =>
    api.staff.bills.list(cafe.slug, view.show === "owed" ? { show: "owed" } : view.month ? { month: view.month } : {}).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: unknown) => {
        if (e instanceof PeniApiError && e.status === 401) signedOut();
        else setError(errorText(e, lang));
      },
    );
  useEffect(() => {
    void load();
    // Once per café and view; the language isn't a reason to load again.
  }, [cafe.slug, view]);

  const thisMonth = data?.today.slice(0, 7) ?? "";
  const shown = view.show === "month" ? (view.month ?? thisMonth) : thisMonth;

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("bills")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("billsHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <dl className="flex flex-wrap gap-x-8 gap-y-4">
              <Stat label={t("statOwed")} value={formatTL(data.owed.totalKurus)} sub={fill(t("billCount"), { n: data.owed.count })} />
              <Stat
                label={t("statOverdue")}
                value={formatTL(data.owed.overdueKurus)}
                tone={data.owed.overdueKurus ? "red" : undefined}
                sub={fill(t("billCount"), { n: data.owed.overdueCount })}
              />
              {data.month && <Stat label={fill(t("statMonth"), { month: formatMonth(data.month, lang) })} value={formatTL(data.monthTotalKurus)} />}
            </dl>
            {data.canAdd && (
              <Button kind="primary" onClick={() => setOpen({ kind: "add" })}>
                {t("addBill")}
              </Button>
            )}
          </section>

          <nav className="flex flex-wrap items-center gap-2" aria-label={t("bills")}>
            <span className={`flex items-center rounded-full border ${view.show === "month" ? "border-ink" : "border-line"}`}>
              <Button kind="bare" size="sm" aria-label={t("prevMonth")} onClick={() => setView({ show: "month", month: shiftMonth(shown, -1) })}>
                ‹
              </Button>
              <button
                type="button"
                onClick={() => setView({ show: "month", month: view.show === "month" ? view.month : null })}
                aria-pressed={view.show === "month"}
                className="min-h-11 cursor-pointer px-1 text-sm font-semibold capitalize"
              >
                {formatMonth(shown, lang)}
              </button>
              <Button
                kind="bare"
                size="sm"
                aria-label={t("nextMonth")}
                disabled={shown >= thisMonth}
                onClick={() => setView({ show: "month", month: shiftMonth(shown, 1) })}
              >
                ›
              </Button>
            </span>
            <button
              type="button"
              aria-pressed={view.show === "owed"}
              onClick={() => setView({ show: "owed" })}
              className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold ${view.show === "owed" ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}
            >
              {t("owedTab")} · {data.owed.count}
            </button>
          </nav>

          {data.month && data.byCategory.length > 0 && <Categories t={t} byCategory={data.byCategory} total={data.monthTotalKurus} />}

          {data.bills.length === 0 ? (
            <p className="rounded-3xl bg-panel p-6 text-muted">{t(data.month ? "noBillsMonth" : "noBillsOwed")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
              {data.bills.map((b) => (
                <li key={b.id}>
                  <BillRow t={t} lang={lang} bill={b} onOpen={() => setOpen({ kind: "bill", id: b.id })} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {data && open?.kind === "add" && (
        <BillForm
          t={t}
          lang={lang}
          slug={cafe.slug}
          data={data}
          bill={null}
          onClose={() => setOpen(null)}
          onDone={(b) => {
            void load();
            setOpen({ kind: "bill", id: b.id });
          }}
        />
      )}
      {data && open?.kind === "correct" && (
        <BillForm
          t={t}
          lang={lang}
          slug={cafe.slug}
          data={data}
          bill={open.bill}
          onClose={() => setOpen({ kind: "bill", id: open.bill.id })}
          onDone={(b) => {
            void load();
            setOpen({ kind: "bill", id: b.id });
          }}
        />
      )}
      {open?.kind === "bill" && (
        <BillSheet
          t={t}
          lang={lang}
          slug={cafe.slug}
          billId={open.id}
          today={data?.today ?? null}
          onClose={() => setOpen(null)}
          onChanged={() => void load()}
          onCorrect={(bill) => setOpen({ kind: "correct", bill })}
        />
      )}
    </>
  );
}

/** The month's spending by kind, as one bar and a legend. */
function Categories({ t, byCategory, total }: { t: T; byCategory: BillsDTO["byCategory"]; total: number }) {
  const shades = ["bg-ink", "bg-green", "bg-muted", "bg-line", "bg-tile", "bg-line-soft", "bg-panel"];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-panel" aria-hidden="true">
        {byCategory.map((c, i) => (
          <span key={c.category} className={shades[i]} style={{ width: `${(100 * c.totalKurus) / Math.max(total, 1)}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {byCategory.map((c, i) => (
          <li key={c.category} className="flex items-center gap-2">
            <span className={`inline-block size-2.5 rounded-full border border-line ${shades[i]}`} aria-hidden="true" />
            <span>{t(CATEGORY[c.category])}</span>
            <span className="text-muted tabular">{formatTL(c.totalKurus)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StatePill({ t, lang, state, dueDate }: { t: T; lang: Lang; state: BillStateDTO; dueDate: string | null }) {
  const label =
    state === "paid"
      ? t("statePaid")
      : state === "voided"
        ? t("stateVoided")
        : state === "overdue"
          ? `${t("stateOverdue")} · ${formatDay(dueDate!, lang)}`
          : dueDate
            ? fill(t("dueOn"), { day: formatDay(dueDate, lang) })
            : t("stateUnpaid");
  const tone =
    state === "paid" ? "bg-green-soft text-green" : state === "overdue" ? "bg-red-soft text-red" : state === "voided" ? "text-muted" : "bg-tile text-ink";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

export function BillRow({
  t,
  lang,
  bill,
  onOpen,
  showSupplier = true,
}: {
  t: T;
  lang: Lang;
  bill: BillSummaryDTO;
  onOpen: () => void;
  showSupplier?: boolean;
}) {
  const meta = [formatDay(bill.date, lang), bill.number && `#${bill.number}`].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={onOpen} className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 py-4 text-left">
      <span className="flex min-w-0 flex-col gap-1">
        <span className={`flex flex-wrap items-center gap-2 text-lg ${bill.state === "voided" ? "text-muted" : ""}`}>
          {showSupplier ? (bill.supplierName ?? t("noSupplier")) : bill.summary}
          {bill.stock && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{t("stockLine")}</span>}
        </span>
        <span className="truncate text-sm text-muted">{showSupplier ? `${bill.summary} · ${meta}` : meta}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-xl font-semibold tabular ${bill.state === "voided" ? "text-muted line-through" : ""}`}>{formatTL(bill.totalKurus)}</span>
        <StatePill t={t} lang={lang} state={bill.state} dueDate={bill.dueDate} />
      </span>
    </button>
  );
}

function unitLabel(unit: StockUnitDTO, lang: Lang) {
  return unit === "kg" ? "kg" : unit === "l" ? "L" : lang === "tr" ? "adet" : "pc";
}

function BillSheet({
  t,
  lang,
  slug,
  billId,
  today,
  onClose,
  onChanged,
  onCorrect,
}: {
  t: T;
  lang: Lang;
  slug: string;
  billId: string;
  today: string | null;
  onClose: () => void;
  onChanged: () => void;
  onCorrect: (bill: BillDTO) => void;
}) {
  const [bill, setBill] = useState<BillDTO | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const changed = (b: BillDTO) => {
    setBill(b);
    setVoiding(false);
    onChanged();
  };
  const save = useSave<BillDTO>(lang, changed);
  useEffect(() => {
    api.staff.bills.get(slug, billId).then(setBill, (e: unknown) => save.setError(errorText(e, lang)));
    // Once per bill.
  }, [slug, billId]);

  const title = bill ? (bill.supplierName ?? t("noSupplier")) : t("loading");
  return (
    <Sheet title={title} onClose={onClose} labelClose={t("close")} wide>
      {bill && (
        <>
          <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{formatDay(bill.date, lang, { year: true })}</span>
            {bill.number && <span>#{bill.number}</span>}
            <StatePill t={t} lang={lang} state={bill.state} dueDate={bill.dueDate} />
            {bill.supplierId && (
              <a
                className="underline underline-offset-4"
                href={`/panel/tedarikciler?kafe=${encodeURIComponent(slug)}&tedarikci=${encodeURIComponent(bill.supplierId)}`}
              >
                {t("seeSupplier")}
              </a>
            )}
          </div>
          {bill.state === "voided" && <Notice>{fill(t("voidedNotice"), { name: bill.voidedBy ?? "", reason: bill.voidReason ?? "" })}</Notice>}

          <table className="w-full text-left">
            <tbody className="divide-y divide-line-soft">
              {bill.lines.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="py-3 pr-3">
                    <span className="flex flex-col gap-0.5">
                      <span>{l.name}</span>
                      <span className="text-sm text-muted">
                        {l.qtyMilli !== null && l.unit
                          ? [
                              formatQty(l.qtyMilli, l.unit, lang),
                              l.unitKurus !== null && fill(t("perUnit"), { price: formatTL(l.unitKurus), unit: unitLabel(l.unit, lang) }),
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : t(CATEGORY[l.category])}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 text-right font-semibold tabular">{formatTL(l.totalKurus)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink">
                <td className="py-3">
                  {t("billTotal")} <span className="text-sm text-muted">· {t("kdvIncluded")}</span>
                </td>
                <td className={`py-3 text-right text-2xl font-semibold tabular ${bill.state === "voided" ? "text-muted line-through" : ""}`}>
                  {formatTL(bill.totalKurus)}
                </td>
              </tr>
            </tfoot>
          </table>
          {bill.note && <p className="leading-normal">{bill.note}</p>}
          <p className="text-sm text-muted">{fill(t("addedBy"), { name: bill.createdBy ?? "", when: when(bill.createdAt, lang) })}</p>

          {bill.payments.map((p) => (
            <PaymentLine
              key={p.id}
              t={t}
              lang={lang}
              payment={p}
              busy={save.busy}
              onUndo={p.canRemove ? () => save.run(() => api.staff.bills.removePayment(slug, bill.id, p.id)) : null}
            />
          ))}
          {bill.paidKurus > 0 && bill.state !== "paid" && (
            <p className="text-sm text-muted">
              {fill(t("partlyPaid"), { paid: formatTL(bill.paidKurus), left: formatTL(bill.totalKurus - bill.paidKurus) })}
            </p>
          )}

          {bill.payWith && today && (
            <section className="flex flex-col gap-3 rounded-3xl bg-panel p-5">
              <h3 className="font-semibold">{bill.paidKurus > 0 ? t("addPayment") : t("markPaid")}</h3>
              <PayForm t={t} lang={lang} slug={slug} bill={bill} today={today} onDone={changed} />
            </section>
          )}
          {bill.canManage && bill.state !== "voided" && (
            <section className="flex flex-col gap-4">
              {bill.paidKurus > 0 ? (
                <p className="text-sm text-muted">{t("paidLocked")}</p>
              ) : voiding ? (
                <div className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
                  <p className="text-sm leading-normal text-muted">{t("voidHelp")}</p>
                  <Field label={t("voidReason")} value={reason} onChange={setReason} placeholder={t("voidReasonPlaceholder")} maxLength={200} autoFocus />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      kind="danger"
                      disabled={!reason.trim() || save.busy}
                      onClick={() => save.run(() => api.staff.bills.void(slug, bill.id, { reason: reason.trim() }))}
                    >
                      {t("voidConfirm")}
                    </Button>
                    <Button kind="bare" onClick={() => setVoiding(false)}>
                      {t("close")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button kind="quiet" onClick={() => onCorrect(bill)}>
                    {t("correctBill")}
                  </Button>
                  <Button kind="bare" onClick={() => setVoiding(true)}>
                    {t("voidBill")}
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {save.error && <Notice tone="red">{save.error}</Notice>}
    </Sheet>
  );
}

type LineForm = { key: number; kind: "stock" | "other"; itemId: string; qty: string; total: string; name: string; category: BillCategoryDTO };

let lineKeys = 0;
const stockLine = (): LineForm => ({ key: ++lineKeys, kind: "stock", itemId: "", qty: "", total: "", name: "", category: "ingredients" });
const otherLine = (): LineForm => ({ key: ++lineKeys, kind: "other", itemId: "", qty: "", total: "", name: "", category: "rent" });

/** "Fatura ekle", or "Düzelt" when given the bill. */
function BillForm({
  t,
  lang,
  slug,
  data,
  bill,
  onClose,
  onDone,
}: {
  t: T;
  lang: Lang;
  slug: string;
  data: BillsDTO;
  bill: BillDTO | null;
  onClose: () => void;
  onDone: (b: BillDTO) => void;
}) {
  const key = useRef(newIdempotencyKey());
  const supplierKey = useRef(newIdempotencyKey());
  const [supplierId, setSupplierId] = useState(bill?.supplierId ?? "");
  const [newName, setNewName] = useState("");
  const [date, setDate] = useState(bill?.date ?? data.today);
  const [number, setNumber] = useState(bill?.number ?? "");
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? "");
  const [note, setNote] = useState(bill?.note ?? "");
  const [paid, setPaid] = useState<"no" | (typeof QUICK_METHODS)[number]>("no");
  const [lines, setLines] = useState<LineForm[]>(() =>
    bill
      ? bill.lines.map((l) => ({
          key: ++lineKeys,
          kind: l.itemId ? "stock" : "other",
          itemId: l.itemId ?? "",
          qty: l.qtyMilli !== null ? bigInput(l.qtyMilli) : "",
          total: tlInput(l.totalKurus),
          name: l.itemId ? "" : l.name,
          category: l.category,
        }))
      : [data.items.length ? stockLine() : otherLine()],
  );
  const save = useSave(lang, onDone);

  // A bill being corrected may name a supplier or item that was removed since; keep them choosable.
  const suppliers = [...data.suppliers];
  if (bill?.supplierId && !suppliers.some((s) => s.id === bill.supplierId)) suppliers.push({ id: bill.supplierId, name: bill.supplierName ?? "" });
  const items = [...data.items];
  for (const l of bill?.lines ?? []) {
    if (l.itemId && l.unit && !items.some((i) => i.id === l.itemId))
      items.push({ id: l.itemId, name: l.name, unit: l.unit, kind: "ingredient", costKurus: null });
  }

  const parsed = lines.map((l) => {
    const totalKurus = parseTL(l.total);
    if (l.kind === "stock") {
      const item = items.find((i) => i.id === l.itemId);
      const qtyMilli = parseBig(l.qty);
      const ok = !!item && qtyMilli !== null && qtyMilli > 0 && totalKurus !== null;
      return { ok, item, qtyMilli, totalKurus, line: ok ? { itemId: item!.id, qtyMilli: qtyMilli!, totalKurus: totalKurus! } : null };
    }
    const ok = !!l.name.trim() && totalKurus !== null;
    return {
      ok,
      item: undefined,
      qtyMilli: null,
      totalKurus,
      line: ok ? { itemId: null, name: l.name.trim(), category: l.category, totalKurus: totalKurus! } : null,
    };
  });
  const total = parsed.reduce((s, p) => s + (p.totalKurus ?? 0), 0);
  const chosen = parsed.flatMap((p) => (p.item ? [p.item.id] : []));
  const duplicate = new Set(chosen).size !== chosen.length;
  const ready = parsed.every((p) => p.ok) && total > 0 && !duplicate && (supplierId !== "__new" || newName.trim()) && date && (!dueDate || dueDate >= date);
  const set = (k: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const submit = () =>
    save.run(async () => {
      let sid: string | null = supplierId || null;
      if (supplierId === "__new") sid = (await api.staff.suppliers.add(slug, { key: supplierKey.current, name: newName.trim() })).supplier.id;
      const fields = {
        supplierId: sid,
        date,
        number: number.trim() || null,
        dueDate: paid === "no" ? dueDate || null : null,
        note: note.trim() || null,
        lines: parsed.map((p) => p.line!),
      };
      return bill
        ? api.staff.bills.correct(slug, bill.id, { version: bill.version, ...fields })
        : api.staff.bills.add(slug, { key: key.current, ...fields, ...(paid !== "no" ? { paid: { method: paid } } : {}) });
    });

  return (
    <Sheet title={bill ? t("correctingBill") : t("addBill")} onClose={onClose} labelClose={t("close")} wide>
      {bill && <p className="-mt-2 text-sm text-muted">{t("correctHelp")}</p>}
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("billSupplier")}
        <select className={`${field} min-h-12`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">{t("noSupplier")}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {data.canAddSupplier && <option value="__new">{t("newSupplier")}</option>}
        </select>
      </label>
      {supplierId === "__new" && (
        <Field label={t("newSupplierName")} value={newName} onChange={setNewName} placeholder={t("supplierNamePlaceholder")} maxLength={80} autoFocus />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("billDate")}
          <input type="date" className={`${field} min-h-12`} value={date} max={data.today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <Field label={t("billNumber")} value={number} onChange={setNumber} maxLength={40} />
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm text-muted">{t("billLines")}</h3>
        {data.items.length === 0 && !bill && <p className="text-sm text-muted">{t("noItemsYet")}</p>}
        <ul className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const p = parsed[i]!;
            const item = p.item;
            const unitKurus = item && p.qtyMilli && p.totalKurus !== null ? Math.round((p.totalKurus * 1000) / p.qtyMilli) : null;
            return (
              <li key={l.key} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_8rem_8rem_auto]">
                {l.kind === "stock" ? (
                  <>
                    <select
                      className={`${field} order-1 col-span-2 min-h-12 sm:order-none sm:col-span-1`}
                      value={l.itemId}
                      onChange={(e) => set(l.key, { itemId: e.target.value })}
                      aria-label={t("lineItem")}
                    >
                      <option value="">{t("lineItem")}</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                    <span className="relative order-3 flex items-center sm:order-none">
                      <input
                        className={`${field} min-h-12 pr-14 text-right tabular`}
                        inputMode="decimal"
                        value={l.qty}
                        placeholder="0"
                        onChange={(e) => set(l.key, { qty: e.target.value })}
                        aria-label={t("lineQty")}
                      />
                      <span className="pointer-events-none absolute right-4 text-muted">{item ? bigUnit(item.unit, lang) : ""}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      className={`${field} order-1 col-span-2 min-h-12 sm:order-none sm:col-span-1`}
                      value={l.name}
                      maxLength={80}
                      placeholder={t("lineWhatPlaceholder")}
                      onChange={(e) => set(l.key, { name: e.target.value })}
                      aria-label={t("lineWhat")}
                    />
                    <select
                      className={`${field} order-3 min-h-12 sm:order-none`}
                      value={l.category}
                      onChange={(e) => set(l.key, { category: e.target.value as BillCategoryDTO })}
                      aria-label={t("lineCategory")}
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {t(CATEGORY[c])}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <span className="relative order-4 col-span-2 flex items-center sm:order-none sm:col-span-1">
                  <input
                    className={`${field} min-h-12 pr-10 text-right tabular ${l.total.trim() && p.totalKurus === null ? "border-red" : ""}`}
                    inputMode="decimal"
                    value={l.total}
                    placeholder="0"
                    onChange={(e) => set(l.key, { total: e.target.value })}
                    aria-label={t("lineTotal")}
                  />
                  <span className="pointer-events-none absolute right-4 text-muted">₺</span>
                </span>
                <Button
                  kind="bare"
                  size="sm"
                  className="order-2 sm:order-none"
                  aria-label={t("removeBillLine")}
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  ×
                </Button>
                {unitKurus !== null && item && (
                  <span className="order-5 col-span-3 text-sm text-muted sm:order-none sm:col-span-4">
                    {fill(t("perUnit"), { price: formatTL(unitKurus), unit: unitLabel(item.unit, lang) })}
                    {item.costKurus !== null &&
                      item.costKurus !== unitKurus &&
                      ` · ${fill(t("lastPriceWas"), { price: fill(t("perUnit"), { price: formatTL(item.costKurus), unit: unitLabel(item.unit, lang) }) })}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          {items.length > 0 && (
            <Button kind="quiet" size="sm" onClick={() => setLines((ls) => [...ls, stockLine()])}>
              + {t("addStockLine")}
            </Button>
          )}
          <Button kind="quiet" size="sm" onClick={() => setLines((ls) => [...ls, otherLine()])}>
            + {t("addOtherLine")}
          </Button>
        </div>
        {duplicate && <Notice tone="red">{t("lineDuplicate")}</Notice>}
      </section>

      {!bill && data.canManage && (
        <Segmented
          label={t("paidQuestion")}
          value={paid}
          onChange={setPaid}
          options={[{ value: "no", label: t("notPaidYet") }, ...QUICK_METHODS.map((m) => ({ value: m, label: t(METHOD[m]) }))]}
        />
      )}
      {paid === "no" && (
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("billDue")}
          <input type="date" className={`${field} min-h-12`} value={dueDate} min={date} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      )}
      <Field label={t("noteOptional")} value={note} onChange={setNote} maxLength={300} />

      <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col gap-3 bg-paper px-6 pt-3 pb-6">
        {save.error && <Notice tone="red">{save.error}</Notice>}
        <div className="flex items-center justify-between gap-4">
          <span className="flex flex-col">
            <span className="text-sm text-muted">
              {t("billTotal")} · {t("kdvIncluded")}
            </span>
            <span className="text-2xl font-semibold tabular">{formatTL(total)}</span>
          </span>
          <Button kind="primary" size="lg" className="shrink-0 whitespace-nowrap" disabled={!ready || save.busy} onClick={submit}>
            {bill ? t("save") : t("saveBill")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export const billHref = (slug: string, billId: string) => `/panel/faturalar?kafe=${encodeURIComponent(slug)}&fatura=${encodeURIComponent(billId)}`;
