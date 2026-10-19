import { beforeEach, describe, expect, it } from "vitest";
import { PeniApp, type CustomerRecord } from "./app";
import { DEMO_CUSTOMERS, DEMO_NEIGHBOURS, seed } from "./seed";

let app: PeniApp;
/** Friday 16 Oct 2026, 12:00 in Istanbul. Tests move it with `tick`. */
let now: Date;
const tick = (ms: number) => {
  now = new Date(now.getTime() + ms);
};
const MIN = 60_000;
const HOUR = 60 * MIN;
/** The seeded customers as stored, reloaded before every test. */
let people: Map<string, CustomerRecord>;
const ayse = () => people.get(DEMO_CUSTOMERS.ayse.id)!;
const mehmet = () => people.get(DEMO_CUSTOMERS.mehmet.id)!;
const deniz = () => people.get(DEMO_CUSTOMERS.deniz.id)!;
const neighbour = (who: keyof typeof DEMO_NEIGHBOURS) => people.get(DEMO_NEIGHBOURS[who].id)!;
/** Deniz takes one çay from the askı at the till. */
const claimCay = async () => {
  const membershipId = (await modaFor(deniz())).membership!.id;
  return app.peni.claimFromAskida({ membershipId, orderId: crypto.randomUUID(), productId: "cay", unitPriceKurus: 3_000 });
};

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now });
  await seed(app);
  const ids = [...Object.values(DEMO_CUSTOMERS), ...Object.values(DEMO_NEIGHBOURS)].map((c) => c.id);
  people = new Map((await app.identity.getCustomers(ids)).map((c) => [c.id, c]));
});

const modaFor = (c: ReturnType<typeof ayse> | null) => app.cafeDetail("moda", c);
const at = async (slug: string) => ({ cafe: (await app.identity.getCafeBySlug(slug))! });

describe("café cards and the café page (G1, G2, G9, G12)", () => {
  it("shows members their balance with goods to read it by; others get null", async () => {
    const [moda] = await app.listCafes(ayse());
    expect(moda).toMatchObject({ slug: "moda", earnRatePercent: 5, hue: "lacivert" });
    expect(moda!.balancePeni).toBe((await modaFor(ayse())).membership!.balancePeni);
    expect(moda!.refItems).toEqual([
      { name: "Çay", priceKurus: 3_000 },
      { name: "Türk Kahvesi", priceKurus: 9_000 },
    ]);
    const [signedOut] = await app.listCafes(null);
    expect(signedOut!.balancePeni).toBeNull();
    // A café without its own reference items falls back to its two cheapest askı items.
    const kuz = (await app.listCafes(null)).find((c) => c.slug === "kuzguncuk")!;
    expect(kuz.refItems.map((r) => r.name)).toEqual(["Çay", "Peynirli Poğaça"]);
    expect((await app.wallet(ayse())).cafes.find((c) => c.cafeSlug === "moda")!.refItems).toEqual(moda!.refItems);
  });

  it("puts the next upcoming Peni masası on the card, never a past one", async () => {
    const [moda] = await app.listCafes(null);
    expect(moda!.nextEvent).toEqual({
      postId: "post_event_1",
      startsAt: "2026-10-22T16:00:00.000Z", // Perşembe 19:00
      title: "Mahalleye bir takas kütüphanesi kursak?",
    });
    tick(7 * 24 * HOUR);
    expect((await app.listCafes(null))[0]!.nextEvent).toBeNull();
  });

  it("tells the give sheet about the café match while the month's cap has room", async () => {
    expect((await modaFor(ayse())).askida.matchPercent).toBe(50);
    expect((await app.cafeDetail("kuzguncuk", ayse())).askida.matchPercent).toBeNull();
  });

});

