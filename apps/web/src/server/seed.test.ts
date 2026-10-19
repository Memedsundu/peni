import { describe, expect, it } from "vitest";
import { PeniApp } from "./app";
import { DEMO_CUSTOMERS, seed } from "./seed";

/** The seed is relative to "now": these clocks are where relative dates go wrong (midnight, month and year ends). */
const times = [
  "2026-10-15T21:00:30Z", // 00:00:30 Istanbul
  "2026-10-15T21:20:00Z", // 00:20
  "2026-10-16T03:00:00Z", // 06:00
  "2026-10-16T20:59:00Z", // 23:59
  "2026-11-01T06:00:00Z", // first of the month
  "2026-12-31T22:30:00Z", // new year's night
  "2027-03-01T09:00:00Z",
];

describe.each(times)("seed at %s", (iso) => {
  it("holds the demo's promises", async () => {
    const now = new Date(iso);
    const app = new PeniApp({ demo: true, staffKey: "k", clock: () => now });
    await seed(app);
    const people = new Map((await app.identity.getCustomers(Object.values(DEMO_CUSTOMERS).map((x) => x.id))).map((x) => [x.id, x]));
    const c = (id: string) => people.get(id)!;
    const moda = (id: string) => app.cafeDetail("moda", c(id));
    const d = await moda(DEMO_CUSTOMERS.deniz.id);
    expect(d.membership!.balancePeni).toBe(0);
    expect(d.askida.myEligibility.status).toBe("ok");
    expect(d.askida.itemsAvailable).toBeGreaterThan(0);
    expect(d.askida.claimedLast7Days).toBeGreaterThanOrEqual(3);
    expect((await moda(DEMO_CUSTOMERS.ayse.id)).membership!.balancePeni).toBeGreaterThanOrEqual(100);
    expect((await moda(DEMO_CUSTOMERS.mehmet.id)).membership!.balancePeni).toBeGreaterThanOrEqual(40);
    expect((await moda(DEMO_CUSTOMERS.mehmet.id)).askida.myEligibility.status).toBe("claimed_today");
    expect(d.askida.matchPercent).toBe(50);
    const q = d.posts.find((p) => p.kind === "question")!;
    expect(q.comments.length).toBe(4);
    for (const cm of q.comments) expect(new Date(cm.createdAt).getTime()).toBeLessThanOrEqual(now.getTime());
    const kuz = await app.cafeDetail("kuzguncuk", c(DEMO_CUSTOMERS.deniz.id));
    expect(kuz.askida.myEligibility).toEqual({ status: "too_new", daysLeft: 3 });
    const w = await app.wallet(c(DEMO_CUSTOMERS.ayse.id));
    expect(w.gifts.filter((g) => g.status === "pending")).toHaveLength(2);
    // Smoke needs: Ayşe can still gift 30 today and get a 30 peni match on 60.
    await app.sendGift(c(DEMO_CUSTOMERS.ayse.id), { cafeSlug: "moda", toPhone: DEMO_CUSTOMERS.mehmet.phone, peni: 30, idempotencyKey: "x-smoke" });
    expect((await app.donateToAskida(c(DEMO_CUSTOMERS.ayse.id), { cafeSlug: "moda", peni: 60, showName: true, idempotencyKey: "x-d" })).matchedPeni).toBe(30);
  });
});
