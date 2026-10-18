import { beforeEach, describe, expect, it } from "vitest";
import { PeniApp } from "./app";
import { DEMO_CUSTOMERS, DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import { PIN_MAX_FAILURES, PIN_TRIES, SIGN_IN_LIMIT } from "./staff";

let app: PeniApp;
let now: Date;
const tick = (ms: number) => {
  now = new Date(now.getTime() + ms);
};
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Signs in a demo staff member and returns their token. */
const signIn = async (who: keyof typeof DEMO_STAFF, password = DEMO_STAFF_PASSWORD) =>
  (await app.staff.signIn(DEMO_STAFF[who].email, password)).token;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now });
  await seed(app);
});

describe("staff sign-in", () => {
  it("signs in with email and password and lists each café with what the role may do there", async () => {
    const session = await app.staff.signIn("  LEYLA@moda.test ", DEMO_STAFF_PASSWORD);
    expect(session.account).toMatchObject({ name: "Leyla Kara", email: "leyla@moda.test" });
    expect(session.cafes.map((c) => [c.slug, c.role])).toEqual([
      ["moda", "owner"],
      ["kuzguncuk", "manager"],
    ]);
    const [moda, kuzguncuk] = session.cafes;
    expect(moda!.permissions).toContain("roles.manage");
    expect(kuzguncuk!.permissions).toContain("reports.view");
    expect(kuzguncuk!.permissions).not.toContain("team.manage");
    expect(await app.staff.me(session.token)).toEqual({ account: session.account, signedInWith: "password", cafes: session.cafes });
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    expect(await code(app.staff.signIn("leyla@moda.test", "wrong-password"))).toBe("SIGN_IN_FAILED");
    expect(await code(app.staff.signIn("nobody@moda.test", DEMO_STAFF_PASSWORD))).toBe("SIGN_IN_FAILED");
  });

  it("pauses sign-in for an email after too many wrong passwords", async () => {
    for (let i = 0; i < SIGN_IN_LIMIT; i++) await code(app.staff.signIn("ece@moda.test", `wrong-${i}`));
    expect(await code(signIn("ece"))).toBe("SIGN_IN_LIMITED");
    expect(await code(signIn("murat"))).toBe("ok");
    tick(16 * MIN);
    expect(await code(signIn("ece"))).toBe("ok");
  });

  it("ends a session on sign-out and after 14 days", async () => {
    const first = await signIn("ece");
    await app.staff.signOut(first);
    expect(await code(app.staff.me(first))).toBe("STAFF_UNAUTHENTICATED");
    const second = await signIn("ece");
    tick(13 * DAY);
    expect(await code(app.staff.me(second))).toBe("ok");
    tick(2 * DAY);
    expect(await code(app.staff.me(second))).toBe("STAFF_UNAUTHENTICATED");
    expect(await code(app.staff.me(null))).toBe("STAFF_UNAUTHENTICATED");
  });

  it("changes a password and signs out every other session", async () => {
    const here = await signIn("ece");
    const elsewhere = await signIn("ece");
    expect(await code(app.staff.changePassword(here, "wrong", "a-new-passphrase"))).toBe("WRONG_PASSWORD");
    await app.staff.changePassword(here, DEMO_STAFF_PASSWORD, "a-new-passphrase");
    expect(await code(app.staff.me(here))).toBe("ok");
    expect(await code(app.staff.me(elsewhere))).toBe("STAFF_UNAUTHENTICATED");
    expect(await code(signIn("ece"))).toBe("SIGN_IN_FAILED");
    expect(await code(signIn("ece", "a-new-passphrase"))).toBe("ok");
  });
});

describe("permissions at a café", () => {
  it("checks the role at that café", async () => {
    const ece = await signIn("ece");
    expect((await app.staff.at(ece, "moda", "peni.till")).role).toBe("barista");
    expect(await code(app.staff.at(ece, "moda", "peni.view"))).toBe("FORBIDDEN");
    expect(await code(app.staff.at(ece, "kuzguncuk"))).toBe("NOT_STAFF");
    expect(await code(app.staff.at(ece, "nowhere"))).toBe("NOT_STAFF");
    const leyla = await signIn("leyla");
    expect((await app.staff.at(leyla, "kuzguncuk", "peni.view")).role).toBe("manager");
    expect(await code(app.staff.at(leyla, "kuzguncuk", "roles.manage"))).toBe("FORBIDDEN");
  });

  it("records askı cash under the staff member who took it", async () => {
    const ece = await app.staff.at(await signIn("ece"), "moda", "peni.till");
    await app.tillDonation(ece, { peni: 30, idempotencyKey: "till-test-1" });
    const tx = await app.ledger.findByIdempotencyKey("askida_till:till-test-1");
    expect(tx?.meta).toEqual({ staffUserId: ece.member.id });
  });
});

