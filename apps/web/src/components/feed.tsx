"use client";

import type { PostDTO } from "@peni/api";
import { Check, Heart } from "lucide-react";
import { useState } from "react";
import { peni } from "@/lib/client";
import { eventTime, timeAgo } from "@/lib/format";

const KIND_LABEL: Record<PostDTO["kind"], string | null> = {
  post: null,
  question: "Günün sorusu",
  event: "Peni masası",
};

export function Feed({ slug, posts, canInteract, onChange }: { slug: string; posts: PostDTO[]; canInteract: boolean; onChange: () => void }) {
  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl font-semibold">Masa</h2>
      {posts.map((p) => (
        <PostCard key={p.id} slug={slug} post={p} canInteract={canInteract} onChange={onChange} />
      ))}
    </section>
  );
}

function PostCard({ slug, post, canInteract, onChange }: { slug: string; post: PostDTO; canInteract: boolean; onChange: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const label = KIND_LABEL[post.kind];
  const full = post.eventCapacity !== null && post.rsvpCount >= post.eventCapacity;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`card p-5 ${post.kind === "event" ? "border-copper" : ""}`}>
      <div className="mb-2 flex items-center gap-2 text-xs text-ink-2">
        {label && <span className="rounded-full bg-copper-soft px-2 py-0.5 font-semibold text-copper">{label}</span>}
        {post.pinned && <span>Sabitlendi</span>}
        <span className="ml-auto">{timeAgo(post.publishedAt)}</span>
      </div>
      <p className="whitespace-pre-line">{post.body}</p>
      {post.eventStartsAt && (
        <p className="mt-3 text-sm font-medium">
          {eventTime(post.eventStartsAt)} · {post.rsvpCount}
          {post.eventCapacity ? ` / ${post.eventCapacity}` : ""} kişi geliyor
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className={`btn ${post.reactedByMe ? "btn-primary" : "btn-ghost"}`}
          disabled={!canInteract || busy}
          onClick={() => act(() => peni.cafes.react(slug, post.id))}
          aria-pressed={post.reactedByMe}
        >
          <Heart aria-hidden size={16} strokeWidth={1.75} className="inline-block" /> {post.reactionCount}
        </button>
        {post.kind === "event" && (
          <button
            className={`btn ${post.rsvpedByMe ? "btn-leaf" : "btn-ghost"}`}
            disabled={!canInteract || busy || (full && !post.rsvpedByMe)}
            onClick={() => act(() => peni.cafes.rsvp(slug, post.id))}
          >
            {post.rsvpedByMe ? (
              <>
                Geliyorum <Check aria-hidden size={16} strokeWidth={1.75} className="inline-block" />
              </>
            ) : full ? (
              "Masa dolu"
            ) : (
              "Ben de geliyorum"
            )}
          </button>
        )}
      </div>

      {post.comments.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
          {post.comments.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">{c.authorName}</span> {c.body}
            </li>
          ))}
        </ul>
      )}
      {canInteract && (post.kind === "question" || post.kind === "event") && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!comment.trim()) return;
            void act(async () => {
              await peni.cafes.comment(slug, post.id, comment);
              setComment("");
            });
          }}
        >
          <input
            className="input"
            placeholder={post.kind === "question" ? "Cevabını yaz…" : "Bir not bırak…"}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
          />
          <button className="btn btn-ghost" disabled={busy}>
            Gönder
          </button>
        </form>
      )}
    </article>
  );
}
