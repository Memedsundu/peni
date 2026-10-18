"use client";

import {
  newIdempotencyKey,
  PeniApiError,
  type StaffCafeAccessDTO,
  type StaffFeedDTO,
  type StaffMeDTO,
  type StaffPostDTO,
  type StaffReportDTO,
} from "@peni/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { shrinkPhoto } from "../photos";
import { errorText, fill, text, type Lang, type T } from "../text";

const MAX_PHOTOS = 6;
const field = "w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-ink";
const canPost = (c: StaffCafeAccessDTO) => c.permissions.includes("posts.write") || c.permissions.includes("posts.moderate");

function useLang(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>("tr");
  useEffect(() => {
    try {
      if (localStorage.getItem("peni.lang") === "en") setLang("en");
    } catch {}
  }, []);
  return [
    lang,
    () =>
      setLang((l) => {
        const next = l === "tr" ? "en" : "tr";
        try {
          localStorage.setItem("peni.lang", next);
        } catch {}
        return next;
      }),
  ];
}

/**
 * Topluluk (plan pieces 14 and 15): the café writes posts and events with photos, pins, edits
 * and takes them down, hides comments that don't belong, answers members' reports and pauses
 * a member when it must. Phone first, since that's where the photos are.
 */
export function Community({ cafeSlug }: { cafeSlug: string | null }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [me, setMe] = useState<StaffMeDTO | null | "signed-out">(null);
  const [slug, setSlug] = useState<string | null>(cafeSlug);
  const [feed, setFeed] = useState<StaffFeedDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.staff.me().then(setMe, () => setMe("signed-out"));
  }, []);
  const cafes = me && me !== "signed-out" ? me.cafes.filter(canPost) : [];
  useEffect(() => {
    if (cafes.length === 1 && !slug) setSlug(cafes[0]!.slug);
  }, [cafes, slug]);
  const cafe = cafes.find((c) => c.slug === slug) ?? null;

  const load = useCallback(
    (s: string) =>
      api.staff.feed.get(s).then(setFeed, (e: unknown) => {
        if (e instanceof PeniApiError && e.status === 401) setMe("signed-out");
        else setError(errorText(e, lang));
      }),
    [lang],
  );
  useEffect(() => {
    if (cafe) void load(cafe.slug);
  }, [cafe, load]);

  const signOut = async () => {
    await api.staff.signOut().catch(() => undefined);
    setFeed(null);
    setMe("signed-out");
  };

  let body;
  if (me === null) body = <p className="text-muted">{t("loading")}</p>;
  else if (me === "signed-out") body = <SignIn t={t} lang={lang} onDone={setMe} />;
  else if (cafes.length === 0) body = <Notice>{t("noAccess")}</Notice>;
  else if (!cafe) {
    body = (
      <section className="flex flex-col gap-3">
        <h1 className="font-serif text-4xl">{t("whichCafe")}</h1>
        {cafes.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => {
              setSlug(c.slug);
              // A reload stays on this café.
              window.history.replaceState(null, "", `?kafe=${encodeURIComponent(c.slug)}`);
            }}
            className="flex min-h-16 cursor-pointer items-center rounded-2xl border border-line bg-paper px-5 text-left text-lg"
          >
            {c.name}
          </button>
        ))}
      </section>
    );
  } else {
    body = (
      <>
        <section className="flex flex-col gap-2">
          <p className="text-sm text-muted">{cafe.name}</p>
          <h1 className="font-serif text-5xl leading-none">{t("community")}</h1>
          <p className="leading-normal text-muted">
            {t("communityHelp")}{" "}
            <a href={`/kafe/${encodeURIComponent(cafe.slug)}`} className="text-ink underline underline-offset-4">
              {t("seePage")}
            </a>
          </p>
        </section>
        {error && <Notice tone="red">{error}</Notice>}
        {feed && feed.reports.length > 0 && <Reports t={t} lang={lang} slug={cafe.slug} reports={feed.reports} onFeed={setFeed} />}
        {feed?.canWrite && <Composer t={t} lang={lang} slug={cafe.slug} onPosted={setFeed} />}
        {feed && feed.posts.length === 0 && <p className="py-10 text-center text-muted">{t("noPosts")}</p>}
        {feed?.posts.map((p) => (
          <PostCard key={p.id} t={t} lang={lang} slug={cafe.slug} post={p} canWrite={feed.canWrite} canModerate={feed.canModerate} onFeed={setFeed} />
        ))}
        {feed && feed.paused.length > 0 && <Paused t={t} lang={lang} slug={cafe.slug} paused={feed.paused} onFeed={setFeed} />}
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 pt-5 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-baseline gap-3">
          <a href="/" className="font-serif text-2xl">
            peni
          </a>
          <span className="text-sm text-muted">{t("panel")}</span>
        </span>
        <span className="flex items-center gap-1">
          {me && me !== "signed-out" && (
            <Button kind="bare" size="sm" onClick={() => void signOut()}>
              {t("signOut")}
            </Button>
          )}
          <Button kind="bare" size="sm" onClick={toggleLang} aria-label={lang === "tr" ? "English" : "Türkçe"}>
            {lang === "tr" ? "EN" : "TR"}
          </Button>
        </span>
      </header>
      {body}
    </main>
  );
}

