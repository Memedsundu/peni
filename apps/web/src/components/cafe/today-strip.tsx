"use client";

import type { CafeDetailDTO, PostDTO } from "@peni/api";
import { masaCopy } from "@peni/brand/copy";
import { formatTime, relDay, SEP } from "@peni/brand/format";
import { ArrowDown } from "lucide-react";
import { DateBlock } from "@/components/brand";
import { colorMotion, cx, focusRingInset, tappable } from "@/components/ui";

/** The next Peni masası that hasn't started, soonest first. */
export function upcomingEvent(posts: readonly PostDTO[], now: Date): PostDTO | null {
  return (
    posts
      .filter((p) => p.kind === "event" && p.eventStartsAt && Date.parse(p.eventStartsAt) > now.getTime())
      .sort((a, b) => Date.parse(a.eventStartsAt!) - Date.parse(b.eventStartsAt!))[0] ?? null
  );
}

/** Today's question: a question posted today (Istanbul), the pinned one first. */
export function todaysQuestion(posts: readonly PostDTO[], now: Date): PostDTO | null {
  const today = posts.filter((p) => p.kind === "question" && relDay(p.publishedAt, now) === "bugün");
  return today.find((p) => p.pinned) ?? today[0] ?? null;
}

/** An event's topic [G4], or the first line of its body until the title exists. */
export function eventTopic(post: PostDTO): string {
  return post.title?.trim() || post.body.split("\n")[0]!.trim();
}

/**
 * "Bugün masada" (design-system.md §9.3 item 5): a `masa-soft` strip with up to two rows that
 * scroll to the Masa section. Only when there is an upcoming Peni masası or a question today.
 */
export function TodayStrip({ cafe, now, onGo }: { cafe: CafeDetailDTO; now: Date; onGo: (postId: string) => void }) {
  const event = upcomingEvent(cafe.posts, now);
  const question = todaysQuestion(cafe.posts, now);
  if (!event && !question) return null;

  return (
    <section aria-labelledby="bugun-masada" className="rounded-[10px] bg-masa-soft p-3">
      <h2 id="bugun-masada" className="legend px-1 text-masa-ink">
        {masaCopy.todayLegend}
      </h2>
      <ul className="mt-2 flex flex-col">
        {event && (
          <li>
            <StripButton onClick={() => onGo(event.id)}>
              <DateBlock date={event.eventStartsAt!} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-meta text-ink-2">
                  Peni masası{SEP}
                  <span className="tabular-nums">{formatTime(event.eventStartsAt!)}</span>
                </span>
                <span className="line-clamp-2 text-item text-ink">{eventTopic(event)}</span>
              </span>
            </StripButton>
          </li>
        )}
        {question && (
          <li className={cx(event && "border-t border-masa-ink/15")}>
            <StripButton onClick={() => onGo(question.id)}>
              <span className="sr-only">Günün sorusu: </span>
              <span className="min-w-0 flex-1 truncate font-display text-[17px] leading-6 font-medium text-ink italic">
                {question.body}
              </span>
            </StripButton>
          </li>
        )}
      </ul>
    </section>
  );
}

function StripButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        // px-2 −mx-1 keeps the text axis and gives the inset focus ring air off the first glyph.
        "group -mx-1 flex min-h-12 w-[calc(100%+8px)] items-center gap-3 rounded-[8px] px-2 py-2 text-left",
        tappable,
        colorMotion,
        focusRingInset,
        "hover:bg-masa-ink/5 active:bg-masa-ink/10",
      )}
    >
      {children}
      <ArrowDown aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0 text-masa-ink" />
    </button>
  );
}
