import { forgetIn } from "./removal";

/** The café feed: posts, questions and events, with comments, reactions and RSVPs. */

export type PostKind = "post" | "question" | "event";

export interface Post {
  id: string;
  cafeId: string;
  kind: PostKind;
  /** Event topic. */
  title: string | null;
  body: string;
  publishedAt: Date;
  pinned: boolean;
  eventStartsAt: Date | null;
  eventCapacity: number | null;
  /** Photos, in order: the café's own uploads (`/api/v1/images/<id>`). */
  imageUrls?: string[];
  /** The staff member who posted it, when known. */
  authorId?: string | null;
  /** The member who opened this event (D4, plan piece 15); null when the café posted it. */
  hostCustomerId?: string | null;
  /** Taken down by the café, its host, or enough reports: gone from the feed, kept on record. */
  hiddenAt?: Date | null;
}

/**
 * A member's comment, or the café's reply to one. A reply has no customer, names the staff
 * member who wrote it, and answers a member's comment: never a reply, never the post itself.
 */
export interface PostComment {
  id: string;
  /** The member who wrote it; null on the café's reply. */
  customerId: string | null;
  body: string;
  createdAt: Date;
  /** Hidden by the café's moderators; only they still see it (plan piece 14). Replies are removed, not hidden. */
  hiddenAt?: Date | null;
  /** On the café's reply: who on the staff wrote it. Null once they are gone from the café. */
  staffMemberId?: string | null;
  /** On the café's reply: the member's comment it answers. */
  replyToId?: string | null;
}

/** A post with everything people did on it. */
export interface PostWithActivity extends Post {
  /** Customer ids. */
  reactions: string[];
  /** Customer ids, in the order they joined. */
  rsvps: string[];
  /** Oldest first. */
  comments: PostComment[];
}

/** An event stays open this long after it starts, so people can still say they're coming while it's on. */
export const EVENT_OPEN_MS = 3 * 3_600_000;

/** An event that started more than EVENT_OPEN_MS ago: nobody joins or leaves it any more. */
export function eventOver(post: Pick<Post, "kind" | "eventStartsAt">, now: Date): boolean {
  return post.kind === "event" && !!post.eventStartsAt && now.getTime() - post.eventStartsAt.getTime() > EVENT_OPEN_MS;
}

/** A member may write this many comments at one café in a minute, and this many in an hour. */
export const COMMENTS_PER_MINUTE = 5;
export const COMMENTS_PER_HOUR = 30;

/** Moderators see hidden comments too, and find taken-down posts that were reported; everyone else never does. */
export type ListOptions = { hiddenComments?: boolean; hiddenPosts?: boolean };

/** A page of the customers' feed holds this many posts besides the pinned ones on top. */
export const FEED_PAGE = 10;
/** A post on a feed page carries this many of its newest members' comments; the rest come on asking. */
export const COMMENTS_IN_FEED = 20;

/**
 * Where a page of the feed ended. Posts go newest first by time, then by id, so two posts
 * published at the same instant still have a fixed order and none is skipped or repeated.
 */
export interface FeedCursor {
  publishedAt: Date;
  id: string;
}

export interface PageOptions {
  /** Only posts after this one in feed order; from the newest when left out. */
  before?: FeedCursor | null;
  limit: number;
  /** Post ids to leave out: the pinned ones already shown on top. */
  skip?: string[];
  hiddenComments?: boolean;
}

