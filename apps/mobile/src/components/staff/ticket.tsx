/**
 * StaffTicket (design-system.md §9.10, §6.3 `Fis variant="ticket"`, §10.10): a raised card with
 * a 4pt café-colourway band.
 *
 *   P-004                                  [◷ 3 dk]
 *   Zeynep
 *   2 × Çay   [hook ikram]
 *   ┌ Not: az şekerli, yulaf sütlü ┐          warningSoft + StickyNote
 *   - - - - - - - - - - - - - - - - - - - -
 *   Kasada ₺55                    Yetişemiyoruz
 *   [            Kabul et (56pt)            ]
 *
 * - The code in `ticket` (Archivo Narrow 40, D17), the first name in `item`; the elapsed chip
 *   on the right: 0–4 min `Clock` neutral, 5–9 `Timer` warning, ≥10 `AlarmClock`
 *   "12 dk · gecikiyor" danger. It counts from `submittedAt`, `acceptedAt` once accepted, and
 *   `readyAt` on a Hazır ticket.
 * - An askı line carries the neutral HOOK "ikram" chip: `ink2` on `surface2`, never turquoise,
 *   never beside the customer's name (§17).
 * - The secondary action is quiet and 44pt: "Yetişemiyoruz" (submitted, accepted) opens the
 *   `reddet` sheet; "Gelmedi" shows only on Hazır tickets ≥10 min after `readyAt`.
 * - The 56pt ink primary is always last: "Kabul et" → "Hazır" → "Ödendi, teslim edildi". Shelby
 *   boards show "Kasada kapanacak" on ready tickets instead (D18).
 * - A13: a new order carries a 4pt `warning` bar on its left edge, fully visible for 10s from
 *   its arrival, then fading over 600ms (reduced motion: it just goes). No flashing, no pulse.
 */
import type { OrderDTO } from "@peni/api";
import { askiCopy, cartCopy, elapsedChip, staffCopy } from "@peni/brand/copy";
import { formatTL } from "@peni/brand/format";
import { AlarmClock, Clock, Info, StickyNote, Timer } from "lucide-react-native";
import { memo, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Fis, FisDivider, HookGlyph } from "@/components/brand";
import { Button, Chip, Icon, Skeleton, T } from "@/components/ui";
import { NEW_TICKET, useMotionReduced } from "@/lib/motion";
import { radius, useTokens } from "@/lib/theme";
import { canMarkNoShow, elapsedMinutes, firstName, primaryAction, ticketCode, ticketNotes, type BumpAction } from "./model";

const ELAPSED_ICON = { Clock, Timer, AlarmClock } as const;

export interface StaffTicketProps {
  order: OrderDTO;
  slug: string;
  posKind: "standalone" | "shelby";
  /** The board's clock (ms), ticking every few seconds: elapsed chips and "Gelmedi" follow it. */
  now: number;
  /** When the order arrived during this shift (ms): the A13 bar shows for 10s from then. */
  arrivedAt?: number;
  onBump: (order: OrderDTO, action: BumpAction) => void;
  onReject: (order: OrderDTO) => void;
}

