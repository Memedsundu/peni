import type { PostDTO } from "@peni/api";
import { formatTime, relDay } from "@peni/brand/format";

/*
 * Pure helpers for the Masa feed (design-system.md §9.3 "Masa", §6.5). No React, no DOM:
 * everything here is unit-tested in masa-model.test.ts.
 */

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

/** The DOM id of a card, which the "Bugün masada" strip and shared links scroll to. */
export function postDomId(postId: string): string {
  return `post-${postId}`;
}
