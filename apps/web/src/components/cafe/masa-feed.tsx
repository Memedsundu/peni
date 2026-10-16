"use client";

import type { PostDTO } from "@peni/api";
import { masaCopy } from "@peni/brand/copy";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { Masthead } from "@/components/brand";
import { EmptyState, Skeleton } from "@/components/ui";
import { useCafe } from "./cafe-context";
import { EventInvite } from "./masa-event";
import { feedOrder } from "./masa-model";
import { CafePost } from "./masa-post";
import { QuestionCard } from "./masa-question";
import { useFocusClearOfBars } from "./masa-shared";

/**
 * Masa, the café's feed (design-system.md §9.3 "Masa"): h2 "Masa", the compact masthead
 * ("MODA KAHVESİ GAZETESİ · 16 EKİM 2026"), then the cards — pinned on top, newest first:
 * Günün sorusu (`QuestionCard`), Peni masası (`EventInvite`) and café posts (`CafePost`).
 *
 * It takes no props; everything comes from `useCafe()`. Actions go through
 * `peni.cafes.react / rsvp / comment`, then `refresh()`. A failed action never wipes the feed:
 * the optimistic state rolls back and a toast says why.
 */
export function MasaFeed() {
  const { cafe } = useCafe();
  // One clock for the whole feed, so "bugün", "GEÇTİ" and the dateline agree.
  const [now] = useState(() => new Date());
  const posts = feedOrder(cafe.posts);
  const keepClear = useFocusClearOfBars();

  return (
    <div className="flex flex-col" onFocus={keepClear}>
      <h2 className="font-display text-h2 text-ink">{masaCopy.section}</h2>
      <Masthead cafe={cafe} date={now} compact className="mt-3" />

      {posts.length === 0 ? (
        <EmptyState icon={MessageCircle} text={masaCopy.empty} className="mt-4" />
      ) : (
        <div className="mt-6 flex flex-col gap-4 md:gap-5">
          {posts.map((post) => (
            <MasaItem key={post.id} post={post} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function MasaItem({ post, now }: { post: PostDTO; now: Date }) {
  switch (post.kind) {
    case "question":
      return <QuestionCard post={post} now={now} />;
    case "event":
      return <EventInvite post={post} now={now} />;
    default:
      return <CafePost post={post} now={now} />;
  }
}

/** The Masa section while the café loads: the heading, the dateline and one card's shape. */
export function MasaFeedSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      <h2 className="font-display text-h2 text-ink">{masaCopy.section}</h2>
      <div aria-hidden className="mt-3 rule-ink" />
      <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
      <div className="mt-6 flex flex-col gap-4 rounded-[14px] bg-masa-soft p-4 md:p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="mt-1 h-16 w-full" radius={10} />
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-raised md:p-5">
        <div className="flex gap-4">
          <Skeleton className="h-16 w-14" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-full" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-[92px] w-60 max-w-full" />
      </div>
    </div>
  );
}
