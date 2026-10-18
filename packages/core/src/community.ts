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
  /** Taken down by the café: gone from the feed, kept on record. */
  hiddenAt?: Date | null;
}

export interface PostComment {
  id: string;
  customerId: string;
  body: string;
  createdAt: Date;
  /** Hidden by the café's moderators; only they still see it (plan piece 14). */
  hiddenAt?: Date | null;
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

/** Moderators see hidden comments too; everyone else never does. */
export type ListOptions = { hiddenComments?: boolean };

export interface CommunityStore {
  savePost(post: Post): Promise<void>;
  /** Posts the café took down aren't found. */
  getPost(id: string, opts?: ListOptions): Promise<PostWithActivity | null>;
  /** All of a café's posts still up, newest first. */
  listPosts(cafeId: string, opts?: ListOptions): Promise<PostWithActivity[]>;
  /** Returns whether the customer now reacts to the post. */
  toggleReaction(postId: string, customerId: string, at: Date): Promise<boolean>;
  addRsvp(postId: string, customerId: string, at: Date): Promise<void>;
  removeRsvp(postId: string, customerId: string): Promise<void>;
  addComment(postId: string, comment: PostComment): Promise<void>;
  /** Hides a comment, or brings it back with `null`. */
  setCommentHidden(postId: string, commentId: string, hiddenAt: Date | null): Promise<void>;
  /** The writer takes their own comment back: it's gone for good. */
  deleteComment(postId: string, commentId: string): Promise<void>;
}

/** Up to this many photos on a post. */
export const MAX_POST_IMAGES = 6;

export class InMemoryCommunityStore implements CommunityStore {
  private readonly posts = new Map<string, PostWithActivity>();

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
    return p && !p.hiddenAt ? copy(p, opts) : null;
  }

  async listPosts(cafeId: string, opts: ListOptions = {}) {
    return [...this.posts.values()]
      .filter((p) => p.cafeId === cafeId && !p.hiddenAt)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .map((p) => copy(p, opts));
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

  async setCommentHidden(postId: string, commentId: string, hiddenAt: Date | null) {
    const p = this.require(postId);
    p.comments = p.comments.map((c) => (c.id === commentId ? { ...c, hiddenAt } : c));
  }

  async deleteComment(postId: string, commentId: string) {
    const p = this.require(postId);
    p.comments = p.comments.filter((c) => c.id !== commentId);
  }

  private require(postId: string): PostWithActivity {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`Unknown post ${postId}`);
    return p;
  }
}

function copy(p: PostWithActivity, opts: ListOptions = {}): PostWithActivity {
  return {
    ...p,
    imageUrls: [...(p.imageUrls ?? [])],
    reactions: [...p.reactions],
    rsvps: [...p.rsvps],
    comments: p.comments.filter((c) => opts.hiddenComments || !c.hiddenAt).map((c) => ({ ...c })),
  };
}
