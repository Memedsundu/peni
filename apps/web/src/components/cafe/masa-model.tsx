import type { CafeDetailDTO, PostDTO } from "@peni/api";
import { masaCopy } from "@peni/brand/copy";
import { formatNumber, formatTime, relDay, SEP, TIME_ZONE } from "@peni/brand/format";
import { buildIcs } from "@/server/ics";

/*
 * Pure helpers for the Masa feed (design-system.md §9.3 "Masa", §6.5). No React, no DOM:
 * everything here is unit-tested in masa-model.test.ts.
 */

/** "22 Ekim Perşembe 19:00": an event's day and time, for words that travel without the date block. */
export function eventWhen(eventStartsAt: string): string {
  const day = new Intl.DateTimeFormat("tr-TR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(
    new Date(eventStartsAt),
  );
  return `${day} ${formatTime(eventStartsAt)}`;
}

/**
 * Masa strings that `@peni/brand` `masaCopy` doesn't carry yet. They live here, in one place,
 * until they move into packages/brand/src/copy.ts (so mobile says the same words); then this
 * object goes and the components read `masaCopy` alone.
 */
export const masaMoreCopy = {
  showLess: "Daha az göster",
  send: "Gönder",
  heart: "Kalp",
  answersLabel: "Cevaplar",
  olderAnswersLabel: "Önceki cevaplar",
  commentsLabel: "Yorumlar",
  /** Under a post's comments, for someone who isn't a member yet (the answer card's pattern). */
  commentJoin: "Yorum yazmak için kafeye katıl.",
  /** Read out once a comment is in (an answer says `masaCopy.answered`). */
  commentSent: "Yorumun masada.",
  /** "Gönder" with nothing typed: the reason nothing was sent. */
  emptyAnswer: "Önce cevabını yaz.",
  emptyComment: "Önce yorumunu yaz.",
  /**
   * The seats line. `masaCopy.seats` says a bare "Masa doldu" once the table is full; when one of
   * the chairs is mine it keeps " · sen de geliyorsun", as it does below capacity.
   */
  seats: (count: number, capacity: number, me = false) =>
    count >= capacity && me ? `${masaCopy.full}${SEP}sen de geliyorsun` : masaCopy.seats(count, capacity, me),
  /** An open table (no capacity): "8 kişi geliyor" / "8 kişi geliyor · sen de geliyorsun". */
  attending: (n: number, me = false) => `${formatNumber(n)} kişi geliyor${me ? `${SEP}sen de geliyorsun` : ""}`,
  /** A table that's over: "9/12 yer doluydu". */
  seatsPast: (n: number, capacity: number) => `${formatNumber(n)}/${formatNumber(capacity)} yer doluydu`,
  /** An open table that's over: "8 kişi geldi". */
  came: (n: number) => `${formatNumber(n)} kişi geldi`,
  /** What "Paylaş" sends with the link: "Moda Kahvesi · Peni masası · 22 Ekim Perşembe 19:00". */
  shareText: (cafeName: string, eventStartsAt: string) => `${cafeName}${SEP}Peni masası${SEP}${eventWhen(eventStartsAt)}`,
} as const;

/** A Peni masası lasts two hours (the same length the .ics file uses). */
export const EVENT_LENGTH_MS = 2 * 60 * 60 * 1000;

/** The newest answers a question card shows before "12 cevabın hepsini gör". */
export const ANSWERS_SHOWN = 3;

/** Answers and comments: the API's limit (`commentSchema`). */
export const COMMENT_MAX = 500;

/** The feed order: pinned items on top, then newest first (§9.3). Stable; never mutates. */
export function feedOrder(posts: readonly PostDTO[]): PostDTO[] {
  return posts
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        Number(b.p.pinned) - Number(a.p.pinned) || Date.parse(b.p.publishedAt) - Date.parse(a.p.publishedAt) || a.i - b.i,
    )
    .map(({ p }) => p);
}

