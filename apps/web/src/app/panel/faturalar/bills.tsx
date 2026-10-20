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
  type BillDraftDTO,
  type DraftDTO,
  type ProposalLineDTO,
  type StockUnitDTO,
} from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { bigInput, bigUnit, formatDay, formatMonth, formatQty, parseBig, parseTL, shiftMonth, tlInput } from "../amounts";
import { Field, Segmented, Stat, useSave } from "../controls";
import { METHOD, PaymentLine, PayForm } from "../pay";
import { useScanButton } from "../scan";
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
type DraftPaid = (typeof QUICK_METHODS)[number] | "credit";

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
  const scan = useScanButton({ t, lang, slug: cafe.slug, canSeeDrafts: !!data?.canSeeDrafts });

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
            <span className="flex flex-wrap gap-2">
              {data.canScan && scan.button}
              {data.canAdd && (
                <Button kind="primary" onClick={() => setOpen({ kind: "add" })}>
                  {t("addBill")}
                </Button>
              )}
            </span>
          </section>
          {scan.notices}

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
              {bill.kdv.map((k) => (
                <tr key={k.ratePct} className="text-sm text-muted">
                  <td className="pb-1">{fill(t("kdvLine"), { rate: k.ratePct })}</td>
                  <td className="pb-1 text-right tabular">{formatTL(k.amountKurus)}</td>
                </tr>
              ))}
            </tfoot>
          </table>
          {bill.document && (
            <a href={bill.document.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 self-start text-sm font-semibold underline underline-offset-4">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 2h9l5 5v15H6z" />
                <path d="M14 2v6h6" />
              </svg>
              {t("billDocument")}
              {bill.document.name ? <span className="font-normal text-muted">· {bill.document.name}</span> : null}
            </a>
          )}
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
          {bill.canManage && bill.state !== "voided" && bill.closed && <p className="text-sm text-muted">{t("billClosed")}</p>}
          {bill.canManage && bill.state !== "voided" && !bill.closed && (
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

type LineForm = {
  key: number;
  /** "new": a stock item this line starts (piece 25's "Yeni stok kalemi"). */
  kind: "stock" | "other" | "new";
  itemId: string;
  qty: string;
  /** What one printed pack holds, while it's being typed ("12" for 1 koli = 12 L); otherwise worked out from the amount. */
  pack: string | null;
  total: string;
  name: string;
  category: BillCategoryDTO;
  /** The new stock item's name and unit. */
  newName: string;
  newUnit: StockUnitDTO;
  /** The draft line it came from (piece 25), so the assistant learns what it was. */
  from: number | null;
  read: ProposalLineDTO | null;
};
type KdvForm = { key: number; rate: number; amount: string };

let lineKeys = 0;
const blank = { itemId: "", qty: "", pack: null, total: "", name: "", newName: "", newUnit: "adet" as StockUnitDTO, from: null, read: null };
const stockLine = (): LineForm => ({ key: ++lineKeys, kind: "stock", ...blank, category: "ingredients" });
const otherLine = (): LineForm => ({ key: ++lineKeys, kind: "other", ...blank, category: "rent" });
/** Today's rates first; 8 and 18 still show up on older bills. */
const KDV_CHOICES = [20, 10, 1, 18, 8];

/**
 * "Fatura ekle", or "Düzelt" when given the bill. Given a draft (piece 24), it's the
 * assistant's reading to check: filled in from it, shown in the page rather than over it,
 * and saved with "Onayla". A quick entry that said how it was paid (piece 28) comes with
 * that payment chosen; it's paid only when the person confirming keeps it (D21).
 */
export function BillForm({
  t,
  lang,
  slug,
  data,
  bill,
  draft = null,
  onClose,
  onDone,
  onConfirmed,
}: {
  t: T;
  lang: Lang;
  slug: string;
  data: BillsDTO;
  bill: BillDTO | null;
  draft?: BillDraftDTO | null;
  onClose: () => void;
  onDone?: (b: BillDTO) => void;
  onConfirmed?: (d: DraftDTO) => void;
}) {
  const key = useRef(newIdempotencyKey());
  const supplierKey = useRef(newIdempotencyKey());
  const proposal = draft?.proposal;
  // Two suppliers that fit equally are offered to pick from; a name that fits none is offered as a new supplier.
  const choices = proposal && !proposal.supplierId ? proposal.supplierChoices : [];
  const [supplierId, setSupplierId] = useState(
    bill?.supplierId ?? proposal?.supplierId ?? (proposal?.supplierName && !choices.length && data.canAddSupplier ? "__new" : ""),
  );
  const [newName, setNewName] = useState(proposal?.supplierId ? "" : (proposal?.supplierName ?? ""));
  // What the bill showed about a new supplier, to check before it's saved with it.
  const [newTaxNo, setNewTaxNo] = useState(proposal && !proposal.supplierId ? (proposal.supplierTaxNumber?.replace(/\s/g, "") ?? "") : "");
  const [newPhone, setNewPhone] = useState(proposal && !proposal.supplierId ? (proposal.supplierPhone ?? "") : "");
  const [newIban, setNewIban] = useState(proposal && !proposal.supplierId ? (proposal.supplierIban ?? "") : "");
  const [newAddress, setNewAddress] = useState(proposal && !proposal.supplierId ? (proposal.supplierAddress ?? "") : "");
  const newDetailsOk =
    (!newTaxNo.trim() || /^\d{10,11}$/.test(newTaxNo.replace(/\s/g, ""))) &&
    (!newPhone.trim() || /^\+?[\d ()-]{7,20}$/.test(newPhone.trim())) &&
    (!newIban.trim() || /^TR\d{24}$/.test(newIban.replace(/\s/g, "").toUpperCase()));
  const [date, setDate] = useState(bill?.date ?? proposal?.date ?? data.today);
  const [number, setNumber] = useState(bill?.number ?? proposal?.number ?? "");
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? proposal?.dueDate ?? "");
  const [note, setNote] = useState(bill?.note ?? "");
  const [paid, setPaid] = useState<"no" | DraftPaid>(() => (proposal?.paid && data.canManage ? proposal.paid.method : "no"));
  const [lines, setLines] = useState<LineForm[]>(() =>
    (bill ?? proposal)
      ? (bill ?? proposal)!.lines.map((l, i): LineForm => {
          const read = proposal ? proposal.lines[i]! : null;
          // A new stock item is offered to those who can add one; anyone else sees the line as an expense.
          const fresh = read?.newItem ?? null;
          return {
            key: ++lineKeys,
            kind: l.itemId ? "stock" : fresh && data.canAddStock ? "new" : "other",
            itemId: l.itemId ?? "",
            qty: l.qtyMilli !== null ? bigInput(l.qtyMilli) : "",
            pack: null,
            total: tlInput(l.totalKurus),
            name: l.itemId ? "" : fresh ? read!.readName : l.name,
            category: l.category,
            newName: fresh?.name ?? "",
            newUnit: fresh?.unit ?? "adet",
            from: proposal ? i : null,
            read,
          };
        })
      : [data.items.length ? stockLine() : otherLine()],
  );
  const [kdv, setKdv] = useState<KdvForm[]>(() =>
    (bill?.kdv ?? proposal?.kdv ?? []).map((k) => ({ key: ++lineKeys, rate: k.ratePct, amount: tlInput(k.amountKurus) })),
  );
  // A bill that looks already entered is saved only with a yes (piece 25).
  const [askDuplicate, setAskDuplicate] = useState(!!draft?.duplicateOf);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const save = useSave<BillDTO | DraftDTO>(lang, (r) => ("kind" in r ? onConfirmed?.(r) : onDone?.(r)));

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
    if (l.kind === "new") {
      const qtyMilli = parseBig(l.qty);
      const name = l.newName.trim();
      const ok = !!name && name.length <= 60 && qtyMilli !== null && qtyMilli > 0 && totalKurus !== null;
      const from = l.from !== null ? { from: l.from } : {};
      const newItem = { name, unit: l.newUnit, kind: l.category === "supplies" ? ("supply" as const) : ("ingredient" as const) };
      return {
        ok,
        item: undefined,
        unit: l.newUnit,
        qtyMilli,
        totalKurus,
        line: ok ? { itemId: null, newItem, qtyMilli: qtyMilli!, totalKurus: totalKurus!, ...from } : null,
      };
    }
    if (l.kind === "stock") {
      const item = items.find((i) => i.id === l.itemId);
      const qtyMilli = parseBig(l.qty);
      const ok = !!item && qtyMilli !== null && qtyMilli > 0 && totalKurus !== null;
      const from = l.from !== null ? { from: l.from } : {};
      return { ok, item, unit: item?.unit ?? null, qtyMilli, totalKurus, line: ok ? { itemId: item!.id, qtyMilli: qtyMilli!, totalKurus: totalKurus!, ...from } : null };
    }
    const from = l.from !== null ? { from: l.from } : {};
    const ok = !!l.name.trim() && totalKurus !== null;
    return {
      ok,
      item: undefined,
      unit: null,
      qtyMilli: null,
      totalKurus,
      line: ok ? { itemId: null, name: l.name.trim(), category: l.category, totalKurus: totalKurus!, ...from } : null,
    };
  });
  const total = parsed.reduce((s, p) => s + (p.totalKurus ?? 0), 0);
  const chosen = parsed.flatMap((p) => (p.item ? [p.item.id] : []));
  const duplicate = new Set(chosen).size !== chosen.length;
  const kdvParsed = kdv.map((k) => ({ ratePct: k.rate, amountKurus: parseTL(k.amount) }));
  const kdvOk =
    kdvParsed.every((k) => k.amountKurus !== null && k.amountKurus > 0) &&
    new Set(kdv.map((k) => k.rate)).size === kdv.length &&
    kdvParsed.reduce((sum, k) => sum + (k.amountKurus ?? 0), 0) < Math.max(total, 1);
  const ready =
    parsed.every((p) => p.ok) &&
    total > 0 &&
    !duplicate &&
    kdvOk &&
    (!askDuplicate || allowDuplicate) &&
    (supplierId !== "__new" || (newName.trim() && (!draft || newDetailsOk))) &&
    date &&
    (!dueDate || dueDate >= date);
  const set = (k: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const submit = () =>
    save.run(async () => {
      let sid: string | null = supplierId || null;
      // Confirming a draft adds the new supplier itself, so the choice is remembered for this seller's next bill.
      const newSupplier =
        draft && supplierId === "__new"
          ? {
              name: newName.trim(),
              taxNo: newTaxNo.replace(/\s/g, "") || null,
              phone: newPhone.trim() || null,
              iban: newIban.replace(/\s/g, "").toUpperCase() || null,
              note: newAddress.trim() ? `${t("addressNote")}: ${newAddress.trim()}`.slice(0, 300) : null,
            }
          : null;
      if (newSupplier) sid = null;
      else if (supplierId === "__new") {
        // A tax number read off the bill comes along when it looks like one.
        const taxNo = proposal?.supplierTaxNumber && /^\d{10,11}$/.test(proposal.supplierTaxNumber) ? proposal.supplierTaxNumber : undefined;
        sid = (await api.staff.suppliers.add(slug, { key: supplierKey.current, name: newName.trim(), ...(taxNo ? { taxNo } : {}) })).supplier.id;
      }
      const fields = {
        supplierId: sid,
        date,
        number: number.trim() || null,
        dueDate: paid === "no" ? dueDate || null : null,
        note: note.trim() || null,
        lines: parsed.map((p) => p.line!),
        kdv: kdvParsed.map((k) => ({ ratePct: k.ratePct, amountKurus: k.amountKurus! })),
      };
      const yes = allowDuplicate ? { allowDuplicate: true } : {};
      try {
        if (draft)
          return await api.staff.drafts.confirm(slug, draft.id, {
            ...fields,
            ...yes,
            ...(newSupplier ? { newSupplier } : {}),
            ...(paid !== "no" ? { paid: { method: paid } } : {}),
          });
        return bill
          ? await api.staff.bills.correct(slug, bill.id, { version: bill.version, ...fields })
          : await api.staff.bills.add(slug, { key: key.current, ...fields, ...yes, ...(paid !== "no" ? { paid: { method: paid } } : {}) });
      } catch (e) {
        if (e instanceof PeniApiError && e.code === "BILL_DUPLICATE") setAskDuplicate(true);
        throw e;
      }
    });

  const Frame = draft ? InPage : Sheet;
  return (
    <Frame title={draft ? t("draftCheck") : bill ? t("correctingBill") : t("addBill")} onClose={onClose} labelClose={t("close")} wide>
      {bill && <p className="-mt-2 text-sm text-muted">{t("correctHelp")}</p>}
      {draft?.duplicateOf && <DuplicateOf t={t} slug={slug} of={draft.duplicateOf} />}
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
      {proposal?.supplierId && proposal.supplierId === supplierId && proposal.supplierMatchedBy === "learned" && (
        <p className="-mt-3 text-sm text-muted">{fill(t("supplierLearned"), { name: proposal.supplierName ?? "" })}</p>
      )}
      {choices.length > 0 && !supplierId && (
        <div role="status" className="-mt-2 flex flex-col gap-2 rounded-2xl bg-panel px-4 py-3 text-sm">
          <span>{fill(t("supplierWhich"), { name: proposal?.supplierName ?? "" })}</span>
          <span className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <Button key={c.id} kind="quiet" size="sm" onClick={() => setSupplierId(c.id)}>
                {c.name}
              </Button>
            ))}
            {data.canAddSupplier && (
              <Button kind="bare" size="sm" onClick={() => setSupplierId("__new")}>
                {t("supplierNoneOfThem")}
              </Button>
            )}
          </span>
        </div>
      )}
      {supplierId === "__new" && draft && (
        <p className="-mt-2 text-sm font-semibold text-green">
          {fill(t(newTaxNo.trim() ? "newSupplierWithTax" : "newSupplierLine"), { name: newName.trim() || "…", tax: newTaxNo.trim() })}
        </p>
      )}
      {supplierId === "__new" && (
        <Field label={t("newSupplierName")} value={newName} onChange={setNewName} placeholder={t("supplierNamePlaceholder")} maxLength={80} autoFocus={!draft} />
      )}
      {supplierId === "__new" && draft && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("supplierTaxNoOptional")} value={newTaxNo} onChange={setNewTaxNo} inputMode="text" maxLength={20} />
            <Field label={t("supplierPhoneOptional")} value={newPhone} onChange={setNewPhone} inputMode="text" maxLength={30} />
          </div>
          <Field label={t("supplierIbanOptional")} value={newIban} onChange={setNewIban} maxLength={40} />
          <Field label={t("supplierAddressOptional")} value={newAddress} onChange={setNewAddress} maxLength={200} />
          {!newDetailsOk && <Notice tone="red">{t("newSupplierCheck")}</Notice>}
          <p className="-mt-2 text-sm text-muted">{t("newSupplierHelp")}</p>
        </>
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
        {data.items.length === 0 && !bill && !lines.some((l) => l.kind === "new") && <p className="text-sm text-muted">{t("noItemsYet")}</p>}
        <ul className="@container flex flex-col gap-3">
          {lines.map((l, i) => {
            const p = parsed[i]!;
            const item = p.item;
            const unitKurus = p.unit && p.qtyMilli && p.totalKurus !== null ? Math.round((p.totalKurus * 1000) / p.qtyMilli) : null;
            return (
              <li key={l.key} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-2xl border border-line p-3 @lg:grid-cols-[1fr_8rem_8rem_auto]">
                {l.kind === "new" && (
                  <span className="order-first col-span-3 text-sm font-semibold text-green @lg:col-span-4">
                    {fill(t("newStockItem"), { name: l.newName.trim() || "…", unit: bigUnit(l.newUnit, lang) })}
                  </span>
                )}
                {l.kind === "new" ? (
                  <>
                    <span className="order-1 col-span-2 grid grid-cols-[1fr_6rem] gap-2 @lg:order-none @lg:col-span-1">
                      <input
                        className={`${field} min-h-12`}
                        value={l.newName}
                        maxLength={60}
                        onChange={(e) => set(l.key, { newName: e.target.value })}
                        aria-label={t("newStockName")}
                      />
                      <select
                        className={`${field} min-h-12`}
                        value={l.newUnit}
                        onChange={(e) => set(l.key, { newUnit: e.target.value as StockUnitDTO })}
                        aria-label={t("newStockUnit")}
                      >
                        {(["kg", "l", "adet"] as const).map((u) => (
                          <option key={u} value={u}>
                            {bigUnit(u, lang)}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span className="relative order-3 flex items-center @lg:order-none">
                      <input
                        className={`${field} min-h-12 pr-14 text-right tabular`}
                        inputMode="decimal"
                        value={l.qty}
                        placeholder="0"
                        onChange={(e) => set(l.key, { qty: e.target.value, pack: null })}
                        aria-label={t("lineQty")}
                      />
                      <span className="pointer-events-none absolute right-4 text-muted">{bigUnit(l.newUnit, lang)}</span>
                    </span>
                  </>
                ) : l.kind === "stock" ? (
                  <>
                    <select
                      className={`${field} order-1 col-span-2 min-h-12 @lg:order-none @lg:col-span-1`}
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
                    <span className="relative order-3 flex items-center @lg:order-none">
                      <input
                        className={`${field} min-h-12 pr-14 text-right tabular`}
                        inputMode="decimal"
                        value={l.qty}
                        placeholder="0"
                        onChange={(e) => set(l.key, { qty: e.target.value, pack: null })}
                        aria-label={t("lineQty")}
                      />
                      <span className="pointer-events-none absolute right-4 text-muted">{item ? bigUnit(item.unit, lang) : ""}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      className={`${field} order-1 col-span-2 min-h-12 @lg:order-none @lg:col-span-1`}
                      value={l.name}
                      maxLength={80}
                      placeholder={t("lineWhatPlaceholder")}
                      onChange={(e) => set(l.key, { name: e.target.value })}
                      aria-label={t("lineWhat")}
                    />
                    <select
                      className={`${field} order-3 min-h-12 @lg:order-none`}
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
                <span className="relative order-4 col-span-2 flex items-center @lg:order-none @lg:col-span-1">
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
                  className="order-2 @lg:order-none"
                  aria-label={t("removeBillLine")}
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  ×
                </Button>
                {l.read && (
                  <span className="order-6 col-span-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted @lg:order-none @lg:col-span-4">
                    <span>
                      {fill(t(draft?.entry ? "readAsNote" : "readAs"), { name: readLine(l.read, lang) })}
                      {l.kind === "stock" && l.read.itemId === l.itemId && l.read.matchedBy && (
                        <span className={l.read.matchedBy === "model" ? "text-ink" : ""}>
                          {" · "}
                          {t(l.read.matchedBy === "learned" ? "readLearned" : "readModel")}
                        </span>
                      )}
                      {l.kind === "new" && <span className="text-ink"> · {t("newStockHelp")}</span>}
                    </span>
                    <span className="flex flex-wrap gap-x-4">
                      {l.kind !== "new" && l.read.newItem && data.canAddStock && (
                        <button
                          type="button"
                          className="min-h-9 cursor-pointer font-semibold text-ink underline underline-offset-4"
                          onClick={() => set(l.key, { kind: "new", itemId: "", name: l.read!.readName, qty: l.read!.qtyMilli !== null ? bigInput(l.read!.qtyMilli) : l.qty, pack: null })}
                        >
                          {t("makeNewStock")}
                        </button>
                      )}
                      {l.kind !== "stock" && items.length > 0 && (
                        <button
                          type="button"
                          className="min-h-9 cursor-pointer font-semibold text-ink underline underline-offset-4"
                          onClick={() => set(l.key, { kind: "stock", name: "", itemId: "", pack: null })}
                        >
                          {t(l.kind === "new" ? "pickExisting" : "makeStock")}
                        </button>
                      )}
                      {l.kind !== "other" && (
                        <button
                          type="button"
                          className="min-h-9 cursor-pointer font-semibold text-ink underline underline-offset-4"
                          onClick={() =>
                            set(l.key, { kind: "other", itemId: "", qty: "", pack: null, name: l.read!.readName, category: l.category === "supplies" ? "supplies" : "ingredients" })
                          }
                        >
                          {t(l.kind === "new" ? "keepExpense" : "makeExpense")}
                        </button>
                      )}
                    </span>
                  </span>
                )}
                {l.read && l.kind !== "other" && p.unit && l.read.readQtyMilli !== null && (
                  <PackLine
                    t={t}
                    lang={lang}
                    read={l.read}
                    unit={p.unit}
                    qtyMilli={p.qtyMilli}
                    pack={l.pack}
                    onPack={(raw) => {
                      const size = parseBig(raw);
                      set(l.key, { pack: raw, ...(size !== null && size > 0 ? { qty: bigInput(Math.round((l.read!.readQtyMilli! * size) / 1000)) } : {}) });
                    }}
                  />
                )}
                {unitKurus !== null && p.unit && (
                  <span className="order-5 col-span-3 text-sm text-muted @lg:order-none @lg:col-span-4">
                    {fill(t("perUnit"), { price: formatTL(unitKurus), unit: unitLabel(p.unit, lang) })}
                    {item &&
                      item.costKurus !== null &&
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

      <section className="flex flex-col gap-3">
        {kdv.length > 0 && <h3 className="text-sm text-muted">{t("kdvOptional")}</h3>}
        {kdv.map((k, i) => (
          <div key={k.key} className="grid grid-cols-[7rem_1fr_auto] gap-2">
            <select
              className={`${field} min-h-12`}
              value={k.rate}
              aria-label={t("kdvRate")}
              onChange={(e) => setKdv((ks) => ks.map((x) => (x.key === k.key ? { ...x, rate: Number(e.target.value) } : x)))}
            >
              {KDV_CHOICES.map((r) => (
                <option key={r} value={r}>
                  %{r}
                </option>
              ))}
            </select>
            <span className="relative flex items-center">
              <input
                className={`${field} min-h-12 pr-10 text-right tabular ${k.amount.trim() && kdvParsed[i]!.amountKurus === null ? "border-red" : ""}`}
                inputMode="decimal"
                value={k.amount}
                placeholder="0"
                aria-label={t("kdvAmount")}
                onChange={(e) => setKdv((ks) => ks.map((x) => (x.key === k.key ? { ...x, amount: e.target.value } : x)))}
              />
              <span className="pointer-events-none absolute right-4 text-muted">₺</span>
            </span>
            <Button kind="bare" size="sm" aria-label={t("kdvRemove")} onClick={() => setKdv((ks) => ks.filter((x) => x.key !== k.key))}>
              ×
            </Button>
          </div>
        ))}
        {kdv.length > 0 && !kdvOk && kdvParsed.every((k) => k.amountKurus !== null) && <Notice tone="red">{t("kdvTooMuch")}</Notice>}
        {kdv.length < KDV_CHOICES.length && (
          <div>
            <Button
              kind="quiet"
              size="sm"
              onClick={() =>
                setKdv((ks) => [...ks, { key: ++lineKeys, rate: KDV_CHOICES.find((r) => !ks.some((k) => k.rate === r)) ?? 20, amount: "" }])
              }
            >
              + {kdv.length ? t("kdvAdd") : t("kdvOptional")}
            </Button>
          </div>
        )}
      </section>

      {!bill && data.canManage && (!draft || draft.proposal.paid) && (
        <Segmented
          label={t("paidQuestion")}
          value={paid}
          onChange={setPaid}
          options={[
            { value: "no", label: t("notPaidYet") },
            // The credit card shows when the note said it, since it needs the card set up.
            ...[...QUICK_METHODS, ...(proposal?.paid?.method === "credit" ? (["credit"] as const) : [])].map((m) => ({ value: m, label: t(METHOD[m]) })),
          ]}
        />
      )}
      {draft?.proposal.paid && !data.canManage && <Notice>{fill(t("qePaidSaid"), { method: t(METHOD[draft.proposal.paid.method]).toLocaleLowerCase(lang) })}</Notice>}
      {paid === "no" && (
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("billDue")}
          <input type="date" className={`${field} min-h-12`} value={dueDate} min={date} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      )}
      <Field label={t("noteOptional")} value={note} onChange={setNote} maxLength={300} />

      <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col gap-3 bg-paper px-6 pt-3 pb-6">
        {save.error && <Notice tone="red">{save.error}</Notice>}
        {askDuplicate && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-ink" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} />
            {t("dupAllow")}
          </label>
        )}
        <div className="flex items-center justify-between gap-4">
          <span className="flex flex-col">
            <span className="text-sm text-muted">
              {t("billTotal")} · {t("kdvIncluded")}
            </span>
            <span className="text-2xl font-semibold tabular">{formatTL(total)}</span>
            {proposal?.totalKurus != null && proposal.totalKurus !== total && (
              <span className="text-sm text-red">{fill(t("draftDocTotal"), { total: formatTL(proposal.totalKurus) })}</span>
            )}
          </span>
          <Button kind="primary" size="lg" className="shrink-0 whitespace-nowrap" disabled={!ready || save.busy} onClick={submit}>
            {draft ? t("draftConfirm") : bill ? t("save") : t("saveBill")}
          </Button>
        </div>
      </div>
    </Frame>
  );
}

/** A draft is checked beside its document, so its form sits in the page instead of over it. */
function InPage({ title, children }: { title: string; onClose: () => void; children: ReactNode; labelClose: string; wide?: boolean }) {
  return (
    <section aria-label={title} className="flex flex-col gap-5 overflow-clip rounded-3xl border border-line bg-paper p-6">
      {children}
    </section>
  );
}

/** The bill or draft a draft looks like (piece 25), with a link to look. */
function DuplicateOf({ t, slug, of }: { t: T; slug: string; of: NonNullable<DraftDTO["duplicateOf"]> }) {
  const href = of.kind === "bill" ? billHref(slug, of.id) : `/panel/taslaklar?kafe=${encodeURIComponent(slug)}&taslak=${encodeURIComponent(of.id)}`;
  return (
    <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-red-soft px-4 py-3 text-sm text-red">
      <span>
        {fill(t(of.kind === "bill" ? "dupBill" : "dupDraft"), { title: of.title })} {t(`dup_${of.why}`)}
      </span>
      <a href={href} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
        {t("dupOpen")}
      </a>
    </p>
  );
}

/** A printed unit in words: "koli", or "case" in English. */
function readUnitLabel(unit: string | null, lang: Lang): string {
  const en: Record<string, string> = { koli: "case", paket: "pack", kasa: "crate", adet: "pcs", l: "L" };
  if (!unit) return "";
  return lang === "en" ? (en[unit] ?? unit) : unit === "l" ? "L" : unit;
}

/**
 * How a line's printed amount became stock: "2 koli → 24 L", with what one pack holds to
 * check or type ("1 koli = 12 L"). Confirming keeps that pack size for this supplier's next
 * bill (piece 25), so the same line is always worked out the same way.
 */
function PackLine({
  t,
  lang,
  read,
  unit,
  qtyMilli,
  pack,
  onPack,
}: {
  t: T;
  lang: Lang;
  read: ProposalLineDTO;
  unit: StockUnitDTO;
  qtyMilli: number | null;
  pack: string | null;
  onPack: (raw: string) => void;
}) {
  const num = (milli: number) => (milli / 1000).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { maximumFractionDigits: 3 });
  const printed = `${num(read.readQtyMilli!)} ${readUnitLabel(read.readUnit, lang)}`.trim();
  const size = qtyMilli && read.readQtyMilli ? Math.round((qtyMilli * 1000) / read.readQtyMilli) : null;
  // Only worth showing when something was converted: "24 L" from "24 l" needs no line.
  const same = read.readUnit === unit && size === 1000;
  if (same || !qtyMilli) return null;
  return (
    <span className="order-7 col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted @lg:order-none @lg:col-span-4">
      <span className="font-semibold text-ink tabular">{fill(t("packShows"), { from: printed, to: `${num(qtyMilli)} ${bigUnit(unit, lang)}` })}</span>
      {read.readUnit && read.readUnit !== unit && (
        <label className="flex items-center gap-2 whitespace-nowrap">
          <span>{fill(t("packOne"), { unit: readUnitLabel(read.readUnit, lang) })}</span>
          <input
            className="min-h-9 w-24 rounded-xl border border-line bg-paper px-3 py-1 text-right text-base text-ink tabular outline-none focus:border-ink"
            inputMode="decimal"
            value={pack ?? (size !== null ? bigInput(size) : "")}
            onChange={(e) => onPack(e.target.value)}
            aria-label={fill(t("packOne"), { unit: readUnitLabel(read.readUnit, lang) })}
          />
          <span>{bigUnit(unit, lang)}</span>
        </label>
      )}
      {read.matchedBy === "learned" && read.qtyMilli === qtyMilli ? <span>{t("packLearned")}</span> : <span>{t("packRemembered")}</span>}
    </span>
  );
}

/** "SÜT 1 LT · 24 adet": the line as the document printed it. */
function readLine(l: ProposalLineDTO, lang: Lang) {
  const qty = l.readQtyMilli !== null ? (l.readQtyMilli / 1000).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { maximumFractionDigits: 3 }) : null;
  return [l.readName, qty && [qty, l.readUnit].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

export const billHref = (slug: string, billId: string) => `/panel/faturalar?kafe=${encodeURIComponent(slug)}&fatura=${encodeURIComponent(billId)}`;
