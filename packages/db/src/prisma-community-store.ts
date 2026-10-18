import type { CommunityStore, Post, PostComment, PostWithActivity } from "@peni/core";
import type { Db } from "./db";

const ACTIVITY = {
  reactions: { select: { customerId: true } },
  rsvps: { select: { customerId: true }, orderBy: { createdAt: "asc" } },
  comments: { where: { hiddenAt: null }, orderBy: { createdAt: "asc" } },
} as const;

type Row = Post & {
  reactions: { customerId: string }[];
  rsvps: { customerId: string }[];
  comments: { id: string; customerId: string; body: string; createdAt: Date }[];
};

export class PrismaCommunityStore implements CommunityStore {
  constructor(private readonly db: Db) {}

  async savePost(post: Post): Promise<void> {
    const { id, ...data } = post;
    await this.db().cafePost.upsert({ where: { id }, create: post, update: data });
  }

  async getPost(id: string): Promise<PostWithActivity | null> {
    const row = await this.db().cafePost.findFirst({ where: { id, hiddenAt: null }, include: ACTIVITY });
    return row ? toDomain(row) : null;
  }

  async listPosts(cafeId: string): Promise<PostWithActivity[]> {
    const rows = await this.db().cafePost.findMany({
      where: { cafeId, hiddenAt: null },
      include: ACTIVITY,
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
    reactions: row.reactions.map((r) => r.customerId),
    rsvps: row.rsvps.map((r) => r.customerId),
    comments: row.comments.map((c) => ({ id: c.id, customerId: c.customerId, body: c.body, createdAt: c.createdAt })),
  };
}