/** An event's topic [G4], or the first line of its body until the title exists. */
export function eventTopic(post: Pick<PostDTO, "title" | "body">): string {
  return post.title?.trim() || post.body.split("\n")[0]!.trim();
}

/**
 * The body under the topic. When the topic is the body's own first line (no title yet [G4]),
 * the rest of the body, so the same sentence is never printed twice. May be empty.
 */
export function eventBody(post: Pick<PostDTO, "title" | "body">): string {
  if (post.title?.trim()) return post.body.trim();
  return post.body.split("\n").slice(1).join("\n").trim();
}

/** Over once its two hours have run out: then a "GEÇTİ" tag and no actions. */
export function eventIsPast(post: Pick<PostDTO, "eventStartsAt">, now: Date): boolean {
  if (!post.eventStartsAt) return false;
  return Date.parse(post.eventStartsAt) + EVENT_LENGTH_MS <= now.getTime();
}

/** Every seat is taken. An event with no capacity never fills. */
export function eventIsFull(post: Pick<PostDTO, "eventCapacity" | "rsvpCount">): boolean {
  return post.eventCapacity != null && post.eventCapacity > 0 && post.rsvpCount >= post.eventCapacity;
}

type Comment = PostDTO["comments"][number];

/** Newest first. Never mutates. */
export function newestFirst(comments: readonly Comment[]): Comment[] {
  return [...comments].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * When something was said, as short as it can be: "09:12" today, otherwise the relative day
 * ("dün", "Pazartesi", "12 Eki").
 */
export function whenLabel(iso: string, now: Date): string {
  const day = relDay(iso, now);
  return day === "bugün" ? formatTime(iso) : day;
}

/** The fields a heart changes. */
export type HeartState = Pick<PostDTO, "reactedByMe" | "reactionCount">;

/** The heart after one tap. */
export function toggledHeart(s: HeartState): HeartState {
  return { reactedByMe: !s.reactedByMe, reactionCount: Math.max(0, s.reactionCount + (s.reactedByMe ? -1 : 1)) };
}

/** The fields an RSVP changes. Attendees follow `rsvpedByMe` inside `LongTable`. */
export type RsvpState = Pick<PostDTO, "rsvpedByMe" | "rsvpCount">;

/** The RSVP after one tap: "Geliyorum" takes a seat, "Geliyorsun" gives it back (no confirm). */
export function toggledRsvp(s: RsvpState): RsvpState {
  return { rsvpedByMe: !s.rsvpedByMe, rsvpCount: Math.max(0, s.rsvpCount + (s.rsvpedByMe ? -1 : 1)) };
}

/**
 * An optimistic picture over the server's. It applies only while the server still reports the
 * values it was taken against: once a refetch brings the change (or anything newer), the
 * server wins and the overlay is ignored, with nothing to clean up.
 */
export interface Overlay<T> {
  base: T;
  value: T;
}

export function sameFields<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((k) => Object.is(a[k], b[k]));
}

export function withOverlay<T extends object>(server: T, overlay: Overlay<T> | null): T {
  return overlay && sameFields(overlay.base, server) ? overlay.value : server;
}

/** The link "Paylaş" hands out: the café page, scrolled to this card. */
export function postUrl(origin: string, slug: string, postId: string): string {
  return `${origin.replace(/\/$/, "")}/k/${encodeURIComponent(slug)}#post-${encodeURIComponent(postId)}`;
}

