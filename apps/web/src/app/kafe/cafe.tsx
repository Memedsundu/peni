"use client";

import type { CafeDetailDTO, PostDTO, ReportInput } from "@peni/api";
import { goods } from "@peni/brand/format";
import { useCallback, useEffect, useState } from "react";
import { api } from "../kasa/api";
import { Button, Coin, Notice, Photo, Sheet } from "../kasa/ui";
import { EmailSignIn, Shell, useLang, useSignedIn } from "../p/claim";
import { errorText, fill, text, type Lang, type T } from "../p/text";

/**
 * The café's page (DS25): its photo and name, the viewer's peni here, what's on the askı,
 * then the feed (plan piece 14). Anyone can read it; members like, comment, open events and
 * report what other members wrote (piece 15).
 */
export function CafePage({ slug }: { slug: string }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [cafe, setCafe] = useState<CafeDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  /** null: closed; "new": opening one; a post: editing it. */
  const [eventSheet, setEventSheet] = useState<"new" | PostDTO | null>(null);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);

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
  const paused = !!cafe.membership?.paused;
  const canWrite = member && !paused;
  const askiItems = cafe.menu.filter((m) => m.askida && m.available);
  const waiting = goods(cafe.askida.balancePeni, askiItems);
  const ask = member ? null : signedIn ? "join" : "signIn";

  return (
    <Shell lang={lang} onLang={toggleLang} hue={cafe.hue}>
      <section className="flex flex-col gap-4">
        {cafe.coverImageUrl ? (
          <Photo src={cafe.coverImageUrl} alt={cafe.name} label={t("photoN").replace("{n}", "")} className="aspect-[4/3] w-full rounded-3xl" />
        ) : (
          // No cover yet: the café's initial, as on its posts, rather than an empty grey box.
          <span aria-hidden="true" className="flex aspect-[5/2] w-full items-center justify-center rounded-3xl bg-tile">
            <Initial name={cafe.name} cafe className="size-20 text-4xl" />
          </span>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-5xl leading-[1.05]">{cafe.name}</h1>
          {(cafe.district || cafe.address) && <p className="text-muted">{[cafe.address, cafe.district].filter(Boolean).join(" · ")}</p>}
        </div>
      </section>

      {member ? (
        <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
          <div className="flex items-center justify-between">
            <span className="text-muted">{t("yourPeni")}</span>
            <span className="tabular inline-flex items-center gap-3 font-serif text-5xl leading-none text-[var(--cafe)]">
              <Coin size={40} />
              <span className="whitespace-nowrap">
                {cafe.membership!.balancePeni} <span className="text-2xl">penny</span>
              </span>
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

      {paused && <Notice>{t("pausedNotice")}</Notice>}
      {canWrite && (
        <section className="flex flex-col gap-3">
          <Button kind="secondary" size="md" className="w-full" onClick={() => setEventSheet("new")}>
            <span aria-hidden="true" className="text-xl leading-none">
              +
            </span>
            {t("openEvent")}
          </Button>
          <p className="text-center text-sm leading-normal text-muted">{t("openEventHelp")}</p>
        </section>
      )}

      {error && <Notice tone="red">{error}</Notice>}
      <section aria-label={t("fromCafe")} className="flex flex-col gap-4">
        {cafe.posts.length === 0 && <p className="py-6 text-center text-muted">{t("noFeed")}</p>}
        {cafe.posts.map((p) => (
          <Post
            key={p.id}
            t={t}
            lang={lang}
            slug={cafe.slug}
            cafeName={cafe.name}
            post={p}
            member={member}
            paused={paused}
            act={act}
            onEdit={() => setEventSheet(p)}
            onReport={setReporting}
            onNeedMember={() => (signedIn ? void act(() => api.cafes.join(cafe.slug)) : setSigningIn(true))}
          />
        ))}
      </section>

      {eventSheet && (
        <EventSheet
          t={t}
          lang={lang}
          slug={cafe.slug}
          editing={eventSheet === "new" ? null : eventSheet}
          onClose={() => setEventSheet(null)}
          onDone={async () => {
            setEventSheet(null);
            await load();
          }}
        />
      )}
      {reporting && (
        <ReportSheet
          t={t}
          lang={lang}
          slug={cafe.slug}
          target={reporting}
          onClose={() => {
            setReporting(null);
            void load();
          }}
        />
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

function Post({
  t,
  lang,
  slug,
  cafeName,
  post,
  member,
  paused,
  act,
  onEdit,
  onReport,
  onNeedMember,
}: {
  t: T;
  lang: Lang;
  slug: string;
  cafeName: string;
  post: PostDTO;
  member: boolean;
  paused: boolean;
  act: (call: () => Promise<unknown>) => Promise<void>;
  onEdit: () => void;
  onReport: (target: ReportTarget) => void;
  onNeedMember: () => void;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const canWrite = member && !paused;
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
    <article className="flex flex-col gap-4 rounded-3xl border border-line p-4">
      {/* Who it's from comes first, as on every social feed: it's what tells one post from the next. */}
      <p className="flex items-center gap-3 font-semibold">
        <Initial name={post.host ? post.host.name : cafeName} cafe={!post.host} className="size-9 text-lg" />
        {post.host ? post.host.name : cafeName}
      </p>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {post.pinned && <span className="rounded-full bg-[var(--cafe)] px-3 py-1 font-medium text-paper">{t("pinnedPost")}</span>}
        {label && <span className="rounded-full bg-panel px-3 py-1">{label}</span>}
        {post.host?.mine && <span>{t("hostedByYou")}</span>}
        <span>{date(post.publishedAt)}</span>
        {post.host && !post.host.mine && canWrite && (
          <ReportButton t={t} done={post.reportedByMe} onClick={() => onReport({ targetType: "post", targetId: post.id })} className="ml-auto" />
        )}
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
          disabled={busy || paused}
          onClick={() => (member ? void run(() => api.cafes.react(slug, post.id)) : onNeedMember())}
          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 ${post.reactedByMe ? "border-heart text-heart" : "border-line"}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={post.reactedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
          </svg>
          <span className="tabular">{post.reactionCount}</span>
        </button>
        {post.kind === "event" && post.host?.mine && (
          <span className="inline-flex min-h-11 items-center rounded-full bg-[var(--cafe)] px-4 text-sm font-semibold text-paper">{t("goingYes")} ✓</span>
        )}
        {post.kind === "event" && !post.host?.mine && (
          <Button
            kind={post.rsvpedByMe ? "primary" : "quiet"}
            size="sm"
            disabled={busy || paused}
            onClick={() => (member ? void run(() => api.cafes.rsvp(slug, post.id)) : onNeedMember())}
            className={post.rsvpedByMe ? "border-[var(--cafe)] bg-[var(--cafe)]" : ""}
          >
            {post.rsvpedByMe ? `${t("goingYes")} ✓` : t("join")}
          </Button>
        )}
        <span className="ml-auto text-sm text-muted">
          {post.kind !== "event"
            ? fill(t("commentsN"), { n: post.commentCount })
            : post.eventCapacity
              ? fill(t("goingOfN"), { n: post.rsvpCount, max: post.eventCapacity })
              : fill(t("goingN"), { n: post.rsvpCount })}
        </span>
      </div>

      {post.host?.mine && (
        <div className="flex gap-2">
          <Button kind="quiet" size="sm" disabled={busy || paused} onClick={onEdit}>
            {t("editEvent")}
          </Button>
          <Button kind="quiet" size="sm" disabled={busy} onClick={() => setCancelling(true)}>
            {t("cancelEvent")}
          </Button>
        </div>
      )}
      {cancelling && (
        <Sheet title={t("cancelEventTitle")} onClose={() => setCancelling(false)} labelClose={t("close")}>
          <p className="leading-normal text-muted">{t("cancelEventBody")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button kind="quiet" onClick={() => setCancelling(false)}>
              {t("keepEvent")}
            </Button>
            <Button kind="danger" disabled={busy} onClick={() => void run(() => api.cafes.cancelEvent(slug, post.id)).then(() => setCancelling(false))}>
              {t("cancelEventYes")}
            </Button>
          </div>
        </Sheet>
      )}

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
              {!c.mine && canWrite && <ReportButton t={t} done={c.reportedByMe} onClick={() => onReport({ targetType: "comment", targetId: c.id })} className="-my-2" />}
            </li>
          ))}
        </ul>
      )}
      {post.kind === "question" && post.answeredTodayByMe && <p className="text-sm text-muted">{t("answeredToday")}</p>}
      {canWrite && (
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

/** A small flag: reports a member's comment or event, once. */
function ReportButton({ t, done, onClick, className = "" }: { t: T; done: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      disabled={done}
      onClick={onClick}
      aria-label={done ? t("reported") : t("report")}
      title={done ? t("reported") : t("report")}
      className={`flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:text-ink disabled:cursor-default disabled:text-red ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={done ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
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
function ReportSheet({ t, lang, slug, target, onClose }: { t: T; lang: Lang; slug: string; target: ReportTarget; onClose: () => void }) {
  const [reason, setReason] = useState<ReportInput["reason"] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
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
      await api.cafes.report(slug, { ...target, reason, note: note.trim() || undefined });
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
          <p className="text-lg leading-normal">{t("reportThanks")}</p>
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
