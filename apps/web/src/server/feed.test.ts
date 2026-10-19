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