describe("the team", () => {
  it("lets the owner add someone, who can then sign in", async () => {
    const owner = await app.staff.at(await signIn("leyla"), "moda");
    const team = await app.staff.addMember(owner, { name: "Ali Vural", email: "Ali@Moda.test", role: "barista", password: "ali-first-day" });
    expect(team.members.find((m) => m.email === "ali@moda.test")).toMatchObject({ role: "barista", canSignIn: true, isYou: false });
    expect(team.members.find((m) => m.isYou)?.name).toBe("Leyla Kara");
    expect((await app.staff.signIn("ali@moda.test", "ali-first-day")).cafes.map((c) => c.slug)).toEqual(["moda"]);
    expect(await code(app.staff.addMember(owner, { name: "Ali", email: "ali@moda.test", role: "chef" }))).toBe("ALREADY_STAFF");
    expect(await code(app.staff.addMember(owner, { name: "Yeni", email: "yeni@moda.test", role: "chef" }))).toBe("PASSWORD_REQUIRED");
  });

  it("adds an existing account to another café without touching its password", async () => {
    const tarik = await app.staff.at(await signIn("tarik"), "kuzguncuk");
    await app.staff.addMember(tarik, { name: "ignored", email: "ece@moda.test", role: "barista", password: "not-used-at-all" });
    expect((await app.staff.signIn("ece@moda.test", DEMO_STAFF_PASSWORD)).cafes.map((c) => c.slug)).toEqual(["moda", "kuzguncuk"]);
  });

  it("lets managers see the team but not change it", async () => {
    const murat = await app.staff.at(await signIn("murat"), "moda");
    expect((await app.staff.team(murat)).members).toHaveLength(4);
    expect(await code(app.staff.addMember(murat, { name: "X", email: "x@moda.test", role: "barista", password: "12345678" }))).toBe("FORBIDDEN");
    const ece = await app.staff.at(await signIn("ece"), "moda");
    expect(await code(app.staff.team(ece))).toBe("FORBIDDEN");
  });

  it("always keeps an owner", async () => {
    const owner = await app.staff.at(await signIn("leyla"), "moda");
    expect(await code(app.staff.updateMember(owner, owner.member.id, { role: "manager" }))).toBe("LAST_OWNER");
    expect(await code(app.staff.updateMember(owner, owner.member.id, { removed: true }))).toBe("LAST_OWNER");
    const murat = (await app.staff.team(owner)).members.find((m) => m.name === "Murat Aksu")!;
    await app.staff.updateMember(owner, murat.id, { role: "owner" });
    await app.staff.updateMember(owner, owner.member.id, { role: "manager" });
    const after = await app.staff.signIn("leyla@moda.test", DEMO_STAFF_PASSWORD);
    expect(after.cafes.find((c) => c.slug === "moda")?.role).toBe("manager");
  });

  it("takes a removed person off this café only", async () => {
    const owner = await app.staff.at(await signIn("tarik"), "kuzguncuk");
    const leylaToken = await signIn("leyla");
    const leyla = (await app.staff.team(owner)).members.find((m) => m.name === "Leyla Kara")!;
    await app.staff.updateMember(owner, leyla.id, { removed: true });
    expect(await code(app.staff.at(leylaToken, "kuzguncuk"))).toBe("NOT_STAFF");
    expect((await app.staff.at(leylaToken, "moda")).role).toBe("owner");
    expect(await code(app.staff.updateMember(owner, leyla.id, { role: "manager" }))).toBe("NOT_FOUND");
  });

  it("resets a password only for people who work nowhere this owner does not own", async () => {
    const leyla = await app.staff.at(await signIn("leyla"), "moda");
    const eceToken = await signIn("ece");
    const ece = (await app.staff.team(leyla)).members.find((m) => m.name === "Ece Tan")!;
    await app.staff.resetPassword(leyla, ece.id, "fresh-start-123");
    expect(await code(app.staff.me(eceToken))).toBe("STAFF_UNAUTHENTICATED");
    expect(await code(app.staff.signIn("ece@moda.test", "fresh-start-123"))).toBe("ok");

    const tarik = await app.staff.at(await signIn("tarik"), "kuzguncuk");
    const leylaThere = (await app.staff.team(tarik)).members.find((m) => m.name === "Leyla Kara")!;
    expect(await code(app.staff.resetPassword(tarik, leylaThere.id, "taken-over-123"))).toBe("OWNER_ONLY");
  });
});

