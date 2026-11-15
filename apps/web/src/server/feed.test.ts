import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type CustomerRecord } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;
let ece: StaffContext;
let ayse: CustomerRecord;
let mehmet: CustomerRecord;

/** The smallest PNG there is: one transparent pixel. */
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);
const feed = (who: CustomerRecord | null = ayse) => app.cafeDetail("moda", who).then((c) => c.posts);

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  const signIn = async (who: keyof typeof DEMO_STAFF) => app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, "moda");
  leyla = await signIn("leyla");
  ece = await signIn("ece");
  ayse = (await app.identity.getCustomer("cus_ayse"))!;
  mehmet = (await app.identity.getCustomer("cus_mehmet"))!;
});

describe("the café feed (plan piece 14)", () => {
  it("posts photos and words once, pinned on top of the customers' feed", async () => {
    const { url } = await app.feed.uploadImage(leyla, PNG);
    expect(url).toMatch(/^\/api\/v1\/images\/img_/);
    expect(await app.images.get(url.split("/").at(-1)!)).toMatchObject({ contentType: "image/png", cafeId: "cafe_moda" });

    now = new Date("2026-10-16T09:05:00Z");
    const input = { createKey: "post-key-0001", kind: "post" as const, body: "Yeni kavurduk: Etiyopya Guji.", imageUrls: [url], pinned: true };
    const mine = await app.feed.create(leyla, input);
    await app.feed.create(leyla, input);
    expect(mine.posts.filter((p) => p.body === input.body)).toHaveLength(1);
    expect(mine.posts[0]).toMatchObject({ body: input.body, imageUrls: [url], pinned: true, authorName: "Leyla Kara" });
    expect(mine).toMatchObject({ canWrite: true, canModerate: true });

    const posts = await feed(null);
    expect(posts[0]).toMatchObject({ id: "post_post-key-0001", imageUrls: [url], pinned: true, comments: [] });

    // Edited and unpinned: it drops below the other pinned post, still with its photo.
    const edited = await app.feed.update(leyla, "post_post-key-0001", { body: "Etiyopya Guji, çekirdek olarak da var.", pinned: false });
    expect(edited.posts.find((p) => p.id === "post_post-key-0001")).toMatchObject({ pinned: false, imageUrls: [url] });
    expect((await feed()).find((p) => p.id === "post_post-key-0001")!.body).toBe("Etiyopya Guji, çekirdek olarak da var.");
  });

  it("takes only this café's photos, real photos, and posts with something in them", async () => {
    expect(await code(app.feed.create(leyla, { createKey: "post-key-0002", kind: "post", body: "", imageUrls: [], pinned: false }))).toBe("POST_EMPTY");
    expect(await code(app.feed.uploadImage(leyla, new TextEncoder().encode("<svg onload=alert(1)>")))).toBe("IMAGE_TYPE");
    expect(await code(app.feed.uploadImage(leyla, new Uint8Array(2 * 1024 * 1024 + 1)))).toBe("IMAGE_TOO_LARGE");

    const tarik = await app.staff.at((await app.staff.signIn(DEMO_STAFF.tarik.email, DEMO_STAFF_PASSWORD)).token, "kuzguncuk");
    const theirs = await app.feed.uploadImage(tarik, PNG);
    const make = (imageUrls: string[]) => app.feed.create(leyla, { createKey: `post-key-${imageUrls.length}x`, kind: "post", body: "Bak", imageUrls, pinned: false });
    expect(await code(make([theirs.url]))).toBe("IMAGE_NOT_FOUND");
    expect(await code(make(["https://example.com/a.jpg"]))).toBe("IMAGE_NOT_FOUND");
    // A photo alone is a post.
    const photo = await app.feed.uploadImage(leyla, PNG);
    expect(await code(app.feed.create(leyla, { createKey: "post-key-0003", kind: "post", body: "", imageUrls: [photo.url], pinned: false }))).toBe("ok");
  });

  it("leaves posting and moderating to the roles that have them", async () => {
    expect(await code(app.feed.uploadImage(ece, PNG))).toBe("FORBIDDEN");
    expect(await code(app.feed.view(ece))).toBe("FORBIDDEN");
    expect(await code(app.feed.create(ece, { createKey: "post-key-0004", kind: "post", body: "Merhaba", imageUrls: [], pinned: false }))).toBe("FORBIDDEN");
  });

  it("hides a comment from everyone but the moderators, and brings it back", async () => {
    const [post] = await feed();
    await app.comment(mehmet, "moda", post!.id, "Reklam: ucuz kahve makinesi");
    const said = (await feed()).find((p) => p.id === post!.id)!.comments.at(-1)!;
    expect(said).toMatchObject({ body: "Reklam: ucuz kahve makinesi", mine: false });

    const hidden = await app.feed.setCommentHidden(leyla, post!.id, said.id, true);
    expect(hidden.posts.find((p) => p.id === post!.id)!.comments.at(-1)).toMatchObject({ id: said.id, hidden: true });
    const seen = (await feed()).find((p) => p.id === post!.id)!;
    expect(seen.comments.map((c) => c.id)).not.toContain(said.id);
    expect(seen.commentCount).toBe(seen.comments.length);
    expect(await code(app.feed.setCommentHidden(leyla, post!.id, "cmt_nope", true))).toBe("COMMENT_NOT_FOUND");

    await app.feed.setCommentHidden(leyla, post!.id, said.id, false);
    expect((await feed()).find((p) => p.id === post!.id)!.comments.map((c) => c.id)).toContain(said.id);
  });

  it("lets people take back their own comments only", async () => {
    const [post] = await feed();
    await app.comment(ayse, "moda", post!.id, "Yanlış yere yazdım");
    const mine = (await feed()).find((p) => p.id === post!.id)!.comments.find((c) => c.mine)!;
    expect(await code(app.deleteComment(mehmet, "moda", post!.id, mine.id))).toBe("COMMENT_NOT_FOUND");
    await app.deleteComment(ayse, "moda", post!.id, mine.id);
    expect((await feed()).find((p) => p.id === post!.id)!.comments.map((c) => c.id)).not.toContain(mine.id);
  });

  it("takes a post down for everyone, and keeps it on record", async () => {
    const [post] = await feed();
    const after = await app.feed.remove(leyla, post!.id);
    expect(after.posts.map((p) => p.id)).not.toContain(post!.id);
    expect((await feed()).map((p) => p.id)).not.toContain(post!.id);
    expect(await code(app.react(ayse, "moda", post!.id))).toBe("NOT_FOUND");
    expect(await code(app.feed.update(leyla, post!.id, { pinned: true }))).toBe("POST_NOT_FOUND");
    expect(await code(app.feed.remove(leyla, post!.id))).toBe("ok");
  });
});

