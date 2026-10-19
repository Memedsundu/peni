"use client";

import { PeniApiError, type RecipeDTO, type RecipesDTO, type StaffMenuDTO, type StockModeDTO } from "@peni/api";
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
 * recipes; a chef edits recipes only.
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

  const fail = (e: unknown) => {
    if (e instanceof PeniApiError && e.status === 401) signedOut();
    else setError(errorText(e, lang));
  };
  const reload = () =>
    Promise.all([canEdit ? api.staff.menu.get(cafe.slug).then(setMenu) : null, canRecipes ? api.staff.menu.recipes(cafe.slug).then(setRecipes) : null]).catch(
      fail,
    );
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
          {categories.map((c) => (
            <section key={c} className="flex flex-col gap-1">
              <h2 className="font-serif text-3xl">{c}</h2>
              <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                {products
                  .filter((p) => p.category === c)
                  .map((p) => (
                    <li key={p.productId}>
                      <ProductRow t={t} product={p} onOpen={() => setOpen(p.productId)} />
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
      {open && open !== "new" && (
        <ProductSheet
          key={open}
          t={t}
          lang={lang}
          slug={cafe.slug}
          product={products.find((p) => p.productId === open)!}
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

function ProductRow({ t, product: p, onOpen }: { t: T; product: Product; onOpen: () => void }) {
  let costLine: string | null = null;
  if (p.mode === "none") costLine = t("modeNoneShort");
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
        {costLine && <span className={`text-sm ${p.mode && p.costKurus === null && p.mode !== "none" ? "text-red" : "text-muted"}`}>{costLine}</span>}
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
