import type { GiftDTO, LedgerEntryDTO } from "@peni/api";
import { describe, expect, it } from "vitest";
import {
  buildHistory,
  capReason,
  firstName,
  giftCaps,
  giftDeadline,
  giftedTodayPeni,
  giftInviteTitle,
  giftLegend,
  giftReturnNote,
  giftWhat,
  groupByDay,
  itemChipLabel,
  sentence,
  shortDisplayName,
  spokenGoods,
  whatsappText,
} from "./wallet-model";

const CAY = { name: "Çay", priceKurus: 3000 };
const TURK = { name: "Türk Kahvesi", priceKurus: 9000 };
// 16 Oct 2026, 14:00 in Istanbul (UTC+3).
const NOW = new Date("2026-10-16T11:00:00.000Z");

function gift(over: Partial<GiftDTO> = {}): GiftDTO {
  return {
    id: "g1",
    cafeSlug: "moda",
    cafeName: "Moda Kahvesi",
    peni: 30,
    message: null,
    status: "pending",
    fromName: "Ayşe Yılmaz",
    toName: "Mehmet Kaya",
    direction: "out",
    createdAt: "2026-10-16T09:00:00.000Z",
    expiresAt: "2026-10-17T09:00:00.000Z",
    canCancel: true,
    cancelledBySender: false,
    thankedAt: null,
    ...over,
  };
}

function entry(over: Partial<LedgerEntryDTO> = {}): LedgerEntryDTO {
  return {
    id: "l1",
    at: "2026-10-16T08:00:00.000Z",
    cafeSlug: "moda",
    cafeName: "Moda Kahvesi",
    kind: "earn",
    peni: 6,
    orderId: "ord_3",
    orderNumber: "P-003",
    giftId: null,
    counterpartName: null,
    ...over,
  };
}

describe("names and goods", () => {
  it("takes the first name and a short name", () => {
    expect(firstName("Ayşe Yılmaz")).toBe("Ayşe");
    expect(shortDisplayName("Mehmet Kaya")).toBe("Mehmet K.");
    expect(shortDisplayName("İrem Güneş")).toBe("İrem G.");
  });

  it("reads exact amounts as goods and never rounds", () => {
    expect(giftWhat(30, [CAY, TURK])).toBe("1\u00A0çay");
    expect(giftWhat(90, [CAY, TURK])).toBe("3\u00A0çay");
    expect(giftWhat(45, [CAY, TURK])).toBe("45\u00A0peni");
    expect(giftWhat(30, [])).toBe("30\u00A0peni");
  });

  it("says goods as words in the WhatsApp line", () => {
    expect(spokenGoods("1\u00A0çay")).toBe("bir çay");
    expect(spokenGoods("45\u00A0peni")).toBe("45 peni");
    expect(whatsappText("1\u00A0çay", "Moda Kahvesi", "https://peni.test/hediye/g1")).toBe(
      "Sana Peni'de bir çay ısmarladım (Moda Kahvesi). 24 saat içinde kabul et: https://peni.test/hediye/g1",
    );
  });

  it("labels the choice chips", () => {
    expect(itemChipLabel(CAY)).toBe("1 çay · 30 peni");
    expect(itemChipLabel(TURK)).toBe("1 Türk kahvesi · 90 peni");
  });
});

describe("gift copy", () => {
  it("writes the invite", () => {
    expect(giftLegend("Moda Kahvesi")).toBe("ISMARLAMA · MODA KAHVESİ");
    expect(giftInviteTitle(gift({ direction: "in" }), [CAY])).toBe("Ayşe sana 1\u00A0çay ısmarladı");
    // 17 Oct 11:30 UTC = 14:30 in Istanbul.
    expect(giftDeadline("2026-10-17T11:30:00.000Z", NOW)).toBe("Yarın 14:30'a kadar kabul edebilirsin.");
    expect(giftReturnNote("2026-10-17T11:30:00.000Z", NOW)).toBe("Kabul edilmezse peni yarın 14:30'da sana döner.");
  });
});