describe("roles", () => {
  it("shows every role's permissions grouped like the café panel", async () => {
    const murat = await app.staff.at(await signIn("murat"), "moda");
    const roles = await app.staff.roles(murat);
    expect(roles.canEdit).toBe(false);
    expect(roles.roles.map((r) => r.label.tr)).toEqual(["Sahip", "Müdür", "Şef", "Barista"]);
    expect(roles.sections[0]!.label.tr).toBe("Bugün");
    const all = roles.sections.flatMap((s) => s.permissions);
    expect(all.every((p) => p.roles.owner)).toBe(true);
    expect(all.find((p) => p.key === "reports.view")).toMatchObject({ locked: true, roles: { manager: true, chef: false, barista: false } });
  });

  it("lets the owner change what a role may do, except locked permissions", async () => {
    const owner = await app.staff.at(await signIn("leyla"), "moda");
    const eceToken = await signIn("ece");
    expect(await code(app.staff.at(eceToken, "moda", "stock.view"))).toBe("FORBIDDEN");
    await app.staff.saveRoles(owner, { barista: { "stock.view": true, "reports.view": true }, owner: { "till.use": false } });
    expect(await code(app.staff.at(eceToken, "moda", "stock.view"))).toBe("ok");
    expect(await code(app.staff.at(eceToken, "moda", "reports.view"))).toBe("FORBIDDEN");
    expect(await code(app.staff.at(await signIn("leyla"), "moda", "till.use"))).toBe("ok");
    const kuzguncuk = await app.staff.at(await signIn("tarik"), "kuzguncuk");
    expect((await app.staff.roles(kuzguncuk)).sections.flatMap((s) => s.permissions).find((p) => p.key === "stock.view")!.roles.barista).toBe(false);
  });

  it("lets only the owner save roles", async () => {
    const murat = await app.staff.at(await signIn("murat"), "moda");
    expect(await code(app.staff.saveRoles(murat, { barista: { "stock.view": true } }))).toBe("FORBIDDEN");
  });
});

describe("staff who are also customers", () => {
  it("shows a linked customer their cafés", async () => {
    const account = await app.staff.ensureAccount({ name: "Deniz", email: "deniz@moda.test", password: "deniz-pass", customerId: DEMO_CUSTOMERS.deniz.id });
    await app.staff.join(account.id, "cafe_kuzguncuk", "chef");
    expect(await app.staff.cafesForCustomer(DEMO_CUSTOMERS.deniz.id)).toEqual([{ slug: "kuzguncuk", name: expect.any(String), role: "chef" }]);
    expect(await app.staff.cafesForCustomer(DEMO_CUSTOMERS.ayse.id)).toEqual([]);
  });
});

