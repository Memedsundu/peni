"use client";

import type { PostDTO } from "@peni/api";
import { longTableLayout } from "@peni/brand/shapes";
import { errorCopy, masaCopy } from "@peni/brand/copy";
import { formatTime } from "@peni/brand/format";
import { CalendarPlus, Check, Share2 } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, type CSSProperties, type MouseEvent } from "react";
import { DateBlock, LongTable } from "@/components/brand";
import { Button, buttonClasses, Chip, cx, IconButton, toast } from "@/components/ui";
import { peni } from "@/lib/client";
import { useCafe } from "./cafe-context";
import {
  eventBody,
  eventIcs,
  eventIsFull,
  eventIsPast,
  eventTopic,
  icsFilename,
  masaMoreCopy,
  postDomId,
  postUrl,
  toggledRsvp,
  type MasaIntentKind,
} from "./masa-model";
import { clearOfBars, revealSoon, saveFile, useJoinFor, usePostToggle } from "./masa-shared";

const cardScroll = "scroll-mt-[calc(var(--header-h)+var(--seg-h)+16px)]";

/**
 * Peni masası (design-system.md §9.3, §6.5, A14): a raised card with no fiş scallop.
 *
 * - Head: md `DateBlock`; beside it "PENİ MASASI" (`masa-ink`) with "19:00", and the topic in
 *   `text-h3` [G4; until a title exists, the body's first line]. The date appears only once.
 * - The body (at most 60ch wide), the long table and its seats line ("6/14 yer dolu · sen de
 *   geliyorsun"). From a 448px card the table is drawn a quarter larger and the seats line sits
 *   beside it, level with the table top, so a wide card doesn't leave the table stranded.
 * - "Geliyorum" (primary, `aria-pressed`) takes a seat at once (A14 inside `LongTable`); then
 *   "Geliyorsun" (secondary, `Check`) gives it back with no confirm. "Takvime ekle" downloads the
 *   .ics [G22]; "Paylaş" uses the share sheet, else copies the link ("Bağlantı kopyalandı.").
 * - Signed out, "Geliyorum" goes to /giris and the seat is taken on return (`intent="rsvp"`).
 * - Full: "Geliyorum" is disabled with the reason "Masa doldu".
 * - Past: a "GEÇTİ" tag, the small date block, the body in `ink-2`, one line for how full the
 *   table was ("9/12 yer doluydu") and no actions. Only an upcoming table is drawn, so the
 *   invitation that is still open is the one the eye lands on.
 */
