import type { StaffFeedDTO, StaffPostDTO, StaffReportDTO } from "@peni/api";
import {
  AUTO_HIDE_REPORTS,
  imageIdOf,
  imageUrl,
  MAX_IMAGE_BYTES,
  MAX_POST_IMAGES,
  sniffImageType,
  type CommunityStore,
  type ContentReport,
  type ImageStore,
  type PeniDirectory,
  type Permission,
  type Post,
  type PostWithActivity,
  type ReportStore,
  type ReportTargetType,
  type StaffStore,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
import type { StaffContext } from "./staff";

/** Events start at least this far ahead, and at most this far. */
const EVENT_LEAD_MS = 5 * 60_000;
const EVENT_HORIZON_MS = 92 * 24 * 3_600_000;

/** An event's time, checked: later than now, within about three months. */
export function eventTime(iso: string, now: Date): Date {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() + EVENT_LEAD_MS) throw new AppError("EVENT_IN_PAST", "Pick a time later than now", 400);
  if (at.getTime() > now.getTime() + EVENT_HORIZON_MS) throw new AppError("EVENT_TOO_FAR", "Events open at most three months ahead", 400);
  return at;
}

/** A capacity below the people already going would turn someone away. */
export function eventCapacity(capacity: number | null, going: number): number | null {
  if (capacity !== null && capacity < going) throw new AppError("EVENT_CAPACITY_BELOW", "Fewer places than people going", 400);
  return capacity;
}

/**
 * The café's side of the feed (plan pieces 14 and 15): posts and events with photos, pinned or
 * not, edited or taken down by "posts.write"; comments hidden, members' events taken down,
 * reports answered and members paused by "posts.moderate". Every change answers with the whole
 * feed, as Menü does.
 */
export class FeedService {
  constructor(
    private readonly community: CommunityStore,
    private readonly images: ImageStore,
    private readonly staff: StaffStore,
    private readonly reports: ReportStore,
    private readonly directory: PeniDirectory,
    /** "Ayşe Y." or "Bir üye", as customers see each other. */
    private readonly publicNames: (customerIds: string[]) => Promise<Map<string, string>>,
    /** "Kerem A." even for hidden profiles: moderators need to know whom they're pausing, as the till does. */
    private readonly memberNames: (customerIds: string[]) => Promise<Map<string, string>>,
    private readonly now: () => Date,
  ) {}