describe("the askı (G3, dignity)", () => {
  it("knows each viewer's take state before they try", async () => {
    expect((await modaFor(null)).askida.myEligibility).toEqual({ status: "not_member" });
    expect((await modaFor(deniz())).askida.myEligibility).toEqual({ status: "ok" });
    expect((await modaFor(mehmet())).askida.myEligibility).toEqual({ status: "claimed_today" });
    expect((await app.cafeDetail("kuzguncuk", deniz())).askida.myEligibility).toEqual({ status: "too_new", daysLeft: 3 });
    expect((await app.cafeDetail("kuzguncuk", neighbour("oguz"))).askida.myEligibility).toEqual({ status: "blocked" });

    await claimCay();
    expect((await modaFor(deniz())).askida.myEligibility).toEqual({ status: "claimed_today" });
  });

  it("never lists a claim: not on the wall, not in anyone's history", async () => {
    await claimCay();
    const moda = await modaFor(ayse());
    expect(moda.askida.claimedLast7Days).toBeGreaterThanOrEqual(3);
    expect(moda.askida.wall.some((e) => e.type === "claim")).toBe(false);
    expect((await app.staffDashboard(await at("moda"))).askida.wall.some((e) => e.type === "claim")).toBe(false);
    const history = (await app.wallet(deniz())).ledger;
    expect(history).toEqual([]);
  });

  it("names only donors who asked to be named, as 'Ayşe Y.'", async () => {
    const names = (await modaFor(null)).askida.wall.flatMap((e) => (e.type === "donation" ? [e.donorName] : []));
    expect(names).toContain("İrem G.");
    expect(names).toContain(null);
    expect(names).not.toContain("Can Ö."); // Can gave without his name
  });
});

