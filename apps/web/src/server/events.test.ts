import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type CustomerRecord } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;
let ece: StaffContext;
const people: Record<string, CustomerRecord> = {};

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);
const feed = (who: CustomerRecord | null = people.ayse!) => app.cafeDetail("moda", who).then((c) => c.posts);
const inDays = (days: number, hh = 19) => new Date(Date.UTC(2026, 9, 16 + days, hh - 3)).toISOString();
const saturday = { createKey: "event-key-0001", title: "Pazar sabahı tavla", body: "Tavlamı getiriyorum, gel bir el oynayalım.", startsAt: inDays(1, 15), capacity: 4 };

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  const signIn = async (who: keyof typeof DEMO_STAFF) => app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, "moda");
  leyla = await signIn("leyla");
  ece = await signIn("ece");
  for (const who of ["ayse", "mehmet", "zeynep", "can", "selin", "emre"]) people[who] = (await app.identity.getCustomer(`cus_${who}`))!;
  // The demo comes with one reported comment; these tests start from an empty queue.
  await app.feed.resolveReport(leyla, { targetType: "comment", targetId: "cmt_spam_1", action: "keep", pauseAuthor: false });
});

describe("members' events (plan piece 15, D4)", () => {
  it("lets a member open an event once, with them already going", async () => {
    const { postId } = await app.openEvent(people.zeynep!, "moda", saturday);
    await app.openEvent(people.zeynep!, "moda", saturday);
    const events = (await feed()).filter((p) => p.title === saturday.title);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: postId, kind: "event", eventCapacity: 4, rsvpCount: 1, host: { name: "Zeynep D.", mine: false }, reportedByMe: false });
    expect((await feed(people.zeynep!)).find((p) => p.id === postId)!.host).toEqual({ name: "Zeynep D.", mine: true });

    // Others join until it's full, as with the café's events.
    for (const who of ["ayse", "can", "selin"]) await app.rsvp(people[who]!, "moda", postId);
    expect(await code(app.rsvp(people.emre!, "moda", postId))).toBe("EVENT_FULL");
    // The café sees who opened it, and can pin it but not reword it.
    const staffView = await app.feed.view(leyla);
    expect(staffView.posts.find((p) => p.id === postId)).toMatchObject({ hostName: "Zeynep D.", authorName: null, rsvpCount: 4 });
    expect(await code(app.feed.update(leyla, postId, { title: "Başka bir şey" }))).toBe("EVENT_NOT_YOURS");
    expect(await code(app.feed.update(leyla, postId, { pinned: true }))).toBe("ok");
  });

  it("keeps events ahead of now, within three months, and three at a time", async () => {
    const at = (key: string, startsAt: string) => app.openEvent(people.can!, "moda", { ...saturday, createKey: key, startsAt });
    expect(await code(at("event-key-past", "2026-10-16T08:00:00Z"))).toBe("EVENT_IN_PAST");
    expect(await code(at("event-key-far", inDays(120)))).toBe("EVENT_TOO_FAR");
    for (const n of [1, 2, 3]) expect(await code(at(`event-key-${n}xx`, inDays(n)))).toBe("ok");
    expect(await code(at("event-key-4xx", inDays(4)))).toBe("EVENT_LIMIT");
    // Only members open events.
    expect(await code(app.openEvent(people.zeynep!, "kuzguncuk", saturday))).toBe("NOT_A_MEMBER");
  });

  it("lets only the host change or call off their event", async () => {
    const { postId } = await app.openEvent(people.zeynep!, "moda", saturday);
    await app.rsvp(people.ayse!, "moda", postId);
    expect(await code(app.updateEvent(people.ayse!, "moda", postId, { title: "Benim oldu" }))).toBe("NOT_FOUND");
    expect(await code(app.updateEvent(people.zeynep!, "moda", postId, { capacity: 1 }))).toBe("EVENT_CAPACITY_BELOW");
    await app.updateEvent(people.zeynep!, "moda", postId, { title: "Pazar sabahı tavla, iki tahta", capacity: null, startsAt: inDays(1, 16) });
    expect((await feed()).find((p) => p.id === postId)).toMatchObject({ title: "Pazar sabahı tavla, iki tahta", eventCapacity: null, eventStartsAt: inDays(1, 16) });

    expect(await code(app.cancelEvent(people.ayse!, "moda", postId))).toBe("NOT_FOUND");
    await app.cancelEvent(people.zeynep!, "moda", postId);
    expect((await feed()).map((p) => p.id)).not.toContain(postId);
  });

  it("lets the café open events with a topic and a time", async () => {
    const input = { createKey: "cafe-event-01", kind: "event" as const, title: "Latte art atölyesi", body: "Süt köpürtmeyi birlikte deniyoruz.", imageUrls: [], pinned: true, eventStartsAt: inDays(5, 18), eventCapacity: 8 };
    expect(await code(app.feed.create(leyla, { ...input, title: undefined }))).toBe("VALIDATION");
    expect(await code(app.feed.create(leyla, { ...input, eventStartsAt: "2026-10-15T10:00:00Z" }))).toBe("EVENT_IN_PAST");
    const view = await app.feed.create(leyla, input);
    expect(view.posts[0]).toMatchObject({ kind: "event", title: input.title, eventCapacity: 8, authorName: "Leyla Kara", hostName: null });
    expect((await feed())[0]).toMatchObject({ title: input.title, host: null, rsvpCount: 0 });
  });
});