/** "2026-10-22": the event's day in the cafés' time zone. */
function isoDay(iso: string): string {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

/** "peni-masasi-2026-10-22.ics", the name the server's file [G22] also carries. */
export function icsFilename(eventStartsAt: string): string {
  return `peni-masasi-${isoDay(eventStartsAt)}.ics`;
}

/**
 * "Takvime ekle" without the server (§9.3): DTSTART = `eventStartsAt`, two hours, SUMMARY = the
 * topic, LOCATION = the café and its address. The fallback when the [G22] file can't be fetched.
 */
export function eventIcs(
  post: Pick<PostDTO, "id" | "title" | "body" | "eventStartsAt">,
  cafe: Pick<CafeDetailDTO, "name" | "address" | "district" | "city">,
  now: Date,
  url?: string,
): { filename: string; body: string } | null {
  if (!post.eventStartsAt) return null;
  const start = new Date(post.eventStartsAt);
  const description = eventBody(post);
  return {
    filename: icsFilename(post.eventStartsAt),
    body: buildIcs({
      uid: `${post.id}@peni`,
      stamp: now,
      start,
      end: new Date(start.getTime() + EVENT_LENGTH_MS),
      summary: eventTopic(post),
      location: [cafe.name, cafe.address, cafe.district, cafe.city].filter(Boolean).join(", ") || null,
      description: description || null,
      url: url ?? null,
    }),
  };
}

/** The DOM id of a card, which the "Bugün masada" strip and shared links scroll to. */
export function postDomId(postId: string): string {
  return `post-${postId}`;
}

/*
 * Keeping a Masa action through sign-in (§9.3, like the menu's `?ekle=` and the askı's
 * `?aski=`). A signed-out "Geliyorum", heart, "Giriş yap ve katıl" under the question or under
 * a post's comments goes to /giris with a return address that joins (`katil=1`, which the page
 * shell finishes) and names the action: `masa=rsvp:post_1`. Back on the page, the feed reads the
 * marker once, removes it, and replays the action as soon as the visitor is a member.
 */

/** rsvp: "Geliyorum". kalp: the heart. cevap: open the answer field. yorum: open the comment field. */
export type MasaIntentKind = "rsvp" | "kalp" | "cevap" | "yorum";

export interface MasaIntent {
  kind: MasaIntentKind;
  postId: string;
}

export const MASA_INTENT_PARAM = "masa";

const INTENT_KINDS: readonly MasaIntentKind[] = ["rsvp", "kalp", "cevap", "yorum"];

/** "/k/moda?katil=1&masa=rsvp%3Apost_1#post-post_1": joins, replays, and lands on the card. */
export function masaReturnTo(slug: string, intent: MasaIntent): string {
  const query = new URLSearchParams({ katil: "1", [MASA_INTENT_PARAM]: `${intent.kind}:${intent.postId}` });
  return `/k/${encodeURIComponent(slug)}?${query.toString()}#${encodeURIComponent(postDomId(intent.postId))}`;
}

/** "rsvp:post_1" → { kind: "rsvp", postId: "post_1" }; anything else → null. */
export function parseMasaIntent(raw: string | null | undefined): MasaIntent | null {
  if (!raw) return null;
  const at = raw.indexOf(":");
  if (at <= 0) return null;
  const kind = raw.slice(0, at) as MasaIntentKind;
  const postId = raw.slice(at + 1);
  if (!INTENT_KINDS.includes(kind) || !/^[\w-]{1,80}$/.test(postId)) return null;
  return { kind, postId };
}

/**
 * A seat or a heart is seen by everyone at the table, so it is replayed only when this browser
 * tab started it (a stored note, see masa-shared). A link someone else crafted never takes a seat
 * for you. Opening an empty answer or comment field changes nothing, so it needs no note.
 */
export function intentChangesTable(kind: MasaIntentKind): boolean {
  return kind === "rsvp" || kind === "kalp";
}

/** How long a stored note vouches for a marker: long enough to receive and type an SMS code. */
export const INTENT_NOTE_TTL_MS = 30 * 60 * 1000;

export interface IntentNote extends MasaIntent {
  slug: string;
  at: number;
}

/** Whether the note this tab stored before /giris vouches for `intent` on this café, now. */
export function noteVouches(note: IntentNote | null, slug: string, intent: MasaIntent, now: number): boolean {
  return (
    !!note &&
    note.slug === slug &&
    note.kind === intent.kind &&
    note.postId === intent.postId &&
    now - note.at >= 0 &&
    now - note.at < INTENT_NOTE_TTL_MS
  );
}
