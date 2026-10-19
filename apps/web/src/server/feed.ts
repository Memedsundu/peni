import type { StaffFeedDTO, StaffPostDTO } from "@peni/api";
import {
  imageIdOf,
  imageUrl,
  MAX_IMAGE_BYTES,
  MAX_POST_IMAGES,
  sniffImageType,
  type CommunityStore,
  type ImageStore,
  type Permission,
  type PostWithActivity,
  type StaffStore,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
import type { StaffContext } from "./staff";

/**
 * The café's side of the feed (plan piece 14): posts with photos, pinned or not, edited or
 * taken down by "posts.write"; comments hidden and brought back by "posts.moderate". Every
 * change answers with the whole feed, as Menü does.
 */
export class FeedService {
  constructor(
    private readonly community: CommunityStore,
    private readonly images: ImageStore,
    private readonly staff: StaffStore,
    /** "Ayşe Y." or "Bir üye", as customers see each other. */
    private readonly publicNames: (customerIds: string[]) => Promise<Map<string, string>>,
    private readonly now: () => Date,
  ) {}

  async view(ctx: StaffContext): Promise<StaffFeedDTO> {
    const canWrite = ctx.permissions.has("posts.write");
    const canModerate = ctx.permissions.has("posts.moderate");
    if (!canWrite && !canModerate) this.require(ctx, "posts.write");
    const posts = await this.community.listPosts(ctx.cafe.id, { hiddenComments: true });
    const names = await this.publicNames([...new Set(posts.flatMap((p) => p.comments.map((c) => c.customerId)))]);
    const authors = new Map<string, string | null>();
    for (const id of new Set(posts.map((p) => p.authorId).filter((x): x is string => !!x))) {
      const member = await this.staff.getMember(id);
      authors.set(id, member ? ((await this.staff.getAccount(member.accountId))?.name ?? null) : null);
    }
    const dto = (p: PostWithActivity): StaffPostDTO => ({
      id: p.id,
      kind: p.kind,
      title: p.title,
      body: p.body,
      imageUrls: p.imageUrls ?? [],
      pinned: p.pinned,
      publishedAt: p.publishedAt.toISOString(),
      eventStartsAt: p.eventStartsAt?.toISOString() ?? null,
      authorName: p.authorId ? (authors.get(p.authorId) ?? null) : null,
      reactionCount: p.reactions.length,
      rsvpCount: p.rsvps.length,
      comments: p.comments.map((c) => ({
        id: c.id,
        authorName: names.get(c.customerId) ?? "Bir üye",
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        hidden: !!c.hiddenAt,
      })),
    });
    return {
      canWrite,
      canModerate,
      posts: [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.getTime() - a.publishedAt.getTime()).map(dto),
    };
  }

  /** A new post; the same `createKey` again posts once. */
  async create(
    ctx: StaffContext,
    input: { createKey: string; kind: "post" | "question"; body: string; imageUrls: string[]; pinned: boolean },
  ): Promise<StaffFeedDTO> {
    this.require(ctx, "posts.write");
    const id = `post_${input.createKey}`;
    const existing = await this.community.getPost(id);
    if (existing && existing.cafeId !== ctx.cafe.id) throw new AppError("IDEMPOTENCY_CONFLICT", "This key belongs to another café", 409);
    if (!existing) {
      const imageUrls = await this.ownImages(ctx, input.imageUrls);
      if (!input.body && imageUrls.length === 0) throw new AppError("POST_EMPTY", "Write something or add a photo", 400);
      await this.community.savePost({
        id,
        cafeId: ctx.cafe.id,
        kind: input.kind,
        title: null,
        body: input.body,
        imageUrls,
        pinned: input.pinned,
        publishedAt: this.now(),
        eventStartsAt: null,
        eventCapacity: null,
        authorId: ctx.member.id,
        hiddenAt: null,
      });
    }
    return this.view(ctx);
  }

  async update(ctx: StaffContext, postId: string, input: { body?: string; imageUrls?: string[]; pinned?: boolean }): Promise<StaffFeedDTO> {
    this.require(ctx, "posts.write");
    const post = await this.find(ctx, postId);
    const body = input.body ?? post.body;
    const imageUrls = input.imageUrls ? await this.ownImages(ctx, input.imageUrls) : (post.imageUrls ?? []);
    // An event keeps its topic, so it can do without the words.
    if (!body && imageUrls.length === 0 && post.kind !== "event") throw new AppError("POST_EMPTY", "Write something or add a photo", 400);
    const { reactions: _r, rsvps: _v, comments: _c, ...rest } = post;
    await this.community.savePost({ ...rest, body, imageUrls, pinned: input.pinned ?? post.pinned });
    return this.view(ctx);
  }

  /** Takes a post down: gone from the feed, kept on record. Taking it down twice is harmless. */
  async remove(ctx: StaffContext, postId: string): Promise<StaffFeedDTO> {
    this.require(ctx, "posts.write");
    const post = await this.community.getPost(postId);
    if (post && post.cafeId === ctx.cafe.id) {
      const { reactions: _r, rsvps: _v, comments: _c, ...rest } = post;
      await this.community.savePost({ ...rest, hiddenAt: this.now() });
    }
    return this.view(ctx);
  }

  async setCommentHidden(ctx: StaffContext, postId: string, commentId: string, hidden: boolean): Promise<StaffFeedDTO> {
    this.require(ctx, "posts.moderate");
    const post = await this.find(ctx, postId, true);
    const comment = post.comments.find((c) => c.id === commentId);
    if (!comment) throw new AppError("COMMENT_NOT_FOUND", "No such comment", 404);
    if (!!comment.hiddenAt !== hidden) await this.community.setCommentHidden(postId, commentId, hidden ? this.now() : null);
    return this.view(ctx);
  }

  /** A photo for a post. The browser shrinks it first; here it's only checked and kept. */
  async uploadImage(ctx: StaffContext, bytes: Uint8Array): Promise<{ url: string }> {
    this.require(ctx, "posts.write");
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new AppError("IMAGE_TOO_LARGE", "Photos can be at most 2 MB", 413);
    const contentType = sniffImageType(bytes);
    if (!contentType) throw new AppError("IMAGE_TYPE", "Only JPEG, PNG or WebP photos", 415);
    const id = `img_${randomUUID()}`;
    await this.images.save({ id, cafeId: ctx.cafe.id, contentType, bytes, uploadedBy: ctx.member.id, createdAt: this.now() });
    return { url: imageUrl(id) };
  }

  /** Only photos this café uploaded go on its posts. */
  private async ownImages(ctx: StaffContext, urls: string[]): Promise<string[]> {
    if (urls.length > MAX_POST_IMAGES) throw new AppError("VALIDATION", `At most ${MAX_POST_IMAGES} photos`, 400);
    for (const url of urls) {
      const id = imageIdOf(url);
      const image = id ? await this.images.get(id) : null;
      if (!image || image.cafeId !== ctx.cafe.id) throw new AppError("IMAGE_NOT_FOUND", "That photo isn't one of this café's", 400);
    }
    return [...new Set(urls)];
  }

  private async find(ctx: StaffContext, postId: string, hiddenComments = false): Promise<PostWithActivity> {
    const post = await this.community.getPost(postId, { hiddenComments });
    if (!post || post.cafeId !== ctx.cafe.id) throw new AppError("POST_NOT_FOUND", "No such post", 404);
    return post;
  }

  private require(ctx: StaffContext, permission: Permission): void {
    if (ctx.permissions.has(permission)) return;
    if (ctx.rolePermissions.has(permission)) throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    throw new AppError("FORBIDDEN", "Your role can't do this", 403);
  }
}