describe("caps", () => {
  it("counts today's gifts at one café only", () => {
    const ledger = [
      entry({ id: "a", kind: "gift_out", peni: -45, at: "2026-10-16T06:00:00.000Z" }),
      entry({ id: "b", kind: "gift_out", peni: -30, at: "2026-10-15T06:00:00.000Z" }),
      entry({ id: "c", kind: "gift_out", peni: -20, cafeSlug: "kuzguncuk", at: "2026-10-16T07:00:00.000Z" }),
    ];
    expect(giftedTodayPeni(ledger, "moda", NOW)).toBe(45);
  });

  it("gives the binding cap and its reason", () => {
    const byBalance = giftCaps(25, 0);
    expect(byBalance).toMatchObject({ max: 25, binding: "balance" });
    expect(capReason(30, byBalance)).toBe("Bakiyen 25");
    const byDay = giftCaps(500, 180);
    expect(byDay).toMatchObject({ max: 20, binding: "daily" });
    expect(capReason(30, byDay)).toBe("Günlük sınır 200 peni");
    expect(capReason(20, byDay)).toBeNull();
  });
});

describe("HAREKETLER", () => {
  it("folds a gift's ledger lines into one line with its state", () => {
    const wallet = {
      gifts: [
        gift({ id: "out1", status: "pending" }),
        gift({ id: "out2", status: "expired", canCancel: false, createdAt: "2026-10-14T07:00:00.000Z" }),
        gift({ id: "in1", direction: "in", status: "pending", fromName: "Mehmet Kaya" }),
        gift({ id: "in2", direction: "in", status: "accepted", fromName: "Nermin Arıkan", thankedAt: "2026-10-12T10:00:00.000Z" }),
      ],
      ledger: [
        entry({ id: "s1", kind: "gift_out", peni: -30, giftId: "out1", orderId: null, orderNumber: null }),
        entry({ id: "r2", kind: "gift_return", peni: 30, giftId: "out2", orderId: null, orderNumber: null }),
        entry({ id: "i2", kind: "gift_in", peni: 30, giftId: "in2", at: "2026-10-12T09:00:00.000Z", orderId: null, orderNumber: null }),
        entry({ id: "e1" }),
        entry({ id: "w1", kind: "earn", peni: 13, orderId: null, orderNumber: null }),
        entry({ id: "d1", kind: "redeem", peni: -90 }),
        entry({ id: "k1", kind: "askida_donate", peni: -30, orderId: null, orderNumber: null }),
        entry({ id: "f1", kind: "refund", peni: 7, orderNumber: "P-010" }),
      ],
    };
    const items = buildHistory(wallet);
    const lines = items.map((i) => `${sentence(i.pieces)}${i.chip ? ` [${i.chip.label}]` : ""}`);
    expect(lines).toContain("Mehmet'e 30 peni ısmarladın [bekliyor]");
    expect(lines).toContain("Mehmet'e 30 peni ısmarladın [sana döndü]");
    expect(lines).toContain("Nermin sana 30 peni ısmarladı [kabul ettin]");
    expect(lines).toContain("Sipariş P-003 · +6 peni");
    expect(lines).toContain("Kasada alışveriş · +13 peni");
    expect(lines).toContain("Siparişte 90 peni kullandın");
    expect(lines).toContain("Askıya 30 peni bıraktın");
    expect(lines).toContain("Sipariş P-010 · 7 penin döndü");
    // Pending incoming gifts are fişes at the top, not history; folded ledger lines are gone.
    expect(items.some((i) => i.id === "gift:in1")).toBe(false);
    expect(items.filter((i) => i.id.startsWith("ledger:")).map((i) => i.id)).not.toContain("ledger:s1");
    expect(items.find((i) => i.id === "gift:out1")?.cancelGiftId).toBe("out1");
    expect(items.find((i) => i.id === "gift:in2")).toMatchObject({ at: "2026-10-12T09:00:00.000Z", note: "Teşekkür ettin." });
  });

  it("marks a gift the sender took back", () => {
    const [item] = buildHistory({ gifts: [gift({ status: "declined", cancelledBySender: true, canCancel: false })], ledger: [] });
    expect(item?.chip?.label).toBe("geri aldın");
  });

  it("groups by day, newest first", () => {
    const items = buildHistory({
      gifts: [],
      ledger: [
        entry({ id: "a", at: "2026-10-16T08:00:00.000Z" }),
        entry({ id: "b", at: "2026-10-15T08:00:00.000Z" }),
        entry({ id: "c", at: "2026-10-16T09:00:00.000Z" }),
      ],
    });
    const days = groupByDay(items, NOW);
    expect(days.map((d) => d.label)).toEqual(["Bugün", "Dün"]);
    expect(days[0]?.items.map((i) => i.id)).toEqual(["ledger:c", "ledger:a"]);
  });
});
