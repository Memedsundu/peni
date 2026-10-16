/**
 * Menü (design-system.md §9.3, §10.2): one blocked banner above the first category when
 * ordering is off (the steppers are hidden, so the state is never silent), then per category a
 * legend and one raised card of flat rows.
 *
 * MenuRow: min 72pt; the name (`item`), then the price (tabular) and the description; on the
 * right a fixed 116pt slot, so nothing shifts when "+" grows into the stepper (A3) or a row is
 * sold out. "+" fires the `tap` haptic (the Stepper plays it). A non-member "+" opens the
 * `katil` sheet (D11): a normal "+", never a greyed one.
 */
import type { MenuItemDTO } from "@peni/api";
import { cartCopy } from "@peni/brand/copy";
import { formatTL } from "@peni/brand/format";
import { CirclePause, Plus } from "lucide-react-native";
import { memo, useMemo } from "react";
import { View } from "react-native";
import { Banner, Card, Chip, IconButton, Stepper, T } from "@/components/ui";
import { MAX_QTY, type Cart } from "@/lib/cart";
import { space, useTokens } from "@/lib/theme";
import type { OrderingBlocked } from "./aski-model";

export const BLOCKED_COPY = {
  closed: "Kafe şu an uygulamadan sipariş almıyor. Kasaya uğrayabilirsin.",
  preorder_off:
    "Son iki siparişin teslim alınmadığı için burada önden sipariş şimdilik kapalı. Kafeye uğradığında baristaya söylemen yeterli; yeniden açabilir.",
} as const;

/** The two "ordering blocked" banners (§9.3), above the menu and in place of the cart button. */
export function BlockedBanner({ reason }: { reason: Exclude<OrderingBlocked, null> }) {
  return reason === "closed" ? (
    <Banner tone="warning" icon={CirclePause} title={BLOCKED_COPY.closed} />
  ) : (
    <Banner tone="warning" title={BLOCKED_COPY.preorder_off} />
  );
}

export type MenuRowState = "orderable" | "join" | "blocked" | "soldout";

const SLOT = 116;

export const MenuRow = memo(function MenuRow({
  item,
  qty,
  state,
  onChange,
  onJoin,
}: {
  item: MenuItemDTO;
  qty: number;
  state: MenuRowState;
  onChange: (qty: number) => void;
  onJoin: () => void;
}) {
  return (
    <View style={{ minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: space.rowH }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="item">{item.name}</T>
        <T variant="meta" style={{ marginTop: 2 }}>
          <T tabular>{formatTL(item.priceKurus)}</T>
          {item.description ? <T color="ink2">{` · ${item.description}`}</T> : null}
        </T>
      </View>
      {state !== "blocked" ? (
        <View style={{ width: SLOT, flexShrink: 0, alignItems: "flex-end" }}>
          {state === "soldout" ? (
            // Full contrast, the price stays plain: only the slot says it.
            <Chip kind="tag">{cartCopy.soldOut}</Chip>
          ) : state === "join" ? (
            <IconButton variant="secondary" icon={Plus} label={cartCopy.add(item.name)} haptic="tap" onPress={onJoin} />
          ) : (
            <Stepper itemName={item.name} value={qty} max={MAX_QTY} onChange={onChange} />
          )}
        </View>
      ) : null}
    </View>
  );
});

export function MenuSection({
  menu,
  cart,
  member,
  blocked,
  dropped,
  onJoinAdd,
}: {
  menu: readonly MenuItemDTO[];
  cart: Cart;
  member: boolean;
  blocked: OrderingBlocked;
  /** Names `?sepet=` couldn't add because they are sold out. */
  dropped: readonly string[];
  onJoinAdd: (item: MenuItemDTO) => void;
}) {
  const t = useTokens();
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
    <View style={{ gap: 24 }}>
      {blocked ? <BlockedBanner reason={blocked} /> : null}
      {dropped.length > 0 ? <Banner tone="info" title={cartCopy.dropped(joinNames(dropped))} /> : null}
      {categories.map(([category, items]) => (
        <View key={category} style={{ gap: 8 }}>
          <T variant="legend" color="ink2" accessibilityRole="header" style={{ paddingHorizontal: 4 }}>
            {category}
          </T>
          <Card padding="none">
            {items.map((item, i) => {
              const state: MenuRowState = !item.available ? "soldout" : blocked ? "blocked" : member ? "orderable" : "join";
              return (
                <View key={item.productId}>
                  {i > 0 ? <View style={{ height: 1, marginLeft: space.rowH, backgroundColor: t.line }} /> : null}
                  <MenuRow
                    item={item}
                    qty={cart.quantityOf(item.productId)}
                    state={state}
                    onChange={(q) => cart.setQuantity(item.productId, q)}
                    onJoin={() => onJoinAdd(item)}
                  />
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </View>
  );
}

/** "Simit", "Simit ve Latte", "Simit, Latte ve Çay". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]}`;
}
