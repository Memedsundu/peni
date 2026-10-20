import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type CustomerRecord } from "./app";
import { OutboxEmailSender } from "./customer-auth";
import { seed } from "./seed";

let app: PeniApp;
let outbox: OutboxEmailSender;
let now: Date;
let ayse: CustomerRecord;
let mehmet: CustomerRecord;
let deniz: CustomerRecord;

const make = async (publicUrl?: string) => {
  outbox = new OutboxEmailSender();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, auth: { email: outbox }, publicUrl }, inMemoryStores());
  await seed(app);
  ayse = (await app.identity.getCustomer("cus_ayse"))!;
  deniz = (await app.identity.getCustomer("cus_deniz"))!;
  mehmet = { ...(await app.identity.getCustomer("cus_mehmet"))!, email: "mehmet@example.com" };
  await app.identity.saveCustomer(mehmet);
};
const toMehmet = (key: string, extra: { message?: string } = {}) =>
  app.sendGift(ayse, { cafeSlug: "moda", toPhone: mehmet.phone!, peni: 20, idempotencyKey: key, ...extra });

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  await make("https://peni.example/");
});

describe("gifts on the web (plan piece 12)", () => {
  it("emails the recipient the gift's link once, even when the send is retried", async () => {
    const gift = await toMehmet("gift-key-1", { message: "Çay benden <3" });
    await toMehmet("gift-key-1", { message: "Çay benden <3" });
    const mails = outbox.sent.filter((m) => m.to === "mehmet@example.com");
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe("Ayşe Y. sana 20 penny ısmarladı · Moda Kahvesi");
    expect(mails[0]!.text).toContain(`https://peni.example/hediye/${gift.id}`);
    expect(mails[0]!.text).toContain("“Çay benden <3”");
    expect(mails[0]!.html).toContain("Çay benden &#60;3");
    expect(mails[0]!.html).not.toContain("<3");
    expect(mails[0]!.text).toContain("24 saat içinde");
  });

  it("sends no email without the site's address, or to someone with no email", async () => {
    await toMehmet("gift-key-2");
    await app.sendGift(ayse, { cafeSlug: "moda", toPhone: deniz.phone!, peni: 5, idempotencyKey: "gift-key-3" });
    expect(outbox.sent.map((m) => m.to)).toEqual(["mehmet@example.com"]);
    await make(undefined);
    await toMehmet("gift-key-4");
    expect(outbox.sent).toHaveLength(0);
  });

  it("still finds the sign-in code after a gift email to the same address", async () => {
    await app.auth.startEmail("mehmet@example.com");
    const code = outbox.lastCodeFor("mehmet@example.com");
    await toMehmet("gift-key-5");
    expect(outbox.sent.at(-1)!.subject).toContain("ısmarladı");
    expect(outbox.lastCodeFor("mehmet@example.com")).toBe(code);
  });

  it("shows the whole gift on its link only to its sender and its recipient", async () => {
    const gift = await toMehmet("gift-key-6", { message: "Afiyet olsun" });
    const forMehmet = await app.giftPreview(gift.id, mehmet);
    expect(forMehmet).toMatchObject({ viewer: "recipient", gift: { id: gift.id, direction: "in", message: "Afiyet olsun", fromName: "Ayşe Yılmaz" } });
    expect((await app.giftPreview(gift.id, ayse)).gift).toMatchObject({ direction: "out", canCancel: true });
    expect((await app.giftPreview(gift.id, deniz)).gift).toBeNull();
    expect((await app.giftPreview(gift.id, null)).gift).toBeNull();
    expect(forMehmet.hue).toBe((await app.identity.listCafes()).find((c) => c.slug === "moda")!.hue ?? null);

    await app.resolveGift(mehmet, gift.id, "accept");
    await app.thankGift(mehmet, gift.id);
    expect((await app.giftPreview(gift.id, ayse)).gift).toMatchObject({ status: "accepted", canCancel: false, thankedAt: now.toISOString() });
  });
});
