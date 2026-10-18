"use client";

import { newIdempotencyKey, PeniApiError, type SupplierDTO, type SupplierPriceDTO, type SuppliersDTO, type SupplierSummaryDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useRef, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { formatDay } from "../amounts";
import { Field, Stat, useSave } from "../controls";
import { billHref, BillRow } from "../faturalar/bills";
import { PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T } from "../text";

type Open = { kind: "add" } | { kind: "supplier"; id: string } | null;

/**
 * Tedarikçiler (plan piece 18): who the café buys from, what it owes each (from unpaid
 * bills), and how their prices moved (from the bills' stock lines).
 */
export function Suppliers({ cafeSlug, supplierId }: { cafeSlug: string | null; supplierId: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="tedarikciler" wide>
      {(p) => <SuppliersPage key={p.cafe.slug} {...p} supplierId={supplierId} />}
    </PanelShell>
  );
}

function SuppliersPage({ cafe, t, lang, signedOut, supplierId }: PanelProps & { supplierId: string | null }) {
  const [data, setData] = useState<SuppliersDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(supplierId ? { kind: "supplier", id: supplierId } : null);

  const load = () =>
    api.staff.suppliers.list(cafe.slug).then(setData, (e: unknown) => {
      if (e instanceof PeniApiError && e.status === 401) signedOut();
      else setError(errorText(e, lang));
    });
  useEffect(() => {
    void load();
    // Once per café; the language isn't a reason to load again.
  }, [cafe.slug]);

  const overdue = data?.suppliers.reduce((s, x) => s + x.overdueKurus, 0) ?? 0;
  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("suppliers")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("suppliersHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <dl className="flex gap-8">
              <Stat label={t("owedToThem")} value={formatTL(data.owedKurus)} />
              <Stat label={t("statOverdue")} value={formatTL(overdue)} tone={overdue ? "red" : undefined} />
            </dl>
            {data.canEdit && (
              <Button kind="primary" onClick={() => setOpen({ kind: "add" })}>
                {t("addSupplier")}
              </Button>
            )}
          </section>

          {data.suppliers.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-3xl bg-panel p-6">
              <p className="font-serif text-2xl">{t("noSuppliersTitle")}</p>
              <p className="leading-normal text-muted">{t("noSuppliersHelp")}</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
              {data.suppliers.map((s) => (
                <li key={s.id}>
                  <SupplierRow t={t} lang={lang} supplier={s} onOpen={() => setOpen({ kind: "supplier", id: s.id })} />
                </li>
              ))}
            </ul>
          )}

          {data.removed.length > 0 && (
            <details className="rounded-2xl bg-panel px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold">{fill(t("removedSuppliers"), { n: data.removed.length })}</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {data.removed.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="min-h-11 cursor-pointer text-left underline-offset-4 hover:underline"
                      onClick={() => setOpen({ kind: "supplier", id: s.id })}
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {open?.kind === "add" && (
        <AddSupplier
          t={t}
          lang={lang}
          slug={cafe.slug}
          onClose={() => setOpen(null)}
          onDone={(s) => {
            void load();
            setOpen({ kind: "supplier", id: s.supplier.id });
          }}
        />
      )}
      {open?.kind === "supplier" && (
        <SupplierSheet t={t} lang={lang} slug={cafe.slug} supplierId={open.id} onClose={() => setOpen(null)} onChanged={() => void load()} />
      )}
    </>
  );
}

function SupplierRow({ t, lang, supplier, onOpen }: { t: T; lang: Lang; supplier: SupplierSummaryDTO; onOpen: () => void }) {
  const meta = [supplier.phone, supplier.lastBillDate ? fill(t("lastBill"), { day: formatDay(supplier.lastBillDate, lang) }) : t("noBillsYet")]
    .filter(Boolean)
    .join(" · ");
  return (
    <button type="button" onClick={onOpen} className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 py-4 text-left">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-lg">{supplier.name}</span>
        <span className="truncate text-sm text-muted">{meta}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {supplier.owedKurus > 0 ? (
          <span className="text-xl font-semibold tabular">{formatTL(supplier.owedKurus)}</span>
        ) : (
          <span className="text-muted">{t("owesNothing")}</span>
        )}
        {supplier.overdueKurus > 0 && (
          <span className="rounded-full bg-red-soft px-2.5 py-0.5 text-xs font-semibold text-red">
            {fill(t("ofWhichOverdue"), { tl: formatTL(supplier.overdueKurus) })}
          </span>
        )}
        {supplier.overdueKurus === 0 && supplier.monthKurus > 0 && (
          <span className="text-xs text-muted tabular">{fill(t("last30"), { tl: formatTL(supplier.monthKurus) })}</span>
        )}
      </span>
    </button>
  );
}

type Details = { name: string; phone: string; email: string; taxNo: string; iban: string; note: string };
const empty: Details = { name: "", phone: "", email: "", taxNo: "", iban: "", note: "" };
const fromDTO = (s: SupplierDTO["supplier"]): Details => ({
  name: s.name,
  phone: s.phone ?? "",
  email: s.email ?? "",
  taxNo: s.taxNo ?? "",
  iban: s.iban ? s.iban.replace(/(.{4})/g, "$1 ").trim() : "",
  note: s.note ?? "",
});
const toInput = (d: Details) => ({
  name: d.name.trim(),
  phone: d.phone.trim() || null,
  email: d.email.trim() || null,
  taxNo: d.taxNo.trim() || null,
  iban: d.iban.trim() || null,
  note: d.note.trim() || null,
});

function DetailsFields({ t, value, onChange, autoFocus = false }: { t: T; value: Details; onChange: (d: Details) => void; autoFocus?: boolean }) {
  const opt = (label: string) => `${label} (${t("optional")})`;
  return (
    <>
      <Field
        label={t("supplierName")}
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        placeholder={t("supplierNamePlaceholder")}
        maxLength={80}
        autoFocus={autoFocus}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={opt(t("supplierPhone"))} value={value.phone} onChange={(phone) => onChange({ ...value, phone })} maxLength={30} />
        <Field label={opt(t("supplierEmail"))} value={value.email} onChange={(email) => onChange({ ...value, email })} maxLength={200} />
        <Field label={opt(t("supplierTaxNo"))} value={value.taxNo} onChange={(taxNo) => onChange({ ...value, taxNo })} inputMode="decimal" maxLength={20} />
        <Field label={opt(t("supplierIban"))} value={value.iban} onChange={(iban) => onChange({ ...value, iban })} placeholder="TR00 0000 …" maxLength={40} />
      </div>
      <Field
        label={opt(t("supplierNote"))}
        value={value.note}
        onChange={(note) => onChange({ ...value, note })}
        placeholder={t("supplierNotePlaceholder")}
        maxLength={300}
      />
    </>
  );
}

function AddSupplier({ t, lang, slug, onClose, onDone }: { t: T; lang: Lang; slug: string; onClose: () => void; onDone: (s: SupplierDTO) => void }) {
  const key = useRef(newIdempotencyKey());
  const [d, setD] = useState<Details>(empty);
  const save = useSave(lang, onDone);
  return (
    <Sheet title={t("addSupplier")} onClose={onClose} labelClose={t("close")} wide>
      <DetailsFields t={t} value={d} onChange={setD} autoFocus />
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <Button
        kind="primary"
        size="lg"
        disabled={!d.name.trim() || save.busy}
        onClick={() => save.run(() => api.staff.suppliers.add(slug, { key: key.current, ...toInput(d) }))}
      >
        {t("addSupplier")}
      </Button>
    </Sheet>
  );
}

function SupplierSheet({
  t,
  lang,
  slug,
  supplierId,
  onClose,
  onChanged,
}: {
  t: T;
  lang: Lang;
  slug: string;
  supplierId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [s, setS] = useState<SupplierDTO | null>(null);
  const [form, setForm] = useState<Details | null>(null);
  const [copied, setCopied] = useState(false);
  const save = useSave<SupplierDTO>(lang, (next) => {
    setS(next);
    setForm(fromDTO(next.supplier));
    onChanged();
  });
  useEffect(() => {
    api.staff.suppliers.get(slug, supplierId).then(
      (x) => {
        setS(x);
        setForm(fromDTO(x.supplier));
      },
      (e: unknown) => save.setError(errorText(e, lang)),
    );
    // Once per supplier.
  }, [slug, supplierId]);

  const sup = s?.supplier;
  return (
    <Sheet title={sup?.name ?? t("loading")} onClose={onClose} labelClose={t("close")} wide>
      {s && sup && form && (
        <>
          <div className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {sup.phone && (
              <a className="underline underline-offset-4" href={`tel:${sup.phone.replace(/[^\d+]/g, "")}`}>
                {sup.phone}
              </a>
            )}
            {sup.email && (
              <a className="underline underline-offset-4" href={`mailto:${sup.email}`}>
                {sup.email}
              </a>
            )}
            {sup.taxNo && <span className="text-muted">VKN {sup.taxNo}</span>}
          </div>
          {sup.iban && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-panel px-4 py-2">
              <span className="font-mono text-sm tracking-wide">{fromDTO(sup).iban}</span>
              <Button
                kind="bare"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(sup.iban!).then(() => setCopied(true));
                }}
              >
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
          )}
          {sup.removed && <Notice>{t("removedSupplierNotice")}</Notice>}

          <dl className="flex gap-8">
            <Stat label={t("owedToThem")} value={formatTL(s.owedKurus)} />
            {s.overdueKurus > 0 && <Stat label={t("statOverdue")} value={formatTL(s.overdueKurus)} tone="red" />}
          </dl>

          <section className="flex flex-col gap-2">
            <h3 className="font-serif text-2xl">{t("prices")}</h3>
            {s.prices.length === 0 ? (
              <p className="text-sm text-muted">{t("noPrices")}</p>
            ) : (
              <>
                <p className="text-sm text-muted">{t("pricesHelp")}</p>
                <ul className="flex flex-col divide-y divide-line-soft">
                  {s.prices.map((p) => (
                    <li key={p.itemId}>
                      <PriceRow t={t} lang={lang} price={p} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-serif text-2xl">{t("theirBills")}</h3>
            {s.bills.length === 0 ? (
              <p className="text-sm text-muted">{t("noBillsYet")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft">
                {s.bills.map((b) => (
                  <li key={b.id}>
                    <BillRow
                      t={t}
                      lang={lang}
                      bill={b}
                      showSupplier={false}
                      onOpen={() => {
                        if (s.canSeeBills) window.location.href = billHref(slug, b.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {s.canEdit && (
            <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
              <h3 className="font-serif text-2xl">{t("details")}</h3>
              <DetailsFields t={t} value={form} onChange={setForm} />
              {save.error && <Notice tone="red">{save.error}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button
                  kind="primary"
                  disabled={!form.name.trim() || save.busy}
                  onClick={() => save.run(() => api.staff.suppliers.update(slug, sup.id, toInput(form)))}
                >
                  {t("save")}
                </Button>
                <Button kind="bare" disabled={save.busy} onClick={() => save.run(() => api.staff.suppliers.update(slug, sup.id, { removed: !sup.removed }))}>
                  {sup.removed ? t("bringBack") : t("removeSupplier")}
                </Button>
              </div>
            </section>
          )}
        </>
      )}
      {!s && save.error && <Notice tone="red">{save.error}</Notice>}
    </Sheet>
  );
}

/** One item's price on this supplier's bills: the latest, how it moved, and a small line of the rest. */
function PriceRow({ t, lang, price }: { t: T; lang: Lang; price: SupplierPriceDTO }) {
  const [latest, previous] = price.points;
  const unit = price.unit === "kg" ? "kg" : price.unit === "l" ? "L" : lang === "tr" ? "adet" : "pc";
  const change = latest && previous ? Math.round((1000 * (latest.unitKurus - previous.unitKurus)) / previous.unitKurus) / 10 : null;
  const pct = change === null ? "" : new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-GB", { maximumFractionDigits: 1 }).format(Math.abs(change));
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{price.name}</span>
        <span className="text-sm text-muted">
          {price.points
            .slice(0, 4)
            .map((p) => `${formatDay(p.date, lang)} ${formatTL(p.unitKurus)}`)
            .join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-4">
        <Sparkline values={[...price.points].reverse().map((p) => p.unitKurus)} />
        <span className="flex flex-col items-end gap-0.5">
          <span className="font-semibold tabular">{latest && fill(t("perUnit"), { price: formatTL(latest.unitKurus), unit })}</span>
          {change !== null && (
            <span className={`text-xs font-semibold ${change > 0 ? "text-red" : change < 0 ? "text-green" : "text-muted"}`}>
              {change > 0 ? `↑ ${fill(t("priceUp"), { pct })}` : change < 0 ? `↓ ${fill(t("priceDown"), { pct })}` : t("priceSame")}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 72;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = (v: number) => (max === min ? h / 2 : h - 2 - ((v - min) / (max - min)) * (h - 4));
  const x = (i: number) => 3 + (i / (values.length - 1)) * (w - 6);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-muted" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r="2.5" fill="currentColor" />
    </svg>
  );
}