describe("reports and moderation (plan piece 15)", () => {
  it("takes reports on members' comments and events, once each, and never on your own or the café's", async () => {
    const { postId } = await app.openEvent(people.zeynep!, "moda", saturday);
    const report = (who: string, targetType: "post" | "comment", targetId: string) =>
      code(app.report(people[who]!, "moda", { targetType, targetId, reason: "spam" }));
    expect(await report("zeynep", "post", postId)).toBe("REPORT_OWN");
    expect(await report("ayse", "post", "post_1")).toBe("NOT_FOUND"); // the café's own post
    expect(await report("ayse", "post", postId)).toBe("ok");
    expect(await report("ayse", "post", postId)).toBe("ok");
    expect((await feed()).find((p) => p.id === postId)!.reportedByMe).toBe(true);

    const { reports } = await app.feed.view(leyla);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ targetType: "post", targetId: postId, authorName: "Zeynep D.", hidden: false, reasons: [{ reason: "spam", count: 1 }] });
    // A barista doesn't moderate, and doesn't see the reports.
    expect(await code(app.feed.resolveReport(ece, { targetType: "post", targetId: postId, action: "keep", pauseAuthor: false }))).toBe("FORBIDDEN");
  });

  it("hides what three members report until a moderator looks, and brings it back if it's fine", async () => {
    const [post] = await feed();
    await app.comment(people.mehmet!, "moda", post!.id, "Takipçi satıyorum, profilime bak");
    const said = (await feed()).find((p) => p.id === post!.id)!.comments.at(-1)!;
    for (const [i, who] of ["ayse", "zeynep", "can"].entries()) {
      await app.report(people[who]!, "moda", { targetType: "comment", targetId: said.id, reason: i ? "spam" : "rude", note: i ? undefined : "Reklam" });
    }
    expect((await feed()).find((p) => p.id === post!.id)!.comments.map((c) => c.id)).not.toContain(said.id);
    const card = (await app.feed.view(leyla)).reports[0]!;
    expect(card).toMatchObject({ targetId: said.id, hidden: true, body: "Takipçi satıyorum, profilime bak", notes: ["Reklam"], reasons: [{ reason: "spam", count: 2 }, { reason: "rude", count: 1 }] });

    const kept = await app.feed.resolveReport(leyla, { targetType: "comment", targetId: said.id, action: "keep", pauseAuthor: false });
    expect(kept.reports).toEqual([]);
    expect((await feed()).find((p) => p.id === post!.id)!.comments.map((c) => c.id)).toContain(said.id);
    expect(await code(app.feed.resolveReport(leyla, { targetType: "comment", targetId: said.id, action: "keep", pauseAuthor: false }))).toBe("REPORT_NOT_FOUND");
  });

  it("takes a member's event down and pauses them; a paused member reads but can't write, and keeps their peni", async () => {
    const { postId } = await app.openEvent(people.mehmet!, "moda", { ...saturday, title: "Kripto fırsatı, kaçırma" });
    await app.report(people.ayse!, "moda", { targetType: "post", targetId: postId, reason: "spam" });
    const before = (await app.cafeDetail("moda", people.mehmet!)).membership!.balancePeni;

    const after = await app.feed.resolveReport(leyla, { targetType: "post", targetId: postId, action: "remove", pauseAuthor: true });
    expect(after.reports).toEqual([]);
    expect(after.paused).toEqual([expect.objectContaining({ customerId: "cus_mehmet", name: "Mehmet K." })]);
    expect((await feed()).map((p) => p.id)).not.toContain(postId);

    const mine = await app.cafeDetail("moda", people.mehmet!);
    expect(mine.membership).toMatchObject({ paused: true, balancePeni: before });
    expect(mine.posts.length).toBeGreaterThan(0);
    for (const write of [
      app.comment(people.mehmet!, "moda", "post_1", "Merhaba"),
      app.react(people.mehmet!, "moda", "post_1"),
      app.rsvp(people.mehmet!, "moda", "post_event_1"),
      app.openEvent(people.mehmet!, "moda", { ...saturday, createKey: "event-key-again" }),
      app.report(people.mehmet!, "moda", { targetType: "post", targetId: postId, reason: "other" }),
    ]) {
      expect(await code(write)).toBe("MEMBER_PAUSED");
    }

    await app.feed.pauseMember(leyla, "cus_mehmet", false);
    expect(await code(app.comment(people.mehmet!, "moda", "post_1", "Merhaba"))).toBe("ok");
    // Moderators see who it is even when the member hides their profile from other members.
    const kerem = await app.feed.pauseMember(leyla, "cus_kerem", true);
    expect(kerem.paused.map((m) => m.name)).toEqual(["Kerem A."]);
  });

  it("lets moderators take a member's event down without the right to post, and closes its reports", async () => {
    const { postId } = await app.openEvent(people.zeynep!, "moda", saturday);
    await app.report(people.ayse!, "moda", { targetType: "post", targetId: postId, reason: "unsafe" });
    const after = await app.feed.remove(leyla, postId);
    expect(after.reports).toEqual([]);
    expect(after.posts.map((p) => p.id)).not.toContain(postId);
  });
});
