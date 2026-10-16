import type { CafeSummaryDTO } from "@peni/api";
import { askiCopy, peniCopy } from "@peni/brand/copy";
import { capitalizeTr, dateBlock, formatTime, relDay, SEP, TIME_ZONE } from "@peni/brand/format";
import { askiItemFor } from "@peni/brand/shapes";
import { Check, CirclePause } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { Amount, AskiRail, CafeCover } from "@/components/brand";
import { Chip, cx, focusRing, pressMotion, StatusDot, tappable } from "@/components/ui";

/*
 * CafeCard (design-system.md §9.1): a raised card that is one link to the café. The cover is
 * the shared element of the card -> café morph (A16, inside CafeCover). Under the cover:
 * the place legend, the name, then up to four quiet rows — the viewer's peni read as goods
 * [G1], the askı rail, the next Peni masası [G2] and whether the café takes orders now.
 *
 * The link is named by the café name (the h3) and described by the rows, so a screen reader
 * hears "Moda Kahvesi, bağlantı" first and the details after.
 */
export function CafeCard({ cafe }: { cafe: CafeSummaryDTO }) {
  const titleId = useId();
  const detailsId = useId();
  const place = [cafe.district, cafe.city].filter(Boolean).join(SEP);
  // The askı reference item is the cheapest askı item; refItems[0] is that same item unless
  // the café picked other reference items (see SHARED CHANGES: CafeSummaryDTO needs its own
  // `askidaReferenceItemName`). The glyph and the caption always use the same name.
  const askiName = cafe.refItems[0]?.name ?? null;

  return (
    <Link
      href={`/k/${cafe.slug}`}
      aria-labelledby={titleId}
      aria-describedby={detailsId}
      className={cx(
        // In a wide single column (a 448px+ container: large phones in landscape, small tablets)
        // the cover moves to the left, so a card is never mostly picture.
        "group flex h-full flex-col rounded-[14px] bg-surface text-ink shadow-raised @md:flex-row",
        tappable,
        focusRing,
        pressMotion,
        // The press is a whole card: a gentler .99 reads as the same A1 press at this size.
        "motion-safe:active:scale-[.99]",
      )}
    >
      <CafeCover
        cafe={cafe}
        size="card"
        className="@md:aspect-auto @md:min-h-[200px] @md:w-[42%] @md:shrink-0 @md:rounded-tr-none @md:rounded-bl-[14px]"
      />
      <div className="flex min-w-0 flex-1 flex-col p-4 md:p-5">
        {place && <p className="legend text-ink-2">{place}</p>}
        <h3
          id={titleId}
          className="mt-1 font-display text-h3 text-ink decoration-[1.5px] underline-offset-[5px] group-hover:underline"
        >
          {cafe.name}
        </h3>

        <div id={detailsId} className="mt-4 flex flex-1 flex-col items-start gap-2">
          {cafe.isMember && <MemberLine cafe={cafe} />}

          <div className="flex min-h-[30px] items-center gap-3">
            <AskiRail count={cafe.askidaItemsAvailable} item={askiItemFor(askiName)} size="sm" />
            <span className="text-meta text-ink">{askiCopy.cardLine(cafe.askidaItemsAvailable, askiName)}</span>
          </div>

          {cafe.nextEvent && <EventChip startsAt={cafe.nextEvent.startsAt} />}

          <div className="mt-auto pt-2">
            {cafe.acceptingOrders ? (
              <Chip tone="success" icon={<StatusDot tone="success" />}>
                Sipariş alıyor
              </Chip>
            ) : (
              <Chip tone="warning" icon={CirclePause}>
                Şu an sipariş almıyor
              </Chip>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** "Sende **90 peni** · ≈ 3 çay" [G1], or "Üyesin" with a check when the balance is unknown. */
function MemberLine({ cafe }: { cafe: CafeSummaryDTO }) {
  if (cafe.balancePeni == null) {
    return (
      <span className="inline-flex min-h-[22px] items-center gap-1.5 text-body text-ink">
        <Check aria-hidden size={16} strokeWidth={1.75} absoluteStrokeWidth className="size-4 shrink-0 text-success-ink" />
        {peniCopy.member}
      </span>
    );
  }
  const balance = peniCopy.balance(cafe.balancePeni);
  return (
    <Amount
      size="sm"
      peni={cafe.balancePeni}
      refItems={cafe.refItems}
      cafe={{ name: cafe.name, district: cafe.district, city: cafe.city, slug: cafe.slug }}
      prefix={<span className="text-ink">{balance.before}</span>}
      className="text-body"
    />
  );
}

/**
 * The next Peni masası [G2]: "PER 19:00 · Peni masası" on the vişne soft fill, the day in the
 * date block's plate style. Within a week the weekday is enough; further out, "22 EKİ".
 */
function EventChip({ startsAt }: { startsAt: string }) {
  const day = eventDay(startsAt);
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-[4px] bg-masa-soft px-2 text-masa-ink">
      {/* The plate abbreviation ("PER") is for the eye; a screen reader hears "Perşembe". */}
      <span aria-hidden className="plate text-plate leading-none">
        {day}
      </span>
      <span className="sr-only">{eventDaySpoken(startsAt)}</span>
      <span className="text-meta font-semibold tabular-nums">{formatTime(startsAt)}</span>
      <span aria-hidden className="text-meta">
        ·
      </span>
      <span className="text-meta">Peni masası</span>
    </span>
  );
}

/** "Bugün", "Yarın", "Perşembe", or "22 Ekim" further out: the day said in full. */
function eventDaySpoken(iso: string): string {
  const rel = relDay(iso);
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  if (rel === "bugün" || rel === "yarın" || days < 6.5) return capitalizeTr(rel);
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TIME_ZONE, day: "numeric", month: "long" }).format(new Date(iso));
}

function eventDay(iso: string): string {
  const rel = relDay(iso);
  if (rel === "bugün") return "Bugün";
  if (rel === "yarın") return "Yarın";
  const d = dateBlock(iso);
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  return days < 6.5 ? d.weekday : `${d.day} ${d.month}`;
}
