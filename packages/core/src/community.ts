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
}

export interface PostComment {
  id: string;
  customerId: string;
  body: string;
  createdAt: Date;
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

export interface CommunityStore {
  savePost(post: Post): Promise<void>;
  getPost(id: string): Promise<PostWithActivity | null>;
  /** All of a café's posts, newest first. */
  listPosts(cafeId: string): Promise<PostWithActivity[]>;
  /** Returns whether the customer now reacts to the post. */
  toggleReaction(postId: string, customerId: string, at: Date): Promise<boolean>;
  addRsvp(postId: string, customerId: string, at: Date): Promise<void>;
  removeRsvp(postId: string, customerId: string): Promise<void>;
  addComment(postId: string, comment: PostComment): Promise<void>;
}

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

  async getPost(id: string) {
    const p = this.posts.get(id);
    return p ? copy(p) : null;
  }

  async listPosts(cafeId: string) {
    return [...this.posts.values()]
      .filter((p) => p.cafeId === cafeId)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .map(copy);
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

  private require(postId: string): PostWithActivity {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`Unknown post ${postId}`);
    return p;
  }
}

function copy(p: PostWithActivity): PostWithActivity {
  return { ...p, reactions: [...p.reactions], rsvps: [...p.rsvps], comments: p.comments.map((c) => ({ ...c })) };
}