  async view(ctx: StaffContext): Promise<StaffFeedDTO> {
    const canWrite = ctx.permissions.has("posts.write");
    const canModerate = ctx.permissions.has("posts.moderate");
    if (!canWrite && !canModerate) this.require(ctx, "posts.write");
    const posts = await this.community.listPosts(ctx.cafe.id, { hiddenComments: true });
    const open = canModerate ? await this.reports.listOpen(ctx.cafe.id) : [];
    const paused = canModerate ? (await this.directory.listMemberships({ cafeId: ctx.cafe.id })).filter((m) => m.pausedAt) : [];
    const names = await this.publicNames([
      ...new Set(posts.flatMap((p) => [...p.comments.map((c) => c.customerId), ...(p.hostCustomerId ? [p.hostCustomerId] : [])])),
    ]);
    const pausedNames = await this.memberNames(paused.map((m) => m.customerId));
    const reportsOn = (type: ReportTargetType, id: string) => open.filter((r) => r.targetType === type && r.targetId === id).length;
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
      eventCapacity: p.eventCapacity,
      authorName: p.authorId ? (authors.get(p.authorId) ?? null) : null,
      hostName: p.hostCustomerId ? (names.get(p.hostCustomerId) ?? "Bir üye") : null,
      reactionCount: p.reactions.length,
      rsvpCount: p.rsvps.length,
      comments: p.comments.map((c) => ({
        id: c.id,
        authorName: names.get(c.customerId) ?? "Bir üye",
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        hidden: !!c.hiddenAt,
      })),
      openReports: reportsOn("post", p.id),
    });
    return {
      canWrite,
      canModerate,
      posts: [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.getTime() - a.publishedAt.getTime()).map(dto),
      reports: await this.reportCards(ctx, open),
      paused: paused
        .sort((a, b) => b.pausedAt!.getTime() - a.pausedAt!.getTime())
        .map((m) => ({ customerId: m.customerId, name: pausedNames.get(m.customerId) ?? "İsimsiz üye", pausedAt: m.pausedAt!.toISOString() })),
    };
  }

  /** A new post or event; the same `createKey` again posts once. */
  async create(
    ctx: StaffContext,
    input: {
      createKey: string;
      kind: "post" | "question" | "event";
      body: string;
      imageUrls: string[];
      pinned: boolean;
      title?: string;
      eventStartsAt?: string;
      eventCapacity?: number | null;
    },
  ): Promise<StaffFeedDTO> {
    this.require(ctx, "posts.write");
    const id = `post_${input.createKey}`;
    const existing = await this.community.getPost(id);
    if (existing && existing.cafeId !== ctx.cafe.id) throw new AppError("IDEMPOTENCY_CONFLICT", "This key belongs to another café", 409);
    if (!existing) {
      const imageUrls = await this.ownImages(ctx, input.imageUrls);
      const event = input.kind === "event";
      if (event && (!input.title || !input.eventStartsAt)) throw new AppError("VALIDATION", "An event needs a topic and a time", 400);
      // An event's topic says enough on its own.
      if (!event && !input.body && imageUrls.length === 0) throw new AppError("POST_EMPTY", "Write something or add a photo", 400);
      await this.community.savePost({
        id,
        cafeId: ctx.cafe.id,
        kind: input.kind,
        title: event ? input.title! : null,
        body: input.body,
        imageUrls,
        pinned: input.pinned,
        publishedAt: this.now(),
        eventStartsAt: event ? eventTime(input.eventStartsAt!, this.now()) : null,
        eventCapacity: event ? (input.eventCapacity ?? null) : null,
        authorId: ctx.member.id,
        hostCustomerId: null,
        hiddenAt: null,
      });
    }
    return this.view(ctx);
  }

  async update(
    ctx: StaffContext,
    postId: string,
    input: { body?: string; imageUrls?: string[]; pinned?: boolean; title?: string; eventStartsAt?: string; eventCapacity?: number | null },
  ): Promise<StaffFeedDTO> {
    this.require(ctx, "posts.write");
    const post = await this.find(ctx, postId);
    // A member's event is theirs to word; the café only pins it or takes it down.
    const changesWords = Object.entries(input).some(([k, v]) => k !== "pinned" && v !== undefined);
    if (post.hostCustomerId && changesWords) throw new AppError("EVENT_NOT_YOURS", "A member opened this event", 403);
    const event = post.kind === "event";
    const body = input.body ?? post.body;
    const imageUrls = input.imageUrls ? await this.ownImages(ctx, input.imageUrls) : (post.imageUrls ?? []);
    // An event keeps its topic, so it can do without the words.
    if (!body && imageUrls.length === 0 && !event) throw new AppError("POST_EMPTY", "Write something or add a photo", 400);
    await this.community.savePost({
      ...bare(post),
      body,
      imageUrls,
      pinned: input.pinned ?? post.pinned,
      ...(event
        ? {
            title: input.title ?? post.title,
            eventStartsAt: input.eventStartsAt ? eventTime(input.eventStartsAt, this.now()) : post.eventStartsAt,
            eventCapacity: input.eventCapacity !== undefined ? eventCapacity(input.eventCapacity, post.rsvps.length) : post.eventCapacity,
          }
        : {}),
    });
    return this.view(ctx);
  }

  /**
   * Takes a post down: gone from the feed, kept on record. Taking it down twice is harmless.
   * The café's own posts need "posts.write"; a member's event is moderation, so either will do.
   */
  async remove(ctx: StaffContext, postId: string): Promise<StaffFeedDTO> {
    const post = await this.community.getPost(postId);
    const mine = !post || !post.hostCustomerId;
    if (mine || !ctx.permissions.has("posts.moderate")) this.require(ctx, "posts.write");
    if (post && post.cafeId === ctx.cafe.id) {
      await this.community.savePost({ ...bare(post), hiddenAt: this.now() });
      await this.reports.resolve("post", post.id, "upheld", ctx.member.id, this.now());
    }
    return this.view(ctx);
  }

  async setCommentHidden(ctx: StaffContext, postId: string, commentId: string, hidden: boolean): Promise<StaffFeedDTO> {
    this.require(ctx, "posts.moderate");
    const post = await this.find(ctx, postId, true);
    const comment = post.comments.find((c) => c.id === commentId);
    if (!comment) throw new AppError("COMMENT_NOT_FOUND", "No such comment", 404);
    if (!!comment.hiddenAt !== hidden) await this.community.setCommentHidden(postId, commentId, hidden ? this.now() : null);
    await this.reports.resolve("comment", commentId, hidden ? "upheld" : "dismissed", ctx.member.id, this.now());
    return this.view(ctx);
  }

  /**
   * A moderator answers everything reported about one comment or event: "remove" takes it down
   * (and, with `pauseAuthor`, pauses whoever wrote it); "keep" closes the reports and brings it
   * back if reports had hidden it.
   */
  async resolveReport(
    ctx: StaffContext,
    input: { targetType: ReportTargetType; targetId: string; action: "remove" | "keep"; pauseAuthor: boolean },
  ): Promise<StaffFeedDTO> {
    this.require(ctx, "posts.moderate");
    const open = (await this.reports.openFor(input.targetType, input.targetId)).filter((r) => r.cafeId === ctx.cafe.id);
    if (open.length === 0) throw new AppError("REPORT_NOT_FOUND", "Someone already looked at this", 404);
    const target = await this.target(ctx, input.targetType, input.targetId, open[0]!.postId);
    if (!target) {
      // Gone already (the writer took it back): nothing left to judge.
      await this.reports.resolve(input.targetType, input.targetId, "dismissed", ctx.member.id, this.now());
      return this.view(ctx);
    }
    const remove = input.action === "remove";
    const hiddenAt = remove ? (target.hiddenAt ?? this.now()) : null;
    if (input.targetType === "post") await this.community.savePost({ ...bare(target.post), hiddenAt });
    else await this.community.setCommentHidden(target.post.id, input.targetId, hiddenAt);
    await this.reports.resolve(input.targetType, input.targetId, remove ? "upheld" : "dismissed", ctx.member.id, this.now());
    if (remove && input.pauseAuthor) await this.setPaused(ctx, target.authorId, true);
    return this.view(ctx);
  }

  /** Pauses a member in the community, or lets them back. Their peni stays as it is. */
  async pauseMember(ctx: StaffContext, customerId: string, paused: boolean): Promise<StaffFeedDTO> {
    this.require(ctx, "posts.moderate");
    await this.setPaused(ctx, customerId, paused);
    return this.view(ctx);
  }

  /**
   * A member reports another member's comment or event. Enough reports hide it until a moderator
   * looks (AUTO_HIDE_REPORTS); the café's own posts can't be reported.
   */
  async report(
    cafeId: string,
    reporterId: string,
    input: { targetType: ReportTargetType; targetId: string; postId: string; reason: ContentReport["reason"]; note?: string },
  ): Promise<void> {
    const post = await this.community.getPost(input.postId);
    if (!post || post.cafeId !== cafeId) throw new AppError("NOT_FOUND", "Post not found", 404);
    const authorId = input.targetType === "post" ? post.hostCustomerId : post.comments.find((c) => c.id === input.targetId)?.customerId;
    if (!authorId) throw new AppError("NOT_FOUND", "Nothing a member wrote is here", 404);
    if (authorId === reporterId) throw new AppError("REPORT_OWN", "That's yours", 400);
    const added = await this.reports.add({
      id: `rep_${randomUUID()}`,
      cafeId,
      targetType: input.targetType,
      targetId: input.targetId,
      postId: post.id,
      reporterId,
      reason: input.reason,
      note: input.note || null,
      status: "open",
      createdAt: this.now(),
      resolvedAt: null,
      resolvedBy: null,
    });
    if (!added || (await this.reports.openFor(input.targetType, input.targetId)).length < AUTO_HIDE_REPORTS) return;
    if (input.targetType === "post") await this.community.savePost({ ...bare(post), hiddenAt: this.now() });
    else await this.community.setCommentHidden(post.id, input.targetId, this.now());
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

  private async reportCards(ctx: StaffContext, open: ContentReport[]): Promise<StaffReportDTO[]> {
    const groups = new Map<string, ContentReport[]>();
    for (const r of open) groups.set(`${r.targetType}:${r.targetId}`, [...(groups.get(`${r.targetType}:${r.targetId}`) ?? []), r]);
    const cards: StaffReportDTO[] = [];
    for (const reports of groups.values()) {
      const first = reports[0]!;
      const target = await this.target(ctx, first.targetType, first.targetId, first.postId);
      if (!target) continue;
      const membership = await this.directory.findMembership(target.authorId, ctx.cafe.id);
      const counts = new Map<ContentReport["reason"], number>();
      for (const r of reports) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
      cards.push({
        targetType: first.targetType,
        targetId: first.targetId,
        postId: target.post.id,
        postTitle: target.post.title ?? target.post.body.slice(0, 80),
        body: target.body,
        authorName: (await this.memberNames([target.authorId])).get(target.authorId) ?? "İsimsiz üye",
        authorCustomerId: target.authorId,
        authorPaused: !!membership?.pausedAt,
        hidden: !!target.hiddenAt,
        reasons: [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
        notes: reports.map((r) => r.note).filter((n): n is string => !!n),
        firstReportedAt: first.createdAt.toISOString(),
      });
    }
    return cards;
  }

  /** The reported thing, hidden or not, with who wrote it. Null when it's gone for good. */
  private async target(
    ctx: StaffContext,
    type: ReportTargetType,
    targetId: string,
    postId: string,
  ): Promise<{ post: PostWithActivity; body: string; authorId: string; hiddenAt: Date | null } | null> {
    const post = await this.community.getPost(postId, { hiddenComments: true, hiddenPosts: true });
    if (!post || post.cafeId !== ctx.cafe.id) return null;
    if (type === "post") {
      if (!post.hostCustomerId) return null;
      // Hidden here means hidden by reports: a host's cancel closes its reports.
      return { post, body: post.body, authorId: post.hostCustomerId, hiddenAt: post.hiddenAt ?? null };
    }
    if (post.hiddenAt) return null;
    const comment = post.comments.find((c) => c.id === targetId);
    return comment ? { post, body: comment.body, authorId: comment.customerId, hiddenAt: comment.hiddenAt ?? null } : null;
  }

  private async setPaused(ctx: StaffContext, customerId: string, paused: boolean): Promise<void> {
    const membership = await this.directory.findMembership(customerId, ctx.cafe.id);
    if (!membership) throw new AppError("NOT_A_MEMBER", "Not a member here", 404);
    if (!!membership.pausedAt === paused) return;
    await this.directory.saveMembership({ ...membership, pausedAt: paused ? this.now() : null });
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

/** The post without what people did on it, ready to save back. */
export function bare(post: PostWithActivity): Post {
  const { reactions: _r, rsvps: _v, comments: _c, ...rest } = post;
  return rest;
}