describe("limits on comments", () => {
  it("takes five comments a minute and thirty an hour from one member at one café", async () => {
    const say = (n: number, postId = "post_1") => code(app.comment(mehmet, "moda", postId, `Yorum ${n}`));
    let n = 0;
    for (let i = 0; i < 5; i++) expect(await say(++n)).toBe("ok");
    // Another post at the same café counts too.
    expect(await say(++n, "post_2")).toBe("COMMENT_TOO_FAST");
    now = new Date(now.getTime() + 61_000);
    expect(await say(++n)).toBe("ok");

    for (let minute = 0; minute < 6; minute++) {
      now = new Date(now.getTime() + 61_000);
      for (let i = 0; i < 5 && n < 31; i++) expect(await say(++n)).toBe("ok");
    }
    // 30 in the hour now; a quiet minute is not enough.
    now = new Date(now.getTime() + 61_000);
    expect(await say(++n)).toBe("COMMENT_TOO_FAST");
    expect(await app.community.countCommentsBy("cafe_moda", "cus_mehmet", new Date(now.getTime() - 3_600_000))).toBe(30);
    // Someone else isn't held up.
    expect(await code(app.comment(ayse, "moda", "post_1", "Yorum 1"))).toBe("ok");
    // An hour after the first ones, there's room again.
    now = new Date(now.getTime() + 3_600_000);
    expect(await say(++n)).toBe("ok");
  });

  it("refuses the same words twice on one post within the hour, whatever the case", async () => {
    expect(await code(app.comment(ayse, "moda", "post_1", "İyi akşamlar"))).toBe("ok");
    expect(await code(app.comment(ayse, "moda", "post_1", "  iyi AKŞAMLAR "))).toBe("COMMENT_REPEAT");
    // Elsewhere, or someone else, is fine.
    expect(await code(app.comment(ayse, "moda", "post_2", "İyi akşamlar"))).toBe("ok");
    expect(await code(app.comment(mehmet, "moda", "post_1", "İyi akşamlar"))).toBe("ok");
    // Hidden by the café still counts.
    const mine = (await app.feed.view(leyla)).posts.find((p) => p.id === "post_1")!.comments.find((c) => c.body === "İyi akşamlar")!;
    await app.feed.setCommentHidden(leyla, "post_1", mine.id, true);
    expect(await code(app.comment(ayse, "moda", "post_1", "İyi akşamlar"))).toBe("COMMENT_REPEAT");
    now = new Date(now.getTime() + 3_600_000 + 1_000);
    expect(await code(app.comment(ayse, "moda", "post_1", "İyi akşamlar"))).toBe("ok");
  });
});

