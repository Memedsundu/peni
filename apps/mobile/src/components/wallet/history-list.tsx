/**
 * HAREKETLER (design-system.md §9.6, §10.5, [G16], [G17]): the wallet's lines grouped by
 * `relDay`, newest first, each written as a sentence ("Mehmet'e 30 peni ısmarladın") with the
 * peni amount in `peniInk`. A gift line carries its state as a chip, icon + word: "bekliyor"
 * (`Clock`, warning), "kabul edildi" (`Check`, success), "sana döndü" (`Undo2`, neutral)…;
 * a pending gift the viewer sent has a quiet "Geri al". Order lines open their fiş.
 *
 * The first 12 lines show; "Daha eskileri göster" adds 20 more. Askı claims never appear.
 */
import { formatTime, SEP } from "@peni/brand/format";
import { Check, Clock, Undo2 } from "lucide-react-native";
import { memo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Chip, Row, RowGroup, Skeleton, T } from "@/components/ui";
import { radius, useTokens } from "@/lib/theme";
import { Sentence } from "./parts";
import { groupByDay, sentence, walletCopy, type HistoryChip, type HistoryItem } from "./wallet-model";

const PAGE = 12;
const MORE = 20;
const CHIP_ICON = { Clock, Check, Undo2 } as const;

export interface HistoryListProps {
  items: readonly HistoryItem[];
  /** More than one café: say which one on each line. */
  showCafe: boolean;
  /** "Geri al" on a pending gift. Resolves when the wallet has reloaded. */
  onCancelGift: (giftId: string) => Promise<void>;
}

export function HistoryList({ items, showCafe, onCancelGift }: HistoryListProps) {
  const t = useTokens();
  const [shown, setShown] = useState(PAGE);
  const [cancelling, setCancelling] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: t.surface2 }]}>
        <T variant="body" color="ink2">
          {walletCopy.historyEmpty}
        </T>
      </View>
    );
  }

  const days = groupByDay(items.slice(0, shown));
  const rest = items.length - shown;

  const cancel = async (giftId: string) => {
    if (cancelling) return;
    setCancelling(giftId);
    try {
      await onCancelGift(giftId);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <View style={styles.days}>
      {days.map((day) => (
        <View key={day.label + day.items[0]!.id} style={styles.day}>
          <T variant="strong" color="ink2" accessibilityRole="header" style={styles.dayLabel}>
            {day.label}
          </T>
          <RowGroup>
            {day.items.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                showCafe={showCafe}
                cancelling={item.cancelGiftId != null && cancelling === item.cancelGiftId}
                cancelDisabled={cancelling != null}
                onCancel={cancel}
              />
            ))}
          </RowGroup>
        </View>
      ))}
      {rest > 0 ? <Button title={walletCopy.more} variant="secondary" onPress={() => setShown((n) => n + MORE)} /> : null}
    </View>
  );
}

const HistoryRow = memo(function HistoryRow({
  item,
  showCafe,
  cancelling,
  cancelDisabled,
  onCancel,
}: {
  item: HistoryItem;
  showCafe: boolean;
  cancelling: boolean;
  cancelDisabled: boolean;
  onCancel: (giftId: string) => void;
}) {
  const time = formatTime(item.at);
  const meta = [time, showCafe ? item.cafeName : null].filter(Boolean).join(SEP);
  const spoken = [sentence(item.pieces), item.chip?.label, meta, item.note].filter(Boolean).join(", ");

  const details = (
    <View style={styles.details}>
      {item.chip ? <StateChip chip={item.chip} /> : null}
      <T variant="meta" color="ink2" tabular style={styles.meta}>
        {meta}
      </T>
      {item.note ? (
        <T variant="meta" color="ink2" style={styles.noteLine}>
          {item.note}
        </T>
      ) : null}
    </View>
  );
  const title = <Sentence pieces={item.pieces} />;

  if (item.cancelGiftId) {
    const id = item.cancelGiftId;
    // No row label here: an accessible row would swallow its "Geri al" button.
    return (
      <Row
        title={title}
        end={
          <Button
            title={walletCopy.cancelGift}
            variant="quiet"
            size="sm"
            loading={cancelling}
            loadingLabel={walletCopy.cancelling}
            disabled={cancelDisabled && !cancelling}
            accessibilityLabel={`${sentence(item.pieces)}: geri al`}
            onPress={() => onCancel(id)}
            style={styles.cancel}
          />
        }
      >
        {details}
      </Row>
    );
  }
  if (item.orderId) {
    return (
      <Row href={{ pathname: "/siparis/[id]", params: { id: item.orderId } }} title={title} accessibilityLabel={spoken}>
        {details}
      </Row>
    );
  }
  return (
    <Row title={title} accessibilityLabel={spoken}>
      {details}
    </Row>
  );
});

function StateChip({ chip }: { chip: HistoryChip }) {
  return (
    <Chip tone={chip.tone} icon={CHIP_ICON[chip.icon]}>
      {chip.label}
    </Chip>
  );
}

/** Loading rows with the final geometry. */
export function HistoryListSkeleton() {
  const t = useTokens();
  return (
    <View aria-hidden style={styles.days}>
      {[3, 2].map((n, g) => (
        <View key={g} style={styles.day}>
          <Skeleton width={56} line="strong" style={styles.dayLabel} />
          <View style={[styles.skeletonCard, { backgroundColor: t.surface, borderColor: t.line }]}>
            {Array.from({ length: n }, (_, i) => (
              <View key={i} style={[styles.skeletonRow, i > 0 ? { borderTopWidth: 1, borderTopColor: t.line } : null]}>
                <Skeleton width={i % 2 ? 180 : 220} line="body" />
                <Skeleton width={110} line="meta" />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  days: { gap: 24 },
  day: { gap: 0 },
  dayLabel: { marginBottom: 8 },
  details: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4, marginTop: 6 },
  meta: { flexShrink: 1 },
  noteLine: { flexBasis: "100%" },
  cancel: { marginRight: -8 },
  empty: { borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 20 },
  skeletonCard: { borderRadius: radius.card, borderWidth: 1, overflow: "hidden" },
  skeletonRow: { minHeight: 56, justifyContent: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
});