describe("the feed and events (G4, G13)", () => {
  it("draws chairs with initials only for visible profiles, and always for me", async () => {
    const event = (await modaFor(ayse())).posts.find((p) => p.id === "post_event_1")!;
    expect(event.title).toBe("Mahalleye bir takas kütüphanesi kursak?");
    expect(event.attendees).toHaveLength(event.rsvpCount);
    expect(event.attendees[0]).toEqual({ initials: "AY", me: true });
    expect(event.attendees.filter((a) => a.initials === null)).toHaveLength(1); // Elif keeps her profile hidden
    const asDeniz = (await modaFor(deniz())).posts.find((p) => p.id === "post_event_1")!;
    expect(asDeniz.attendees.every((a) => !a.me)).toBe(true);
    await app.rsvp(deniz(), "moda", "post_event_1");
    const after = (await modaFor(deniz())).posts.find((p) => p.id === "post_event_1")!;
    // Deniz's profile is hidden, but she sees her own initials on her own chair.
    expect(after.attendees.at(-1)).toEqual({ initials: "DA", me: true });
    expect((await modaFor(ayse())).posts.find((p) => p.id === "post_event_1")!.attendees.at(-1)).toEqual({ initials: null, me: false });
  });

  it("says when the viewer already answered today's question", async () => {
    const q = (c: ReturnType<typeof ayse>) => modaFor(c).then((d) => d.posts.find((p) => p.kind === "question")!);
    expect((await q(mehmet())).answeredTodayByMe).toBe(true);
    expect((await q(ayse())).answeredTodayByMe).toBe(false);
    expect((await q(ayse())).comments.length).toBeGreaterThanOrEqual(3);
    await app.comment(ayse(), "moda", "post_question_1", "Moda Parkı'nın üst köşesi.");
    expect((await q(ayse())).answeredTodayByMe).toBe(true);
    tick(24 * HOUR);
    expect((await q(ayse())).answeredTodayByMe).toBe(false);
  });

  it("refuses an RSVP when the table is full", async () => {
    const { reactions: _r, rsvps, comments: _c, ...event } = (await app.community.getPost("post_event_1"))!;
    await app.community.savePost({ ...event, eventCapacity: rsvps.length });
    await expect(app.rsvp(deniz(), "moda", "post_event_1")).rejects.toMatchObject({ code: "EVENT_FULL" });
  });

  it("serves a Peni masası as an .ics file", async () => {
    const { filename, body } = await app.eventIcs("moda", "post_event_1");
    expect(filename).toBe("peni-masasi-2026-10-22.ics");
    expect(body).toContain("BEGIN:VEVENT\r\n");
    expect(body).toContain("DTSTART:20261022T160000Z\r\n");
    expect(body).toContain("DTEND:20261022T180000Z\r\n");
    expect(body).toContain("SUMMARY:Mahalleye bir takas kütüphanesi kursak?\r\n");
    expect(body).toContain("LOCATION:Moda Kahvesi\\, Moda Cd. No: 42\\, Kadıköy\\, İstanbul\r\n");
    for (const line of body.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    await expect(app.eventIcs("moda", "post_1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("membership (G7b)", () => {
  it("gives each membership a stable Peni kodu", async () => {
    const mine = (await modaFor(ayse())).membership!;
    expect(mine.memberCode).toMatch(/^[B-DF-HJ-NP-TV-Z2-9]{3}-[B-DF-HJ-NP-TV-Z2-9]{3}$/);
    expect(mine.memberCode).toBe(await app.memberCodeFor(mine.id));
    expect(await app.membershipForCode(mine.memberCode.replace("-", "").toLowerCase())).toBe(mine.id);
    expect((await app.wallet(ayse())).cafes.find((c) => c.cafeSlug === "moda")!.memberCode).toBe(mine.memberCode);
  });

});

describe("sign-in and profile (G18, G19)", () => {
  it("signs in a seeded customer with a demo session; nobody in the demo is staff", async () => {
    const token = await app.createSessionFor(DEMO_CUSTOMERS.ayse.id);
    expect(await app.customerForToken(token)).toEqual(ayse());
    expect(await app.customerForToken("nope")).toBeNull();
    for (const c of [ayse(), mehmet(), deniz()]) expect((await app.me(c)).staffCafes).toEqual([]);
  });

  it("ends a session on sign-out and after 90 days", async () => {
    const first = await app.createSessionFor(DEMO_CUSTOMERS.ayse.id);
    await app.signOut(first);
    expect(await app.customerForToken(first)).toBeNull();
    const second = await app.createSessionFor(DEMO_CUSTOMERS.ayse.id);
    tick(89 * 24 * HOUR);
    expect(await app.customerForToken(second)).not.toBeNull();
    tick(24 * HOUR);
    expect(await app.customerForToken(second)).toBeNull();
  });

  it("offers the café panel only to staff", async () => {
    const account = await app.staff.ensureAccount({ name: "Mehmet", email: "mehmet@moda.test", password: "x".repeat(8), customerId: DEMO_CUSTOMERS.mehmet.id });
    await app.staff.join(account.id, "cafe_moda", "barista");
    expect((await app.me(mehmet())).staffCafes).toEqual([{ slug: "moda", name: "Moda Kahvesi", role: "barista" }]);
  });

  it("changes only what was sent", async () => {
    const before = (await app.me(ayse())).customer;
    expect((await app.updateProfile(ayse(), { profileVisible: false })).customer).toEqual({ ...before, profileVisible: false });
    expect((await app.identity.getCustomer(DEMO_CUSTOMERS.ayse.id))!.profileVisible).toBe(false);
  });
});

describe("gifts (G6, G11, G15, G16, G17)", () => {
  it("looks up a recipient as 'Mehmet K.', only at the same café, and not oneself", async () => {
    expect(await app.lookupMember(ayse(), "moda", { phone: DEMO_CUSTOMERS.mehmet.phone })).toEqual({ firstName: "Mehmet", lastInitial: "K" });
    await expect(app.lookupMember(ayse(), "kuzguncuk", { phone: DEMO_CUSTOMERS.mehmet.phone })).rejects.toMatchObject({ code: "RECIPIENT_NOT_MEMBER", status: 404 });
    await expect(app.lookupMember(ayse(), "moda", { phone: "+905559999999" })).rejects.toMatchObject({ code: "RECIPIENT_NOT_MEMBER" });
    await expect(app.lookupMember(ayse(), "moda", { phone: DEMO_CUSTOMERS.ayse.phone })).rejects.toMatchObject({ code: "GIFT_INVALID" });
    await expect(app.lookupMember(mehmet(), "kuzguncuk", { phone: DEMO_CUSTOMERS.ayse.phone })).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await expect(app.lookupMember(ayse(), "kuzguncuk", { phone: DEMO_NEIGHBOURS.oguz.phone })).rejects.toMatchObject({ code: "RECIPIENT_NOT_MEMBER" }); // blocked there
  });

  it("rate-limits lookups to 20 an hour per customer", async () => {
    for (let i = 0; i < 20; i++) await app.lookupMember(ayse(), "moda", { phone: DEMO_CUSTOMERS.mehmet.phone }).catch(() => undefined);
    await expect(app.lookupMember(ayse(), "moda", { phone: DEMO_CUSTOMERS.mehmet.phone })).rejects.toMatchObject({ code: "LOOKUP_LIMITED", status: 429 });
    expect(await app.lookupMember(mehmet(), "moda", { phone: DEMO_CUSTOMERS.ayse.phone })).toMatchObject({ firstName: "Ayşe" });
    tick(HOUR + MIN);
    expect(await app.lookupMember(ayse(), "moda", { phone: DEMO_CUSTOMERS.mehmet.phone })).toMatchObject({ firstName: "Mehmet" });
  });

  it("finds a recipient by Peni kodu, typed any way, only at that café (D28)", async () => {
    const code = (await modaFor(mehmet())).membership!.memberCode;
    expect(await app.lookupMember(ayse(), "moda", { code: code.replace("-", " ").toLowerCase() })).toEqual({ firstName: "Mehmet", lastInitial: "K" });
    await expect(app.lookupMember(ayse(), "moda", { code: "BCD-FGH" })).rejects.toMatchObject({ code: "RECIPIENT_NOT_MEMBER" });
    await expect(app.lookupMember(ayse(), "moda", { code: "not a code" })).rejects.toMatchObject({ code: "RECIPIENT_NOT_MEMBER" });
    await expect(app.lookupMember(ayse(), "moda", { code: (await modaFor(ayse())).membership!.memberCode })).rejects.toMatchObject({ code: "GIFT_INVALID" });
    const kuzguncukCode = (await app.cafeDetail("kuzguncuk", ayse())).membership!.memberCode;
    await expect(app.lookupMember(mehmet(), "moda", { code: kuzguncukCode })).rejects.toMatchObject({ code: "RECIPIENT_NOT_MEMBER" });
    const sent = await app.sendGift(ayse(), { cafeSlug: "moda", toCode: code, peni: 10, idempotencyKey: "by-code-1" });
    expect(sent.status).toBe("pending");
    expect((await app.wallet(mehmet())).gifts.some((g) => g.id === sent.id)).toBe(true);
  });

  it("lists the café's members who show their profile, by name, and sends to a picked one (D28)", async () => {
    const { members } = await app.cafeMembers(ayse(), "moda");
    const names = members.map((m) => `${m.firstName} ${m.lastInitial}.`);
    expect(names).toContain("Mehmet K.");
    expect(names).not.toContain("Ayşe Y.");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "tr")));
    for (const m of members) {
      const c = await app.identity.getCustomer((await app.directory.getMembership(m.memberId))!.customerId);
      expect(c!.profileVisible).toBe(true);
    }
    expect((await app.cafeMembers(ayse(), "moda", "meh")).members.map((m) => m.firstName)).toEqual(["Mehmet"]);
    expect((await app.cafeMembers(ayse(), "moda", "KOÇ")).members.map((m) => m.firstName)).toEqual((await app.cafeMembers(ayse(), "moda", "koç")).members.map((m) => m.firstName));
    await expect(app.cafeMembers(mehmet(), "kuzguncuk")).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    const mehmetId = members.find((m) => m.firstName === "Mehmet")!.memberId;
    const sent = await app.sendGift(ayse(), { cafeSlug: "moda", toMemberId: mehmetId, peni: 10, idempotencyKey: "by-pick-1" });
    expect(sent.status).toBe("pending");
    await expect(app.sendGift(mehmet(), { cafeSlug: "moda", toMemberId: mehmetId, peni: 10, idempotencyKey: "by-pick-2" })).rejects.toMatchObject({ code: "GIFT_INVALID" });
    const elsewhere = (await app.cafeDetail("kuzguncuk", ayse())).membership!.id;
    await expect(app.sendGift(mehmet(), { cafeSlug: "moda", toMemberId: elsewhere, peni: 10, idempotencyKey: "by-pick-3" })).rejects.toMatchObject({ code: "RECIPIENT_NOT_MEMBER" });
  });

  it("remembers recent recipients per café, newest first, once each", async () => {
    await app.sendGift(ayse(), { cafeSlug: "moda", toPhone: DEMO_CUSTOMERS.mehmet.phone, peni: 10, idempotencyKey: "recents-1" });
    const recents = (await app.wallet(ayse())).recentRecipients;
    expect(recents[0]).toMatchObject({ cafeSlug: "moda", firstName: "Mehmet", lastInitial: "K", initials: "MK", phone: DEMO_CUSTOMERS.mehmet.phone });
    expect(recents[0]!.memberId).toBe((await modaFor(mehmet())).membership!.id);
    expect(recents.filter((r) => r.firstName === "Mehmet")).toHaveLength(1);
  });

  it("lets the sender take a pending gift back; the recipient never sees it", async () => {
    const sent = await app.sendGift(ayse(), { cafeSlug: "moda", toPhone: DEMO_CUSTOMERS.mehmet.phone, peni: 30, idempotencyKey: "cancel-1" });
    expect(sent.canCancel).toBe(true);
    expect((await app.wallet(mehmet())).gifts.some((g) => g.id === sent.id)).toBe(true);
    const balance = (await modaFor(ayse())).membership!.balancePeni;
    const back = await app.cancelGift(ayse(), sent.id);
    expect(back).toMatchObject({ status: "declined", cancelledBySender: true, canCancel: false });
    expect((await modaFor(ayse())).membership!.balancePeni).toBe(balance + 30);
    expect((await app.wallet(mehmet())).gifts.some((g) => g.id === sent.id)).toBe(false);
    await expect(app.cancelGift(mehmet(), sent.id)).rejects.toMatchObject({ code: "GIFT_NOT_PENDING" });
  });

  it("stores a thank-you once, from the recipient, after accepting", async () => {
    const sent = await app.sendGift(ayse(), { cafeSlug: "moda", toPhone: DEMO_CUSTOMERS.mehmet.phone, peni: 30, idempotencyKey: "thanks-1" });
    await expect(app.thankGift(mehmet(), sent.id)).rejects.toMatchObject({ code: "GIFT_NOT_ACCEPTED" });
    await app.resolveGift(mehmet(), sent.id, "accept");
    await expect(app.thankGift(ayse(), sent.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const first = await app.thankGift(mehmet(), sent.id);
    tick(5 * MIN);
    const again = await app.thankGift(mehmet(), sent.id);
    expect(first.thankedAt).toBe("2026-10-16T09:00:00.000Z");
    expect(again.thankedAt).toBe(first.thankedAt);
    expect((await app.wallet(ayse())).gifts.find((g) => g.id === sent.id)!.thankedAt).toBe(first.thankedAt);
  });

  it("previews a shared gift link without signing in, and per viewer when signed in", async () => {
    const sent = await app.sendGift(ayse(), { cafeSlug: "moda", toPhone: DEMO_CUSTOMERS.mehmet.phone, peni: 30, idempotencyKey: "preview-1" });
    expect(await app.giftPreview(sent.id, null)).toMatchObject({
      cafeSlug: "moda",
      cafeName: "Moda Kahvesi",
      fromFirstName: "Ayşe",
      peni: 30,
      goods: "1 çay",
      status: "pending",
      viewer: "signed_out",
    });
    expect((await app.giftPreview(sent.id, mehmet())).viewer).toBe("recipient");
    expect((await app.giftPreview(sent.id, ayse())).viewer).toBe("sender");
    expect((await app.giftPreview(sent.id, deniz())).viewer).toBe("member");
    expect((await app.giftPreview(sent.id, neighbour("nermin"))).viewer).toBe("guest");
    tick(25 * HOUR);
    expect((await app.giftPreview(sent.id, null)).status).toBe("expired");
    await expect(app.giftPreview("nope", null)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("writes the full wallet history as signed lines, with the other person", async () => {
    const ledger = (await app.wallet(ayse())).ledger;
    const kinds = new Set(ledger.map((l) => l.kind));
    for (const k of ["earn", "gift_out", "gift_in", "gift_return", "askida_donate"] as const) expect(kinds).toContain(k);
    expect([...ledger].sort((a, b) => b.at.localeCompare(a.at))).toEqual(ledger);
    expect(ledger.find((l) => l.kind === "earn")).toMatchObject({ cafeSlug: "moda", orderId: expect.stringMatching(/^till_seed_/) });
    expect(ledger.find((l) => l.kind === "gift_in" && l.cafeSlug === "kuzguncuk")).toMatchObject({ peni: 25, counterpartName: "Nermin Arıkan" });
    expect(ledger.find((l) => l.kind === "askida_donate")).toMatchObject({ peni: -60 });
  });
});

describe("staff (G21)", () => {
  it("reports the previous 30 days next to the current ones", async () => {
    const { report, memberCount } = await app.staffDashboard(await at("moda"));
    expect(report.previous.untilIso).toBe(report.sinceIso);
    expect(report.previous.issuedPeni).toBeGreaterThan(0);
    expect(report.previous.memberCount).toBeLessThan(memberCount);
    expect(report.previous.outstandingPeni).toBeLessThan(report.outstandingPeni);
  });
});