describe("the café answers a comment", () => {
  const post1 = async (who: CustomerRecord | null = ayse) => (await feed(who)).find((p) => p.id === "post_1")!;
  const staffPost1 = async () => (await app.feed.view(leyla)).posts.find((p) => p.id === "post_1")!;

  it("shows the demo's answer under Can's question, in the café's name to customers and Leyla's to staff", async () => {
    const seen = await post1();
    expect(seen.comments.map((c) => [c.id, c.replies.map((r) => r.body)])).toEqual([
      ["cmt_5", []],
      ["cmt_6", ["Evet, 250 gramlık paketler kasada."]],
    ]);
    expect(seen.commentCount).toBe(3);
    expect((await staffPost1()).comments.find((c) => c.id === "cmt_6")!.replies).toEqual([
      expect.objectContaining({ id: "cmt_reply_1", body: "Evet, 250 gramlık paketler kasada.", byName: "Leyla Kara" }),
    ]);
  });

  it("answers once per key, only a member's comment in view, and only for those who post", async () => {
    const input = { replyKey: "reply-key-0001", body: "Afiyet olsun!" };
    await app.feed.reply(leyla, "post_1", "cmt_5", input);
    const view = await app.feed.reply(leyla, "post_1", "cmt_5", input);
    expect(view.posts.find((p) => p.id === "post_1")!.comments.find((c) => c.id === "cmt_5")!.replies).toEqual([
      { id: "cmt_reply-key-0001", body: "Afiyet olsun!", createdAt: now.toISOString(), byName: "Leyla Kara" },
    ]);
    expect((await post1()).commentCount).toBe(4);
    // The same key elsewhere belongs to something else.
    expect(await code(app.feed.reply(leyla, "post_1", "cmt_6", input))).toBe("IDEMPOTENCY_CONFLICT");
    expect(await code(app.feed.reply(leyla, "post_1", "cmt_6", { replyKey: "reply-key-0007", body: "Hm" }))).toBe("ok");
    // No reply to a reply, nothing that isn't there, nothing on another post.
    expect(await code(app.feed.reply(leyla, "post_1", "cmt_reply_1", { replyKey: "reply-key-0002", body: "Ek" }))).toBe("COMMENT_NOT_FOUND");
    expect(await code(app.feed.reply(leyla, "post_1", "cmt_nope", { replyKey: "reply-key-0003", body: "Ek" }))).toBe("COMMENT_NOT_FOUND");
    expect(await code(app.feed.reply(leyla, "post_2", "cmt_5", { replyKey: "reply-key-0004", body: "Ek" }))).toBe("COMMENT_NOT_FOUND");
    expect(await code(app.feed.reply(ece, "post_1", "cmt_5", { replyKey: "reply-key-0005", body: "Ek" }))).toBe("FORBIDDEN");
    // Not on a comment the café hid.
    await app.feed.setCommentHidden(leyla, "post_1", "cmt_5", true);
    expect(await code(app.feed.reply(leyla, "post_1", "cmt_5", { replyKey: "reply-key-0006", body: "Ek" }))).toBe("COMMENT_NOT_FOUND");
  });

  it("takes a reply back for good, and leaves members' comments alone", async () => {
    const after = await app.feed.removeReply(leyla, "post_1", "cmt_reply_1");
    expect(after.posts.find((p) => p.id === "post_1")!.comments.find((c) => c.id === "cmt_6")!.replies).toEqual([]);
    expect((await post1()).commentCount).toBe(2);
    expect(await code(app.feed.removeReply(leyla, "post_1", "cmt_reply_1"))).toBe("ok");
    expect(await code(app.feed.removeReply(leyla, "post_1", "cmt_6"))).toBe("COMMENT_NOT_FOUND");
    expect(await code(app.feed.removeReply(ece, "post_1", "cmt_6"))).toBe("FORBIDDEN");
  });

  it("hides the replies with the comment they answer, and deletes them with it", async () => {
    await app.feed.setCommentHidden(leyla, "post_1", "cmt_6", true);
    const seen = await post1();
    expect(seen.comments.map((c) => c.id)).toEqual(["cmt_5"]);
    expect(seen.commentCount).toBe(1);
    // Moderators still see both.
    expect((await staffPost1()).comments.find((c) => c.id === "cmt_6")).toMatchObject({ hidden: true, replies: [expect.objectContaining({ id: "cmt_reply_1" })] });
    await app.feed.setCommentHidden(leyla, "post_1", "cmt_6", false);
    expect((await post1()).commentCount).toBe(3);

    const can = (await app.identity.getCustomer("cus_can"))!;
    await app.deleteComment(can, "moda", "post_1", "cmt_6");
    expect((await staffPost1()).comments.map((c) => c.id)).toEqual(["cmt_5"]);
    expect(await app.community.findComment("cmt_reply_1")).toBeNull();
  });

  it("can't be hidden, reported or taken back by a member", async () => {
    expect(await code(app.feed.setCommentHidden(leyla, "post_1", "cmt_reply_1", true))).toBe("COMMENT_NOT_FOUND");
    expect(await code(app.report(ayse, "moda", { targetType: "comment", targetId: "cmt_reply_1", reason: "rude" }))).toBe("NOT_FOUND");
    expect(await code(app.deleteComment(ayse, "moda", "post_1", "cmt_reply_1"))).toBe("COMMENT_NOT_FOUND");
    expect((await app.feed.view(leyla)).reports.map((r) => r.targetId)).not.toContain("cmt_reply_1");
  });
});

