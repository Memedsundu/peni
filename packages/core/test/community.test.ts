import { describe, expect, it } from "vitest";
import { EVENT_OPEN_MS, eventOver, InMemoryCommunityStore, type Post } from "../src";

const at = new Date("2026-10-16T09:00:00Z");
const later = (ms: number) => new Date(at.getTime() + ms);
const post = (id: string, cafeId: string, extra: Partial<Post> = {}): Post => ({
  id, cafeId, kind: "post", title: null, body: "Merhaba", publishedAt: at, pinned: false, eventStartsAt: null, eventCapacity: null, ...extra,
});

describe("the community store", () => {
  it("counts a member's comments at one café since a time, hidden ones and ones on posts taken down too", async () => {
    const store = new InMemoryCommunityStore();
    await store.savePost(post("p1", "moda"));
    await store.savePost(post("p2", "moda"));
    await store.savePost(post("k1", "kuzguncuk"));
    await store.addComment("p1", { id: "c1", customerId: "ayse", body: "1", createdAt: at });
    await store.addComment("p1", { id: "c2", customerId: "ayse", body: "2", createdAt: later(30_000) });
    await store.addComment("p2", { id: "c3", customerId: "ayse", body: "3", createdAt: later(60_000) });
    await store.addComment("p2", { id: "c4", customerId: "mehmet", body: "4", createdAt: later(60_000) });
    await store.addComment("k1", { id: "c5", customerId: "ayse", body: "5", createdAt: later(60_000) });
    await store.addComment("p1", { id: "r1", customerId: null, body: "Cevap", createdAt: later(60_000), staffMemberId: "sm", replyToId: "c1" });
    await store.setCommentHidden("p1", "c2", at);
    await store.savePost({ ...post("p2", "moda"), hiddenAt: at });

    expect(await store.countCommentsBy("moda", "ayse", at)).toBe(3);
    expect(await store.countCommentsBy("moda", "ayse", later(30_000))).toBe(2);
    expect(await store.countCommentsBy("moda", "mehmet", at)).toBe(1);
    expect(await store.countCommentsBy("kuzguncuk", "ayse", at)).toBe(1);
  });

  it("hides a reply with its comment and deletes it with its comment", async () => {
    const store = new InMemoryCommunityStore();
    await store.savePost(post("p1", "moda"));
    await store.addComment("p1", { id: "c1", customerId: "ayse", body: "Soru", createdAt: at });
    await store.addComment("p1", { id: "r1", customerId: null, body: "Cevap", createdAt: later(1), staffMemberId: "sm", replyToId: "c1" });
    expect(await store.findComment("r1")).toEqual({ postId: "p1", comment: expect.objectContaining({ replyToId: "c1", staffMemberId: "sm" }) });

    await store.setCommentHidden("p1", "c1", at);
    expect((await store.getPost("p1"))!.comments).toEqual([]);
    expect((await store.getPost("p1", { hiddenComments: true }))!.comments.map((c) => c.id)).toEqual(["c1", "r1"]);

    await store.deleteComment("p1", "c1");
    expect((await store.getPost("p1", { hiddenComments: true }))!.comments).toEqual([]);
    expect(await store.findComment("r1")).toBeNull();
  });

  it("remembers when staff last looked, per café, until the café is removed", async () => {
    const store = new InMemoryCommunityStore();
    expect(await store.seenAt("moda")).toBeNull();
    await store.markSeen("moda", at);
    await store.markSeen("moda", later(60_000));
    expect(await store.seenAt("moda")).toEqual(later(60_000));
    expect(await store.seenAt("kuzguncuk")).toBeNull();
    store.forgetCafe("moda");
    expect(await store.seenAt("moda")).toBeNull();
  });

  it("reads the feed a page at a time, by time then id, without skipping or repeating posts published together", async () => {
    const store = new InMemoryCommunityStore();
    // p3, p4 and p5 go out at the same instant; p6 is pinned; p7 is taken down; k1 is another café's.
    for (const [id, minutes] of [["p1", 1], ["p2", 2], ["p3", 3], ["p4", 3], ["p5", 3], ["p6", 4], ["p7", 5]] as const) {
      await store.savePost(post(id, "moda", { publishedAt: later(minutes * 60_000), pinned: id === "p6", hiddenAt: id === "p7" ? at : null }));
    }
    await store.savePost(post("k1", "kuzguncuk", { publishedAt: later(10 * 60_000) }));

    const seen: string[] = [];
    let before: { publishedAt: Date; id: string } | null = null;
    for (;;) {
      const page = await store.pagePosts("moda", { before, limit: 2, skip: ["p6"] });
      seen.push(...page.map((p) => p.id));
      if (page.length < 2) break;
      before = { publishedAt: page.at(-1)!.publishedAt, id: page.at(-1)!.id };
    }
    expect(seen).toEqual(["p5", "p4", "p3", "p2", "p1"]);
    expect((await store.listPinned("moda")).map((p) => p.id)).toEqual(["p6"]);
    expect(await store.countPosts("moda")).toBe(6);
    expect(await store.pagePosts("moda", { limit: 0 })).toEqual([]);
  });
});

describe("eventOver", () => {
  it("is true only for an event that started more than three hours ago", () => {
    const event = post("e1", "moda", { kind: "event", eventStartsAt: at });
    expect(eventOver(event, later(EVENT_OPEN_MS))).toBe(false);
    expect(eventOver(event, later(EVENT_OPEN_MS + 1))).toBe(true);
    expect(eventOver(event, later(-86_400_000))).toBe(false);
    expect(eventOver(post("p1", "moda"), later(EVENT_OPEN_MS * 10))).toBe(false);
  });
});