/** Feed order: newest first, then by id, so posts published at the same instant keep one order. */
export function feedOrder(a: Pick<Post, "publishedAt" | "id">, b: Pick<Post, "publishedAt" | "id">): number {
  return b.publishedAt.getTime() - a.publishedAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

export interface CommunityStore {
  savePost(post: Post): Promise<void>;
  /** Posts taken down aren't found, unless `hiddenPosts`. */
  getPost(id: string, opts?: ListOptions): Promise<PostWithActivity | null>;
  /** All of a café's posts still up, newest first. */
  listPosts(cafeId: string, opts?: ListOptions): Promise<PostWithActivity[]>;
  /** One page of a café's posts still up, in feed order, without reading the rest. */
  pagePosts(cafeId: string, page: PageOptions): Promise<PostWithActivity[]>;
  /** A café's pinned posts still up, in feed order. There are only ever a few. */
  listPinned(cafeId: string, opts?: ListOptions): Promise<PostWithActivity[]>;
  /** How many posts a café has still up. */
  countPosts(cafeId: string): Promise<number>;
  /** Returns whether the customer now reacts to the post. */
  toggleReaction(postId: string, customerId: string, at: Date): Promise<boolean>;
  addRsvp(postId: string, customerId: string, at: Date): Promise<void>;
  removeRsvp(postId: string, customerId: string): Promise<void>;
  addComment(postId: string, comment: PostComment): Promise<void>;
  /** Any comment or reply by its id, hidden or not, on any post. */
  findComment(commentId: string): Promise<{ postId: string; comment: PostComment } | null>;
  /** Hides a comment, or brings it back with `null`. */
  setCommentHidden(postId: string, commentId: string, hiddenAt: Date | null): Promise<void>;
  /** The writer takes their own comment back: it's gone for good, with the café's replies under it. */
  deleteComment(postId: string, commentId: string): Promise<void>;
  /** Comments a member wrote at this café since then, hidden ones and ones on posts taken down too. */
  countCommentsBy(cafeId: string, customerId: string, since: Date): Promise<number>;
  /** When someone on the staff last looked at Topluluk; null if nobody has yet. */
  seenAt(cafeId: string): Promise<Date | null>;
  markSeen(cafeId: string, at: Date): Promise<void>;
}

/** Up to this many photos on a post. */
export const MAX_POST_IMAGES = 6;

export class InMemoryCommunityStore implements CommunityStore {
  private readonly posts = new Map<string, PostWithActivity>();
  private readonly seen = new Map<string, Date>();

  /** For removing the café (N13). */
  forgetCafe(cafeId: string): void {
    forgetIn(this.posts, cafeId);
    this.seen.delete(cafeId);
  }

  async savePost(post: Post) {
    const existing = this.posts.get(post.id);
    this.posts.set(post.id, {
      ...post,
      reactions: existing?.reactions ?? [],
      rsvps: existing?.rsvps ?? [],
      comments: existing?.comments ?? [],
    });
  }

  async getPost(id: string, opts: ListOptions = {}) {
    const p = this.posts.get(id);
    return p && (opts.hiddenPosts || !p.hiddenAt) ? copy(p, opts) : null;
  }

  async listPosts(cafeId: string, opts: ListOptions = {}) {
    return [...this.posts.values()]
      .filter((p) => p.cafeId === cafeId && !p.hiddenAt)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .map((p) => copy(p, opts));
  }

  async pagePosts(cafeId: string, page: PageOptions) {
    const skip = new Set(page.skip ?? []);
    const before = page.before;
    return [...this.posts.values()]
      .filter((p) => p.cafeId === cafeId && !p.hiddenAt && !skip.has(p.id))
      .filter((p) => !before || feedOrder(before, p) < 0)
      .sort(feedOrder)
      .slice(0, Math.max(0, page.limit))
      .map((p) => copy(p, page));
  }

  async listPinned(cafeId: string, opts: ListOptions = {}) {
    return [...this.posts.values()]
      .filter((p) => p.cafeId === cafeId && !p.hiddenAt && p.pinned)
      .sort(feedOrder)
      .map((p) => copy(p, opts));
  }

  async countPosts(cafeId: string) {
    return [...this.posts.values()].filter((p) => p.cafeId === cafeId && !p.hiddenAt).length;
  }

  async toggleReaction(postId: string, customerId: string) {
    const p = this.require(postId);
    const on = !p.reactions.includes(customerId);
    p.reactions = on ? [...p.reactions, customerId] : p.reactions.filter((id) => id !== customerId);
    return on;
  }

  async addRsvp(postId: string, customerId: string) {
    const p = this.require(postId);
    if (!p.rsvps.includes(customerId)) p.rsvps = [...p.rsvps, customerId];
  }

  async removeRsvp(postId: string, customerId: string) {
    const p = this.require(postId);
    p.rsvps = p.rsvps.filter((id) => id !== customerId);
  }

  async addComment(postId: string, comment: PostComment) {
    const p = this.require(postId);
    p.comments = [...p.comments, { ...comment }];
  }

  async findComment(commentId: string) {
    for (const p of this.posts.values()) {
      const comment = p.comments.find((c) => c.id === commentId);
      if (comment) return { postId: p.id, comment: { ...comment } };
    }
    return null;
  }

  async setCommentHidden(postId: string, commentId: string, hiddenAt: Date | null) {
    const p = this.require(postId);
    p.comments = p.comments.map((c) => (c.id === commentId ? { ...c, hiddenAt } : c));
  }

  async deleteComment(postId: string, commentId: string) {
    const p = this.require(postId);
    p.comments = p.comments.filter((c) => c.id !== commentId && c.replyToId !== commentId);
  }

  async countCommentsBy(cafeId: string, customerId: string, since: Date) {
    let n = 0;
    for (const p of this.posts.values()) {
      if (p.cafeId === cafeId) n += p.comments.filter((c) => c.customerId === customerId && c.createdAt >= since).length;
    }
    return n;
  }

  async seenAt(cafeId: string) {
    return this.seen.get(cafeId) ?? null;
  }

  async markSeen(cafeId: string, at: Date) {
    this.seen.set(cafeId, at);
  }

  private require(postId: string): PostWithActivity {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`Unknown post ${postId}`);
    return p;
  }
}

function copy(p: PostWithActivity, opts: ListOptions = {}): PostWithActivity {
  // A reply goes where the comment it answers goes.
  const hidden = new Set(p.comments.filter((c) => c.hiddenAt).map((c) => c.id));
  const shown = (c: PostComment) => opts.hiddenComments || (!c.hiddenAt && !(c.replyToId && hidden.has(c.replyToId)));
  return {
    ...p,
    imageUrls: [...(p.imageUrls ?? [])],
    reactions: [...p.reactions],
    rsvps: [...p.rsvps],
    comments: p.comments.filter(shown).map((c) => ({ ...c })),
  };
}