function SignIn({ t, lang, onDone }: { t: T; lang: Lang; onDone: (me: StaffMeDTO) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        api.staff
          .signIn({ email, password })
          .then(onDone, (err: unknown) => setError(errorText(err, lang)))
          .finally(() => setBusy(false));
      }}
    >
      <h1 className="font-serif text-4xl">{t("signInTitle")}</h1>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("email")}
        <input className={`${field} min-h-12`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("password")}
        <input className={`${field} min-h-12`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <Notice tone="red">{error}</Notice>}
      <Button kind="primary" size="lg" type="submit" disabled={busy}>
        {t("signIn")}
      </Button>
    </form>
  );
}

/** Picks photos, shrinks and uploads them one by one; the order they're picked in is the order shown. */
function Photos({
  t,
  lang,
  slug,
  urls,
  onChange,
  onBusy,
}: {
  t: T;
  lang: Lang;
  slug: string;
  urls: string[];
  onChange: (urls: string[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(urls);
  latest.current = urls;

  const pick = async (files: FileList | null) => {
    if (!files) return;
    const chosen = [...files].slice(0, MAX_PHOTOS - latest.current.length);
    setError(null);
    setUploading(chosen.length);
    onBusy(true);
    for (const file of chosen) {
      try {
        const { url } = await api.staff.feed.uploadImage(slug, await shrinkPhoto(file));
        latest.current = [...latest.current, url];
        onChange(latest.current);
      } catch (e) {
        setError(e instanceof PeniApiError ? errorText(e, lang) : t("photoFailed"));
      }
      setUploading((n) => n - 1);
    }
    onBusy(false);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="flex flex-col gap-3">
      {(urls.length > 0 || uploading > 0) && (
        <ul className="grid grid-cols-3 gap-2">
          {urls.map((url, i) => (
            <li key={url} className="relative aspect-square overflow-hidden rounded-xl bg-tile">
              <img src={url} alt={`${t("photo")} ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(urls.filter((u) => u !== url))}
                aria-label={`${t("removePhoto")} ${i + 1}`}
                className="absolute top-1.5 right-1.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <li key={`up-${i}`} className="flex aspect-square animate-pulse items-center justify-center rounded-xl bg-tile text-center text-xs text-muted">
              {t("uploading")}
            </li>
          ))}
        </ul>
      )}
      {error && <Notice tone="red">{error}</Notice>}
      <label className={`self-start ${urls.length + uploading >= MAX_PHOTOS ? "pointer-events-none opacity-40" : ""}`}>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" multiple className="sr-only" onChange={(e) => void pick(e.target.files)} />
        <span className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="M21 16l-5-5-8 8" />
          </svg>
          {t("addPhotos")}
          <span className="font-normal text-muted">· {fill(t("photosLeft"), { n: MAX_PHOTOS })}</span>
        </span>
      </label>
    </div>
  );
}

function Composer({ t, lang, slug, onPosted }: { t: T; lang: Lang; slug: string; onPosted: (f: StaffFeedDTO) => void }) {
  const [kind, setKind] = useState<"post" | "question" | "event">("post");
  const [event, setEvent] = useState<EventFields>(NO_EVENT);
  const [body, setBody] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per post: a retried tap posts once; a new post gets a new key.
  const key = useRef(newIdempotencyKey());

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      onPosted(await api.staff.feed.create(slug, { createKey: key.current, kind, body: body.trim(), imageUrls, pinned, ...(kind === "event" ? eventInput(event) : {}) }));
      key.current = newIdempotencyKey();
      setEvent(NO_EVENT);
      setBody("");
      setImageUrls([]);
      setPinned(false);
      setKind("post");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const placeholder = kind === "post" ? t("composePlaceholder") : kind === "question" ? t("questionPlaceholder") : t("eventPlaceholder");
  const empty = kind === "event" ? !eventReady(event) : !body.trim() && imageUrls.length === 0;

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-line bg-paper p-4 sm:p-5">
      <div role="radiogroup" className="flex gap-2">
        {(["post", "question", "event"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`min-h-10 cursor-pointer rounded-full border px-4 text-sm ${kind === k ? "border-ink bg-ink font-semibold text-paper" : "border-line text-ink"}`}
          >
            {k === "post" ? t("kindPost") : k === "question" ? t("kindQuestion") : t("kindEvent")}
          </button>
        ))}
      </div>
      {kind === "event" && <EventInputs t={t} value={event} onChange={setEvent} />}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={4}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${field} resize-y leading-normal`}
      />
      <Photos t={t} lang={lang} slug={slug} urls={imageUrls} onChange={setImageUrls} onBusy={setUploading} />
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-5 accent-[var(--ink)]" />
        {t("pinIt")}
      </label>
      {error && <Notice tone="red">{error}</Notice>}
      <Button kind="primary" size="lg" disabled={busy || uploading || empty} onClick={() => void publish()}>
        {busy ? t("publishing") : t("publish")}
      </Button>
    </section>
  );
}

type EventFields = { title: string; when: string; capacity: string };
const NO_EVENT: EventFields = { title: "", when: "", capacity: "" };
const eventReady = (e: EventFields) => e.title.trim().length >= 3 && !!e.when;
const eventInput = (e: EventFields) => ({ title: e.title.trim(), eventStartsAt: new Date(e.when).toISOString(), eventCapacity: e.capacity ? Number(e.capacity) : null });

/** "2026-10-17T15:00" in the device's own time, for a datetime-local field. */
function localInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** An event's topic, time and limit. */
function EventInputs({ t, value, onChange }: { t: T; value: EventFields; onChange: (v: EventFields) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("eventTitle")}
        <input className={`${field} min-h-12`} value={value.title} maxLength={120} placeholder={t("eventTitlePlaceholder")} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("eventWhen")}
          <input className={`${field} min-h-12`} type="datetime-local" value={value.when} onChange={(e) => onChange({ ...value, when: e.target.value })} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("eventCapacity")}
          <input className={`${field} tabular min-h-12`} type="number" inputMode="numeric" min={2} max={200} value={value.capacity} placeholder="∞" onChange={(e) => onChange({ ...value, capacity: e.target.value })} />
        </label>
      </div>
      <p className="-mt-1 text-sm text-muted">{t("eventCapacityHelp")}</p>
    </div>
  );
}

const REASON_KEYS = { spam: "reasonSpam", rude: "reasonRude", unsafe: "reasonUnsafe", other: "reasonOther" } as const;

/** What members reported, one card per reported thing, with the three answers a moderator has. */
function Reports({ t, lang, slug, reports, onFeed }: { t: T; lang: Lang; slug: string; reports: StaffReportDTO[]; onFeed: (f: StaffFeedDTO) => void }) {
  return (
    <section aria-labelledby="reports" className="flex flex-col gap-4 rounded-3xl bg-panel p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="reports" className="flex items-center gap-3 font-serif text-3xl">
          {t("reports")}
          <span className="tabular rounded-full bg-red px-2.5 py-0.5 font-sans text-sm font-semibold text-paper">{reports.length}</span>
        </h2>
        <p className="text-sm leading-normal text-muted">{t("reportsHelp")}</p>
      </div>
      {reports.map((r) => (
        <ReportCard key={`${r.targetType}:${r.targetId}`} t={t} lang={lang} slug={slug} report={r} onFeed={onFeed} />
      ))}
      <p className="text-sm leading-normal text-muted">{t("pauseHelp")}</p>
    </section>
  );
}

function ReportCard({ t, lang, slug, report, onFeed }: { t: T; lang: Lang; slug: string; report: StaffReportDTO; onFeed: (f: StaffFeedDTO) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (action: "remove" | "keep", pauseAuthor = false) => {
    setBusy(true);
    setError(null);
    try {
      onFeed(await api.staff.feed.resolveReport(slug, { targetType: report.targetType, targetId: report.targetId, action, pauseAuthor }));
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{report.targetType === "comment" ? fill(t("reportOnComment"), { title: report.postTitle }) : t("reportOnEvent")}</span>
        {report.hidden && <span className="rounded-full bg-red-soft px-2.5 py-0.5 font-medium text-red">{t("autoHidden")}</span>}
      </p>
      {report.targetType === "post" && <h3 className="font-serif text-2xl leading-tight">{report.postTitle}</h3>}
      {report.body && <blockquote className="border-l-2 border-line pl-3 text-[17px] leading-relaxed whitespace-pre-line">{report.body}</blockquote>}
      <p className="text-sm">
        {fill(t("writtenBy"), { name: report.authorName })}
        {report.authorPaused && <span className="text-muted"> · {t("pausedTag")}</span>}
      </p>
      <ul className="flex flex-wrap gap-2 text-sm">
        {report.reasons.map((r) => (
          <li key={r.reason} className="rounded-full border border-line px-3 py-1">
            {t(REASON_KEYS[r.reason])}
            {r.count > 1 && <span className="tabular text-muted"> × {r.count}</span>}
          </li>
        ))}
      </ul>
      {report.notes.map((n, i) => (
        <p key={i} className="text-sm text-muted italic">
          “{n}”
        </p>
      ))}
      <p className="text-xs text-muted">{fill(t("firstReported"), { when: when(report.firstReportedAt, lang) })}</p>
      {error && <Notice tone="red">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button kind="danger" size="sm" disabled={busy} onClick={() => void answer("remove")}>
          {t("takeDown")}
        </Button>
        {!report.authorPaused && (
          <Button kind="quiet" size="sm" disabled={busy} onClick={() => void answer("remove", true)}>
            {t("takeDownAndPause")}
          </Button>
        )}
        <Button kind="quiet" size="sm" disabled={busy} onClick={() => void answer("keep")}>
          {t("keepIt")}
        </Button>
      </div>
    </article>
  );
}

/** Members paused in the community, each one tap from being let back in. */
function Paused({ t, lang, slug, paused, onFeed }: { t: T; lang: Lang; slug: string; paused: StaffFeedDTO["paused"]; onFeed: (f: StaffFeedDTO) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section aria-labelledby="paused" className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 id="paused" className="font-serif text-3xl">
        {t("pausedMembers")}
      </h2>
      <ul className="flex flex-col rounded-2xl bg-panel px-4">
        {paused.map((m) => (
          <li key={m.customerId} className="flex items-center justify-between gap-3 border-b border-line-soft py-3 last:border-0">
            <span>
              {m.name} <span className="text-sm text-muted">· {fill(t("pausedSince"), { when: when(m.pausedAt, lang) })}</span>
            </span>
            <Button
              kind="bare"
              size="sm"
              className="shrink-0 underline underline-offset-4"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                api.staff.feed.pauseMember(slug, m.customerId, false).then(onFeed).finally(() => setBusy(false));
              }}
            >
              {t("unpause")}
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-sm leading-normal text-muted">{t("pauseHelp")}</p>
    </section>
  );
}

function when(iso: string, lang: Lang) {
  return new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function PostCard({
  t,
  lang,
  slug,
  post,
  canWrite,
  canModerate,
  onFeed,
}: {
  t: T;
  lang: Lang;
  slug: string;
  post: StaffPostDTO;
  canWrite: boolean;
  canModerate: boolean;
  onFeed: (f: StaffFeedDTO) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [photos, setPhotos] = useState(post.imageUrls);
  const eventNow = (): EventFields => ({ title: post.title ?? "", when: localInput(post.eventStartsAt), capacity: post.eventCapacity ? String(post.eventCapacity) : "" });
  const [event, setEvent] = useState<EventFields>(eventNow);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (call: () => Promise<StaffFeedDTO>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      onFeed(await call());
      after?.();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const label = post.hostName ? t("memberEvent") : post.kind === "event" ? t("event") : post.kind === "question" ? t("question") : null;
  const isEvent = post.kind === "event";
  const hiddenCount = post.comments.filter((c) => c.hidden).length;

  return (
    <article className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {post.pinned && <span className="rounded-full bg-green-soft px-3 py-1 font-medium text-green">{t("pinned")}</span>}
        {label && <span className="rounded-full bg-panel px-3 py-1">{label}</span>}
        {post.openReports > 0 && <span className="rounded-full bg-red-soft px-3 py-1 font-medium text-red">{fill(t("reportsN"), { n: post.openReports })}</span>}
        <span>
          {when(post.publishedAt, lang)}
          {post.authorName && ` · ${fill(t("by"), { name: post.authorName })}`}
          {post.hostName && ` · ${fill(t("hostedBy"), { name: post.hostName })}`}
        </span>
      </div>
      {!editing && post.title && <h2 className="font-serif text-3xl leading-tight">{post.title}</h2>}
      {!editing && isEvent && post.eventStartsAt && <p className="-mt-2 text-lg">{when(post.eventStartsAt, lang)}</p>}

      {editing ? (
        <div className="flex flex-col gap-3">
          {isEvent && <EventInputs t={t} value={event} onChange={setEvent} />}
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={4} aria-label={t("edit")} className={`${field} resize-y leading-normal`} />
          <Photos t={t} lang={lang} slug={slug} urls={photos} onChange={setPhotos} onBusy={setUploading} />
          {error && <Notice tone="red">{error}</Notice>}
          <div className="flex gap-2">
            <Button
              kind="primary"
              disabled={busy || uploading || (isEvent && !eventReady(event))}
              onClick={() =>
                void run(
                  () => api.staff.feed.update(slug, post.id, { body: draft.trim(), imageUrls: photos, ...(isEvent ? eventInput(event) : {}) }),
                  () => setEditing(false),
                )
              }
            >
              {t("save")}
            </Button>
            <Button
              kind="quiet"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setDraft(post.body);
                setPhotos(post.imageUrls);
                setEvent(eventNow());
              }}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {post.imageUrls.length > 0 && (
            <div className={`grid gap-2 ${post.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {post.imageUrls.map((url, i) => (
                <img key={url} src={url} alt={`${t("photo")} ${i + 1}`} className={`w-full rounded-2xl object-cover ${post.imageUrls.length === 1 ? "max-h-[520px]" : "aspect-square"}`} />
              ))}
            </div>
          )}
          {post.body && <p className="whitespace-pre-line text-[17px] leading-relaxed">{post.body}</p>}
        </>
      )}

      <p className="text-sm text-muted">
        {fill(t("likes"), { n: post.reactionCount })} · {fill(t("comments"), { n: post.comments.length - hiddenCount })}
        {isEvent && ` · ${post.eventCapacity ? fill(t("goingOf"), { n: post.rsvpCount, max: post.eventCapacity }) : fill(t("going"), { n: post.rsvpCount })}`}
      </p>
      {post.hostName && <p className="text-sm text-muted">{t("memberEventHelp")}</p>}

      {(canWrite || (post.hostName && canModerate)) && !editing && (
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <Button kind="quiet" size="sm" disabled={busy} onClick={() => void run(() => api.staff.feed.update(slug, post.id, { pinned: !post.pinned }))}>
              {post.pinned ? t("unpin") : t("pin")}
            </Button>
          )}
          {canWrite && !post.hostName && (
            <Button kind="quiet" size="sm" disabled={busy} onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
          )}
          <Button kind="quiet" size="sm" disabled={busy} onClick={() => setConfirm(true)}>
            {t("remove")}
          </Button>
        </div>
      )}
      {!editing && error && <Notice tone="red">{error}</Notice>}

      {post.comments.length > 0 && (
        <ul className="flex flex-col rounded-2xl bg-panel px-4">
          {post.comments.map((c) => (
            <li key={c.id} className={`flex items-start justify-between gap-3 border-b border-line-soft py-3 last:border-0 ${c.hidden ? "text-muted" : ""}`}>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm">
                  <strong className="font-semibold">{c.authorName}</strong> <span className="text-muted">· {when(c.createdAt, lang)}</span>
                  {c.hidden && <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs">{t("hidden")}</span>}
                </span>
                <span className={c.hidden ? "line-through decoration-line" : ""}>{c.body}</span>
              </span>
              {canModerate && (
                <Button kind="bare" size="sm" className="shrink-0 underline underline-offset-4" disabled={busy} onClick={() => void run(() => api.staff.feed.hideComment(slug, post.id, c.id, !c.hidden))}>
                  {c.hidden ? t("unhide") : t("hide")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 && <p className="text-sm text-muted">{t("hiddenHelp")}</p>}

      {confirm && (
        <Sheet title={t("removeTitle")} onClose={() => setConfirm(false)} labelClose={t("close")}>
          <p className="leading-normal text-muted">{t("removeBody")}</p>
          <Button kind="danger" size="lg" disabled={busy} onClick={() => void run(() => api.staff.feed.remove(slug, post.id), () => setConfirm(false))}>
            {t("removeYes")}
          </Button>
          <Button kind="quiet" onClick={() => setConfirm(false)}>
            {t("cancel")}
          </Button>
        </Sheet>
      )}
    </article>
  );
}
