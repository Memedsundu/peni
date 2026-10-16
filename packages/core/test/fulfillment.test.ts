import { describe, expect, it } from "vitest";
import { allowedActions, initialFulfillment, prepTimeStats, transition } from "../src";

const now = new Date("2026-10-15T09:00:00Z");

describe("app order lifecycle", () => {
  it("walks the happy path and tells the customer when it's ready", () => {
    let s = initialFulfillment(now);
    s = transition(s, "accept", "staff", now).state;
    const ready = transition(s, "ready", "staff", now);
    expect(ready.notify).toBe("order_ready");
    const done = transition(ready.state, "collect", "system", now);
    expect(done.state.status).toBe("collected");
    expect(done.state.closedAt).toEqual(now);
    expect(done.releaseReservations).toBe(false);
  });

  it("needs a reason to reject, and releases reservations", () => {
    const s = initialFulfillment(now);
    expect(() => transition(s, "reject", "staff", now)).toThrow(/reason/);
    const r = transition(s, "reject", "staff", now, "Süt bitti");
    expect(r.state.rejectionReason).toBe("Süt bitti");
    expect(r.releaseReservations).toBe(true);
  });

  it("lets the customer cancel only before the barista accepts", () => {
    const s = initialFulfillment(now);
    expect(allowedActions(s.status, "customer")).toEqual(["cancel"]);
    const accepted = transition(s, "accept", "staff", now).state;
    expect(allowedActions(accepted.status, "customer")).toEqual([]);
    expect(() => transition(accepted, "cancel", "customer", now)).toThrow();
  });

  it("does not let customers move orders forward", () => {
    expect(() => transition(initialFulfillment(now), "accept", "customer", now)).toThrow();
  });
});

describe("prep time (G14)", () => {
  const at = (min: number) => new Date(now.getTime() + min * 60_000);
  const collected = (prepMin: number) => ({ status: "collected" as const, acceptedAt: now, readyAt: at(prepMin) });

  it("stays silent below 20 collected orders", () => {
    expect(prepTimeStats(Array.from({ length: 19 }, () => collected(6)))).toBeNull();
  });

  it("gives the median and the usual range from the barista's own taps", () => {
    const orders = [4, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 8, 9, 5, 6, 7].map(collected);
    expect(prepTimeStats(orders)).toEqual({ sampleSize: 20, medianMinutes: 6, lowMinutes: 5, highMinutes: 8 });
  });

  it("ignores orders that were never marked ready, or were not collected", () => {
    const orders = [
      ...Array.from({ length: 19 }, () => collected(6)),
      { status: "collected" as const, acceptedAt: now, readyAt: null },
      { status: "no_show" as const, acceptedAt: now, readyAt: at(6) },
    ];
    expect(prepTimeStats(orders)).toBeNull();
  });
});
