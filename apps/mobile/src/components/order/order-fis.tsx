/**
 * The order fiş on mobile (design-system.md §10.3, same content and copy as web §9.4).
 *
 * Inside the slip, in order: the Oxford rule and "MODA KAHVESİ · SİPARİŞ" (the Fis draws
 * them), the code "P-003" in `code`, the customer in `meta ink2`, the StatusTrack, the
 * headline in a live region (polite; assertive once Hazır), the printed lines with neutral
 * deductions, the total, and "Peni kodun: M7K-42Q" [G7b].
 *
 * Hazır (A11): the Fis itself turns green, plays `success` and announces "Hazır. Kasada P-003
 * kodunu söyle." on the change (never on mount); the stamp comes down only when the change
 * happened while the customer was looking.
 */
import type { OrderDTO } from "@peni/api";
import { orderCopy, staffCopy } from "@peni/brand/copy";
import { formatTL } from "@peni/brand/format";
import { memo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Fis, FisDivider, FisRow, FisText, HazirStamp, StatusTrack } from "@/components/brand";
import { Skeleton } from "@/components/ui";
import { fonts, useTokens } from "@/lib/theme";
import { EarnMoment, type EarnMode } from "./earn-moment";
import { earnedPeni, fisLines, headline, isVoid, noWidow, orderCode, voidNotes, whoLine } from "./order-model";

export interface OrderFisProps {
  order: OrderDTO;
  /** The café's usual accept-to-ready range [G14]; null shows no ETA, ever. */
  prepRange?: { low: number; high: number } | null;
  /** The order turned ready while the customer was looking: the stamp comes down (A11). */
  stampAnimates?: boolean;
  /** A6 for `earnedPeni` (see `useEarnMoment`). */
  earnMode?: EarnMode;
  now?: Date;
}

export const OrderFis = memo(function OrderFis({ order, prepRange, stampAnimates = false, earnMode = "still", now }: OrderFisProps) {
  const ready = order.status === "ready";
  const code = orderCode(order);

  return (
    <Fis
      variant="order"
      tone={ready ? "ready" : "default"}
      legend={orderCopy.legend(order.cafeName)}
      announce={code ? orderCopy.readyAnnouncement(code) : orderCopy.headline.ready}
    >
      <CodeBlock code={code} who={whoLine(order, now)} ready={ready} stampAnimates={stampAnimates} />
      <StatusTrack order={order} style={styles.track} />
      <Headline order={order} prepRange={prepRange} earnMode={earnMode} />
      <Lines order={order} />
      {order.memberCode && !isVoid(order.status) ? (
        <FisText variant="plate" color="ink2" style={styles.memberCode}>
          {orderCopy.memberCode(order.memberCode)}
        </FisText>
      ) : null}
    </Fis>
  );
});

/* ------------------------------------------------------------------------------------------ */
/* Code, customer, stamp                                                                       */
/* ------------------------------------------------------------------------------------------ */

const GAP = 12;
/** The stamp's width before it has been measured once ("HAZIR" at 22pt, padding, rules). */
let stampWidth = 104;

/**
 * The stamp sits beside the code while both fit; on a narrow slip (360pt phones) it drops
 * beside the customer's name instead, overlapping the lines around it a little, the way a
 * rubber stamp does, so the code never wraps or shrinks.
 */