describe("the customers' feed in pages", () => {
  /** Posts `n` more on Moda's feed, a minute apart; the first two go out at the same instant. */
  const postMany = async (n: number) => {
    for (let i = 0; i < n; i++) {
      if (i > 1) now = new Date(now.getTime() + 60_000);
      await app.feed.create(leyla, { createKey: `page-key-${String(i).padStart(4, "0")}`, kind: "post", body: `Paylaşım ${i}`, imageUrls: [], pinned: false });
    }
  };
  /** Every page's post ids, following `olderPosts` to the end. */
  const pages = async (who: CustomerRecord | null = ayse) => {
    const first = await app.cafeDetail("moda", who);
    const out = [first.posts.map((p) => p.id)];
    let cursor = first.olderPosts;
    while (cursor) {
      const page = await app.olderPosts("moda", who, cursor);
      out.push(page.posts.map((p) => p.id));
      cursor = page.olderPosts;
    }
    return out;
  };

  it("sends the pinned posts and the newest ten, then ten at a time, never skipping or repeating one", async () => {
    await postMany(25);
    const all = (await app.feed.view(leyla, 500)).posts;
    const seen = await pages(null);
    expect(seen.map((p) => p.length)).toEqual([2 + 10, 10, all.length - 22]);
    // The two pinned posts on top, once; posts published at the same instant both come, in a fixed order.
    expect(seen[0]!.slice(0, 2)).toEqual(["post_question_1", "post_event_1"]);
    expect(seen.flat()).toHaveLength(all.length);
    expect(new Set(seen.flat())).toEqual(new Set(all.map((p) => p.id)));
    expect(seen.flat()).toEqual(expect.arrayContaining(["post_page-key-0000", "post_page-key-0001"]));
    // Newest first after the pinned ones, as the café's own feed has them.
    expect(seen.flat().slice(2)).toEqual(all.slice(2).map((p) => p.id));
  });

  it("ends with null, and turns away a page marker it didn't write", async () => {
    const first = await app.cafeDetail("moda", null);
    // The demo has fewer than a page of posts.
    expect(first.olderPosts).toBeNull();
    expect(await code(app.olderPosts("moda", null, "nonsense!"))).toBe("VALIDATION");
    expect(await code(app.olderPosts("moda", null, Buffer.from("1.2").toString("base64url")))).toBe("VALIDATION");
    expect(await code(app.olderPosts("moda", null, ""))).toBe("VALIDATION");
  });

  it("never brings a pinned post back further down, even when its event ends between pages", async () => {
    await postMany(25);
    const first = await app.cafeDetail("moda", ayse);
    const event = first.posts.find((p) => p.id === "post_event_1")!;
    expect(event.pinned).toBe(true);
    // The event ends while the person scrolls.
    now = new Date(new Date(event.eventStartsAt!).getTime() + 4 * 3_600_000);
    const later: string[] = [];
    let cursor = first.olderPosts;
    while (cursor) {
      const page = await app.olderPosts("moda", ayse, cursor);
      later.push(...page.posts.map((p) => p.id));
      cursor = page.olderPosts;
    }
    expect(later).not.toContain("post_event_1");
    expect(later).not.toContain("post_question_1");
    // Read afresh, it sits by its date, once.
    expect((await pages()).flat().filter((id) => id === "post_event_1")).toHaveLength(1);
    expect((await app.cafeDetail("moda", ayse)).posts[0]!.id).toBe("post_question_1");
  });

  it("carries a post's newest twenty comments, says how many came before, and gives them all on asking", async () => {
    for (let i = 0; i < 22; i++) {
      now = new Date(now.getTime() + 15_000);
      await app.comment(ayse, "moda", "post_1", `Yorum ${i}`);
    }
    const onFeed = (await feed()).find((p) => p.id === "post_1")!;
    // 24 members' comments (the demo's 2 and Ayşe's 22) and the café's reply to one of them.
    expect(onFeed).toMatchObject({ commentCount: 25, earlierComments: 4 });
    expect(onFeed.comments).toHaveLength(20);
    expect(onFeed.comments.at(0)!.body).toBe("Yorum 2");
    expect(onFeed.comments.at(-1)!).toMatchObject({ body: "Yorum 21", mine: true });

    const whole = await app.cafePost("moda", "post_1", ayse);
    expect(whole).toMatchObject({ commentCount: 25, earlierComments: 0 });
    expect(whole.comments).toHaveLength(24);
    expect(whole.comments.find((c) => c.id === "cmt_6")!.replies.map((r) => r.id)).toEqual(["cmt_reply_1"]);
    expect(await code(app.cafePost("moda", "post_k2", ayse))).toBe("POST_NOT_FOUND");
  });

  it("opens one post alone with all its comments, for a visitor too, and not one that's gone", async () => {
    const shared = await app.cafeDetail("moda", null, { post: "post_1" });
    expect(shared.posts.map((p) => p.id)).toEqual(["post_1"]);
    expect(shared.posts[0]).toMatchObject({ earlierComments: 0, commentCount: 3, reactedByMe: false });
    expect(shared.olderPosts).toBeNull();
    expect(shared.name).toBeTruthy();
    // A signed-in member sees their own like on it.
    const liked = (await app.cafeDetail("moda", ayse, { post: "post_1" })).posts[0]!.reactedByMe;
    await app.react(ayse, "moda", "post_1");
    expect((await app.cafeDetail("moda", ayse, { post: "post_1" })).posts[0]!.reactedByMe).toBe(!liked);

    await app.feed.remove(leyla, "post_2");
    expect(await code(app.cafeDetail("moda", null, { post: "post_2" }))).toBe("POST_NOT_FOUND");
    expect(await code(app.cafeDetail("moda", null, { post: "post_k2" }))).toBe("POST_NOT_FOUND");
    expect(await code(app.cafeDetail("moda", null, { post: "post_nope" }))).toBe("POST_NOT_FOUND");
  });
});

