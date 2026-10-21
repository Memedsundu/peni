import { describe, expect, it } from "vitest";
import { InMemoryDirectory, InMemoryIdentityStore, PlanAwareDirectory, permissionsFor, planOn, trialEndFrom, type Cafe } from "../src";

const day = (d: string) => new Date(`${d}T09:00:00Z`);

describe("café plans (N11)", () => {
  it("has everything during the trial, then the plan it pays for", () => {
    const cafe = { plan: "topluluk" as const, trialEndsAt: trialEndFrom(day("2026-11-01")) };
    expect(cafe.trialEndsAt.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(planOn(cafe, day("2026-11-14"))).toBe("isletme");
    expect(planOn(cafe, day("2026-11-15"))).toBe("topluluk");
    expect(planOn({ plan: "penny", trialEndsAt: null }, day("2026-11-01"))).toBe("penny");
  });

  it("gives the owner of a free café only the café page and the team", () => {
    const owner = permissionsFor("owner", [], "topluluk");
    expect([...owner].sort()).toEqual(["posts.moderate", "posts.write", "roles.manage", "settings.edit", "team.manage", "team.view"]);
  });

  it("adds pennies, the menu and Müdavimler on Topluluk + Penny, but not reports or the till", () => {
    const owner = permissionsFor("owner", [], "penny");
    for (const p of ["peni.view", "peni.till", "menu.edit", "regulars.view", "posts.write"] as const) expect(owner.has(p)).toBe(true);
    for (const p of ["reports.view", "till.use", "bills.view", "stock.view", "assistant.use", "menu.recipes"] as const) expect(owner.has(p)).toBe(false);
  });

  it("keeps the role's own limits inside the plan", () => {
    // A barista doesn't see Müdavimler on any plan.
    expect(permissionsFor("barista", [], "penny").has("regulars.view")).toBe(false);
  });

  it("switches pennies and the askı off for customers when the plan has none, without touching what's stored", async () => {
    const identity = new InMemoryIdentityStore();
    const inner = new InMemoryDirectory();
    const cafe: Cafe = {
      id: "c1",
      slug: "c1",
      name: "C1",
      address: null,
      district: null,
      city: null,
      coverImageUrl: null,
      referenceProductIds: [],
      hue: null,
      plan: "topluluk",
      trialEndsAt: null,
    };
    await identity.saveCafe(cafe);
    let now = day("2026-11-01");
    const directory = new PlanAwareDirectory(inner, identity, () => now);
    expect(await directory.getSettings("c1")).toMatchObject({ peniEnabled: false, askidaEnabled: false });
    expect(await inner.getSettings("c1")).toMatchObject({ peniEnabled: true, askidaEnabled: true });

    await identity.saveCafe({ ...cafe, trialEndsAt: trialEndFrom(now) });
    expect(await directory.getSettings("c1")).toMatchObject({ peniEnabled: true, askidaEnabled: true });
    now = day("2026-11-20");
    expect(await directory.getSettings("c1")).toMatchObject({ peniEnabled: false });

    await identity.saveCafe({ ...cafe, plan: "penny" });
    expect(await directory.getSettings("c1")).toMatchObject({ peniEnabled: true, askidaEnabled: true });
  });
});
