import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type CustomerRecord } from "./app";
import { setCafePlan } from "./plans";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";

let app: PeniApp;
let now: Date;
let leylaToken: string;
let ayse: CustomerRecord;
const DAY = 86_400_000;
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
const plan = (change: { plan?: string; trial?: "start" | "end" }) => setCafePlan(app.identity, "moda", change, now);
const leyla = () => app.staff.at(leylaToken, "moda");

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  leylaToken = (await app.staff.signIn(DEMO_STAFF.leyla.email, DEMO_STAFF_PASSWORD)).token;
  ayse = (await app.identity.getCustomer("cus_ayse"))!;
});

describe("café plans (N11)", () => {
  it("keeps everything for cafés already here", async () => {
    const moda = (await app.staff.me(leylaToken)).cafes.find((c) => c.slug === "moda")!;
    expect(moda.plan).toEqual({ now: "isletme", paid: "isletme", trialEndsAt: null });
    expect(moda.permissions).toContain("till.use");
  });

  it("on Topluluk, lets the owner post and run the team, and says the rest needs another plan", async () => {
    await plan({ plan: "topluluk" });
    const moda = (await app.staff.me(leylaToken)).cafes.find((c) => c.slug === "moda")!;
    expect(moda.plan.now).toBe("topluluk");
    expect(moda.permissions.sort()).toEqual(["posts.moderate", "posts.write", "roles.manage", "settings.edit", "team.manage", "team.view"]);

    expect(await code(app.staff.at(leylaToken, "moda", "posts.write"))).toBe("ok");
    expect(await code(app.staff.at(leylaToken, "moda", "bills.view"))).toBe("PLAN_NEEDED");
    const ctx = await leyla();
    expect(await code(app.bills.list(ctx))).toBe("PLAN_NEEDED");
    expect(await code(app.salesReports.get(ctx))).toBe("PLAN_NEEDED");
    expect(await code(app.insights.get(ctx))).toBe("PLAN_NEEDED");
    expect(await code(app.feed.view(ctx))).toBe("ok");
    // Kuzguncuk, where Leyla is a manager, still has everything.
    expect(await code(app.staff.at(leylaToken, "kuzguncuk", "bills.view"))).toBe("ok");
  });

  it("on Topluluk + Penny, opens Müdavimler and the menu but not reports or the till", async () => {
    await plan({ plan: "penny" });
    const ctx = await leyla();
    expect(await code(app.insights.get(ctx))).toBe("ok");
    expect(await code(app.staff.at(leylaToken, "moda", "menu.edit"))).toBe("ok");
    expect(await code(app.salesReports.get(ctx))).toBe("PLAN_NEEDED");
    expect(await code(app.staff.at(leylaToken, "moda", "till.use"))).toBe("PLAN_NEEDED");
    expect(await code(app.staff.at(leylaToken, "moda", "menu.recipes"))).toBe("PLAN_NEEDED");
  });

  it("gives a new café two weeks of everything, then the plan it pays for", async () => {
    await plan({ plan: "topluluk", trial: "start" });
    const during = (await app.staff.me(leylaToken)).cafes.find((c) => c.slug === "moda")!;
    expect(during.plan).toEqual({ now: "isletme", paid: "topluluk", trialEndsAt: "2026-10-30T09:00:00.000Z" });
    expect(await code(app.staff.at(leylaToken, "moda", "bills.view"))).toBe("ok");

    now = new Date(now.getTime() + 14 * DAY);
    // A staff session lasts 14 days too: sign in again.
    leylaToken = (await app.staff.signIn(DEMO_STAFF.leyla.email, DEMO_STAFF_PASSWORD)).token;
    expect(await code(app.staff.at(leylaToken, "moda", "bills.view"))).toBe("PLAN_NEEDED");
    // Nothing was deleted: paying brings it all back.
    await plan({ plan: "isletme" });
    expect((await app.bills.list(await leyla())).bills.length).toBeGreaterThan(0);
  });

  it("shows only the plan's switches on the roles screen, and keeps the café's other changes", async () => {
    const owner = await leyla();
    await app.staff.saveRoles(owner, { barista: { "stock.view": true } });
    await plan({ plan: "topluluk" });
    const small = await leyla();
    const keys = (await app.staff.roles(small)).sections.flatMap((s) => s.permissions.map((p) => p.key));
    expect(keys).not.toContain("stock.view");
    expect(keys).toContain("posts.write");
    await app.staff.saveRoles(small, { barista: { "posts.write": false } });

    await plan({ plan: "isletme" });
    const roles = await app.staff.roles(await leyla());
    const row = (key: string) => roles.sections.flatMap((s) => s.permissions).find((p) => p.key === key)!;
    expect(row("stock.view").roles.barista).toBe(true);
    expect(row("posts.write").roles.barista).toBe(false);
  });

  it("stops pennies and the askı for customers at a Topluluk café, and keeps their balance", async () => {
    const before = (await app.cafeDetail("moda", ayse)).membership!.balancePeni;
    expect(before).toBeGreaterThan(0);
    await plan({ plan: "topluluk" });
    const page = await app.cafeDetail("moda", ayse);
    expect(page.pennyOn).toBe(false);
    expect(page.askida.enabled).toBe(false);
    expect(page.membership!.balancePeni).toBe(before);

    await plan({ plan: "penny" });
    expect((await app.cafeDetail("moda", ayse)).pennyOn).toBe(true);
  });

  it("writes the weekly letter only for cafés with İşletme", async () => {
    await plan({ plan: "penny" });
    now = new Date("2026-10-19T09:00:00Z");
    const started = await app.letters.startDue();
    expect(started.map((s) => s.cafeId)).not.toContain("cafe_moda");
  });

  it("refuses a plan that doesn't exist", async () => {
    expect(await code(plan({ plan: "gold" }))).toBe("VALIDATION");
    expect(await code(setCafePlan(app.identity, "nowhere", { plan: "penny" }, now))).toBe("NOT_FOUND");
  });
});
