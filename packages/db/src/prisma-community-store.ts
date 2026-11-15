import type { CommunityStore, ListOptions, PageOptions, Post, PostComment, PostWithActivity } from "@peni/core";
import type { Db } from "./db";

const activity = (opts: ListOptions) =>
  ({
    reactions: { select: { customerId: true } },
    rsvps: { select: { customerId: true }, orderBy: { createdAt: "asc" } },
    comments: {
      // A reply goes where the comment it answers goes.
      where: opts.hiddenComments ? {} : { hiddenAt: null, OR: [{ replyToId: null }, { replyTo: { hiddenAt: null } }] },
      orderBy: { createdAt: "asc" },
    },
  }) as const;

type CommentRow = {
  id: string;
  customerId: string | null;
  body: string;
  createdAt: Date;
  hiddenAt: Date | null;
  staffMemberId: string | null;
  replyToId: string | null;
};

type Row = Omit<Post, "imageUrls"> & {
  imageUrls: string[];
  reactions: { customerId: string }[];
  rsvps: { customerId: string }[];
  comments: CommentRow[];
};

export class PrismaCommunityStore implements CommunityStore {
  constructor(private readonly db: Db) {}

  async savePost(post: Post): Promise<void> {
    const { id, ...data } = post;
    await this.db().cafePost.upsert({ where: { id }, create: post, update: data });
  }

  async getPost(id: string, opts: ListOptions = {}): Promise<PostWithActivity | null> {
    const row = await this.db().cafePost.findFirst({ where: { id, ...(opts.hiddenPosts ? {} : { hiddenAt: null }) }, include: activity(opts) });
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

  async pagePosts(cafeId: string, page: PageOptions): Promise<PostWithActivity[]> {
    if (page.limit <= 0) return [];
    const before = page.before;
    const rows = await this.db().cafePost.findMany({
      where: {
        cafeId,
        hiddenAt: null,
        ...(page.skip?.length ? { id: { notIn: page.skip } } : {}),
        // Older than the cursor, or published at the same instant with a smaller id.
        ...(before ? { OR: [{ publishedAt: { lt: before.publishedAt } }, { publishedAt: before.publishedAt, id: { lt: before.id } }] } : {}),
      },
      include: activity(page),
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: page.limit,
    });
    return rows.map(toDomain);
  }

  async listPinned(cafeId: string, opts: ListOptions = {}): Promise<PostWithActivity[]> {
    const rows = await this.db().cafePost.findMany({
      where: { cafeId, hiddenAt: null, pinned: true },
      include: activity(opts),
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toDomain);
  }

  async countPosts(cafeId: string): Promise<number> {
    return this.db().cafePost.count({ where: { cafeId, hiddenAt: null } });
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

  async findComment(commentId: string): Promise<{ postId: string; comment: PostComment } | null> {
    const row = await this.db().postComment.findUnique({ where: { id: commentId } });
    return row ? { postId: row.postId, comment: comment(row) } : null;
  }

  async setCommentHidden(postId: string, commentId: string, hiddenAt: Date | null): Promise<void> {
    await this.db().postComment.updateMany({ where: { id: commentId, postId }, data: { hiddenAt } });
  }

  async deleteComment(postId: string, commentId: string): Promise<void> {
    // The café's replies under it go with it (ON DELETE CASCADE).
    await this.db().postComment.deleteMany({ where: { id: commentId, postId } });
  }

  async countCommentsBy(cafeId: string, customerId: string, since: Date): Promise<number> {
    return this.db().postComment.count({ where: { customerId, createdAt: { gte: since }, post: { cafeId } } });
  }

  async seenAt(cafeId: string): Promise<Date | null> {
    return (await this.db().communitySeen.findUnique({ where: { cafeId } }))?.seenAt ?? null;
  }

  async markSeen(cafeId: string, at: Date): Promise<void> {
    await this.db().communitySeen.upsert({ where: { cafeId }, create: { cafeId, seenAt: at }, update: { seenAt: at } });
  }
}

function comment(c: CommentRow): PostComment {
  return {
    id: c.id,
    customerId: c.customerId,
    body: c.body,
    createdAt: c.createdAt,
    hiddenAt: c.hiddenAt,
    staffMemberId: c.staffMemberId,
    replyToId: c.replyToId,
  };
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
    hostCustomerId: row.hostCustomerId,
    hiddenAt: row.hiddenAt,
    reactions: row.reactions.map((r) => r.customerId),
    rsvps: row.rsvps.map((r) => r.customerId),
    comments: row.comments.map(comment),
  };
}
