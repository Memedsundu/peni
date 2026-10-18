"use client";

import type { CafeDetailDTO, PostDTO } from "@peni/api";
import { goods } from "@peni/brand/format";
import { useCallback, useEffect, useState } from "react";
import { api } from "../kasa/api";
import { Button, Notice, Photo, Sheet } from "../kasa/ui";
import { EmailSignIn, Shell, useLang, useSignedIn } from "../p/claim";
import { errorText, fill, text, type Lang, type T } from "../p/text";

/**
 * The café's page (DS25): its photo and name, the viewer's peni here, what's on the askı,
 * then the feed (plan piece 14). Anyone can read it; members like and comment.
 */
export function CafePage({ slug }: { slug: string }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [cafe, setCafe] = useState<CafeDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const load = useCallback(() => api.cafes.get(slug).then(setCafe, (e: unknown) => setError(errorText(e, lang))), [slug, lang]);
  useEffect(() => {
    if (signedIn !== null) void load();
  }, [signedIn, load]);

  /** Runs an action on the feed, then shows the café as it is now. */
  const act = async (call: () => Promise<unknown>) => {
    setError(null);
    try {
      await call();
    } catch (e) {
      setError(errorText(e, lang));
    }
    await load();
  };

  if (!cafe) {
    return (
      <Shell lang={lang} onLang={toggleLang} hue={null}>
        {error ? <Notice tone="red">{error}</Notice> : <p className="text-muted">{t("loading")}</p>}
      </Shell>
    );
  }
  const member = !!cafe.membership;
  const askiItems = cafe.menu.filter((m) => m.askida && m.available);
  const waiting = goods(cafe.askida.balancePeni, askiItems);
  const ask = member ? null : signedIn ? "join" : "signIn";

  return (
    <Shell lang={lang} onLang={toggleLang} hue={cafe.hue}>
      <section className="flex flex-col gap-4">
        <Photo src={cafe.coverImageUrl} alt={cafe.name} label={t("photoN").replace("{n}", "")} className="aspect-[4/3] w-full rounded-3xl" />
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-5xl leading-[1.05]">{cafe.name}</h1>
          {(cafe.district || cafe.address) && <p className="text-muted">{[cafe.address, cafe.district].filter(Boolean).join(" · ")}</p>}
        </div>
      </section>

      {member ? (
        <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-muted">{t("yourPeni")}</span>
            <span className="tabular font-serif text-5xl leading-none text-[var(--cafe)]">
              {cafe.membership!.balancePeni} <span className="text-2xl">peni</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a href={`/harca?kafe=${encodeURIComponent(cafe.slug)}`} className="flex min-h-12 items-center justify-center rounded-full border border-line bg-paper font-semibold">
              {t("payWithPeni")}
            </a>
            <a href={`/ismarla?kafe=${encodeURIComponent(cafe.slug)}`} className="flex min-h-12 items-center justify-center rounded-full border border-line bg-paper font-semibold">
              {t("treatSomeoneHere")}
            </a>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-3xl bg-panel p-5">
          <p className="leading-normal">{ask === "join" ? t("joinHelp") : t("signInToJoin")}</p>
          <Button
            kind="primary"
            size="lg"
            className="border-[var(--cafe)] bg-[var(--cafe)]"
            onClick={() => (ask === "join" ? void act(() => api.cafes.join(cafe.slug)) : setSigningIn(true))}
          >
            {ask === "join" ? t("joinCafe") : t("signIn")}
          </Button>
        </section>
      )}

      {cafe.askida.enabled && (
        <a href={`/aski?kafe=${encodeURIComponent(cafe.slug)}`} className="flex min-h-14 items-center justify-between border-y border-line text-lg">
          <span>{waiting ? fill(t("askidaLink"), { goods: waiting }) : t("askidaLinkEmpty")}</span>
          <span aria-hidden="true" className="text-muted">
            →
          </span>
        </a>
      )}

      {error && <Notice tone="red">{error}</Notice>}
      <section aria-label={t("fromCafe")} className="flex flex-col gap-10">
        {cafe.posts.length === 0 && <p className="py-6 text-center text-muted">{t("noFeed")}</p>}
        {cafe.posts.map((p) => (
          <Post key={p.id} t={t} lang={lang} slug={cafe.slug} post={p} member={member} act={act} onNeedMember={() => (signedIn ? void act(() => api.cafes.join(cafe.slug)) : setSigningIn(true))} />
        ))}
      </section>

      {signingIn && (
        <Sheet title={t("signIn")} onClose={() => setSigningIn(false)} labelClose={t("close")}>
          <EmailSignIn
            t={t}
            lang={lang}
            action={t("signIn")}
            prompt={t("signInToJoin")}
            onSignedIn={async () => {
              setSigningIn(false);
              markSignedIn();
            }}
          />
        </Sheet>
      )}
    </Shell>
  );
}

