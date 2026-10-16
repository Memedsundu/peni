"use client";

import type { PostDTO } from "@peni/api";
import { errorCopy, masaCopy } from "@peni/brand/copy";
import { formatNumber, formatTime, SEP } from "@peni/brand/format";
import { CalendarPlus, Check, Share2 } from "lucide-react";
import { useId } from "react";
import { DateBlock, LongTable } from "@/components/brand";
import { Button, buttonClasses, Chip, cx, IconButton, toast } from "@/components/ui";
import { peni } from "@/lib/client";
import { useCafe } from "./cafe-context";
import { eventBody, eventIsFull, eventIsPast, eventTopic, postDomId, postUrl, toggledRsvp } from "./masa-model";
import { usePostToggle } from "./masa-shared";

const cardScroll = "scroll-mt-[calc(var(--header-h)+var(--seg-h)+16px)]";

/**
 * Peni masası (design-system.md §9.3, §6.5, A14): a raised card with no fiş scallop.
 *
 * - Head: md `DateBlock`; beside it "PENİ MASASI" (`masa-ink`) with "19:00", and the topic in
 *   `text-h3` [G4; until a title exists, the body's first line]. The date appears only once.
 * - The body, the long table and its seats line ("6/14 yer dolu · sen de geliyorsun").
 * - "Geliyorum" (primary, `aria-pressed`) takes a seat at once (A14 inside `LongTable`); then
 *   "Geliyorsun" (secondary, `Check`) gives it back with no confirm. "Takvime ekle" downloads the
 *   .ics [G22]; "Paylaş" uses the share sheet, else copies the link ("Bağlantı kopyalandı.").
 * - Full: "Geliyorum" is disabled with the reason "Masa doldu". Past: a "GEÇTİ" tag, no actions.
 */
export function EventInvite({ post, now }: { post: PostDTO; now: Date }) {
  const { cafe, requireJoin, member } = useCafe();
  const titleId = useId();
  const { shown, act } = usePostToggle({ rsvpedByMe: post.rsvpedByMe, rsvpCount: post.rsvpCount });

  if (!post.eventStartsAt) return null;
  const startsAt = post.eventStartsAt;
  const topic = eventTopic(post);
  const body = eventBody(post);
  const past = eventIsPast(post, now);
  const full = eventIsFull({ eventCapacity: post.eventCapacity, rsvpCount: shown.rsvpCount });
  const capacity = post.eventCapacity;

  const toggle = () => {
    const send = () => act(toggledRsvp(shown), () => peni.cafes.rsvp(cafe.slug, post.id), send);
    if (member) void send();
    else requireJoin(() => void send());
  };

  const share = async () => {
    const url = postUrl(window.location.origin, cafe.slug, post.id);
    const nav = window.navigator;
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: topic, text: `${cafe.name} · Peni masası · ${formatTime(startsAt)}`, url });
        return;
      } catch (e) {
        // Closing the share sheet is a choice, not an error.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await nav.clipboard.writeText(url);
      toast.success(masaCopy.linkCopied);
    } catch {
      toast.error(errorCopy.generic);
    }
  };

  // Seats: the table's own line, except when the table is full and I'm not at it — then the
  // disabled "Geliyorum" carries "Masa doldu" as its reason, and the line isn't printed twice.
  const blockedByFull = full && !shown.rsvpedByMe && !past;

  return (
    <article
      id={postDomId(post.id)}
      data-post-id={post.id}
      aria-labelledby={titleId}
      className={cx("@container rounded-[14px] bg-surface p-4 text-ink shadow-raised md:p-5", cardScroll)}
    >
      <header className="flex items-start gap-4">
        <DateBlock date={startsAt} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="legend text-masa-ink">{masaCopy.eventLegend}</span>
            <time dateTime={startsAt} className="text-item leading-4 text-ink tabular-nums">
              {formatTime(startsAt)}
            </time>
            {past && (
              <Chip kind="tag" className="ml-auto">
                {masaCopy.past}
              </Chip>
            )}
          </p>
          <h3 id={titleId} className="font-display text-h3 break-words text-ink">
            {topic}
          </h3>
        </div>
      </header>

      {body && <p className="mt-3 text-body break-words whitespace-pre-line text-ink">{body}</p>}

      <div className="mt-5">
        {capacity != null && capacity > 0 ? (
          <>
            {/* The table top lines up with the text edge (the SVG keeps 8 units of air on its left). */}
            <LongTable
              capacity={capacity}
              seats={post.attendees}
              count={shown.rsvpCount}
              rsvpedByMe={shown.rsvpedByMe}
              caption={false}
              className="-ml-2"
            />
            {!blockedByFull && !past && (
              <p className="mt-2 text-meta text-ink tabular-nums">{masaCopy.seats(shown.rsvpCount, capacity, shown.rsvpedByMe)}</p>
            )}
          </>
        ) : (
          !past && (
            <p className="text-meta text-ink tabular-nums">
              {formatNumber(shown.rsvpCount)} kişi geliyor
              {shown.rsvpedByMe ? `${SEP}sen de geliyorsun` : ""}
            </p>
          )
        )}
        {/* Over: the table as it was, in the past tense; no "sen de geliyorsun". */}
        {past && shown.rsvpCount > 0 && (
          <p className="mt-2 text-meta text-ink tabular-nums">
            {capacity ? `${formatNumber(shown.rsvpCount)}/${formatNumber(capacity)} yer doluydu` : `${formatNumber(shown.rsvpCount)} kişi geldi`}
          </p>
        )}
      </div>

      {!past && (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 @md:flex @md:flex-wrap @md:items-start">
          <div className="col-span-2 @md:col-span-1">
            {shown.rsvpedByMe ? (
              <Button variant="secondary" aria-pressed iconStart={Check} onClick={toggle} fullWidth className="@md:w-auto">
                {masaCopy.rsvped}
              </Button>
            ) : (
              <Button
                aria-pressed={false}
                onClick={toggle}
                disabled={blockedByFull}
                disabledReason={blockedByFull ? masaCopy.full : undefined}
                fullWidth
                className="@md:w-auto"
              >
                {masaCopy.rsvp}
              </Button>
            )}
          </div>
          <a
            href={peni.cafes.icsUrl(cafe.slug, post.id)}
            download
            className={buttonClasses({ variant: "secondary" })}
          >
            <CalendarPlus aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0" />
            <span>{masaCopy.addToCalendar}</span>
          </a>
          <IconButton label={masaCopy.share} icon={Share2} size={48} onClick={() => void share()} />
        </div>
      )}
    </article>
  );
}
