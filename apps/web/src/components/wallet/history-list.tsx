"use client";

import { formatPeni, formatTime, SEP } from "@peni/brand/format";
import { Check, Clock, Undo2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
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
 *
 * Focus never falls to the page: after "Geri al" it lands on the same line's sentence (now
 * "geri aldın"), and when "Daha eskileri göster" leaves, on the first line it revealed. Days
 * are headed groups, not landmarks (a landmark per day would crowd landmark navigation).
 */

const PAGE = 12;
const MORE = 20;

const CHIP_ICON = { Clock, Check, Undo2 } as const;

export interface HistoryListProps {
  items: readonly HistoryItem[];
  /** More than one café: say which one on each line. */
  showCafe: boolean;
  /** "Geri al" on a pending gift. Resolves to true once it is taken back and the wallet has reloaded. */
  onCancelGift: (giftId: string) => Promise<boolean>;
}

/** The DOM id of a line's sentence: the focus target after "Geri al" and "Daha eskileri göster". */
function lineDomId(id: string): string {
  return `hareket-${id.replace(/[^\w-]/g, "-")}`;
}

export function HistoryList({ items, showCafe, onCancelGift }: HistoryListProps) {
  const [shown, setShown] = useState(PAGE);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [focusLine, setFocusLine] = useState<string | null>(null);

  useEffect(() => {
    if (!focusLine) return;
    setFocusLine(null);
    const el = document.getElementById(lineDomId(focusLine));
    // A line that opens its order is a link: focus the link, not the words inside it.
    (el?.closest<HTMLElement>("a") ?? el)?.focus();
  }, [focusLine]);

  if (items.length === 0) {
    return (
      <p className="rounded-[14px] bg-surface-2 px-4 py-5 text-body text-ink-2">
        Kazandığın ve kullandığın peni burada görünür.
      </p>
    );
  }

  const days = groupByDay(items.slice(0, shown));
  const rest = items.length - shown;

  const cancel = async (giftId: string, lineId: string) => {
    if (cancelling) return;
    setCancelling(giftId);
    try {
      // "Geri al" leaves with the pending state: the line's sentence takes the focus.
      if (await onCancelGift(giftId)) setFocusLine(lineId);
    } finally {
      setCancelling(null);
    }
  };

  const showMore = () => {
    const firstNew = items[shown]?.id;
    setShown((n) => n + MORE);
    // The button leaves when everything is shown: focus the first line it revealed.
    if (firstNew && items.length <= shown + MORE) setFocusLine(firstNew);
  };

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <div key={day.label + day.items[0]!.id}>
          <h3 className="mb-2 text-meta font-semibold text-ink-2">{day.label}</h3>
          <RowGroup>
            {day.items.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                showCafe={showCafe}
                cancelling={cancelling === item.cancelGiftId && item.cancelGiftId != null}
                onCancel={cancel}
              />
            ))}
          </RowGroup>
        </div>
      ))}
      {rest > 0 && (
        <Button variant="secondary" className="self-start" onClick={showMore}>
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
  onCancel,
}: {
  item: HistoryItem;
  showCafe: boolean;
  cancelling: boolean;
  /** One at a time: a second "Geri al" while one is in flight is ignored (no grey flash). */
  onCancel: (giftId: string, lineId: string) => void;
}) {
  const meta = [formatTime(item.at), showCafe ? item.cafeName : null].filter(Boolean).join(SEP);
  const body = (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {item.chip && <StateChip chip={item.chip} />}
      <span className="text-meta text-ink-2 tabular-nums">{meta}</span>
      {item.note && <span className="basis-full text-meta text-ink-2">{item.note}</span>}
    </span>
  );
  // Lines that open their order are links already; any other line's words take focus themselves.
  const title = <Sentence id={lineDomId(item.id)} focusable={item.orderId == null} pieces={item.pieces} />;

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
            aria-label={`${sentence(item.pieces)}: geri al`}
            onClick={() => onCancel(item.cancelGiftId!, item.id)}
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
function Sentence({ id, focusable, pieces }: { id: string; focusable: boolean; pieces: readonly Piece[] }) {
  return (
    <span
      id={id}
      tabIndex={focusable ? -1 : undefined}
      className="rounded-[4px] text-body text-ink scroll-mt-[calc(var(--header-h)+1rem)]"
    >
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