describe("the café's own feed is capped", () => {
  it("shows the newest thirty, pinned first, more on asking, and says how many are older", async () => {
    for (let i = 0; i < 35; i++) {
      now = new Date(now.getTime() + 60_000);
      await app.feed.create(leyla, { createKey: `cap-key-${String(i).padStart(4, "0")}`, kind: "post", body: `Paylaşım ${i}`, imageUrls: [], pinned: false });
    }
    const total = (await app.feed.view(leyla, 500)).posts.length;
    expect(total).toBeGreaterThan(40);

    const usual = await app.feed.view(leyla);
    expect(usual.posts).toHaveLength(30);
    expect(usual.olderPosts).toBe(total - 30);
    expect(usual.posts.slice(0, 2).map((p) => p.pinned)).toEqual([true, true]);
    expect(usual.posts[2]!.id).toBe("post_cap-key-0034");

    const three = await app.feed.view(leyla, 3);
    expect(three.posts.map((p) => p.id)).toEqual([usual.posts[0]!.id, usual.posts[1]!.id, "post_cap-key-0034"]);
    expect(three.olderPosts).toBe(total - 3);
    expect((await app.feed.view(leyla, 10_000)).olderPosts).toBe(0);
    // Every other change answers with the usual size.
    expect((await app.feed.update(leyla, "post_cap-key-0000", { pinned: true })).posts).toHaveLength(30);
  });
});