function CodeBlock({ code, who, ready, stampAnimates }: { code: string | null; who: string; ready: boolean; stampAnimates: boolean }) {
  const [rowWidth, setRowWidth] = useState(0);
  const [codeWidth, setCodeWidth] = useState(0);
  const [, remeasure] = useState(0);
  const beside = ready && code != null && rowWidth > 0 && codeWidth > 0 && codeWidth + GAP + stampWidth <= rowWidth;

  const onStamp = (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (w > 0 && w !== stampWidth) {
      stampWidth = w;
      remeasure((n) => n + 1);
    }
  };
  const stamp = ready ? (
    <View onLayout={onStamp} style={beside ? styles.stampBeside : styles.stampInline}>
      <HazirStamp animate={stampAnimates} />
    </View>
  ) : null;

  return (
    <View style={styles.codeBlock} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      <View style={styles.codeRow}>
        <View style={styles.codeColumn}>
          {code ? (
            <View style={styles.codeBox} onLayout={(e) => setCodeWidth(Math.ceil(e.nativeEvent.layout.width))}>
              <FisText variant="code" numberOfLines={1} accessibilityRole="header" accessibilityLabel={`${orderCopy.headerTitle} ${code}`}>
                {code}
              </FisText>
            </View>
          ) : null}
          <View style={[styles.whoRow, code ? styles.whoGap : null]}>
            <FisText variant="meta" color="ink2" style={styles.who}>
              {who}
            </FisText>
            {beside ? null : stamp}
          </View>
        </View>
        {beside ? stamp : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Headline                                                                                    */
/* ------------------------------------------------------------------------------------------ */

function Headline({ order, prepRange, earnMode }: { order: OrderDTO; prepRange?: { low: number; high: number } | null; earnMode: EarnMode }) {
  const ready = order.status === "ready";
  const code = orderCode(order);
  const earned = earnedPeni(order);
  const notes = voidNotes(order);
  const title = headline(order, prepRange);
  const readyBody = ready && code ? orderCopy.readyBody(code, order.dueKurus) : null;

  return (
    <View style={styles.headline}>
      {/* One live region; it turns assertive for Hazır (the Fis also announces it on iOS). */}
      <View accessibilityLiveRegion={ready ? "assertive" : "polite"} aria-live={ready ? "assertive" : "polite"} style={styles.headlineText}>
        <FisText variant="h3" accessibilityLabel={earned != null ? `${title} ${orderCopy.earned(earned)}` : undefined}>
          {noWidow(title)}
        </FisText>
        {readyBody ? <FisText variant="body">{noWidow(readyBody)}</FisText> : null}
        {notes.note ? (
          <FisText variant="meta" color="ink2">
            {notes.note}
          </FisText>
        ) : null}
        {notes.lines.length ? (
          <FisText variant="body" style={notes.note ? styles.notesAfterNote : null}>
            {noWidow(notes.lines.join(" "))}
          </FisText>
        ) : null}
      </View>
      {earned != null ? (
        <View style={styles.earn}>
          <EarnMoment peni={earned} cafe={{ name: order.cafeName, slug: order.cafeSlug }} mode={earnMode} />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Lines and total                                                                             */
/* ------------------------------------------------------------------------------------------ */

function Lines({ order }: { order: OrderDTO }) {
  const lines = fisLines(order.lines);
  const voided = isVoid(order.status);
  const due = order.dueKurus;

  return (
    <>
      <FisDivider style={styles.firstDivider} />
      <View style={styles.lines}>
        {lines.map((l) => (
          <View key={l.key}>
            <FisRow label={l.label} value={formatTL(l.totalKurus)} />
            {l.note ? (
              <FisText variant="meta" color="ink2">
                {l.note}
              </FisText>
            ) : null}
          </View>
        ))}
        {/* Deductions: ink2, the same for peni and askı, never coloured, never "(askıdan)" (§17). */}
        {order.peniDiscountKurus > 0 ? <FisRow muted label={orderCopy.peniLine} value={formatTL(-order.peniDiscountKurus)} /> : null}
        {order.askidaKurus > 0 ? <FisRow muted label={orderCopy.askiLine} value={formatTL(-order.askidaKurus)} /> : null}
      </View>
      {order.customerNote?.trim() ? (
        <FisText variant="meta" color="ink2" style={styles.note}>
          {staffCopy.note(order.customerNote.trim())}
        </FisText>
      ) : null}
      <FisDivider />
      {due > 0 ? (
        <View style={styles.total} accessible accessibilityLabel={`${orderCopy.dueLabel} ${formatTL(due)}`}>
          <FisText variant="strong" color={voided ? "ink2" : "ink"}>
            {orderCopy.dueLabel}
          </FisText>
          {/* A void order's amount stays legible but struck through: nothing is owed. */}
          <FisText
            variant="item"
            color={voided ? "ink2" : "ink"}
            tabular
            style={[styles.totalValue, voided ? styles.struck : null]}
          >
            {formatTL(due)}
          </FisText>
        </View>
      ) : (
        <FisText variant="strong" color={voided ? "ink2" : "ink"}>
          {orderCopy.noPayment}
        </FisText>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Loading                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** The skeleton fiş (§9.4 Loading): the real geometry, static `surface2` blocks. */
export function OrderFisSkeleton() {
  return (
    <View accessible accessibilityLabel="Sipariş yükleniyor" accessibilityState={{ busy: true }} aria-busy>
      <Fis variant="order" legend={null}>
        <Skeleton line="plate" width={196} style={styles.skeletonLegend} />
        <View style={styles.codeBlock}>
          <Skeleton line="code" width={164} />
          <Skeleton line="meta" width={104} style={styles.whoGap} />
        </View>
        {/* The real track's geometry: four equal columns, the line from the first centre to the last. */}
        <View style={[styles.track, styles.skeletonTrack]}>
          <SkeletonTrackLine />
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonStop}>
              <Skeleton width={22} height={22} radius="full" />
              <Skeleton line="meta" width={i === 1 ? 72 : 48} />
            </View>
          ))}
        </View>
        <View style={styles.headline}>
          <Skeleton line="h3" width="82%" />
          <Skeleton line="h3" width="46%" />
        </View>
        <FisDivider style={styles.firstDivider} />
        <View style={styles.lines}>
          <View style={styles.skeletonRow}>
            <Skeleton line="body" width={112} />
            <Skeleton line="body" width={44} />
          </View>
          <View style={styles.skeletonRow}>
            <Skeleton line="body" width={92} />
            <Skeleton line="body" width={36} />
          </View>
        </View>
        <FisDivider />
        <View style={styles.skeletonRow}>
          <Skeleton line="strong" width={132} />
          <Skeleton line="h3" width={60} />
        </View>
      </Fis>
    </View>
  );
}

function SkeletonTrackLine() {
  const t = useTokens();
  return <View aria-hidden style={[styles.skeletonLine, { backgroundColor: t.surface2 }]} />;
}

const styles = StyleSheet.create({
  codeBlock: { marginTop: 16 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: GAP },
  codeColumn: { flex: 1, minWidth: 0 },
  codeBox: { alignSelf: "flex-start" },
  whoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: GAP },
  whoGap: { marginTop: 4 },
  who: { flexShrink: 1 },
  // Beside the code: centred on the code and name together, nudged off the slip's edge.
  stampBeside: { marginRight: 2 },
  // Beside the name: the stamp keeps the name row's height and overlaps its neighbours a little.
  stampInline: { marginVertical: -10, marginRight: 2 },
  track: { marginTop: 24 },
  headline: { marginTop: 24, gap: 6 },
  headlineText: { gap: 6 },
  notesAfterNote: { marginTop: 4 },
  earn: { marginTop: 8 },
  firstDivider: { marginTop: 20 },
  lines: { gap: 6 },
  note: { marginTop: 8 },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16 },
  totalValue: { fontFamily: fonts.sansSemiBold, fontSize: 22, lineHeight: 26 },
  struck: { textDecorationLine: "line-through" },
  memberCode: { marginTop: 20 },
  skeletonLegend: { marginTop: 8 },
  skeletonTrack: { flexDirection: "row" },
  skeletonLine: { position: "absolute", left: "12.5%", right: "12.5%", top: 10, height: 2 },
  skeletonStop: { flex: 1, alignItems: "center", gap: 6 },
  skeletonRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
