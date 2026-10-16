"use client";

import type { MenuItemDTO } from "@peni/api";
import { cartCopy } from "@peni/brand/copy";
import { formatTL } from "@peni/brand/format";
import { CirclePause, Plus } from "lucide-react";
import { useMemo } from "react";
import { Banner, Chip, IconButton, Stepper } from "@/components/ui";
import { joinNames, MAX_PER_LINE } from "./cart";

export type MenuRowState = "orderable" | "join" | "blocked" | "soldout";

/** The two "ordering blocked" banners (§9.3). Used above the menu and in place of the cart button. */
export function BlockedBanner({ reason, className }: { reason: "closed" | "preorder_off"; className?: string }) {
  return reason === "closed" ? (
    <Banner tone="warning" icon={CirclePause} className={className} title="Kafe şu an uygulamadan sipariş almıyor. Kasaya uğrayabilirsin." />
  ) : (
    <Banner
      tone="warning"
      className={className}
      title="Son iki siparişin teslim alınmadığı için burada önden sipariş şimdilik kapalı. Kafeye uğradığında baristaya söylemen yeterli; yeniden açabilir."
    />
  );
}

/**
 * MenuRow (design-system.md §9.3): a container-query row, min 72px. Name in `text-item`, then
 * the price (tabular) and the description. The right side is a fixed 116px slot, so nothing
 * shifts when "+" grows into the stepper (A3) or when a row is sold out.
 */
export function MenuRow({
  item,
  qty,
  state,
  max = MAX_PER_LINE,
  onChange,
  onJoin,
}: {
  item: MenuItemDTO;
  qty: number;
  state: MenuRowState;
  max?: number;
  onChange: (qty: number) => void;
  onJoin: () => void;
}) {
  return (
    <li className="@container flex min-h-[72px] items-center gap-3 px-4 py-3 md:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-item text-ink">{item.name}</p>
        <p className="mt-0.5 text-meta text-ink">
          <span className="tabular-nums">{formatTL(item.priceKurus)}</span>
          {item.description && <span className="text-ink-2">{"\u00A0· "}{item.description}</span>}
        </p>
      </div>
      {state !== "blocked" && (
        <div className="flex w-[116px] shrink-0 justify-end">
          {state === "soldout" ? (
            // Full contrast, the price stays plain: only the slot says it.
            <Chip kind="tag">{cartCopy.soldOut}</Chip>
          ) : state === "join" ? (
            <IconButton variant="secondary" icon={Plus} label={cartCopy.add(item.name)} onClick={onJoin} />
          ) : (
            <Stepper itemName={item.name} value={qty} max={max} onChange={onChange} />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Menü (design-system.md §9.3): one blocked banner above the first category when ordering is
 * off (the steppers are hidden, so the state is never silent), then per category a legend and
 * one raised card of flat rows.
 */
export function MenuSection({
  menu,
  lines,
  ikram,
  member,
  blocked,
  dropped,
  locked = false,
  onChange,
  onJoinAdd,
}: {
  menu: readonly MenuItemDTO[];
  lines: Record<string, number>;
  ikram: string | null;
  member: boolean;
  blocked: null | "closed" | "preorder_off";
  /** Names `?sepet=` couldn't add because they are sold out. */
  dropped: readonly string[];
  /** An order is being sent with the cart as it is: no edits until it lands (desktop edits here). */
  locked?: boolean;
  onChange: (productId: string, qty: number) => void;
  onJoinAdd: (item: MenuItemDTO) => void;
}) {
  const categories = useMemo(() => {
    const map = new Map<string, MenuItemDTO[]>();
    for (const m of menu) {
      const list = map.get(m.category);
      if (list) list.push(m);
      else map.set(m.category, [m]);
    }
    return [...map];
  }, [menu]);

  return (
    <div className="flex flex-col gap-6" inert={locked}>
      {blocked && <BlockedBanner reason={blocked} />}
      {dropped.length > 0 && <Banner tone="info" title={cartCopy.dropped(joinNames(dropped))} />}
      {categories.map(([category, items]) => {
        const headingId = `menu-${slugify(category)}`;
        return (
          <section key={category} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h3 id={headingId} className="legend px-4 text-ink-2 md:px-5">
              {category}
            </h3>
            <ul className="divide-y divide-line overflow-hidden rounded-[14px] bg-surface shadow-raised">
              {items.map((item) => {
                const state: MenuRowState = !item.available
                  ? "soldout"
                  : blocked
                    ? "blocked"
                    : member
                      ? "orderable"
                      : "join";
                return (
                  <MenuRow
                    key={item.productId}
                    item={item}
                    qty={lines[item.productId] ?? 0}
                    max={ikram === item.productId ? MAX_PER_LINE - 1 : MAX_PER_LINE}
                    state={state}
                    onChange={(q) => onChange(item.productId, q)}
                    onJoin={() => onJoinAdd(item)}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
