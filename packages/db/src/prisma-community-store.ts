import type { CommunityStore, ListOptions, Post, PostComment, PostWithActivity } from "@peni/core";
import type { Db } from "./db";

const activity = (opts: ListOptions) =>
  ({
    reactions: { select: { customerId: true } },
    rsvps: { select: { customerId: true }, orderBy: { createdAt: "asc" } },
    comments: { where: opts.hiddenComments ? {} : { hiddenAt: null }, orderBy: { createdAt: "asc" } },
  }) as const;

type Row = Omit<Post, "imageUrls"> & {
  imageUrls: string[];
  reactions: { customerId: string }[];
  rsvps: { customerId: string }[];
  comments: { id: string; customerId: string; body: string; createdAt: Date; hiddenAt: Date | null }[];
};

export class PrismaCommunityStore implements CommunityStore {
  constructor(private readonly db: Db) {}

  async savePost(post: Post): Promise<void> {
    const { id, ...data } = post;
    await this.db().cafePost.upsert({ where: { id }, create: post, update: data });
  }

  async getPost(id: string, opts: ListOptions = {}): Promise<PostWithActivity | null> {
    const row = await this.db().cafePost.findFirst({ where: { id, hiddenAt: null }, include: activity(opts) });
    return row ? toDomain(row) : null;
  }

  async listPosts(cafeId: string, opts: ListOptions = {}): Promise<PostWithActivity[]> {
    const rows = await this.db().cafePost.findMany({
      where: { cafeId, hiddenAt: null },
      include: activity(opts),
      orderBy: { publishedAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async toggleReaction(postId: string, customerId: string, at: Date): Promise<boolean> {
    const { count } = await this.db().postReaction.deleteMany({ where: { postId, customerId } });
    if (count > 0) return false;
    await this.db().postReaction.createMany({ data: [{ postId, customerId, createdAt: at }], skipDuplicates: true });
    return true;
  }

  async addRsvp(postId: string, customerId: string, at: Date): Promise<void> {
    await this.db().eventRsvp.createMany({ data: [{ postId, customerId, createdAt: at }], skipDuplicates: true });
  }

  async removeRsvp(postId: string, customerId: string): Promise<void> {
    await this.db().eventRsvp.deleteMany({ where: { postId, customerId } });
  }

  async addComment(postId: string, comment: PostComment): Promise<void> {
    await this.db().postComment.create({ data: { ...comment, postId } });
  }

  async setCommentHidden(postId: string, commentId: string, hiddenAt: Date | null): Promise<void> {
    await this.db().postComment.updateMany({ where: { id: commentId, postId }, data: { hiddenAt } });
  }

  async deleteComment(postId: string, commentId: string): Promise<void> {
    await this.db().postComment.deleteMany({ where: { id: commentId, postId } });
  }
}

function toDomain(row: Row): PostWithActivity {
  return {
    id: row.id,
    cafeId: row.cafeId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    publishedAt: row.publishedAt,
    pinned: row.pinned,
    eventStartsAt: row.eventStartsAt,
    eventCapacity: row.eventCapacity,
    imageUrls: row.imageUrls,
    authorId: row.authorId,
    hiddenAt: row.hiddenAt,
    reactions: row.reactions.map((r) => r.customerId),
    rsvps: row.rsvps.map((r) => r.customerId),
    comments: row.comments.map((c) => ({ id: c.id, customerId: c.customerId, body: c.body, createdAt: c.createdAt, hiddenAt: c.hiddenAt })),
  };
}
