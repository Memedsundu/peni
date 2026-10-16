"use client";

import type { PostDTO } from "@peni/api";
import { masaCopy } from "@peni/brand/copy";
import { formatNumber, relDay } from "@peni/brand/format";
import { Heart, MessageCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CafeHueBand, Coin } from "@/components/brand";
import { cx, focusRing, pressMotion, tappable } from "@/components/ui";
import { peni } from "@/lib/client";
import { useCafe } from "./cafe-context";
import { masaMoreCopy, newestFirst, postDomId, toggledHeart, whenLabel } from "./masa-model";
import { CommentForm, JoinPopover, Reveal, useJoinLabel, usePostToggle } from "./masa-shared";

const cardScroll = "scroll-mt-[calc(var(--header-h)+var(--seg-h)+16px)]";

/** The footer's quiet 44px controls: the heart and "4 yorum". */
const footerButton = cx(
  "inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-button text-ink",
  "hover:bg-surface-2 active:bg-surface-2",
  tappable,
  focusRing,
  pressMotion,
);

/**
 * Café post (design-system.md §9.3): a raised card with a 3px café-hue left edge.
 *
 * - Head: the 28px café coin, the café name (`text-button`) and `relDay` (`meta`).
 * - The body.
 * - Footer: `HeartButton` (optimistic; filled ink when mine; count `tabular-nums`) and "4 yorum",
 *   which opens the comments in place; members get the "Yorum yaz" field there.
 * - Non-members tapping the heart get a popover: "Kalp bırakmak için kafeye katıl." + "Katıl".
 */
export function CafePost({ post, now }: { post: PostDTO; now: Date }) {
  const { cafe, member } = useCafe();
  const titleId = useId();
  const commentsId = useId();
  const [open, setOpen] = useState(false);
  const comments = newestFirst(post.comments);
  const count = Math.max(post.commentCount, comments.length);

  return (
    <article
      id={postDomId(post.id)}
      data-post-id={post.id}
      aria-labelledby={titleId}
      className={cx("flex overflow-hidden rounded-[14px] bg-surface text-ink shadow-raised", cardScroll)}
    >
      <CafeHueBand slug={cafe.slug} hue={cafe.hue} size={3} orientation="vertical" />
      <div className="min-w-0 flex-1 p-4 md:p-5">
        <header className="flex items-center gap-2.5">
          <Coin size={28} cafe={cafe} />
          <p id={titleId} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="text-button text-ink">{cafe.name}</span>
            <time dateTime={post.publishedAt} className="text-meta text-ink-2">
              {relDay(post.publishedAt, now)}
            </time>
          </p>
        </header>

        <p className="mt-3 text-body-lg break-words whitespace-pre-line text-ink">{post.body}</p>

        <div className="-ml-3 mt-2 -mb-2 flex flex-wrap items-center gap-1 md:-mb-3">
          <HeartButton post={post} />
          {count > 0 ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={commentsId}
              onClick={() => setOpen((v) => !v)}
              className={footerButton}
            >
              <MessageCircle aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0" />
              <span className="tabular-nums">{masaCopy.comments(count)}</span>
            </button>
          ) : (
            member && (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={commentsId}
                onClick={() => setOpen((v) => !v)}
                className={footerButton}
              >
                <MessageCircle aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0" />
                <span>{masaCopy.commentLabel}</span>
              </button>
            )
          )}
        </div>

        <Reveal open={open} id={commentsId}>
          <div className="mt-3 border-t border-line pt-1 md:mt-4">
            {comments.length > 0 && (
              <ul aria-label={masaMoreCopy.commentsLabel} className="flex flex-col divide-y divide-line">
                {comments.map((c) => (
                  <li key={c.id} className="py-3">
                    <p className="text-meta text-ink-2">
                      {c.authorName}
                      {" · "}
                      <time dateTime={c.createdAt} className="tabular-nums">
                        {whenLabel(c.createdAt, now)}
                      </time>
                    </p>
                    <p className="mt-1 text-body break-words whitespace-pre-line text-ink">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {member && (
              <CommentForm
                postId={post.id}
                label={masaCopy.commentLabel}
                // With no comments yet, the "Yorum yaz" toggle right above already names the field.
                labelHidden={comments.length === 0}
                autoFocus={open && comments.length === 0}
                className={cx(comments.length > 0 ? "border-t border-line pt-4" : "pt-3", "pb-1")}
              />
            )}
          </div>
        </Reveal>
      </div>
    </article>
  );
}

/**
 * HeartButton (§9.3): 44px, `Heart`, filled ink when mine, the count in `tabular-nums`. The
 * tap shows at once; a failure puts it back and says why in a toast. Non-members get the join
 * popover instead.
 */
export function HeartButton({ post }: { post: PostDTO }) {
  const { cafe, member, requireJoin } = useCafe();
  const joinLabel = useJoinLabel(masaCopy.heartJoinAction);
  const { shown, act } = usePostToggle({ reactedByMe: post.reactedByMe, reactionCount: post.reactionCount });
  // Joining swaps the popover trigger for the member's heart: focus follows to the new button.
  const button = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!member || !refocus.current) return;
    refocus.current = false;
    button.current?.focus({ preventScroll: true });
  }, [member]);

  const react = () => {
    const send = () => act(toggledHeart(shown), () => peni.cafes.react(cafe.slug, post.id), send);
    void send();
  };

  const face = (
    <>
      <Heart
        aria-hidden
        size={20}
        strokeWidth={1.75}
        fill={shown.reactedByMe ? "currentColor" : "none"}
        className="size-5 shrink-0"
      />
      <span className="sr-only">{masaMoreCopy.heart}</span>
      {shown.reactionCount > 0 && <span className="tabular-nums">{formatNumber(shown.reactionCount)}</span>}
    </>
  );

  if (!member) {
    return (
      <JoinPopover
        trigger={face}
        triggerClassName={footerButton}
        text={masaCopy.heartJoin}
        action={joinLabel}
        onJoin={() =>
          requireJoin(() => {
            refocus.current = true;
            void act(toggledHeart(shown), () => peni.cafes.react(cafe.slug, post.id));
          })
        }
      />
    );
  }

  return (
    <button ref={button} type="button" aria-pressed={shown.reactedByMe} onClick={react} className={footerButton}>
      {face}
    </button>
  );
}

