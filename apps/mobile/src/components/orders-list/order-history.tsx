/**
 * GEÇMİŞ on Siparişler (design-system.md §9.5, §10.4): one raised card of flat rows, grouped by
 * day ("Bugün", "Dün", "Pazartesi", "8 Eki"). Each row is one link to its fiş:
 *
 *   Moda Kahvesi · P-003                 ₺55
 *   Latte, Simit
 *   [✓ Teslim edildi]  14:32
 *
 * The status chip is icon + word: "Teslim edildi" (`Check`, success), "Kafe yetişemedi"
 * (`Undo2`, neutral), "İptal edildi" (neutral), "Teslim alınmadı" (`CircleAlert`, warning).
 * Nothing due at the till reads "Ödeme yok", never "₺0" (§11); a void order's total is `ink2`.
 *
 * The most recent collected order per café carries "Her zamanki: Latte + Simit", a choice chip
 * that opens the café with that cart (`?sepet=`). It sits under the row as its own target, so
 * the two never nest.
 */
import type { OrderDTO } from "@peni/api";
import { statusChips } from "@peni/brand/copy";
import { formatTime, formatTL, SEP } from "@peni/brand/format";
import { router } from "expo-router";
import { Check, CircleAlert, Undo2 } from "lucide-react-native";
import { Fragment, memo } from "react";
import { StyleSheet, View } from "react-native";
import { isVoid, orderCode } from "@/components/order/order-model";
import { Card, Chip, PressableScale, Skeleton, T } from "@/components/ui";
import { fonts, space, useTokens } from "@/lib/theme";
import { groupByDay, itemsSummary, reorderSepet, usualLabel, usualOrderIds } from "./model";

const CHIP_ICON = { Check, Undo2, CircleAlert } as const;

/** The total when nothing was due at the till (§11: never "₺0"). */
const NO_PAYMENT = "Ödeme yok";

type ClosedStatus = keyof typeof statusChips;

export function OrderHistory({ orders, now }: { orders: OrderDTO[]; now?: Date }) {
  const t = useTokens();
  const groups = groupByDay(orders, now);
  const usual = usualOrderIds(orders);

  return (
    <Card padding="none">
      {groups.map((g, gi) => (
        <View key={g.label} style={gi > 0 ? [styles.groupRule, { borderTopColor: t.line }] : null}>
          <T variant="meta" color="ink2" accessibilityRole="header" style={[styles.day, styles.dayText]}>
            {g.label}
          </T>
          {g.orders.map((o, i) => (
            <Fragment key={o.id}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: t.line }]} /> : null}
              <HistoryRow order={o} usual={usual.has(o.id)} />
            </Fragment>
          ))}
        </View>
      ))}
    </Card>
  );
}

const HistoryRow = memo(function HistoryRow({ order, usual }: { order: OrderDTO; usual: boolean }) {
  const t = useTokens();
  const code = orderCode(order);
  const chip = order.status in statusChips ? statusChips[order.status as ClosedStatus] : null;
  const voided = isVoid(order.status);
  const usualText = usual ? usualLabel(order.lines) : null;
  const items = itemsSummary(order.lines);
  const total = order.dueKurus > 0 ? formatTL(order.dueKurus) : NO_PAYMENT;
  const time = formatTime(order.submittedAt);

  const spoken = [`${order.cafeName}${code ? `, ${code}` : ""}`, items, total, chip?.label, time].filter(Boolean).join(". ");

  return (
    <View>
      <PressableScale
        accessibilityRole="link"
        accessibilityLabel={spoken}
        accessibilityHint="Fişi açar"
        targetScale={1}
        pressedColor={t.surface2}
        onPress={() => router.push({ pathname: "/siparis/[id]", params: { id: order.id } })}
        style={[styles.row, usualText ? styles.rowWithUsual : null]}
      >
        <View style={styles.top}>
          <View style={styles.what}>
            <T variant="button" numberOfLines={2}>
              {order.cafeName}
              {code ? (
                <T color="ink2" tabular style={styles.code}>
                  {`${SEP}${code}`}
                </T>
              ) : null}
            </T>
            {items ? (
              <T variant="meta" color="ink2" numberOfLines={2}>
                {items}
              </T>
            ) : null}
          </View>
          {order.dueKurus > 0 ? (
            <T variant="button" tabular color={voided ? "ink2" : "ink"} style={styles.total}>
              {total}
            </T>
          ) : (
            <T variant="meta" color="ink2" style={styles.total}>
              {NO_PAYMENT}
            </T>
          )}
        </View>
        <View style={styles.status}>
          {chip ? (
            <Chip tone={chip.tone} icon={chip.icon ? CHIP_ICON[chip.icon] : undefined}>
              {chip.label}
            </Chip>
          ) : null}
          <T variant="meta" color="ink2" tabular>
            {time}
          </T>
        </View>
      </PressableScale>
      {/* A sibling of the row, never inside it: two separate targets. */}
      {usualText ? (
        <View style={styles.usual}>
          <Chip
            kind="choice"
            accessibilityLabel={usualText}
            onPress={() => {
              const sepet = reorderSepet(order.lines);
              router.push({
                pathname: "/kafe/[slug]",
                params: sepet ? { slug: order.cafeSlug, sepet } : { slug: order.cafeSlug },
              });
            }}
          >
            {usualText}
          </Chip>
        </View>
      ) : null}
    </View>
  );
});

/* ------------------------------------------------------------------------------------------ */
/* Skeleton                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** Loading (§9.5): two skeleton rows with the real geometry, under the day label. */
export function OrderHistorySkeleton() {
  const t = useTokens();
  return (
    <Card padding="none" aria-hidden>
      <View style={styles.day}>
        <Skeleton width={48} line="meta" />
      </View>
      {[0.56, 0.42].map((w, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: t.line }]} /> : null}
          <View style={styles.row}>
            <View style={styles.top}>
              <View style={styles.what}>
                <Skeleton width={`${w * 100}%`} line="button" />
                <Skeleton width={120} line="meta" />
              </View>
              <Skeleton width={44} line="button" />
            </View>
            <View style={styles.status}>
              <Skeleton width={116} height={24} />
            </View>
          </View>
        </Fragment>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  groupRule: { borderTopWidth: 1 },
  day: { paddingHorizontal: space.rowH, paddingTop: 14, paddingBottom: 2 },
  dayText: { fontFamily: fonts.sansSemiBold },
  divider: { height: 1, marginLeft: space.rowH },
  row: { paddingHorizontal: space.rowH, paddingVertical: space.rowV, minHeight: space.row },
  rowWithUsual: { paddingBottom: 8 },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  what: { flex: 1, minWidth: 0, gap: 2 },
  code: { fontFamily: fonts.sans },
  total: { flexShrink: 0 },
  status: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 4 },
  usual: { paddingHorizontal: space.rowH, paddingBottom: space.rowV },
});