describe("the till", () => {
  /** Leyla sets the café computer up as a till and returns its device token. */
  const setUpTill = async () => {
    const owner = await app.staff.at(await signIn("leyla"), "moda");
    return (await app.staff.registerDevice(owner, "Kasa bilgisayarı")).token;
  };
  const eceId = async (device: string) => (await app.staff.till(device)).staff.find((s) => s.name === "Ece Tan")!.memberId;

  it("lists who can sign in with a PIN on a computer set up as a till", async () => {
    const device = await setUpTill();
    const till = await app.staff.till(device);
    expect(till.cafe).toEqual({ slug: "moda", name: "Moda Kahvesi" });
    expect(till.staff.map((s) => [s.name, s.hasPin])).toEqual([
      ["Leyla Kara", false],
      ["Murat Aksu", false],
      ["Hakan Usta", true],
      ["Ece Tan", true],
    ]);
    expect(await code(app.staff.till("not-a-device"))).toBe("DEVICE_UNKNOWN");
    expect(await code(app.staff.till(null))).toBe("DEVICE_UNKNOWN");
  });

  it("is set up by an owner", async () => {
    const murat = await app.staff.at(await signIn("murat"), "moda");
    expect(await code(app.staff.registerDevice(murat, "Kasa"))).toBe("FORBIDDEN");
  });

  it("signs a barista in with their PIN for the till's own work only", async () => {
    const device = await setUpTill();
    const session = await app.staff.pinSignIn(device, await eceId(device), "2580");
    expect(session.signedInWith).toBe("pin");
    expect(session.cafes.map((c) => c.slug)).toEqual(["moda"]);
    expect(session.cafes[0]!.permissions).toContain("till.use");
    expect((await app.staff.at(session.token, "moda", "peni.till")).method).toBe("pin");
    expect(await code(app.staff.at(session.token, "moda", "stock.view"))).toBe("FORBIDDEN");
  });

  it("keeps an owner's PIN session away from the back office", async () => {
    const owner = await app.staff.at(await signIn("leyla"), "moda");
    const device = (await app.staff.registerDevice(owner, "Kasa")).token;
    const leylaId = (await app.staff.till(device)).staff.find((s) => s.name === "Leyla Kara")!.memberId;
    expect(await code(app.staff.pinSignIn(device, leylaId, "2580"))).toBe("NO_PIN");
    await app.staff.setPin(owner, "4826");
    const pin = await app.staff.pinSignIn(device, leylaId, "4826");
    expect(pin.cafes.map((c) => c.slug)).toEqual(["moda"]);
    expect((await app.staff.at(pin.token, "moda", "till.correct")).role).toBe("owner");
    expect(await code(app.staff.at(pin.token, "moda", "team.manage"))).toBe("NEEDS_PASSWORD");
    expect(await code(app.staff.at(pin.token, "kuzguncuk"))).toBe("NOT_STAFF");
    const atTill = await app.staff.at(pin.token, "moda");
    expect(await code(app.staff.setPin(atTill, "9137"))).toBe("NEEDS_PASSWORD");
    expect(await code(app.staff.registerDevice(atTill, "Another"))).toBe("NEEDS_PASSWORD");
    expect(await code(app.staff.changePassword(pin.token, DEMO_STAFF_PASSWORD, "something-new-1"))).toBe("NEEDS_PASSWORD");
  });

  it("refuses easy PINs", async () => {
    const owner = await app.staff.at(await signIn("leyla"), "moda");
    expect(await code(app.staff.setPin(owner, "1234"))).toBe("PIN_TOO_EASY");
    expect(await code(app.staff.setPin(owner, "12"))).toBe("PIN_FORMAT");
  });

  it("pauses a PIN after 5 wrong tries and clears it after 20", async () => {
    const device = await setUpTill();
    const ece = await eceId(device);
    for (let i = 1; i < PIN_TRIES; i++) expect(await code(app.staff.pinSignIn(device, ece, "0007"))).toBe("PIN_WRONG");
    expect(await code(app.staff.pinSignIn(device, ece, "0007"))).toBe("PIN_WRONG");
    expect(await code(app.staff.pinSignIn(device, ece, "2580"))).toBe("PIN_LOCKED");
    expect((await app.staff.till(device)).staff.find((s) => s.memberId === ece)!.lockedUntilIso).not.toBeNull();
    tick(16 * MIN);
    expect(await code(app.staff.pinSignIn(device, ece, "2580"))).toBe("ok");

    for (let i = 1; i < PIN_MAX_FAILURES; i++) {
      await code(app.staff.pinSignIn(device, ece, "0007"));
      if (i % PIN_TRIES === 0) tick(16 * MIN);
    }
    expect(await code(app.staff.pinSignIn(device, ece, "0007"))).toBe("PIN_CLEARED");
    expect(await code(app.staff.pinSignIn(device, ece, "2580"))).toBe("NO_PIN");
  });

  it("ends a PIN session after a shift, when the till is revoked, or when the person leaves", async () => {
    const owner = await app.staff.at(await signIn("leyla"), "moda");
    const { device, token } = await app.staff.registerDevice(owner, "Kasa");
    const ece = await eceId(token);
    const first = await app.staff.pinSignIn(token, ece, "2580");
    tick(13 * 60 * MIN);
    expect(await code(app.staff.me(first.token))).toBe("STAFF_UNAUTHENTICATED");

    const second = await app.staff.pinSignIn(token, ece, "2580");
    expect((await app.staff.devices(owner)).devices.map((d) => d.name)).toEqual(["Kasa"]);
    await app.staff.revokeDevice(owner, device.id);
    expect(await code(app.staff.me(second.token))).toBe("STAFF_UNAUTHENTICATED");
    expect(await code(app.staff.till(token))).toBe("DEVICE_UNKNOWN");
    expect(await app.staff.devices(owner)).toEqual({ devices: [] });

    const again = (await app.staff.registerDevice(owner, "Yeni kasa")).token;
    const third = await app.staff.pinSignIn(again, ece, "2580");
    await app.staff.updateMember(owner, ece, { removed: true });
    expect(await code(app.staff.at(third.token, "moda"))).toBe("NOT_STAFF");
    expect(await code(app.staff.pinSignIn(again, ece, "2580"))).toBe("NOT_STAFF");
  });

  it("lets the owner clear someone's PIN", async () => {
    const owner = await app.staff.at(await signIn("leyla"), "moda");
    const device = (await app.staff.registerDevice(owner, "Kasa")).token;
    const ece = await eceId(device);
    const team = await app.staff.updateMember(owner, ece, { clearPin: true });
    expect(team.members.find((m) => m.id === ece)!.hasPin).toBe(false);
    expect(await code(app.staff.pinSignIn(device, ece, "2580"))).toBe("NO_PIN");
  });

  it("keeps one café's till to that café's team", async () => {
    const tarik = await app.staff.at(await signIn("tarik"), "kuzguncuk");
    const device = (await app.staff.registerDevice(tarik, "Kuzguncuk kasa")).token;
    const modaDevice = await setUpTill();
    expect(await code(app.staff.pinSignIn(device, await eceId(modaDevice), "2580"))).toBe("NOT_STAFF");
    expect((await app.staff.till(device)).staff.map((s) => s.name)).toEqual(["Tarık Ersoy", "Leyla Kara"]);
  });
});