function Post({
  t,
  lang,
  slug,
  post,
  member,
  act,
  onNeedMember,
}: {
  t: T;
  lang: Lang;
  slug: string;
  post: PostDTO;
  member: boolean;
  act: (call: () => Promise<unknown>) => Promise<void>;
  onNeedMember: () => void;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (call: () => Promise<unknown>) => {
    setBusy(true);
    await act(call);
    setBusy(false);
  };
  const date = (iso: string, withWeekday = false) =>
    new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", {
      ...(withWeekday ? { weekday: "long" } : {}),
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  const label = post.kind === "event" ? t("eventLabel") : post.kind === "question" ? t("questionOfDay") : null;

  return (
    <article className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {post.pinned && <span className="rounded-full bg-[var(--cafe)] px-3 py-1 font-medium text-paper">{t("pinnedPost")}</span>}
        {label && <span className="rounded-full bg-panel px-3 py-1">{label}</span>}
        <span>{date(post.publishedAt)}</span>
      </p>
      {post.title && <h2 className="font-serif text-3xl leading-tight">{post.title}</h2>}
      {post.kind === "event" && post.eventStartsAt && <p className="text-lg">{date(post.eventStartsAt, true)}</p>}

      {post.imageUrls.length === 1 && <img src={post.imageUrls[0]} alt={t("photoN").replace("{n}", "1")} className="max-h-[560px] w-full rounded-3xl object-cover" />}
      {post.imageUrls.length > 1 && (
        <div className="-mx-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-6 pb-1">
          {post.imageUrls.map((url, i) => (
            <img key={url} src={url} alt={t("photoN").replace("{n}", String(i + 1))} className="aspect-[4/5] w-[85%] shrink-0 snap-center rounded-3xl object-cover" />
          ))}
        </div>
      )}
      {post.body && <p className="whitespace-pre-line text-[17px] leading-relaxed">{post.body}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={post.reactedByMe}
          aria-label={post.reactedByMe ? t("unlike") : t("like")}
          disabled={busy}
          onClick={() => (member ? void run(() => api.cafes.react(slug, post.id)) : onNeedMember())}
          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 ${post.reactedByMe ? "border-[var(--cafe)] text-[var(--cafe)]" : "border-line"}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={post.reactedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
          </svg>
          <span className="tabular">{post.reactionCount}</span>
        </button>
        {post.kind === "event" && (
          <Button
            kind={post.rsvpedByMe ? "primary" : "quiet"}
            size="sm"
            disabled={busy}
            onClick={() => (member ? void run(() => api.cafes.rsvp(slug, post.id)) : onNeedMember())}
            className={post.rsvpedByMe ? "border-[var(--cafe)] bg-[var(--cafe)]" : ""}
          >
            {post.rsvpedByMe ? `${t("goingYes")} ✓` : t("join")}
          </Button>
        )}
        <span className="ml-auto text-sm text-muted">
          {post.kind === "event" ? fill(t("goingN"), { n: post.rsvpCount }) : fill(t("commentsN"), { n: post.commentCount })}
        </span>
      </div>

      {post.comments.length > 0 && (
        <ul className="flex flex-col gap-3 border-l-2 border-line pl-4">
          {post.comments.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3">
              <span>
                <strong className="font-semibold">{c.authorName}</strong> {c.body}
              </span>
              {c.mine && (
                <Button kind="bare" size="sm" className="-my-2 shrink-0 px-2 underline underline-offset-4" disabled={busy} onClick={() => void run(() => api.cafes.deleteComment(slug, post.id, c.id))}>
                  {t("deleteComment")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {post.kind === "question" && post.answeredTodayByMe && <p className="text-sm text-muted">{t("answeredToday")}</p>}
      {member && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = comment.trim();
            if (!body) return;
            void run(() => api.cafes.comment(slug, post.id, body)).then(() => setComment(""));
          }}
        >
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            placeholder={post.kind === "question" ? t("writeAnswer") : t("writeComment")}
            aria-label={post.kind === "question" ? t("writeAnswer") : t("writeComment")}
            className="min-h-12 min-w-0 flex-1 rounded-full border border-line bg-paper px-5 text-base outline-none focus:border-ink"
          />
          <Button kind="secondary" type="submit" disabled={busy || !comment.trim()}>
            {t("sendComment")}
          </Button>
        </form>
      )}
    </article>
  );
}
