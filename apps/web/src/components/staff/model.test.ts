import type { MenuItemDTO, OrderDTO } from "@peni/api";
import { describe, expect, it } from "vitest";
import {
  applyOverride,
  boardColumns,
  bumpToastText,
  canMarkNoShow,
  elapsedMinutes,
  firstName,
  itemsFor,
  minutesLeft,
  pausedBannerText,
  primaryAction,
  ticketNotes,
  tillItems,
  tillSelection,
  tillSubmitLabel,
  tillToastText,
  trend,
  trendSpoken,
} from "./model";

const T0 = Date.parse("2026-10-16T12:00:00.000Z");
const iso = (minutesFromT0: number) => new Date(T0 + minutesFromT0 * 60_000).toISOString();

function order(over: Partial<OrderDTO> = {}): OrderDTO {
  return {
    id: "o1",
    cafeSlug: "moda",
    cafeName: "Moda Kahvesi",
    orderNumber: "P-004",
    status: "submitted",
    customerName: "Zeynep Demir",
    lines: [{ productId: "cay", name: "Çay", unitPriceKurus: 3000, quantity: 2, note: null, fromAskida: false }],
    subtotalKurus: 6000,
    peniDiscountKurus: 0,
    askidaKurus: 0,
    dueKurus: 6000,
    customerNote: null,
    rejectionReason: null,
    submittedAt: iso(0),
    acceptedAt: null,
    readyAt: null,
    closedAt: null,
    earnedPeni: null,
    memberCode: null,
    ...over,
  };
}

describe("ticket basics", () => {
  it("shows the first name only", () => {
    expect(firstName("Zeynep Demir")).toBe("Zeynep");
    expect(firstName("  Can  ")).toBe("Can");
  });

  it("names the primary action per status, and Shelby closes at the till (D18)", () => {
    expect(primaryAction("submitted", "standalone")).toEqual({ action: "accept", label: "Kabul et" });
    expect(primaryAction("accepted", "standalone")).toEqual({ action: "ready", label: "Hazır" });
    expect(primaryAction("ready", "standalone")).toEqual({ action: "collect", label: "Ödendi, teslim edildi" });
    expect(primaryAction("ready", "shelby")).toEqual({ action: null, label: "Kasada kapanacak" });
    expect(primaryAction("collected", "standalone")).toBeNull();
  });

  it("measures elapsed time from submit, then accept, then ready", () => {
    const now = T0 + 12 * 60_000 + 30_000;
    expect(elapsedMinutes(order(), now)).toBe(12);
    expect(elapsedMinutes(order({ status: "accepted", acceptedAt: iso(5) }), now)).toBe(7);
    expect(elapsedMinutes(order({ status: "ready", acceptedAt: iso(5), readyAt: iso(9) }), now)).toBe(3);
  });

  it("offers Gelmedi only on ready tickets 10 minutes after readyAt", () => {
    const ready = order({ status: "ready", acceptedAt: iso(1), readyAt: iso(2) });
    expect(canMarkNoShow(ready, T0 + 11 * 60_000)).toBe(false);
    expect(canMarkNoShow(ready, T0 + 12 * 60_000)).toBe(true);
    expect(canMarkNoShow(order({ status: "accepted", readyAt: iso(0) }), T0 + 60 * 60_000)).toBe(false);
  });

  it("collects line notes and the order note for the warning block", () => {
    const o = order({
      lines: [
        { productId: "latte", name: "Latte", unitPriceKurus: 12000, quantity: 1, note: " yulaf sütlü ", fromAskida: false },
        { productId: "cay", name: "Çay", unitPriceKurus: 3000, quantity: 1, note: null, fromAskida: true },
      ],
      customerNote: "az şekerli",
    });
    expect(ticketNotes(o)).toEqual(["Latte: yulaf sütlü", "Not: az şekerli"]);
    expect(ticketNotes(order())).toEqual([]);
  });

  it("words the undo toast with the new status", () => {
    expect(bumpToastText(order(), "ready")).toBe("P-004 · Hazır");
    expect(bumpToastText(order(), "accept")).toBe("P-004 · Hazırlanıyor");
  });
});

