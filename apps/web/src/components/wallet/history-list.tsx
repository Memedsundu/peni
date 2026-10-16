"use client";

import { formatPeni, formatTime, SEP } from "@peni/brand/format";
import { Check, Clock, Undo2 } from "lucide-react";
import { Fragment, useState } from "react";
import { Button, Chip, RowGroup, Row, Skeleton } from "@/components/ui";
import { groupByDay, sentence, type HistoryChip, type HistoryItem, type Piece } from "./wallet-model";

/*
 * HAREKETLER (design-system.md §9.6, [G16], [G17]): the wallet's lines grouped by `relDay`,
 * newest first, each written as a sentence ("Mehmet'e 30 peni ısmarladın"), the peni amount in
 * `peni-ink`. Gift lines carry their state as a chip (icon + word): "bekliyor" (Clock, warning),
 * "kabul edildi" (Check, success), "sana döndü" (Undo2, neutral)…; a pending gift the viewer
 * sent has a quiet "Geri al". Order lines open their fiş.
 *
 * The first PAGE lines show; "Daha eskileri göster" adds more. Askı claims never appear.
 */

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
  const [shown, setShown] = useState(PAGE);
  const [cancelling, setCancelling] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-[14px] bg-surface-2 px-4 py-5 text-body text-ink-2">
        Kazandığın ve kullandığın peni burada görünür.
      </p>
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
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.label + day.items[0]!.id} aria-label={day.label}>
          <h3 className="mb-2 text-meta font-semibold text-ink-2">{day.label}</h3>
          <RowGroup>
            {day.items.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                showCafe={showCafe}
                cancelling={cancelling === item.cancelGiftId && item.cancelGiftId != null}
                cancelDisabled={cancelling != null}
                onCancel={cancel}
              />
            ))}
          </RowGroup>
        </section>
      ))}
      {rest > 0 && (
        <Button variant="secondary" className="self-start" onClick={() => setShown((n) => n + MORE)}>
          Daha eskileri göster
        </Button>
      )}
    </div>
  );
}

function HistoryRow({
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
  const meta = [formatTime(item.at), showCafe ? item.cafeName : null].filter(Boolean).join(SEP);
  const body = (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {item.chip && <StateChip chip={item.chip} />}
      <span className="text-meta text-ink-2 tabular-nums">{meta}</span>
      {item.note && <span className="basis-full text-meta text-ink-2">{item.note}</span>}
    </span>
  );
  const title = <Sentence pieces={item.pieces} />;

  if (item.cancelGiftId) {
    return (
      <Row
        title={title}
        end={
          <Button
            variant="quiet"
            size="sm"
            className="-mr-2"
            loading={cancelling}
            loadingLabel="Geri alınıyor…"
            disabled={cancelDisabled && !cancelling}
            aria-label={`${sentence(item.pieces)}: geri al`}
            onClick={() => onCancel(item.cancelGiftId!)}
          >
            Geri al
          </Button>
        }
      >
        {body}
      </Row>
    );
  }
  if (item.orderId) {
    return (
      <Row href={`/siparis/${item.orderId}`} title={title}>
        {body}
      </Row>
    );
  }
  return <Row title={title}>{body}</Row>;
}

/** The sentence, with every peni amount in `peni-ink` (never broken inside "30 peni"). */
function Sentence({ pieces }: { pieces: readonly Piece[] }) {
  return (
    <span className="text-body text-ink">
      {pieces.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <span key={i} className="font-semibold whitespace-nowrap text-peni-ink tabular-nums">
            {formatPeni(p.peni, { signed: p.signed })}
          </span>
        ),
      )}
    </span>
  );
}

function StateChip({ chip }: { chip: HistoryChip }) {
  return (
    <Chip tone={chip.tone} icon={CHIP_ICON[chip.icon]}>
      {chip.label}
    </Chip>
  );
}

/** Loading rows with the final geometry. */
export function HistoryListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      {[3, 2].map((n, g) => (
        <div key={g}>
          <Skeleton className="mb-2 h-4 w-16" />
          <div className="divide-y divide-line overflow-hidden rounded-[14px] bg-surface shadow-raised">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex min-h-14 flex-col justify-center gap-2 px-4 py-3">
                <Skeleton className={i % 2 ? "h-4 w-40" : "h-4 w-52"} />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
