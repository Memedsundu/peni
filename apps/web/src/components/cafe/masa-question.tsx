"use client";

import type { PostDTO } from "@peni/api";
import { masaCopy } from "@peni/brand/copy";
import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button, cx } from "@/components/ui";
import { useCafe } from "./cafe-context";
import { ANSWERS_SHOWN, newestFirst, postDomId, whenLabel } from "./masa-model";
import { CommentForm, Reveal, useJoinLabel } from "./masa-shared";

const cardScroll = "scroll-mt-[calc(var(--header-h)+var(--seg-h)+16px)]";

/**
 * Günün sorusu (design-system.md §9.3): a flat `masa-soft` card, radius 14, padding 16.
 *
 * - Legend "GÜNÜN SORUSU" (`masa-ink`) and the time; the question in `text-question` italic.
 * - The three newest answers as notes on `surface`: "Ayşe K. · 09:12" and the body. A quiet
 *   "12 cevabın hepsini gör" opens the rest in place.
 * - Members: "Sen de cevapla" reveals `Field label="Cevabın"` + "Gönder"; once they have
 *   answered today: "Bugünkü cevabın masada." [G13]. Non-members: "Cevap yazmak için kafeye katıl."
 */
export function QuestionCard({ post, now }: { post: PostDTO; now: Date }) {
  const { member, requireJoin } = useCafe();
  const joinLabel = useJoinLabel();
  const titleId = useId();
  const restId = useId();
  const [allOpen, setAllOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  // The server says so on the next read [G13]; this covers the moment in between (and a failed re-read).
  const [justAnswered, setJustAnswered] = useState(false);
  const answeredRef = useRef<HTMLParagraphElement>(null);
  const answered = post.answeredTodayByMe || justAnswered;

  const answers = newestFirst(post.comments);
  const first = answers.slice(0, ANSWERS_SHOWN);
  const rest = answers.slice(ANSWERS_SHOWN);

  useEffect(() => {
    if (justAnswered) answeredRef.current?.focus({ preventScroll: true });
  }, [justAnswered]);

  return (
    <article
      id={postDomId(post.id)}
      data-post-id={post.id}
      aria-labelledby={titleId}
      className={cx("rounded-[14px] bg-masa-soft p-4 text-ink md:p-5", cardScroll)}
    >
      <header className="flex items-baseline justify-between gap-3">
        <p className="legend text-masa-ink">{masaCopy.questionLegend}</p>
        <time dateTime={post.publishedAt} className="text-meta text-ink-2 tabular-nums">
          {whenLabel(post.publishedAt, now)}
        </time>
      </header>

      <h3 id={titleId} className="mt-3 font-display text-question break-words text-ink italic md:text-[26px] md:leading-8">
        {post.body}
      </h3>

      {answers.length > 0 && (
        <div className="mt-4">
          <ul aria-label="Cevaplar" className="flex flex-col gap-2">
            {first.map((a) => (
              <AnswerNote key={a.id} answer={a} now={now} />
            ))}
          </ul>
          {rest.length > 0 && (
            <>
              <Reveal open={allOpen} id={restId}>
                <ul aria-label="Önceki cevaplar" className="flex flex-col gap-2 pt-2">
                  {rest.map((a) => (
                    <AnswerNote key={a.id} answer={a} now={now} />
                  ))}
                </ul>
              </Reveal>
              <Button
                variant="quiet"
                size="sm"
                aria-expanded={allOpen}
                aria-controls={restId}
                onClick={() => setAllOpen((v) => !v)}
                className="-ml-3 mt-1"
              >
                {allOpen ? "Daha az göster" : masaCopy.allAnswers(answers.length)}
              </Button>
            </>
          )}
        </div>
      )}

      <div className={cx(answers.length > 0 && rest.length === 0 ? "mt-4" : rest.length > 0 ? "mt-2" : "mt-5")}>
        {!member ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-body text-ink">{masaCopy.answerJoin}</p>
            <Button variant="secondary" size="sm" onClick={() => requireJoin(() => setComposing(true))}>
              {joinLabel}
            </Button>
          </div>
        ) : answered ? (
          <p ref={answeredRef} tabIndex={-1} role="status" className="flex items-center gap-2 text-body text-ink outline-none">
            <Check aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0 text-masa-ink" />
            {masaCopy.answered}
          </p>
        ) : composing ? (
          <CommentForm
            postId={post.id}
            label={masaCopy.answerLabel}
            autoFocus
            onSent={() => {
              setComposing(false);
              setJustAnswered(true);
            }}
            onCancel={() => setComposing(false)}
          />
        ) : (
          <Button variant="secondary" onClick={() => setComposing(true)}>
            {masaCopy.answer}
          </Button>
        )}
      </div>
    </article>
  );
}

function AnswerNote({ answer, now }: { answer: PostDTO["comments"][number]; now: Date }) {
  return (
    <li className="rounded-[10px] bg-surface px-3.5 py-3">
      <p className="text-meta text-ink-2">
        {answer.authorName}
        {" · "}
        <time dateTime={answer.createdAt} className="tabular-nums">
          {whenLabel(answer.createdAt, now)}
        </time>
      </p>
      <p className="mt-1 text-body break-words whitespace-pre-line text-ink">{answer.body}</p>
    </li>
  );
}