export function EventInvite({
  post,
  now,
  intent = null,
  onIntentDone,
}: {
  post: PostDTO;
  now: Date;
  /** An action brought back from /giris for this card (only "rsvp" applies here). */
  intent?: MasaIntentKind | null;
  onIntentDone?: () => void;
}) {
  const { cafe, member } = useCafe();
  const titleId = useId();
  const joinFor = useJoinFor();
  const rsvpButton = useRef<HTMLButtonElement>(null);
  const { shown, act } = usePostToggle(
    { rsvpedByMe: post.rsvpedByMe, rsvpCount: post.rsvpCount },
    { kind: "rsvp", postId: post.id },
  );

  const startsAt = post.eventStartsAt;
  const past = startsAt ? eventIsPast(post, now) : false;
  const full = eventIsFull({ eventCapacity: post.eventCapacity, rsvpCount: shown.rsvpCount });

  const send = () => act(toggledRsvp(shown), () => peni.cafes.rsvp(cafe.slug, post.id), send);
  const toggle = () => {
    if (member) void send();
    else joinFor({ kind: "rsvp", postId: post.id }, () => void send());
  };

  // Back from /giris (and the join the page finished): take the seat, unless it is already
  // mine, the table filled up meanwhile or it is over. Focus lands on the button either way.
  const replay = useEffectEvent(() => {
    onIntentDone?.();
    if (!startsAt || past) return;
    if (!shown.rsvpedByMe && !full) void send();
    rsvpButton.current?.focus({ preventScroll: true });
    revealSoon(rsvpButton.current);
  });
  useEffect(() => {
    if (intent === "rsvp" && member) replay();
  }, [intent, member]);

  if (!startsAt) return null;
  const topic = eventTopic(post);
  const body = eventBody(post);
  const capacity = post.eventCapacity;

  // "Takvime ekle": the server's file [G22]; if it can't be had, the same file built here (§9.3).
  // The link stays a real `download` link, for when the script hasn't loaded.
  const addToCalendar = async (event: MouseEvent<HTMLAnchorElement>) => {
    // A modified click (new tab, save as…) is the browser's to handle.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const href = event.currentTarget.href;
    try {
      const res = await fetch(href, { headers: { accept: "text/calendar" } });
      if (!res.ok) throw new Error(String(res.status));
      saveFile(icsFilename(startsAt), await res.blob());
    } catch {
      try {
        const file = eventIcs(post, cafe, new Date(), postUrl(window.location.origin, cafe.slug, post.id));
        if (!file) throw new Error("no event");
        saveFile(file.filename, new Blob([file.body], { type: "text/calendar;charset=utf-8" }));
      } catch {
        toast.error(errorCopy.generic);
      }
    }
  };

  const share = async () => {
    const url = postUrl(window.location.origin, cafe.slug, post.id);
    const nav = window.navigator;
    if (typeof nav.share === "function") {
      try {
        // The words carry the day too: the person it reaches has no date block to look at.
        await nav.share({ title: topic, text: masaMoreCopy.shareText(cafe.name, startsAt), url });
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
  // The drawn width, which the wide card scales by a quarter (the SVG keeps its proportions).
  const tableStyle =
    capacity != null && capacity > 0 ? ({ "--table-w": `${longTableLayout(capacity, []).width}px` } as CSSProperties) : undefined;

  return (
    <article
      id={postDomId(post.id)}
      data-post-id={post.id}
      aria-labelledby={titleId}
      className={cx("@container rounded-[14px] bg-surface p-4 text-ink shadow-raised md:p-5", cardScroll)}
    >
      <header className="flex items-start gap-4">
        <DateBlock date={startsAt} size={past ? "sm" : "md"} />
        <div className={cx("flex min-w-0 flex-1 flex-col gap-1.5", past ? "pt-0" : "pt-0.5")}>
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

      {body && (
        <p className={cx("mt-3 max-w-[60ch] text-body break-words whitespace-pre-line", past ? "text-ink-2" : "text-ink")}>
          {body}
        </p>
      )}

      {past ? (
        // Over: how full the table was, in the past tense; the table itself is no longer drawn.
        shown.rsvpCount > 0 && (
          <p className="mt-3 text-meta text-ink-2 tabular-nums">
            {capacity ? masaMoreCopy.seatsPast(shown.rsvpCount, capacity) : masaMoreCopy.came(shown.rsvpCount)}
          </p>
        )
      ) : (
        <div className="mt-5">
          {capacity != null && capacity > 0 ? (
            <div style={tableStyle} className="flex flex-col gap-2 @md:flex-row @md:items-center @md:gap-6">
              {/*
                The table top lines up with the text edge: the SVG keeps 8 units of air on its
                left (10px once drawn a quarter larger).
              */}
              <LongTable
                capacity={capacity}
                seats={post.attendees}
                count={shown.rsvpCount}
                rsvpedByMe={shown.rsvpedByMe}
                caption={false}
                className="-ml-2 shrink-0 @md:-ml-2.5 @md:[&>svg]:w-[calc(var(--table-w)*1.25)]"
              />
              {!blockedByFull && (
                <p className="text-meta text-ink tabular-nums">{masaMoreCopy.seats(shown.rsvpCount, capacity, shown.rsvpedByMe)}</p>
              )}
            </div>
          ) : (
            <p className="text-meta text-ink tabular-nums">{masaMoreCopy.attending(shown.rsvpCount, shown.rsvpedByMe)}</p>
          )}
        </div>
      )}

      {!past && (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 @md:flex @md:flex-wrap @md:items-start">
          <div className="col-span-2 @md:col-span-1">
            {shown.rsvpedByMe ? (
              <Button
                ref={rsvpButton}
                variant="secondary"
                aria-pressed
                iconStart={Check}
                onClick={toggle}
                fullWidth
                className={cx("@md:w-auto", clearOfBars)}
              >
                {masaCopy.rsvped}
              </Button>
            ) : (
              <Button
                ref={rsvpButton}
                aria-pressed={false}
                onClick={toggle}
                disabled={blockedByFull}
                disabledReason={blockedByFull ? masaCopy.full : undefined}
                fullWidth
                className={cx("@md:w-auto", clearOfBars)}
              >
                {masaCopy.rsvp}
              </Button>
            )}
          </div>
          <a
            href={peni.cafes.icsUrl(cafe.slug, post.id)}
            download={icsFilename(startsAt)}
            onClick={(e) => void addToCalendar(e)}
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
