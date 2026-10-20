import { beforeEach, describe, expect, it } from "vitest";
import { DELETED_NAME, PeniApp } from "./app";
import { OutboxEmailSender } from "./customer-auth";
import { seed } from "./seed";

let app: PeniApp;
let outbox: OutboxEmailSender;
const now = new Date("2026-10-16T09:00:00Z");

beforeEach(async () => {
  outbox = new OutboxEmailSender();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, auth: { email: outbox } });
  await seed(app, { drafts: false });
});

const zeynep = async () => (await app.identity.getCustomer("cus_zeynep"))!;

describe("Verilerimi indir and Hesabımı sil (plan piece 34)", { timeout: 30_000 }, () => {
  it("gives the customer everything Penny keeps about them", async () => {
    const data = await app.exportAccount(await zeynep());
    expect(data.profile).toMatchObject({ displayName: "Zeynep Demir", phone: "+905320000011", profileVisible: true });
    expect(data.cafes.map((c) => c.cafe)).toContain("Moda Kahvesi");
    expect(data.peniHistory.length).toBeGreaterThan(0);
    expect(data.posts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "event", text: expect.stringContaining("Cumartesi satranç") })]));
  });

  it("forgets the person, signs them out everywhere, and keeps the cafés' books", async () => {
    const token = await app.createSessionFor("cus_zeynep");
    const other = await app.createSessionFor("cus_zeynep");
    const membership = (await app.directory.listMemberships({ customerId: "cus_zeynep" }))[0]!;
    const balance = await app.peni.walletBalance(membership.id);

    await app.deleteAccount(await zeynep());

    expect(await app.customerForToken(token)).toBeNull();
    expect(await app.customerForToken(other)).toBeNull();
    expect(await zeynep()).toMatchObject({ displayName: DELETED_NAME, email: null, phone: null, avatarUrl: null, profileVisible: false });
    expect(await app.identity.loginsOf("cus_zeynep")).toEqual([]);
    // The ledger still adds up.
    expect(await app.peni.walletBalance(membership.id)).toBe(balance);
    // Her own event still to come is taken down.
    expect(await app.community.getPost("post_member_event_1")).toBeNull();
  });

  it("frees their place at events still to come", async () => {
    const before = (await app.community.getPost("post_member_event_1"))!;
    expect(before.rsvps).toContain("cus_can");
    await app.deleteAccount((await app.identity.getCustomer("cus_can"))!);
    expect((await app.community.getPost("post_member_event_1"))!.rsvps).not.toContain("cus_can");
    // Past events keep who came.
    expect((await app.community.getPost("post_event_past"))!.rsvps).toContain("cus_can");
  });

  it("lets the same email start afresh", async () => {
    await app.auth.startEmail("yeni@example.com");
    const first = await app.signInWithEmailCode("yeni@example.com", outbox.lastCodeFor("yeni@example.com")!);
    const me = (await app.customerForToken(first.token))!;
    await app.deleteAccount(me);

    await app.auth.startEmail("yeni@example.com");
    const again = await app.signInWithEmailCode("yeni@example.com", outbox.lastCodeFor("yeni@example.com")!);
    expect(again.isNew).toBe(true);
    expect((await app.customerForToken(again.token))!.id).not.toBe(me.id);
  });
});