describe("board", () => {
  it("applies a pending bump on top of the polled order", () => {
    const moved = applyOverride(order(), { status: "accepted", at: iso(3) });
    expect(moved.status).toBe("accepted");
    expect(moved.acceptedAt).toBe(iso(3));
    const ready = applyOverride(order({ status: "accepted", acceptedAt: iso(1) }), { status: "ready", at: iso(4) });
    expect(ready.acceptedAt).toBe(iso(1));
    expect(ready.readyAt).toBe(iso(4));
  });

  it("splits orders into columns, oldest stage first, and leaves closed ones off", () => {
    const a = order({ id: "a", submittedAt: iso(2) });
    const b = order({ id: "b", submittedAt: iso(1) });
    const c = order({ id: "c", status: "accepted", acceptedAt: iso(5) });
    const d = order({ id: "d", status: "collected", closedAt: iso(6) });
    const cols = boardColumns([a, b, c, d]);
    expect(cols.submitted.map((o) => o.id)).toEqual(["b", "a"]);
    expect(cols.accepted.map((o) => o.id)).toEqual(["c"]);
    expect(cols.ready).toEqual([]);

    // Bumping "b" moves it to the bottom of Hazırlanıyor (its stage began just now).
    const bumped = boardColumns([a, b, c, d], new Map([["b", { status: "accepted", at: iso(9) }]]));
    expect(bumped.submitted.map((o) => o.id)).toEqual(["a"]);
    expect(bumped.accepted.map((o) => o.id)).toEqual(["c", "b"]);
  });
});

describe("pause", () => {
  it("counts minutes left, rounded up", () => {
    expect(minutesLeft(null, T0)).toBeNull();
    expect(minutesLeft(iso(15), T0)).toBe(15);
    expect(minutesLeft(iso(15), T0 + 1_000)).toBe(15);
    expect(minutesLeft(iso(0), T0 + 5_000)).toBe(1);
  });

  it("reads short pauses as a countdown and long ones as the resume time", () => {
    expect(pausedBannerText(null, T0)).toBe("Uygulama siparişleri durdu");
    expect(pausedBannerText(iso(12), T0)).toBe("Uygulama siparişleri durdu · 12 dk kaldı");
    // 21:00Z is 00:00 in Istanbul.
    expect(pausedBannerText("2026-10-16T21:00:00.000Z", T0)).toBe("Uygulama siparişleri durdu · 00:00'da açılır");
  });
});

describe("till", () => {
  const menu: MenuItemDTO[] = [
    { productId: "filtre", name: "Filtre Kahve", category: "Sıcak", priceKurus: 8500, available: true, description: null, askida: true },
    { productId: "cay", name: "Çay", category: "Sıcak", priceKurus: 3000, available: true, description: null, askida: true },
    { productId: "latte", name: "Latte", category: "Sıcak", priceKurus: 12000, available: true, description: null, askida: false },
    { productId: "simit", name: "Simit", category: "Yiyecek", priceKurus: 2500, available: false, description: null, askida: true },
  ];

  it("lists askı items cheapest first, priced in peni", () => {
    expect(tillItems(menu).map((i) => `${i.name}:${i.peni}`)).toEqual(["Simit:25", "Çay:30", "Filtre Kahve:85"]);
  });

  it("labels the submit button and the toast like the spec", () => {
    const items = tillItems(menu);
    const none = tillSelection(items, {});
    expect(tillSubmitLabel(none)).toBe("Askıya ekle");

    const two = tillSelection(items, { cay: 2 });
    expect(two.peni).toBe(60);
    expect(tillSubmitLabel(two)).toBe("Askıya ekle · 2 çay (60 peni)");
    expect(tillToastText(two)).toBe("Askıya 2 çay eklendi.");

    const mixed = tillSelection(items, { cay: 1, simit: 1, filtre: 2 });
    expect(mixed.peni).toBe(30 + 25 + 170);
    expect(tillSubmitLabel(mixed)).toBe("Askıya ekle · 1 simit, 1 çay ve 2 filtre kahve (225 peni)");
    expect(tillToastText(mixed)).toBe("Askıya 1 simit, 1 çay ve 2 filtre kahve eklendi.");
  });

  it("counts whole reference items only (D9)", () => {
    expect(itemsFor(329, 30)).toBe(10);
    expect(itemsFor(29, 30)).toBe(0);
    expect(itemsFor(100, null)).toBeNull();
  });
});

describe("report trends", () => {
  it("compares with the previous 30 days only when there is something to compare", () => {
    expect(trend(120, 100)).toEqual({ percent: 20, direction: "up" });
    expect(trend(80, 100)).toEqual({ percent: 20, direction: "down" });
    expect(trend(100, 100)).toEqual({ percent: 0, direction: "flat" });
    expect(trend(5, 0)).toBeNull();
    expect(trend(5, undefined)).toBeNull();
    expect(trendSpoken({ percent: 12, direction: "up" })).toBe("önceki 30 güne göre %12 arttı");
  });
});
