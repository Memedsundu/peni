"use client";

import {
  PeniApiError,
  type RecipeDTO,
  type RecipeDraftDTO,
  type RecipeDraftsDTO,
  type RecipesDTO,
  type StaffMenuDTO,
  type StockModeDTO,
  type StockUnitDTO,
} from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Photo, Sheet } from "../../kasa/ui";
import { formatQty, parseSmall, parseTL, smallInput, smallUnit, tlInput } from "../amounts";
import { Field, Segmented } from "../controls";
import { field, has, PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T } from "../text";

type Items = RecipesDTO["items"];
type Line = { itemId: string; qty: string };

/**
 * Menü (plan pieces 5 and 17): every product with its price and, from its recipe and the
 * items' prices, what one costs and what it leaves (D30). A manager edits products and
 * recipes; a chef edits recipes only. For a product with no recipe, the assistant can write
 * a draft that the person checks and confirms (D21).
 */
export function Menu({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="menu" wide>
      {(p) => <MenuPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function MenuPage({ cafe, t, lang, signedOut }: PanelProps) {
  const canEdit = has(cafe, "menu.edit");
  const canRecipes = has(cafe, "menu.recipes");
  const [menu, setMenu] = useState<StaffMenuDTO | null>(null);
  const [recipes, setRecipes] = useState<RecipesDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [drafts, setDrafts] = useState<RecipeDraftsDTO | null>(null);
  // Products the assistant is writing for right now, and the "write all" run's progress.
  const [writing, setWriting] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(0);

  const fail = (e: unknown) => {
    if (e instanceof PeniApiError && e.status === 401) signedOut();
    else setError(errorText(e, lang));
  };
  const reload = () =>
    Promise.all([
      canEdit ? api.staff.menu.get(cafe.slug).then(setMenu) : null,
      canRecipes ? api.staff.menu.recipes(cafe.slug).then(setRecipes) : null,
      canRecipes ? api.staff.menu.recipeDrafts(cafe.slug).then(setDrafts) : null,
    ]).catch(fail);

  /** One draft; true when written. Stops the run when the assistant is off or the day's drafts are used up. */
  const writeOne = async (productId: string): Promise<"ok" | "failed" | "stop"> => {
    setWriting((w) => new Set(w).add(productId));
    try {
      setDrafts(await api.staff.menu.draftRecipe(cafe.slug, productId));
      return "ok";
    } catch (e) {
      fail(e);
      return e instanceof PeniApiError && ["RECIPE_AI_OFF", "RECIPE_DRAFT_LIMIT", "NEEDS_PASSWORD", "FORBIDDEN"].includes(e.code) ? "stop" : "failed";
    } finally {
      setWriting((w) => {
        const next = new Set(w);
        next.delete(productId);
        return next;
      });
    }
  };
  // "Eksik reçetelerin hepsini yaz": two at a time, in menu order, each kept as it arrives.
  const writeAll = async () => {
    const queue = [...(drafts?.missing ?? [])];
    setError(null);
    setFailed(0);
    setBulk({ done: 0, total: queue.length });
    let stop = false;
    const worker = async () => {
      while (!stop && queue.length) {
        const r = await writeOne(queue.shift()!);
        if (r === "stop") stop = true;
        setBulk((b) => b && { ...b, done: b.done + 1 });
        if (r !== "ok") setFailed((f) => f + 1);
      }
    };
    await Promise.all([worker(), worker()]);
    setBulk(null);
  };
  useEffect(() => {
    void reload();
    // Once per café.
  }, [cafe.slug]);

  // The product list: from recipes when this person sees them (with costs), else from the menu.
  const products: Product[] = recipes
    ? recipes.recipes.map((r) => ({
        ...r,
        available: menu?.products.find((p) => p.productId === r.productId)?.available ?? true,
      }))
    : (menu?.products ?? []).map((p) => ({
        productId: p.productId,
        name: p.name,
        category: p.category,
        priceKurus: p.priceKurus,
        imageUrl: p.imageUrl,
        available: p.available,
      }));
  const categories = [...new Set(products.map((p) => p.category))];
  const tracked = recipes?.recipes.filter((r) => r.mode !== "none").length ?? 0;
  const draftOf = new Map((drafts?.drafts ?? []).map((d) => [d.productId, d]));
  const missing = new Set(drafts?.missing ?? []);
  const opened = open && open !== "new" ? products.find((p) => p.productId === open) : undefined;
  const openDraft = opened ? draftOf.get(opened.productId) : undefined;
  const ready = (canEdit ? menu : true) && (canRecipes ? recipes : true);

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("menu")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{canRecipes ? t("menuHelp") : t("menuHelpNoCost")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {ready && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {recipes && (
              <p className="text-sm text-muted">
                {fill(t("trackedOf"), {
                  n: tracked,
                  total: recipes.recipes.length,
                })}
              </p>
            )}
            {canEdit && (
              <Button kind="primary" onClick={() => setOpen("new")}>
                {t("addProduct")}
              </Button>
            )}
          </div>
          {drafts && (drafts.missing.length > 0 || drafts.drafts.length > 0) && (
            <AssistantBar t={t} drafts={drafts} bulk={bulk} failed={failed} busy={bulk !== null || writing.size > 0} onWriteAll={() => void writeAll()} />
          )}
          {categories.map((c) => (
            <section key={c} className="flex flex-col gap-1">
              <h2 className="font-serif text-3xl">{c}</h2>
              <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                {products
                  .filter((p) => p.category === c)
                  .map((p) => (
                    <li key={p.productId}>
                      <ProductRow t={t} product={p} draft={draftOf.get(p.productId)} onOpen={() => setOpen(p.productId)} />
                      {missing.has(p.productId) && drafts?.ai !== "off" && (
                        <div className="-mt-2 pb-3 pl-18">
                          <Button kind="quiet" size="sm" disabled={writing.has(p.productId) || bulk !== null} onClick={() => void writeOne(p.productId)}>
                            {t(writing.has(p.productId) ? "rdWritingOne" : "rdWriteOne")}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {open === "new" && menu && (
        <AddProduct
          t={t}
          lang={lang}
          slug={cafe.slug}
          menu={menu}
          onClose={() => setOpen(null)}
          onDone={(next) => {
            setMenu(next);
            setOpen(null);
            void reload();
          }}
        />
      )}
      {opened && openDraft && recipes && drafts && (
        <DraftSheet
          key={openDraft.id}
          t={t}
          lang={lang}
          slug={cafe.slug}
          draft={openDraft}
          priceKurus={opened.priceKurus}
          items={recipes.items}
          canAddItems={drafts.canAddItems}
          onClose={() => setOpen(null)}
          onDone={async () => {
            await reload();
            setOpen(null);
          }}
        />
      )}
      {opened && !openDraft && (
        <ProductSheet
          key={open}
          t={t}
          lang={lang}
          slug={cafe.slug}
          product={opened}
          menu={menu}
          items={recipes?.items ?? null}
          onClose={() => setOpen(null)}
          onDone={async () => {
            await reload();
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

type Product = Pick<RecipeDTO, "productId" | "name" | "category" | "priceKurus" | "imageUrl"> & { available: boolean } & Partial<
    Pick<RecipeDTO, "mode" | "lines" | "costKurus" | "unpriced">
  >;

function margin(price: number, cost: number): number {
  return price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
}

function ProductRow({ t, product: p, draft, onOpen }: { t: T; product: Product; draft?: RecipeDraftDTO; onOpen: () => void }) {
  let costLine: string | null = null;
  if (draft) costLine = draft.costKurus !== null ? fill(t("rdReadyCost"), { cost: formatTL(draft.costKurus) }) : t("rdReady");
  else if (p.mode === "none") costLine = t("modeNoneShort");
  else if (p.mode && p.costKurus === null) costLine = t("costUnknown");
  else if (p.mode && p.costKurus !== null && p.costKurus !== undefined)
    costLine = fill(t("costAndMargin"), {
      cost: formatTL(p.costKurus),
      pct: margin(p.priceKurus, p.costKurus),
    });
  return (
    <button type="button" onClick={onOpen} className="flex min-h-16 w-full cursor-pointer items-center gap-4 py-3 text-left">
      <Photo src={p.imageUrl} alt="" label="" className="size-14 shrink-0 rounded-2xl" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-lg">
          {p.name}
          {!p.available && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{t("offTill")}</span>}
        </span>
        {costLine && (
          <span className={`text-sm ${draft ? "font-semibold text-green" : p.mode && p.costKurus === null && p.mode !== "none" ? "text-red" : "text-muted"}`}>
            {costLine}
          </span>
        )}
      </span>
      <span className="shrink-0 text-lg font-semibold tabular">{formatTL(p.priceKurus)}</span>
    </button>
  );
}

function AddProduct({
  t,
  lang,
  slug,
  menu,
  onClose,
  onDone,
}: {
  t: T;
  lang: Lang;
  slug: string;
  menu: StaffMenuDTO;
  onClose: () => void;
  onDone: (m: StaffMenuDTO) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState(menu.categories[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceKurus = parseTL(price);
  return (
    <Sheet title={t("addProduct")} onClose={onClose} labelClose={t("close")}>
      <Field label={t("productName")} value={name} onChange={setName} autoFocus maxLength={60} />
      <Field label={t("productPrice")} value={price} onChange={setPrice} suffix="₺" inputMode="decimal" />
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("productCategory")}
        <select className={`${field} min-h-12`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {menu.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted">{t("addProductHelp")}</p>
      {error && <Notice tone="red">{error}</Notice>}
      <Button
        kind="primary"
        size="lg"
        disabled={!name.trim() || priceKurus === null || !categoryId || busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          api.staff.menu
            .addProduct(slug, {
              name: name.trim(),
              priceKurus: priceKurus!,
              categoryId,
            })
            .then(onDone, (e: unknown) => {
              setError(errorText(e, lang));
              setBusy(false);
            });
        }}
      >
        {t("addProduct")}
      </Button>
    </Sheet>
  );
}

function ProductSheet({
  t,
  lang,
  slug,
  product,
  menu,
  items,
  onClose,
  onDone,
}: {
  t: T;
  lang: Lang;
  slug: string;
  product: Product;
  menu: StaffMenuDTO | null;
  items: Items | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const full = menu?.products.find((p) => p.productId === product.productId) ?? null;
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(tlInput(product.priceKurus));
  const [categoryId, setCategoryId] = useState(full?.categoryId ?? "");
  const [available, setAvailable] = useState(product.available);
  const [mode, setMode] = useState<StockModeDTO>(product.mode ?? "none");
  const unitOf = (id: string) => items?.find((i) => i.id === id)?.unit ?? "adet";
  const [lines, setLines] = useState<Line[]>(() =>
    (product.lines ?? []).map((l) => ({
      itemId: l.itemId,
      qty: smallInput(l.qtyMilli, unitOf(l.itemId)),
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pieces = items?.filter((i) => i.unit === "adet") ?? [];
  const priceKurus = parseTL(price);
  const parsed = lines.map((l) => ({
    itemId: l.itemId,
    qtyMilli: l.itemId ? parseSmall(l.qty, unitOf(l.itemId)) : null,
  }));
  const recipeOk = mode === "none" || (parsed.length > 0 && parsed.every((l) => l.itemId && l.qtyMilli && l.qtyMilli > 0));
  // The cost as it stands on screen, before saving.
  const priced = parsed.map((l) => ({
    ...l,
    item: items?.find((i) => i.id === l.itemId),
  }));
  const unpriced = priced.filter((l) => l.item && l.item.costKurus === null).map((l) => l.item!.name);
  const cost =
    mode !== "none" && recipeOk && unpriced.length === 0 ? Math.round(priced.reduce((s, l) => s + (l.qtyMilli! * (l.item?.costKurus ?? 0)) / 1000, 0)) : null;
  const shownPrice = priceKurus ?? product.priceKurus;

  const productChanged =
    !!menu && (name.trim() !== product.name || priceKurus !== product.priceKurus || categoryId !== (full?.categoryId ?? "") || available !== product.available);
  const recipeChanged =
    !!items &&
    (mode !== (product.mode ?? "none") ||
      JSON.stringify(mode === "none" ? [] : parsed) !==
        JSON.stringify(
          (product.lines ?? []).map((l) => ({
            itemId: l.itemId,
            qtyMilli: l.qtyMilli,
          })),
        ));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (productChanged)
        await api.staff.menu.updateProduct(slug, product.productId, {
          name: name.trim(),
          priceKurus: priceKurus!,
          categoryId,
          available,
        });
      if (recipeChanged) {
        await api.staff.menu.saveRecipe(slug, product.productId, {
          mode,
          lines:
            mode === "none"
              ? []
              : parsed.map((l) => ({
                  itemId: l.itemId,
                  qtyMilli: l.qtyMilli!,
                })),
        });
      }
      await onDone();
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };

  const pickMode = (m: StockModeDTO) => {
    setMode(m);
    // "Adet olarak" is one item counted in pieces, one per sale.
    if (m === "counted")
      setLines([
        {
          itemId: lines.find((l) => unitOf(l.itemId) === "adet")?.itemId ?? "",
          qty: "1",
        },
      ]);
    if (m === "recipe" && lines.length === 0) setLines([{ itemId: "", qty: "" }]);
  };

  return (
    <Sheet title={product.name} onClose={onClose} labelClose={t("close")} wide>
      {menu ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label={t("productName")} value={name} onChange={setName} maxLength={60} />
          <Field label={t("productPrice")} value={price} onChange={setPrice} suffix="₺" inputMode="decimal" />
          <label className="flex flex-col gap-2 text-sm text-muted">
            {t("productCategory")}
            <select className={`${field} min-h-12`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {menu.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Segmented
            label={t("onTill")}
            value={available ? "on" : "off"}
            onChange={(v) => setAvailable(v === "on")}
            options={[
              { value: "on", label: t("onTillYes") },
              { value: "off", label: t("onTillNo") },
            ]}
          />
        </section>
      ) : (
        <p className="text-lg tabular">{formatTL(product.priceKurus)}</p>
      )}

      {items && (
        <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
          <Segmented
            label={t("stockModeQuestion")}
            value={mode}
            onChange={pickMode}
            options={[
              { value: "recipe", label: t("modeRecipe") },
              { value: "counted", label: t("modeCounted") },
              { value: "none", label: t("modeNone") },
            ]}
          />
          <p className="-mt-2 text-sm leading-normal text-muted">
            {t(mode === "recipe" ? "modeRecipeHelp" : mode === "counted" ? "modeCountedHelp" : "modeNoneHelp")}
          </p>

          {mode === "recipe" && (
            <>
              <ul className="flex flex-col gap-3">
                {lines.map((l, n) => {
                  const unit = unitOf(l.itemId);
                  const item = items.find((i) => i.id === l.itemId);
                  const milli = l.itemId ? parseSmall(l.qty, unit) : null;
                  const lineCost = item?.costKurus !== null && item?.costKurus !== undefined && milli ? Math.round((milli * item.costKurus) / 1000) : null;
                  return (
                    <li key={n} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_5rem_auto]">
                      <select
                        className={`${field} col-span-3 min-h-12 min-w-0 sm:col-span-1`}
                        value={l.itemId}
                        onChange={(e) => setLines(lines.map((x, i) => (i === n ? { ...x, itemId: e.target.value } : x)))}
                        aria-label={t("recipeItem")}
                      >
                        <option value="">{t("pickItem")}</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id} disabled={i.id !== l.itemId && lines.some((x) => x.itemId === i.id)}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                      <span className="relative flex items-center">
                        <input
                          className={`${field} min-h-12 pr-14 text-right tabular`}
                          inputMode="decimal"
                          value={l.qty}
                          onChange={(e) => setLines(lines.map((x, i) => (i === n ? { ...x, qty: e.target.value } : x)))}
                          aria-label={t("recipeQty")}
                        />
                        <span className="pointer-events-none absolute right-4 text-muted">{smallUnit(unit, lang)}</span>
                      </span>
                      <span className="w-20 text-right text-sm text-muted tabular sm:w-auto">{lineCost !== null ? formatTL(lineCost) : ""}</span>
                      <Button kind="bare" size="sm" onClick={() => setLines(lines.filter((_, i) => i !== n))} aria-label={t("removeLine")}>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <div>
                <Button
                  kind="quiet"
                  size="sm"
                  onClick={() => setLines([...lines, { itemId: "", qty: "" }])}
                  disabled={lines.length >= 20 || items.length === 0}
                >
                  {t("addLine")}
                </Button>
              </div>
            </>
          )}

          {mode === "counted" &&
            (pieces.length === 0 ? (
              <Notice>{t("noPieceItems")}</Notice>
            ) : (
              <label className="flex flex-col gap-2 text-sm text-muted">
                {t("countedItem")}
                <select className={`${field} min-h-12`} value={lines[0]?.itemId ?? ""} onChange={(e) => setLines([{ itemId: e.target.value, qty: "1" }])}>
                  <option value="">{t("pickItem")}</option>
                  {pieces.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}

          {mode !== "none" && (
            <div className="flex flex-col gap-1 border-t border-line pt-4">
              {cost !== null ? (
                <p className="text-lg">
                  {fill(t("costOfOne"), { cost: formatTL(cost) })}
                  <span className="text-muted">
                    {" · "}
                    {fill(t("leavesProfit"), {
                      profit: formatTL(shownPrice - cost),
                      pct: margin(shownPrice, cost),
                    })}
                  </span>
                </p>
              ) : unpriced.length > 0 ? (
                <p className="text-sm text-muted">{fill(t("unpricedItems"), { names: unpriced.join(", ") })}</p>
              ) : null}
              {mode === "recipe" && recipeOk && (
                <p className="text-xs text-muted">
                  {fill(t("perSale"), {
                    list: priced.map((l) => `${formatQty(l.qtyMilli!, l.item?.unit ?? "adet", lang)} ${l.item?.name ?? ""}`).join(", "),
                  })}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col gap-3 bg-paper px-6 pt-3 pb-6">
        {error && <Notice tone="red">{error}</Notice>}
        <Button
          kind="primary"
          size="lg"
          disabled={busy || (!productChanged && !recipeChanged) || !recipeOk || (!!menu && (!name.trim() || priceKurus === null))}
          onClick={() => void save()}
        >
          {t("save")}
        </Button>
      </div>
    </Sheet>
  );
}

/** Above the menu: how many products have no recipe, "write all", and drafts waiting to be checked. */
function AssistantBar({
  t,
  drafts,
  bulk,
  failed,
  busy,
  onWriteAll,
}: {
  t: T;
  drafts: RecipeDraftsDTO;
  bulk: { done: number; total: number } | null;
  failed: number;
  busy: boolean;
  onWriteAll: () => void;
}) {
  const n = drafts.missing.length;
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-green-soft p-5">
      {n > 0 && <p className="max-w-2xl leading-normal">{fill(t(drafts.ai === "off" ? "rdBarOff" : "rdBar"), { n })}</p>}
      {drafts.drafts.length > 0 && <p className="text-sm font-semibold text-green">{fill(t("rdWaiting"), { n: drafts.drafts.length })}</p>}
      {!bulk && failed > 0 && <p className="text-sm text-red">{fill(t("rdSomeFailed"), { n: failed })}</p>}
      {n > 0 && drafts.ai !== "off" && (
        <div>
          <Button kind="primary" disabled={busy || drafts.left === 0} onClick={onWriteAll}>
            {bulk ? fill(t("rdWriting"), { done: bulk.done, total: bulk.total }) : t("rdWriteAll")}
          </Button>
        </div>
      )}
    </section>
  );
}

/** A line as edited: one of the café's items by id, or one of the draft's new items as "new:0". */
type DraftLine = { ref: string; qty: string };
type NewItem = RecipeDraftDTO["newItems"][number];

/**
 * The assistant's draft, to check (D21): the same choices as a recipe in Menü, plus the
 * items it needs that Stok doesn't have yet, which are added when it's confirmed. Letting
 * it go leaves the product as it was.
 */
function DraftSheet({
  t,
  lang,
  slug,
  draft,
  priceKurus,
  items,
  canAddItems,
  onClose,
  onDone,
}: {
  t: T;
  lang: Lang;
  slug: string;
  draft: RecipeDraftDTO;
  priceKurus: number;
  items: Items;
  canAddItems: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState<StockModeDTO>(draft.mode);
  const [newItems, setNewItems] = useState<NewItem[]>(draft.newItems);
  const refOf = (l: RecipeDraftDTO["lines"][number]) => (l.itemId !== null ? l.itemId : `new:${l.newItem}`);
  const newOf = (ref: string) => (ref.startsWith("new:") ? Number(ref.slice(4)) : null);
  const unitOf = (ref: string): StockUnitDTO => {
    const n = newOf(ref);
    return n !== null ? (newItems[n]?.unit ?? "adet") : (items.find((i) => i.id === ref)?.unit ?? "adet");
  };
  const nameOf = (ref: string) => {
    const n = newOf(ref);
    return n !== null ? fill(t("rdNewTag"), { name: newItems[n]?.name ?? "" }) : (items.find((i) => i.id === ref)?.name ?? "");
  };
  const [lines, setLines] = useState<DraftLine[]>(() => draft.lines.map((l) => ({ ref: refOf(l), qty: smallInput(l.qtyMilli, l.itemId !== null ? unitOf(l.itemId) : (draft.newItems[l.newItem!]?.unit ?? "adet")) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = lines.map((l) => ({ ref: l.ref, qtyMilli: l.ref ? parseSmall(l.qty, unitOf(l.ref)) : null }));
  const used = new Set(mode === "none" ? [] : parsed.map((l) => newOf(l.ref)).filter((n): n is number => n !== null));
  const recipeOk =
    mode === "none" ||
    (parsed.length > 0 && parsed.every((l) => l.ref && l.qtyMilli && l.qtyMilli > 0) && [...used].every((n) => newItems[n]?.name.trim()));
  const blocked = used.size > 0 && !canAddItems;
  // The cost as it stands on screen; a new item has no price until its first bill.
  const unpriced = parsed
    .filter((l) => l.ref && (newOf(l.ref) !== null || items.find((i) => i.id === l.ref)?.costKurus === null))
    .map((l) => nameOf(l.ref));
  const cost =
    mode !== "none" && recipeOk && unpriced.length === 0
      ? Math.round(parsed.reduce((s, l) => s + (l.qtyMilli! * (items.find((i) => i.id === l.ref)?.costKurus ?? 0)) / 1000, 0))
      : null;
  const choices = [
    ...items.map((i) => ({ ref: i.id, label: i.name, unit: i.unit })),
    ...newItems.map((x, n) => ({ ref: `new:${n}`, label: fill(t("rdNew"), { name: x.name }), unit: x.unit })),
  ];

  const pickMode = (m: StockModeDTO) => {
    setMode(m);
    if (m === "counted") setLines([{ ref: lines.find((l) => l.ref && unitOf(l.ref) === "adet")?.ref ?? "", qty: "1" }]);
    if (m === "recipe" && lines.length === 0) setLines([{ ref: "", qty: "" }]);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onDone();
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };
  const confirm = () =>
    run(() =>
      api.staff.menu.confirmRecipeDraft(slug, draft.id, {
        mode,
        lines:
          mode === "none"
            ? []
            : parsed.map((l) => ({ itemId: newOf(l.ref) === null ? l.ref : null, newItem: newOf(l.ref), qtyMilli: l.qtyMilli! })),
        newItems: newItems.map((x) => ({ ...x, name: x.name.trim() })),
      }),
    );

  return (
    <Sheet title={draft.productName} onClose={onClose} labelClose={t("close")} wide>
      <section className="flex flex-col gap-2 rounded-3xl bg-green-soft p-5">
        <p className="font-semibold text-green">{t("rdBanner")}</p>
        {draft.reason && <p className="text-sm">{draft.reason}</p>}
        {draft.notes.length > 0 && (
          <ul className="list-disc pl-5 text-sm leading-normal">
            {draft.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
        <Segmented
          label={t("stockModeQuestion")}
          value={mode}
          onChange={pickMode}
          options={[
            { value: "recipe", label: t("modeRecipe") },
            { value: "counted", label: t("modeCounted") },
            { value: "none", label: t("modeNone") },
          ]}
        />
        <p className="-mt-2 text-sm leading-normal text-muted">
          {t(mode === "recipe" ? "modeRecipeHelp" : mode === "counted" ? "modeCountedHelp" : "modeNoneHelp")}
        </p>

        {mode === "recipe" && (
          <>
            <ul className="flex flex-col gap-3">
              {lines.map((l, n) => {
                const unit = l.ref ? unitOf(l.ref) : "adet";
                const price = items.find((i) => i.id === l.ref)?.costKurus;
                const milli = l.ref ? parseSmall(l.qty, unit) : null;
                const lineCost = price !== null && price !== undefined && milli ? Math.round((milli * price) / 1000) : null;
                return (
                  <li key={n} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_5rem_auto]">
                    <select
                      className={`${field} col-span-3 min-h-12 min-w-0 sm:col-span-1`}
                      value={l.ref}
                      onChange={(e) => setLines(lines.map((x, i) => (i === n ? { ...x, ref: e.target.value } : x)))}
                      aria-label={t("recipeItem")}
                    >
                      <option value="">{t("pickItem")}</option>
                      {choices.map((c) => (
                        <option key={c.ref} value={c.ref} disabled={c.ref !== l.ref && lines.some((x) => x.ref === c.ref)}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className="relative flex items-center">
                      <input
                        className={`${field} min-h-12 pr-14 text-right tabular`}
                        inputMode="decimal"
                        value={l.qty}
                        onChange={(e) => setLines(lines.map((x, i) => (i === n ? { ...x, qty: e.target.value } : x)))}
                        aria-label={t("recipeQty")}
                      />
                      <span className="pointer-events-none absolute right-4 text-muted">{smallUnit(unit, lang)}</span>
                    </span>
                    <span className="w-20 text-right text-sm text-muted tabular sm:w-auto">{lineCost !== null ? formatTL(lineCost) : ""}</span>
                    <Button kind="bare" size="sm" onClick={() => setLines(lines.filter((_, i) => i !== n))} aria-label={t("removeLine")}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div>
              <Button kind="quiet" size="sm" onClick={() => setLines([...lines, { ref: "", qty: "" }])} disabled={lines.length >= 20 || choices.length === 0}>
                {t("addLine")}
              </Button>
            </div>
          </>
        )}

        {mode === "counted" && (
          <label className="flex flex-col gap-2 text-sm text-muted">
            {t("countedItem")}
            <select className={`${field} min-h-12`} value={lines[0]?.ref ?? ""} onChange={(e) => setLines([{ ref: e.target.value, qty: "1" }])}>
              <option value="">{t("pickItem")}</option>
              {choices
                .filter((c) => c.unit === "adet")
                .map((c) => (
                  <option key={c.ref} value={c.ref}>
                    {c.label}
                  </option>
                ))}
            </select>
          </label>
        )}

        {used.size > 0 && (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <p className="font-semibold">{t("rdNewItems")}</p>
            <p className="-mt-2 text-sm text-muted">{t("rdNewItemsHelp")}</p>
            {[...used].map((n) => (
              <div key={n} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field
                  label={t("rdNewName")}
                  value={newItems[n]!.name}
                  onChange={(v) => setNewItems(newItems.map((x, i) => (i === n ? { ...x, name: v } : x)))}
                  maxLength={60}
                />
                <Segmented
                  label={t("rdNewUnit")}
                  value={newItems[n]!.unit}
                  onChange={(u) => setNewItems(newItems.map((x, i) => (i === n ? { ...x, unit: u } : x)))}
                  options={[
                    { value: "kg", label: t("rdUnitKg") },
                    { value: "l", label: t("rdUnitL") },
                    { value: "adet", label: t("rdUnitAdet") },
                  ]}
                />
              </div>
            ))}
            {blocked && <Notice>{t("rdNoAddItems")}</Notice>}
          </div>
        )}

        {mode !== "none" && (
          <div className="flex flex-col gap-1 border-t border-line pt-4">
            {cost !== null ? (
              <p className="text-lg">
                {fill(t("costOfOne"), { cost: formatTL(cost) })}
                <span className="text-muted">
                  {" · "}
                  {fill(t("leavesProfit"), { profit: formatTL(priceKurus - cost), pct: margin(priceKurus, cost) })}
                </span>
              </p>
            ) : unpriced.length > 0 ? (
              <p className="text-sm text-muted">{fill(t("unpricedItems"), { names: unpriced.join(", ") })}</p>
            ) : null}
            {mode === "recipe" && recipeOk && (
              <p className="text-xs text-muted">
                {fill(t("perSale"), { list: parsed.map((l) => `${formatQty(l.qtyMilli!, unitOf(l.ref), lang)} ${nameOf(l.ref)}`).join(", ") })}
              </p>
            )}
          </div>
        )}
      </section>

      <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col gap-3 bg-paper px-6 pt-3 pb-6">
        {error && <Notice tone="red">{error}</Notice>}
        <Button kind="primary" size="lg" disabled={busy || !recipeOk || blocked} onClick={() => void confirm()}>
          {t("rdConfirm")}
        </Button>
        <Button kind="quiet" disabled={busy} onClick={() => void run(() => api.staff.menu.dismissRecipeDraft(slug, draft.id))}>
          {t("rdDismiss")}
        </Button>
      </div>
    </Sheet>
  );
}
