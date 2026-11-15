"use client";

import type { CafeDetailDTO, PostDTO, ReportInput } from "@peni/api";
import { goods } from "@peni/brand/format";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../kasa/api";
import { Button, Coin, Notice, Photo, Sheet } from "../kasa/ui";
import { EmailSignIn, Shell, useLang, useSignedIn } from "../p/claim";
import { errorText, fill, text, type Lang, type T } from "../p/text";

/**
 * The café's page (DS25): its name, the viewer's peni here, what's on the askı, then the feed
 * (plan piece 14). Anyone can read it; members like, comment, open events and report what
 * other members wrote (piece 15). The top is kept short, so the feed starts on the first
 * screen of a phone. The feed comes a page at a time. With `postId` it is one post's own
 * page, the one a shared link opens: the café's name, that post with all its comments, and
 * the way to the rest.
 */
export function CafePage({ slug, postId }: { slug: string; postId?: string }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [cafe, setCafe] = useState<CafeDetailDTO | null>(null);
  /** The feed as far as it has been read: the first page, then each older page asked for. */
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [older, setOlder] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A short word that something worked ("Bağlantı kopyalandı"). */
  const [notice, setNotice] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  /** A link to copy by hand, where the browser offers neither a share sheet nor its clipboard. */
  const [linkToCopy, setLinkToCopy] = useState<string | null>(null);
  /** null: closed; "new": opening one; a post: editing it. */
  const [eventSheet, setEventSheet] = useState<"new" | PostDTO | null>(null);
  const [reporting, setReporting] = useState<(ReportTarget & { already: boolean }) | null>(null);
  /** Taps already on their way to the café, so a second tap doesn't undo the first. */
  const sending = useRef(new Set<string>());
  /** Whether older pages have been read: a fresh first page then goes on top of them, not instead of them. */
  const deep = useRef(false);

  const load = useCallback(
    () =>
      api.cafes.get(slug, { post: postId }).then(
        (c) => {
          setCafe(c);
          if (deep.current) {
            const fresh = new Set(c.posts.map((p) => p.id));
            setPosts((was) => [...c.posts, ...was.filter((p) => !fresh.has(p.id))]);
          } else {
            setPosts(c.posts);
            setOlder(c.olderPosts);
          }
        },
        (e: unknown) => setError(errorText(e, lang)),
      ),
    [slug, postId, lang],
  );
  useEffect(() => {
    if (signedIn !== null) void load();
  }, [signedIn, load]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const patch = (id: string, change: (p: PostDTO) => PostDTO) => setPosts((was) => was.map((p) => (p.id === id ? change(p) : p)));

  /** One post as the café has it now, with every comment; gone from the feed if it was taken down. */
  const refresh = (id: string) =>
    api.cafes.post(slug, id).then(
      (fresh) => patch(id, () => fresh),
      () => setPosts((was) => was.filter((p) => p.id !== id)),
    );

  /** Runs an action, then shows things as they are now: that post, or the whole café. Answers whether it went through. */
  const act = async (call: () => Promise<unknown>, id?: string): Promise<boolean> => {
    setError(null);
    let ok = true;
    try {
      await call();
    } catch (e) {
      setError(errorText(e, lang));
      ok = false;
    }
    await (id ? refresh(id) : load());
    return ok;
  };

  /**
   * A like or a "Katıl": shows it at once and tells the café after, so the tap never waits on
   * the network. If the café says no, the post goes back to how it really is, with why.
   */
  const quick = async (key: string, id: string, change: (p: PostDTO) => PostDTO, call: () => Promise<unknown>) => {
    if (sending.current.has(key)) return;
    sending.current.add(key);
    setError(null);
    patch(id, change);
    try {
      await call();
    } catch (e) {
      setError(errorText(e, lang));
      await refresh(id);
    } finally {
      sending.current.delete(key);
    }
  };

  if (!cafe) {
    return (
      <Shell lang={lang} onLang={toggleLang} hue={null}>
        {error ? <Notice tone="red">{error}</Notice> : <p className="text-muted">{t("loading")}</p>}
      </Shell>
    );
  }
  const member = !!cafe.membership;
  const paused = !!cafe.membership?.paused;
  const canWrite = member && !paused;
  const askiItems = cafe.menu.filter((m) => m.askida && m.available);
  const waiting = goods(cafe.askida.balancePeni, askiItems);
  const ask = member ? null : signedIn ? "join" : "signIn";
  const needMember = () => (signedIn ? void act(() => api.cafes.join(cafe.slug)) : setSigningIn(true));

  const actions: PostActions = {
    like: (p) =>
      member
        ? void quick(`like:${p.id}`, p.id, (x) => ({ ...x, reactedByMe: !x.reactedByMe, reactionCount: x.reactionCount + (x.reactedByMe ? -1 : 1) }), () => api.cafes.react(cafe.slug, p.id))
        : needMember(),
    rsvp: (p) =>
      member
        ? void quick(
            `rsvp:${p.id}`,
            p.id,
            (x) => ({
              ...x,
              rsvpedByMe: !x.rsvpedByMe,
              rsvpCount: x.rsvpCount + (x.rsvpedByMe ? -1 : 1),
              // The viewer's own circle comes and goes with the tap; the café's list replaces it on the next read.
              attendees: x.rsvpedByMe ? x.attendees.filter((a) => !a.me) : [...x.attendees, { initials: null, me: true }],
            }),
            () => api.cafes.rsvp(cafe.slug, p.id),
          )
        : needMember(),
    comment: (p, body) => act(() => api.cafes.comment(cafe.slug, p.id, body), p.id),
    deleteComment: (p, commentId) =>
      void quick(
        `delete:${commentId}`,
        p.id,
        (x) => {
          const gone = x.comments.find((c) => c.id === commentId);
          return { ...x, comments: x.comments.filter((c) => c.id !== commentId), commentCount: x.commentCount - (gone ? 1 + gone.replies.length : 0) };
        },
        () => api.cafes.deleteComment(cafe.slug, p.id, commentId),
      ),
    wholePost: (p) => refresh(p.id),
    cancelEvent: (p) => act(() => api.cafes.cancelEvent(cafe.slug, p.id), p.id),
    edit: setEventSheet,
    report: (target, already) => setReporting({ ...target, already }),
    share: async (p) => {
      const url = new URL(api.cafes.shareUrl(cafe.slug, p.id), window.location.origin).toString();
      const title = p.title ?? cafe.name;
      // A phone's own share sheet when there is one; otherwise the link goes to the clipboard.
      if (navigator.share) {
        await navigator.share({ title, url }).catch(() => undefined);
        return;
      }
      await Promise.resolve()
        .then(() => navigator.clipboard.writeText(url))
        .then(
          () => setNotice(t("copied")),
          () => setLinkToCopy(url),
        );
    },
    needMember,
  };

  const loadOlder = async () => {
    if (!older || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await api.cafes.posts(cafe.slug, older);
      deep.current = true;
      setPosts((was) => {
        const have = new Set(was.map((p) => p.id));
        return [...was, ...page.posts.filter((p) => !have.has(p.id))];
      });
      setOlder(page.olderPosts);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <Shell lang={lang} onLang={toggleLang} hue={cafe.hue}>
      <section className="flex flex-col gap-4">
        {cafe.coverImageUrl && !postId && <Photo src={cafe.coverImageUrl} alt={cafe.name} label={t("photoN").replace("{n}", "")} className="aspect-[2/1] w-full rounded-3xl" />}
        <div className="flex items-center gap-4">
          {/* No cover yet: the café's initial, as on its posts. */}
          {(!cafe.coverImageUrl || postId) && <Initial name={cafe.name} cafe className="size-14 text-3xl" />}
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="font-serif text-4xl leading-[1.05]">{postId ? <a href={`/kafe/${encodeURIComponent(cafe.slug)}`}>{cafe.name}</a> : cafe.name}</h1>
            {(cafe.district || cafe.address) && <p className="text-sm text-muted">{[cafe.address, cafe.district].filter(Boolean).join(" · ")}</p>}
          </div>
        </div>

        {member ? (
          // One post's own page is about the post: the penny card stays on the café's page.
          !postId && (
            <div className="flex flex-col gap-3 rounded-3xl bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{t("yourPeni")}</span>
                <span className="tabular inline-flex items-center gap-2 font-serif text-4xl leading-none text-[var(--cafe)]">
                  <Coin size={28} />
                  <span className="whitespace-nowrap">
                    {cafe.membership!.balancePeni} <span className="text-xl">penny</span>
                  </span>
                </span>
              </div>
              {cafe.pennyOn ? (
                <div className="grid grid-cols-2 gap-2">
                  <a href={`/harca?kafe=${encodeURIComponent(cafe.slug)}`} className="flex min-h-11 items-center justify-center rounded-full border border-line bg-paper text-sm font-semibold">
                    {t("payWithPeni")}
                  </a>
                  <a href={`/ismarla?kafe=${encodeURIComponent(cafe.slug)}`} className="flex min-h-11 items-center justify-center rounded-full border border-line bg-paper text-sm font-semibold">
                    {t("treatSomeoneHere")}
                  </a>
                </div>
              ) : (
                // The plan has no pennies now: the balance stays, but can't be spent or given here.
                <p className="text-sm leading-normal text-muted">{t("pennyOff")}</p>
              )}
            </div>
          )
        ) : (
          <div className="flex items-center gap-3 rounded-3xl bg-panel p-4">
            <p className="min-w-0 flex-1 text-sm leading-normal">{ask === "join" ? t("joinHelp") : t("signInToJoin")}</p>
            <Button kind="primary" size="sm" className="shrink-0 border-[var(--cafe)] bg-[var(--cafe)]" onClick={() => (ask === "join" ? void act(() => api.cafes.join(cafe.slug)) : setSigningIn(true))}>
              {ask === "join" ? t("joinCafe") : t("signIn")}
            </Button>
          </div>
        )}

        {cafe.askida.enabled && !postId && (
          <a href={`/aski?kafe=${encodeURIComponent(cafe.slug)}`} className="flex min-h-12 items-center justify-between border-y border-line">
            <span>{waiting ? fill(t("askidaLink"), { goods: waiting }) : t("askidaLinkEmpty")}</span>
            <span aria-hidden="true" className="text-muted">
              →
            </span>
          </a>
        )}
        {paused && <Notice>{t("pausedNotice")}</Notice>}
      </section>

      <section aria-labelledby={postId ? undefined : "feed"} className="flex flex-col gap-4">
        {!postId && (
          <div className="flex min-h-11 items-center justify-between gap-3">
            <h2 id="feed" className="text-sm text-muted">
              {t("feed")}
            </h2>
            {canWrite && (
              <Button kind="quiet" size="sm" onClick={() => setEventSheet("new")}>
                <span aria-hidden="true" className="text-lg leading-none">
                  +
                </span>
                {t("openEvent")}
              </Button>
            )}
          </div>
        )}
        {posts.length === 0 && !postId && <p className="py-6 text-center text-muted">{t("noFeed")}</p>}
        {posts.map((p) => (
          <Post key={p.id} t={t} lang={lang} slug={cafe.slug} cafeName={cafe.name} post={p} member={member} paused={paused} whole={!!postId} actions={actions} />
        ))}
        {older && !postId && (
          <Button kind="quiet" disabled={loadingOlder} onClick={() => void loadOlder()}>
            {loadingOlder ? t("loading") : t("olderPosts")}
          </Button>
        )}
        {postId && (
          <a href={`/kafe/${encodeURIComponent(cafe.slug)}`} className="flex min-h-12 items-center justify-between border-y border-line">
            <span>{t("seeCafeFeed")}</span>
            <span aria-hidden="true" className="text-muted">
              →
            </span>
          </a>
        )}
      </section>

      {/* Where the tap was, not at the top of a long feed. */}
      {(error || notice) && (
        <button
          type="button"
          role={error ? "alert" : "status"}
          onClick={() => {
            setError(null);
            setNotice(null);
          }}
          className={`fixed inset-x-4 bottom-4 z-30 mx-auto max-w-md cursor-pointer rounded-2xl px-4 py-3 text-left text-sm font-medium text-paper shadow-xl ${error ? "bg-red" : "bg-ink"}`}
        >
          {error ?? notice}
        </button>
      )}

      {eventSheet && (
        <EventSheet
          t={t}
          lang={lang}
          slug={cafe.slug}
          editing={eventSheet === "new" ? null : eventSheet}
          onClose={() => setEventSheet(null)}
          onDone={async () => {
            const edited = eventSheet === "new" ? null : eventSheet.id;
            setEventSheet(null);
            await (edited ? refresh(edited) : load());
          }}
        />
      )}
      {reporting && (
        <ReportSheet
          t={t}
          lang={lang}
          slug={cafe.slug}
          target={reporting}
          already={reporting.already}
          onClose={() => {
            const postOf = reporting.targetType === "post" ? reporting.targetId : posts.find((p) => p.comments.some((c) => c.id === reporting.targetId))?.id;
            setReporting(null);
            void (postOf ? refresh(postOf) : load());
          }}
        />
      )}

      {linkToCopy && (
        <Sheet title={t("sharePost")} onClose={() => setLinkToCopy(null)} labelClose={t("close")}>
          <input
            readOnly
            value={linkToCopy}
            aria-label={t("sharePost")}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-12 w-full rounded-2xl border border-line bg-paper px-4 text-base outline-none focus:border-ink"
          />
        </Sheet>
      )}
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

type ReportTarget = Pick<ReportInput, "targetType" | "targetId">;

/** What a post's buttons do; the page decides how (and asks a guest to sign in first). */
type PostActions = {
  like: (post: PostDTO) => void;
  rsvp: (post: PostDTO) => void;
  /** Answers whether the comment went through. */
  comment: (post: PostDTO, body: string) => Promise<boolean>;
  deleteComment: (post: PostDTO, commentId: string) => void;
  /** Reads the post again with every comment: a feed page carries only the newest. */
  wholePost: (post: PostDTO) => Promise<void>;
  share: (post: PostDTO) => Promise<void>;
  cancelEvent: (post: PostDTO) => Promise<boolean>;
  edit: (post: PostDTO) => void;
  report: (target: ReportTarget, already: boolean) => void;
  needMember: () => void;
};

/** How many comments a post opens with; the rest are one tap away. */
const COMMENTS_SHOWN = 3;

function Post({
  t,
  lang,
  slug,
  cafeName,
  post,
  member,
  paused,
  whole,
  actions,
}: {
  t: T;
  lang: Lang;
  slug: string;
  cafeName: string;
  post: PostDTO;
  member: boolean;
  paused: boolean;
  /** On the post's own page every comment shows from the start. */
  whole: boolean;
  actions: PostActions;
}) {
  const [comment, setComment] = useState("");
  const [writing, setWriting] = useState(false);
  const [allComments, setAllComments] = useState(whole);
  const [busy, setBusy] = useState(false);
  /** The "⋯" sheet: my event's options, or one of my comments. */
  const [menu, setMenu] = useState<{ kind: "event" } | { kind: "cancel" } | { kind: "comment"; id: string; body: string } | null>(null);
  const canWrite = member && !paused;
  const event = post.kind === "event";
  const question = post.kind === "question";
  const date = (iso: string, withWeekday = false) =>
    new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", {
      ...(withWeekday ? { weekday: "long" } : {}),
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  const label = event ? t("eventLabel") : question ? t("questionOfDay") : null;
  const full = event && !!post.eventCapacity && post.rsvpCount >= post.eventCapacity && !post.rsvpedByMe;
  // The day's question is there to be answered, so its box is open; other posts keep theirs behind the comment button.
  const boxOpen = canWrite && (writing || (question && !post.answeredTodayByMe));
  const shown = allComments ? post.comments : post.comments.slice(-COMMENTS_SHOWN);
  // Earlier comments: the ones folded away here, and the ones this page of the feed didn't bring.
  const earlier = post.comments.length - shown.length + (allComments ? 0 : post.earlierComments);
  const going = event && !post.eventOver && (post.rsvpedByMe || !!post.host?.mine);
  const pill = "rounded-full px-2.5 py-0.5 text-xs font-medium";

  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-line p-4">
      {/* Who it's from comes first, as on every social feed: it's what tells one post from the next. */}
      <div className="flex items-center gap-3">
        <Initial name={post.host ? post.host.name : cafeName} cafe={!post.host} className="size-10 text-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate font-semibold">{post.host ? post.host.name : cafeName}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {post.pinned && <span className={`${pill} bg-[var(--cafe)] text-paper`}>{t("pinnedPost")}</span>}
            {label && <span className={`${pill} bg-panel`}>{label}</span>}
            {event && post.eventOver && <span className={`${pill} border border-line`}>{t("eventOver")}</span>}
            <span>{post.host?.mine ? t("hostedByYou") : date(post.publishedAt)}</span>
          </p>
        </div>
        {post.host?.mine && !post.eventOver && <MoreButton label={t("options")} onClick={() => setMenu({ kind: "event" })} />}
        {post.host && !post.host.mine && canWrite && (
          <MoreButton label={post.reportedByMe ? t("reported") : t("report")} onClick={() => actions.report({ targetType: "post", targetId: post.id }, post.reportedByMe)} />
        )}
      </div>
      {post.title && <h3 className="font-serif text-3xl leading-tight">{post.title}</h3>}
      {event && post.eventStartsAt && <p className={`text-lg ${post.eventOver ? "text-muted" : ""}`}>{date(post.eventStartsAt, true)}</p>}
      {event && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Attendees t={t} people={post.attendees} />
          <span className="text-sm text-muted">
            {post.eventOver
              ? fill(t("wentN"), { n: post.rsvpCount })
              : post.eventCapacity
                ? fill(t("goingOfN"), { n: post.rsvpCount, max: post.eventCapacity })
                : fill(t("goingN"), { n: post.rsvpCount })}
          </span>
        </div>
      )}

      {post.imageUrls.length === 1 && <img src={post.imageUrls[0]} alt={t("photoN").replace("{n}", "1")} className="max-h-[560px] w-full rounded-2xl object-cover" />}
      {post.imageUrls.length > 1 && (
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
          {post.imageUrls.map((url, i) => (
            <img key={url} src={url} alt={t("photoN").replace("{n}", String(i + 1))} className="aspect-[4/5] w-[85%] shrink-0 snap-center rounded-2xl object-cover" />
          ))}
        </div>
      )}
      {post.body && <p className="whitespace-pre-line text-[17px] leading-relaxed">{post.body}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={post.reactedByMe}
          aria-label={post.reactedByMe ? t("unlike") : t("like")}
          disabled={paused}
          onClick={() => actions.like(post)}
          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 disabled:cursor-not-allowed disabled:opacity-40 ${post.reactedByMe ? "border-heart text-heart" : "border-line"}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={post.reactedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
          </svg>
          <span className="tabular">{post.reactionCount}</span>
        </button>
        <button
          type="button"
          aria-expanded={canWrite ? boxOpen : undefined}
          aria-label={`${question ? t("writeAnswer") : t("writeComment")} · ${fill(t("commentsN"), { n: post.commentCount })}`}
          disabled={paused}
          onClick={() => (canWrite ? setWriting((w) => !w) : actions.needMember())}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" />
          </svg>
          <span className="tabular">{post.commentCount}</span>
        </button>
        {event && !post.eventOver && post.host?.mine && (
          <span className="inline-flex min-h-11 items-center rounded-full bg-[var(--cafe)] px-4 text-sm font-semibold text-paper">{t("goingYes")} ✓</span>
        )}
        {event && !post.eventOver && !post.host?.mine && (
          <Button kind={post.rsvpedByMe ? "primary" : "quiet"} size="sm" disabled={paused || full} onClick={() => actions.rsvp(post)} className={post.rsvpedByMe ? "border-[var(--cafe)] bg-[var(--cafe)]" : ""}>
            {post.rsvpedByMe ? `${t("goingYes")} ✓` : full ? t("eventFull") : t("join")}
          </Button>
        )}
        {going && (
          // Public, so the phone opens it straight in its calendar. Sits with the share button when the row wraps.
          <a href={api.cafes.icsUrl(slug, post.id)} className="flex min-h-11 items-center px-1 text-sm font-semibold underline underline-offset-4">
            {t("addToCalendar")}
          </a>
        )}
        <button
          type="button"
          aria-label={t("sharePost")}
          title={t("sharePost")}
          onClick={() => void actions.share(post)}
          className="ml-auto flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-muted hover:text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 15V4M8 7.5L12 4l4 3.5M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12" />
          </svg>
        </button>
      </div>

      {post.comments.length > 0 && (
        <div className="flex flex-col gap-2 border-l-2 border-line pl-4">
          {earlier > 0 && (
            <button
              type="button"
              onClick={() => {
                setAllComments(true);
                if (post.earlierComments > 0) void actions.wholePost(post);
              }}
              className="flex min-h-11 cursor-pointer items-center self-start text-sm font-semibold underline underline-offset-4"
            >
              {fill(t("earlierComments"), { n: earlier })}
            </button>
          )}
          <ul className="flex flex-col gap-3">
            {shown.map((c) => (
              <li key={c.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 leading-normal">
                    <strong className="font-semibold">{c.authorName}</strong> {c.body}
                  </p>
                  {c.mine && <MoreButton label={t("options")} onClick={() => setMenu({ kind: "comment", id: c.id, body: c.body })} className="-my-2.5" />}
                  {!c.mine && canWrite && (
                    <MoreButton label={c.reportedByMe ? t("reported") : t("report")} onClick={() => actions.report({ targetType: "comment", targetId: c.id }, c.reportedByMe)} className="-my-2.5" />
                  )}
                </div>
                {/* The café's answer sits under the comment it answers. */}
                {c.replies.map((r) => (
                  <p key={r.id} className="ml-3 flex items-start gap-2 leading-normal">
                    <Initial name={cafeName} cafe className="mt-0.5 size-6 text-sm" />
                    <span className="min-w-0">
                      <strong className="font-semibold">{cafeName}</strong> {r.body}
                    </span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {question && post.answeredTodayByMe && <p className="text-sm text-muted">{t("answeredToday")}</p>}
      {boxOpen && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = comment.trim();
            if (!body || busy) return;
            setBusy(true);
            void actions.comment(post, body).then((ok) => {
              setBusy(false);
              if (!ok) return;
              setComment("");
              setWriting(false);
              setAllComments(true);
            });
          }}
        >
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            autoFocus={writing}
            placeholder={question ? t("writeAnswer") : t("writeComment")}
            aria-label={question ? t("writeAnswer") : t("writeComment")}
            className="min-h-12 min-w-0 flex-1 rounded-full border border-line bg-paper px-5 text-base outline-none focus:border-ink"
          />
          <Button kind="secondary" type="submit" disabled={busy || !comment.trim()}>
            {t("sendComment")}
          </Button>
        </form>
      )}

      {menu?.kind === "event" && (
        <Sheet title={t("editEventTitle")} onClose={() => setMenu(null)} labelClose={t("close")}>
          <Button
            kind="quiet"
            disabled={paused}
            onClick={() => {
              setMenu(null);
              actions.edit(post);
            }}
          >
            {t("editEvent")}
          </Button>
          <Button kind="quiet" onClick={() => setMenu({ kind: "cancel" })}>
            {t("cancelEvent")}
          </Button>
        </Sheet>
      )}
      {menu?.kind === "cancel" && (
        <Sheet title={t("cancelEventTitle")} onClose={() => setMenu(null)} labelClose={t("close")}>
          <p className="leading-normal text-muted">{t("cancelEventBody")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button kind="quiet" onClick={() => setMenu(null)}>
              {t("keepEvent")}
            </Button>
            <Button
              kind="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void actions.cancelEvent(post).then(() => {
                  setBusy(false);
                  setMenu(null);
                });
              }}
            >
              {t("cancelEventYes")}
            </Button>
          </div>
        </Sheet>
      )}
      {menu?.kind === "comment" && (
        <Sheet title={t("yourComment")} onClose={() => setMenu(null)} labelClose={t("close")}>
          <blockquote className="border-l-2 border-line pl-3 leading-normal">{menu.body}</blockquote>
          <Button
            kind="danger"
            onClick={() => {
              actions.deleteComment(post, menu.id);
              setMenu(null);
            }}
          >
            {t("deleteComment")}
          </Button>
        </Sheet>
      )}
    </article>
  );
}

/** How many of the people going an event shows as circles before "+N". */
const FACES = 6;

/**
 * Who's coming: small circles with initials, in the order they said so. A hidden profile is
 * a plain circle; the viewer's own is filled in the café's colour.
 */
function Attendees({ t, people }: { t: T; people: PostDTO["attendees"] }) {
  if (people.length === 0) return null;
  const more = people.length - FACES;
  const circle = "-ml-1.5 flex size-7 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-paper first:ml-0";
  return (
    <span role="img" aria-label={t("whoIsGoing")} className="flex items-center">
      {people.slice(0, FACES).map((a, i) => (
        <span key={i} aria-hidden="true" className={`${circle} ${a.me ? "bg-[var(--cafe)] text-paper" : "bg-tile text-ink"}`}>
          {a.initials ?? "·"}
        </span>
      ))}
      {more > 0 && (
        <span aria-hidden="true" className={`${circle} bg-panel text-muted`}>
          {fill(t("moreGoing"), { n: more })}
        </span>
      )}
    </span>
  );
}

/** Three quiet dots: what you can do with a comment or an event (report it, or take your own back). */
function MoreButton({ label, onClick, className = "" }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:text-ink ${className}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </svg>
    </button>
  );
}

/** "2026-10-17T15:00" in the device's own time, for a datetime-local field. */
function localInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Opening an event, or the host changing theirs: a plan, a time, maybe a limit. */
function EventSheet({
  t,
  lang,
  slug,
  editing,
  onClose,
  onDone,
}: {
  t: T;
  lang: Lang;
  slug: string;
  editing: PostDTO | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [createKey] = useState(() => `event-${crypto.randomUUID()}`);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [when, setWhen] = useState(localInput(editing?.eventStartsAt ?? null));
  const [capacity, setCapacity] = useState(editing?.eventCapacity ? String(editing.eventCapacity) : "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = title.trim().length >= 3 && !!when;
  const field = "min-h-12 w-full rounded-2xl border border-line bg-paper px-4 text-base outline-none focus:border-ink";

  const submit = async () => {
    setBusy(true);
    setError(null);
    const input = { title: title.trim(), body: body.trim(), startsAt: new Date(when).toISOString(), capacity: capacity ? Number(capacity) : null };
    try {
      if (editing) await api.cafes.updateEvent(slug, editing.id, input);
      else await api.cafes.openEvent(slug, { createKey, ...input });
      await onDone();
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };

  return (
    <Sheet title={editing ? t("editEventTitle") : t("openEvent")} onClose={onClose} labelClose={t("close")}>
      {!editing && <p className="text-sm leading-normal text-muted">{t("openEventHelp")}</p>}
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="font-medium">{t("eventTitle")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t("eventTitleHint")} className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-medium">{t("eventWhen")}</span>
          <input type="datetime-local" value={when} min={localInput(new Date().toISOString())} onChange={(e) => setWhen(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-medium">{t("eventCapacity")}</span>
          <input type="number" inputMode="numeric" min={2} max={200} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={`${field} tabular`} />
          <span className="text-sm text-muted">{t("eventCapacityHelp")}</span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-medium">
            {t("eventBody")} <span className="font-normal text-muted">({t("optional")})</span>
          </span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={3} className={`${field} py-3 leading-normal`} />
        </label>
        {error && <Notice tone="red">{error}</Notice>}
        <Button kind="primary" size="lg" type="submit" disabled={!ready || busy} className="border-[var(--cafe)] bg-[var(--cafe)]">
          {editing ? t("eventSave") : t("eventOpenSubmit")}
        </Button>
      </form>
    </Sheet>
  );
}

/** Why a member reports something: four plain reasons and room for a note. */
function ReportSheet({ t, lang, slug, target, already, onClose }: { t: T; lang: Lang; slug: string; target: ReportTarget; already: boolean; onClose: () => void }) {
  const [reason, setReason] = useState<ReportInput["reason"] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Reported once already: nothing more to ask.
  const [sent, setSent] = useState(already);
  const [error, setError] = useState<string | null>(null);
  const reasons = [
    ["spam", t("reasonSpam")],
    ["rude", t("reasonRude")],
    ["unsafe", t("reasonUnsafe")],
    ["other", t("reasonOther")],
  ] as const;

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await api.cafes.report(slug, { targetType: target.targetType, targetId: target.targetId, reason, note: note.trim() || undefined });
      setSent(true);
    } catch (e) {
      setError(errorText(e, lang));
    }
    setBusy(false);
  };

  return (
    <Sheet title={sent ? t("report") : t("reportTitle")} onClose={onClose} labelClose={t("close")}>
      {sent ? (
        <>
          <p className="text-lg leading-normal">{already ? t("reported") : t("reportThanks")}</p>
          <Button kind="primary" onClick={onClose}>
            {t("close")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm leading-normal text-muted">{t("reportHelp")}</p>
          <div role="radiogroup" aria-label={t("reportTitle")} className="flex flex-col gap-2">
            {reasons.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={reason === key}
                onClick={() => setReason(key)}
                className={`flex min-h-12 cursor-pointer items-center rounded-2xl border px-4 text-left ${reason === key ? "border-ink bg-panel font-semibold" : "border-line"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-2">
            <span className="font-medium">
              {t("reportNote")} <span className="font-normal text-muted">({t("optional")})</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base leading-normal outline-none focus:border-ink"
            />
          </label>
          {error && <Notice tone="red">{error}</Notice>}
          <Button kind="primary" disabled={!reason || busy} onClick={() => void send()}>
            {t("reportSend")}
          </Button>
        </>
      )}
    </Sheet>
  );
}

/** A round initial: black for the café, quiet grey for a member. Stands in for a photo. */
function Initial({ name, cafe = false, className = "" }: { name: string; cafe?: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full font-serif leading-none ${cafe ? "bg-ink text-paper" : "bg-tile text-ink"} ${className}`}>
      {name.trim().charAt(0).toLocaleUpperCase("tr-TR")}
    </span>
  );
}
