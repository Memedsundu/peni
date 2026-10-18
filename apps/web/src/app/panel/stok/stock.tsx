"use client";

import { newIdempotencyKey, PeniApiError, type StockDTO, type StockItemDTO, type StockItemHistoryDTO, type StockMoveDTO, type WasteWhyDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { bigInput, bigUnit, formatChange, formatQty, parseBig, parseTL, tlInput } from "../amounts";
import { Field, LevelPill, Segmented, Stat, useSave } from "../controls";
import { field, has, PanelShell, when, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";

type Open = { kind: "add" } | { kind: "count" } | { kind: "waste"; itemId: string | null } | { kind: "item"; itemId: string } | null;

const WHY: Record<WasteWhyDTO, TextKey> = {
  spilled: "whySpilled",
  expired: "whyExpired",
  broken: "whyBroken",
  other: "whyOther",
};
const REASON: Record<StockMoveDTO["reason"], TextKey> = {
  start: "reasonStart",
  count: "reasonCount",
  waste: "reasonWaste",
  sale: "reasonSale",
  refund: "reasonRefund",
  bill: "reasonBill",
};

/**
 * Stok (plan piece 17): what the café has, what is out or running low, counts and waste.
 * Sales take stock away by each product's recipe (set on Menü); deliveries come in with
 * their bill on Faturalar (piece 18).
 */
export function Stock({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="stok" wide>
      {(p) => <StockPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function StockPage({ cafe, t, lang, signedOut }: PanelProps) {
  const [data, setData] = useState<StockDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => {
    api.staff.stock.get(cafe.slug).then(setData, (e: unknown) => {
      if (e instanceof PeniApiError && e.status === 401) signedOut();
      else setError(errorText(e, lang));
    });
    // Once per café; the language isn't a reason to load again.
  }, [cafe.slug]);

  const done = (next: StockDTO) => {
    setData(next);
    setOpen(null);
  };
  const out = data?.items.filter((i) => i.level === "out").length ?? 0;
  const low = data?.items.filter((i) => i.level === "low").length ?? 0;

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("stock")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("stockHelp")}</p>
        {has(cafe, "bills.add") && (
          <p className="text-sm text-muted">
            {t("deliveryCame")}{" "}
            <a className="font-semibold text-ink underline underline-offset-4" href={`/panel/faturalar?kafe=${encodeURIComponent(cafe.slug)}&yeni=1`}>
              {t("enterBill")}
            </a>
          </p>
        )}
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <dl className="flex gap-8">
              <Stat label={t("statOut")} value={String(out)} tone={out ? "red" : undefined} />
              <Stat label={t("statLow")} value={String(low)} />
              <Stat label={t("statWaste")} value={formatTL(data.wasteKurus)} />
            </dl>
            {data.canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button kind="primary" onClick={() => setOpen({ kind: "count" })} disabled={data.items.length === 0}>
                  {t("countStock")}
                </Button>
                <Button kind="secondary" onClick={() => setOpen({ kind: "waste", itemId: null })} disabled={data.items.length === 0}>
                  {t("recordWaste")}
                </Button>
                <Button kind="quiet" onClick={() => setOpen({ kind: "add" })}>
                  {t("addItem")}
                </Button>
              </div>
            )}
          </section>

          {data.items.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-3xl bg-panel p-6">
              <p className="font-serif text-2xl">{t("noStockTitle")}</p>
              <p className="leading-normal text-muted">{t("noStockHelp")}</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
              {data.items.map((i) => (
                <li key={i.id}>
                  <ItemRow t={t} lang={lang} item={i} onOpen={() => setOpen({ kind: "item", itemId: i.id })} />
                </li>
              ))}
            </ul>
          )}

          {data.moves.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-serif text-3xl">{t("recentMoves")}</h2>
              <ul className="flex flex-col divide-y divide-line-soft">
                {data.moves.map((m) => (
                  <li key={m.id}>
                    <MoveRow t={t} lang={lang} move={m} showItem />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.removed.length > 0 && (
            <details className="rounded-2xl bg-panel px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold">{fill(t("removedItems"), { n: data.removed.length })}</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {data.removed.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3">
                    <span>{i.name}</span>
                    {data.canEdit && (
                      <Button
                        kind="quiet"
                        size="sm"
                        onClick={() =>
                          void api.staff.stock.updateItem(cafe.slug, i.id, { removed: false }).then(setData, (e: unknown) => setError(errorText(e, lang)))
                        }
                      >
                        {t("bringBack")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {data && open?.kind === "add" && <AddItem t={t} lang={lang} slug={cafe.slug} onClose={() => setOpen(null)} onDone={done} />}
      {data && open?.kind === "count" && <Count t={t} lang={lang} slug={cafe.slug} items={data.items} onClose={() => setOpen(null)} onDone={done} />}
      {data && open?.kind === "waste" && (
        <Waste t={t} lang={lang} slug={cafe.slug} items={data.items} itemId={open.itemId} onClose={() => setOpen(null)} onDone={done} />
      )}
      {data && open?.kind === "item" && (
        <Item
          t={t}
          lang={lang}
          slug={cafe.slug}
          itemId={open.itemId}
          canEdit={data.canEdit}
          onClose={() => setOpen(null)}
          onDone={done}
          onWaste={() => setOpen({ kind: "waste", itemId: open.itemId })}
        />
      )}
    </>
  );
}

function levelLabel(t: T, level: StockItemDTO["level"]) {
  return level === "out" ? t("levelOut") : t("levelLow");
}

function ItemRow({ t, lang, item, onOpen }: { t: T; lang: Lang; item: StockItemDTO; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 py-4 text-left">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-lg">
          {item.name}
          {item.kind === "supply" && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{t("kindSupply")}</span>}
        </span>
        <span className="truncate text-sm text-muted">{item.usedBy.length ? item.usedBy.join(", ") : t("usedByNone")}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-xl font-semibold tabular ${item.level === "out" ? "text-red" : ""}`}>{formatQty(item.qtyMilli, item.unit, lang)}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          <LevelPill level={item.level} label={levelLabel(t, item.level)} />
          {item.minMilli > 0 &&
            fill(t("minShort"), {
              qty: formatQty(item.minMilli, item.unit, lang),
            })}
        </span>
      </span>
    </button>
  );
}

function MoveRow({ t, lang, move, showItem }: { t: T; lang: Lang; move: StockMoveDTO; showItem: boolean }) {
  const what = move.reason === "waste" && move.why ? `${t("reasonWaste")} · ${t(WHY[move.why])}` : t(REASON[move.reason]);
  const meta = [move.by, when(move.at, lang), move.note].filter(Boolean).join(" · ");
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{showItem ? `${what} · ${move.itemName}` : what}</span>
        <span className="text-sm text-muted">{meta}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {move.changeMilli === 0 ? (
          <span className="font-semibold text-muted">{t("countMatched")}</span>
        ) : (
          <span className={`font-semibold tabular ${move.changeMilli < 0 ? "" : "text-green"}`}>{formatChange(move.changeMilli, move.unit, lang)}</span>
        )}
        {move.reason === "waste" && move.valueKurus !== null ? (
          <span className="text-sm text-muted tabular">{formatTL(move.valueKurus)}</span>
        ) : (
          <span className="text-sm text-muted tabular">
            {fill(t("leaves"), {
              qty: formatQty(move.afterMilli, move.unit, lang),
            })}
          </span>
        )}
      </span>
    </div>
  );
}

type SheetProps = {
  t: T;
  lang: Lang;
  slug: string;
  onClose: () => void;
  onDone: (d: StockDTO) => void;
};

function AddItem({ t, lang, slug, onClose, onDone }: SheetProps) {
  const key = useRef(newIdempotencyKey());
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StockItemDTO["kind"]>("ingredient");
  const [unit, setUnit] = useState<StockItemDTO["unit"]>("kg");
  const [now, setNow] = useState("");
  const [min, setMin] = useState("");
  const [cost, setCost] = useState("");
  const save = useSave(lang, onDone);
  const startMilli = parseBig(now);
  const minMilli = min.trim() ? parseBig(min) : 0;
  const costKurus = cost.trim() ? parseTL(cost) : null;
  const ready = name.trim() && startMilli !== null && minMilli !== null && (!cost.trim() || costKurus !== null);
  const u = bigUnit(unit, lang);
  return (
    <Sheet title={t("addItem")} onClose={onClose} labelClose={t("close")}>
      <Field label={t("itemName")} value={name} onChange={setName} placeholder={t("itemNamePlaceholder")} autoFocus maxLength={60} />
      <Segmented
        label={t("itemKind")}
        value={kind}
        onChange={setKind}
        options={[
          { value: "ingredient", label: t("kindIngredient") },
          { value: "supply", label: t("kindSupplyLong") },
        ]}
      />
      <Segmented
        label={t("itemUnit")}
        value={unit}
        onChange={setUnit}
        options={[
          { value: "kg", label: "kg" },
          { value: "l", label: "L" },
          { value: "adet", label: lang === "tr" ? "adet" : "pieces" },
        ]}
      />
      <Field label={t("itemNow")} value={now} onChange={setNow} suffix={u} inputMode="decimal" placeholder="0" />
      <Field label={t("itemMin")} value={min} onChange={setMin} suffix={u} inputMode="decimal" hint={t("itemMinHelp")} />
      <Field label={fill(t("itemCost"), { unit: u })} value={cost} onChange={setCost} suffix="₺" inputMode="decimal" hint={t("itemCostHelp")} />
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <Button
        kind="primary"
        size="lg"
        disabled={!ready || save.busy}
        onClick={() =>
          save.run(() =>
            api.staff.stock.addItem(slug, {
              key: key.current,
              name: name.trim(),
              kind,
              unit,
              startMilli: startMilli!,
              minMilli: minMilli!,
              costKurus,
            }),
          )
        }
      >
        {t("addItem")}
      </Button>
    </Sheet>
  );
}

function Count({ t, lang, slug, items, onClose, onDone }: SheetProps & { items: StockItemDTO[] }) {
  const key = useRef(newIdempotencyKey());
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [note, setNote] = useState("");
  const save = useSave(lang, onDone);
  const counts = Object.entries(typed)
    .filter(([, v]) => v.trim())
    .map(([itemId, v]) => ({ itemId, countedMilli: parseBig(v) }));
  const bad = counts.some((c) => c.countedMilli === null);
  const shown = useMemo(() => {
    const f = filter.trim().toLocaleLowerCase("tr");
    return f ? items.filter((i) => i.name.toLocaleLowerCase("tr").includes(f)) : items;
  }, [filter, items]);
  return (
    <Sheet title={t("countStock")} onClose={onClose} labelClose={t("close")} wide>
      <p className="-mt-2 text-sm leading-normal text-muted">{t("countHelp")}</p>
      {items.length > 8 && (
        <input className={`${field} min-h-12`} placeholder={t("search")} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("search")} />
      )}
      <ul className="flex flex-col divide-y divide-line-soft">
        {shown.map((i) => {
          const v = typed[i.id] ?? "";
          const counted = v.trim() ? parseBig(v) : null;
          return (
            <li key={i.id} className="flex items-center justify-between gap-4 py-3">
              <span className="flex min-w-0 flex-col">
                <span>{i.name}</span>
                <span className="text-sm text-muted">
                  {fill(t("shouldBe"), {
                    qty: formatQty(i.qtyMilli, i.unit, lang),
                  })}
                  {counted !== null && counted !== i.qtyMilli && ` · ${formatChange(counted - i.qtyMilli, i.unit, lang)}`}
                </span>
              </span>
              <span className="relative flex w-36 shrink-0 items-center">
                <input
                  className={`${field} min-h-12 pr-14 text-right tabular ${v.trim() && counted === null ? "border-red" : ""}`}
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => setTyped((x) => ({ ...x, [i.id]: e.target.value }))}
                  aria-label={fill(t("countedOf"), { name: i.name })}
                />
                <span className="pointer-events-none absolute right-4 text-muted">{bigUnit(i.unit, lang)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <Field label={t("noteOptional")} value={note} onChange={setNote} placeholder={t("countNotePlaceholder")} maxLength={200} />
      <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col gap-3 bg-paper px-6 pt-3 pb-6">
        {save.error && <Notice tone="red">{save.error}</Notice>}
        <Button
          kind="primary"
          size="lg"
          disabled={counts.length === 0 || bad || save.busy}
          onClick={() =>
            save.run(() =>
              api.staff.stock.count(slug, {
                key: key.current,
                counts: counts.map((c) => ({
                  itemId: c.itemId,
                  countedMilli: c.countedMilli!,
                })),
                note: note.trim() || undefined,
              }),
            )
          }
        >
          {counts.length ? fill(t("saveCountN"), { n: counts.length }) : t("saveCount")}
        </Button>
      </div>
    </Sheet>
  );
}

function Waste({ t, lang, slug, items, itemId, onClose, onDone }: SheetProps & { items: StockItemDTO[]; itemId: string | null }) {
  const key = useRef(newIdempotencyKey());
  const [id, setId] = useState(itemId ?? "");
  const [qty, setQty] = useState("");
  const [why, setWhy] = useState<WasteWhyDTO>("spilled");
  const [note, setNote] = useState("");
  const save = useSave(lang, onDone);
  const item = items.find((i) => i.id === id);
  const milli = parseBig(qty);
  const ready = item && milli && milli > 0 && (why !== "other" || note.trim());
  return (
    <Sheet title={t("recordWaste")} onClose={onClose} labelClose={t("close")}>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("wasteWhat")}
        <select className={`${field} min-h-12`} value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">{t("pickItem")}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <Field label={t("wasteHowMuch")} value={qty} onChange={setQty} suffix={item ? bigUnit(item.unit, lang) : undefined} inputMode="decimal" />
      <Segmented
        label={t("wasteWhy")}
        value={why}
        onChange={setWhy}
        options={(Object.keys(WHY) as WasteWhyDTO[]).map((w) => ({
          value: w,
          label: t(WHY[w]),
        }))}
      />
      <Field label={why === "other" ? t("wasteNote") : t("noteOptional")} value={note} onChange={setNote} maxLength={200} />
      {item && milli && milli > 0 && item.costKurus !== null ? (
        <p className="text-sm text-muted">
          {fill(t("wasteWorth"), {
            tl: formatTL(Math.round((milli * item.costKurus) / 1000)),
          })}
        </p>
      ) : null}
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <Button
        kind="primary"
        size="lg"
        disabled={!ready || save.busy}
        onClick={() =>
          save.run(() =>
            api.staff.stock.waste(slug, {
              key: key.current,
              itemId: id,
              qtyMilli: milli!,
              why,
              note: note.trim() || undefined,
            }),
          )
        }
      >
        {t("saveWaste")}
      </Button>
    </Sheet>
  );
}

function Item({ t, lang, slug, itemId, canEdit, onClose, onDone, onWaste }: SheetProps & { itemId: string; canEdit: boolean; onWaste: () => void }) {
  const [history, setHistory] = useState<StockItemHistoryDTO | null>(null);
  const [form, setForm] = useState<{
    name: string;
    kind: StockItemDTO["kind"];
    unit: StockItemDTO["unit"];
    min: string;
    cost: string;
  } | null>(null);
  const save = useSave(lang, onDone);
  useEffect(() => {
    api.staff.stock.item(slug, itemId).then(
      (h) => {
        setHistory(h);
        setForm({
          name: h.item.name,
          kind: h.item.kind,
          unit: h.item.unit,
          min: h.item.minMilli ? bigInput(h.item.minMilli) : "",
          cost: tlInput(h.item.costKurus),
        });
      },
      (e: unknown) => save.setError(errorText(e, lang)),
    );
    // Once per item.
  }, [slug, itemId]);
  const item = history?.item;
  const minMilli = form && (form.min.trim() ? parseBig(form.min) : 0);
  const costKurus = form && (form.cost.trim() ? parseTL(form.cost) : null);
  const valid = form && form.name.trim() && minMilli !== null && (!form.cost.trim() || costKurus !== null);
  const u = form ? bigUnit(form.unit, lang) : "";
  return (
    <Sheet title={item?.name ?? t("loading")} onClose={onClose} labelClose={t("close")} wide>
      {item && form && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className={`text-4xl font-semibold tabular ${item.level === "out" ? "text-red" : ""}`}>{formatQty(item.qtyMilli, item.unit, lang)}</span>
              <span className="flex items-center gap-2 text-sm text-muted">
                <LevelPill level={item.level} label={levelLabel(t, item.level)} />
                {item.countedAt ? fill(t("countedAt"), { when: when(item.countedAt, lang) }) : t("neverCounted")}
              </span>
            </div>
            {canEdit && (
              <Button kind="secondary" onClick={onWaste}>
                {t("recordWaste")}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted">{item.usedBy.length ? fill(t("usedBy"), { names: item.usedBy.join(", ") }) : t("usedByNoneLong")}</p>
          {item.qtyMilli < 0 && <Notice>{t("belowZeroHelp")}</Notice>}

          {canEdit && (
            <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
              <Field label={t("itemName")} value={form.name} onChange={(name) => setForm({ ...form, name })} maxLength={60} />
              <Segmented
                label={t("itemKind")}
                value={form.kind}
                onChange={(kind) => setForm({ ...form, kind })}
                options={[
                  { value: "ingredient", label: t("kindIngredient") },
                  { value: "supply", label: t("kindSupplyLong") },
                ]}
              />
              <Segmented
                label={item.unitLocked ? `${t("itemUnit")} · ${t("unitLocked")}` : t("itemUnit")}
                value={form.unit}
                onChange={(unit) => setForm({ ...form, unit })}
                disabled={item.unitLocked}
                options={[
                  { value: "kg", label: "kg" },
                  { value: "l", label: "L" },
                  { value: "adet", label: lang === "tr" ? "adet" : "pieces" },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("itemMin")}
                  value={form.min}
                  onChange={(min) => setForm({ ...form, min })}
                  suffix={u}
                  inputMode="decimal"
                  hint={t("itemMinHelp")}
                />
                <Field
                  label={fill(t("itemCost"), { unit: u })}
                  value={form.cost}
                  onChange={(cost) => setForm({ ...form, cost })}
                  suffix="₺"
                  inputMode="decimal"
                  hint={t("itemCostHelp")}
                />
              </div>
              {save.error && <Notice tone="red">{save.error}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button
                  kind="primary"
                  disabled={!valid || save.busy}
                  onClick={() =>
                    save.run(() =>
                      api.staff.stock.updateItem(slug, item.id, {
                        name: form.name.trim(),
                        kind: form.kind,
                        ...(item.unitLocked ? {} : { unit: form.unit }),
                        minMilli: minMilli!,
                        costKurus,
                      }),
                    )
                  }
                >
                  {t("save")}
                </Button>
                <Button
                  kind="bare"
                  disabled={save.busy}
                  onClick={() =>
                    save.run(() =>
                      api.staff.stock.updateItem(slug, item.id, {
                        removed: true,
                      }),
                    )
                  }
                >
                  {t("removeItem")}
                </Button>
              </div>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="font-serif text-2xl">{t("history")}</h3>
            {history.moves.length === 0 ? (
              <p className="text-sm text-muted">{t("noHistory")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft">
                {history.moves.map((m) => (
                  <li key={m.id}>
                    <MoveRow t={t} lang={lang} move={m} showItem={false} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {!item && save.error && <Notice tone="red">{save.error}</Notice>}
    </Sheet>
  );
}