export const StaffTicket = memo(function StaffTicket({ order, slug, posKind, now, arrivedAt, onBump, onReject }: StaffTicketProps) {
  const t = useTokens();
  const code = ticketCode(order);
  const name = firstName(order.customerName);
  const chip = elapsedChip(elapsedMinutes(order, now));
  const notes = ticketNotes(order);
  const primary = primaryAction(order.status, posKind);
  const canReject = order.status === "submitted" || order.status === "accepted";
  const noShow = canMarkNoShow(order, now);
  const amount = formatTL(order.dueKurus);

  return (
    <View accessibilityRole="summary" accessibilityLabel={`${code}, ${name}`}>
      <Fis variant="ticket" slug={slug} contentStyle={styles.body}>
        {arrivedAt != null ? <NewBar arrivedAt={arrivedAt} /> : null}

        <View style={styles.head}>
          <View style={styles.who}>
            <T variant="ticket" numberOfLines={1} accessibilityRole="header">
              {code}
            </T>
            <T variant="item" numberOfLines={1}>
              {name}
            </T>
          </View>
          <Chip tone={chip.tone} icon={ELAPSED_ICON[chip.icon]} style={styles.chip}>
            {chip.label}
          </Chip>
        </View>

        <View accessibilityRole="list" style={styles.lines}>
          {order.lines.map((line, i) => (
            <View key={`${line.productId}-${i}`} style={styles.line}>
              <T variant="item">{cartCopy.line(line.quantity, line.name)}</T>
              {line.fromAskida ? (
                <Chip tone="neutral" icon={<HookGlyph size={16} color={t.ink2} absoluteStrokeWidth />}>
                  {askiCopy.ticketChip}
                </Chip>
              ) : null}
            </View>
          ))}
        </View>

        {notes.length > 0 ? (
          <View style={[styles.notes, { backgroundColor: t.warningSoft }]}>
            <View style={styles.noteIcon}>
              <Icon icon={StickyNote} size={20} color={t.warningInk} />
            </View>
            <View style={styles.noteText}>
              {notes.map((n, i) => (
                <T key={i} variant="body">
                  {n}
                </T>
              ))}
            </View>
          </View>
        ) : null}

        <FisDivider style={styles.divider} />

        <View style={styles.payRow}>
          <T variant="meta" color="ink2" style={styles.pay}>
            {order.dueKurus > 0 ? (
              <>
                {staffCopy.payment(order.dueKurus).replace(amount, "")}
                <T variant="strong" color="ink" tabular>
                  {amount}
                </T>
              </>
            ) : (
              staffCopy.payment(0)
            )}
          </T>
          {canReject ? (
            <Button
              title={staffCopy.reject}
              variant="quiet"
              size="sm"
              accessibilityLabel={`${staffCopy.reject}, ${code}`}
              onPress={() => onReject(order)}
              style={styles.quiet}
            />
          ) : null}
          {noShow ? (
            <Button
              title={staffCopy.noShow}
              variant="quiet"
              size="sm"
              accessibilityLabel={`${staffCopy.noShow}, ${code}`}
              onPress={() => onBump(order, "no_show")}
              style={styles.quiet}
            />
          ) : null}
        </View>

        {primary ? (
          primary.action ? (
            <Button
              title={primary.label}
              size="lg"
              fullWidth
              accessibilityLabel={`${primary.label}, ${code}`}
              onPress={() => onBump(order, primary.action)}
              style={styles.primary}
            />
          ) : (
            <View accessible accessibilityRole="text" style={[styles.closesAtTill, { backgroundColor: t.surface2 }]}>
              <Icon icon={Info} size={20} color={t.ink2} />
              <T variant="button" color="ink2">
                {primary.label}
              </T>
            </View>
          )
        ) : null}
      </Fis>
    </View>
  );
});

/** A13 `new-ticket`: a 4pt `warning` bar on the left edge. Measured from the arrival, so a remount (switching segments) doesn't restart it. */
function NewBar({ arrivedAt }: { arrivedAt: number }) {
  const t = useTokens();
  const reduced = useMotionReduced();
  const [delay] = useState(() => Math.max(0, NEW_TICKET.holdMs - (Date.now() - arrivedAt)));
  const [gone, setGone] = useState(() => Date.now() - arrivedAt >= NEW_TICKET.holdMs + NEW_TICKET.fadeMs);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (gone) return;
    if (reduced) {
      // No fade under reduced motion: the bar stays 10s, then it is simply gone.
      const id = setTimeout(() => setGone(true), delay);
      return () => clearTimeout(id);
    }
    opacity.value = withDelay(delay, withTiming(0, { duration: NEW_TICKET.fadeMs, reduceMotion: ReduceMotion.Never }));
    const id = setTimeout(() => setGone(true), delay + NEW_TICKET.fadeMs + 50);
    return () => clearTimeout(id);
  }, [delay, gone, opacity, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (gone) return null;
  return <Animated.View aria-hidden pointerEvents="none" style={[styles.newBar, { backgroundColor: t.warning }, style]} />;
}

/** Loading stand-in with the ticket's real geometry. */
export function StaffTicketSkeleton() {
  const t = useTokens();
  return (
    <View aria-hidden style={[styles.skeleton, { backgroundColor: t.surface, borderColor: t.line }]}>
      <View style={[styles.skeletonBand, { backgroundColor: t.surface2 }]} />
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.who}>
            <Skeleton width={104} height={34} />
            <Skeleton width={72} line="item" />
          </View>
          <Skeleton width={64} height={24} style={styles.chip} />
        </View>
        <View style={styles.lines}>
          <Skeleton width="44%" line="item" />
          <Skeleton width="36%" line="item" />
        </View>
        <Skeleton width="100%" height={1.5} style={styles.divider} />
        <View style={styles.payRow}>
          <Skeleton width={88} line="meta" />
        </View>
        <Skeleton width="100%" height={56} radius={10} style={styles.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingTop: 14 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  who: { flexShrink: 1, minWidth: 0, gap: 2 },
  chip: { marginTop: 8, flexShrink: 0 },
  lines: { marginTop: 14, gap: 8 },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
  notes: { marginTop: 14, flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: radius.control },
  noteIcon: { paddingTop: 1 },
  noteText: { flex: 1, minWidth: 0, gap: 4 },
  divider: { marginTop: 16, marginBottom: 4 },
  payRow: { minHeight: 44, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12 },
  pay: { flexShrink: 1 },
  quiet: { marginRight: -12 },
  primary: { marginTop: 4 },
  closesAtTill: {
    marginTop: 4,
    minHeight: 56,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  newBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  skeleton: { borderRadius: radius.card, borderWidth: 1, overflow: "hidden" },
  skeletonBand: { height: 4 },
});