describe("link previews", () => {
  it("shows the café's name, where it is and its cover", async () => {
    const cafe = (await app.identity.getCafeBySlug("moda"))!;
    expect(await app.sharePreview("moda")).toEqual({
      cafeName: cafe.name,
      title: cafe.name,
      description: expect.stringContaining("Moda Cd. No: 42"),
      imageUrl: null,
    });
    await app.identity.saveCafe({ ...cafe, coverImageUrl: "/api/v1/images/img_cover" });
    expect((await app.sharePreview("moda"))!.imageUrl).toBe("/api/v1/images/img_cover");
    expect(await app.sharePreview("nowhere")).toBeNull();
  });

  it("shows a post's first line, the rest of its words and its first photo", async () => {
    const { url } = await app.feed.uploadImage(leyla, PNG);
    await app.feed.create(leyla, {
      createKey: "share-key-0001", kind: "post", body: "Yeni kavurduk: Etiyopya Guji.\nÇekirdek olarak da var.", imageUrls: [url], pinned: false,
    });
    const cafe = (await app.identity.getCafeBySlug("moda"))!;
    expect(await app.sharePreview("moda", "post_share-key-0001")).toEqual({
      cafeName: cafe.name,
      title: "Yeni kavurduk: Etiyopya Guji.",
      description: "Çekirdek olarak da var.",
      imageUrl: url,
    });
  });

  it("shows an event's topic, day and time", async () => {
    const preview = (await app.sharePreview("moda", "post_event_1"))!;
    const event = (await feed(null)).find((p) => p.id === "post_event_1")!;
    expect(preview.title).toBe(event.title);
    expect(preview.description).toMatch(/^\d{1,2} [A-ZÇĞİÖŞÜa-zçğıöşü]+ [A-ZÇĞİÖŞÜa-zçğıöşü]+ \d{2}:\d{2} · /);
  });

  it("shows nothing for a post that's taken down or another café's", async () => {
    await app.feed.remove(leyla, "post_2");
    expect(await app.sharePreview("moda", "post_2")).toBeNull();
    expect(await app.sharePreview("moda", "post_k2")).toBeNull();
    expect(await app.sharePreview("moda", "post_nope")).toBeNull();
  });
});
