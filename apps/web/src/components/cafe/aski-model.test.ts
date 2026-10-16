import type { AskidaDTO, CafeDetailDTO, MenuItemDTO } from "@peni/api";
import { describe, expect, it } from "vitest";
import { afterDonation, donationToast, donationWhat, donorLines, takeState, takeStateText } from "./aski-model";

const item = (productId: string, name: string, priceKurus: number): MenuItemDTO => ({
  productId,
  name,
  category: "Sıcak",
  priceKurus,
  available: true,
  description: null,
  askida: true,
});
const CAY = item("cay", "Çay", 3_000);
const FILTRE = item("filtre", "Filtre Kahve", 8_500);
const SIMIT = item("simit", "Simit", 2_500);
const LATTE = { ...item("latte", "Latte", 12_000), askida: false };

const askida = (over: Partial<AskidaDTO> = {}): AskidaDTO => ({
  enabled: true,
  balancePeni: 217,
  itemsAvailable: 7,
  referenceItemName: "Çay",
  claimedLast7Days: 5,
  donatedLast7DaysPeni: 277,
  claimsPerDay: 1,
  wall: [],
  myEligibility: { status: "ok" },
  matchPercent: 50,
  ...over,
});
const cafe = (a: AskidaDTO): Pick<CafeDetailDTO, "menu" | "askida"> => ({ menu: [CAY, LATTE, FILTRE, SIMIT], askida: a });

const NOW = new Date("2026-10-16T12:00:00+03:00");

describe("donor lines (§9.3, §17)", () => {
  it("lists only named member donations, newest first, at most three", () => {
    const lines = donorLines(
      cafe(
        askida({
          wall: [
            { type: "donation", at: "2026-10-12T15:30:00Z", peni: 30, donorName: "Zeynep D." },
            { type: "till_donation", at: "2026-10-16T08:00:00Z", peni: 60 },
            { type: "cafe_match", at: "2026-10-16T07:00:00Z", peni: 15 },
            { type: "donation", at: "2026-10-16T07:00:00Z", peni: 30, donorName: null },
            { type: "claim", at: "2026-10-16T06:00:00Z", itemName: "Çay" },
            { type: "donation", at: "2026-10-15T14:45:00Z", peni: 25, donorName: "İrem G." },
            { type: "donation", at: "2026-10-16T06:30:00Z", peni: 60, donorName: "Ayşe K." },
            { type: "donation", at: "2026-10-01T06:30:00Z", peni: 85, donorName: "Can B." },
          ],
        }),
      ),
      NOW,
    );
    expect(lines.map((l) => `${l.name} ${l.what} · ${l.day}`)).toEqual([
      "Ayşe K. 2 çay · bugün",
      "İrem G. 1 simit · dün",
      "Zeynep D. 1 çay · Pazartesi",
    ]);
  });

  it("reads a donation as whole goods, never a fraction", () => {
    expect(donationWhat(30, [CAY, FILTRE, SIMIT], CAY)).toBe("1 çay");
    expect(donationWhat(85, [CAY, FILTRE, SIMIT], CAY)).toBe("1 filtre kahve");
    expect(donationWhat(50, [CAY, FILTRE, SIMIT], CAY)).toBe("2 simit");
    expect(donationWhat(45, [CAY, FILTRE, SIMIT], CAY)).toBe("45 peni");
  });
});

describe("take states [G3]", () => {
  const base = { member: true, orderingBlocked: null, coverable: 3 } as const;
  it("puts personal reasons first, then the pool, then ordering", () => {
    expect(takeState({ ...base, askida: askida() })).toEqual({ kind: "ok" });
    expect(takeState({ ...base, member: false, askida: askida() }).kind).toBe("non_member");
    expect(takeState({ ...base, askida: askida({ myEligibility: { status: "blocked" } }) }).kind).toBe("blocked");
    expect(takeState({ ...base, coverable: 0, askida: askida({ myEligibility: { status: "claimed_today" } }) }).kind).toBe("claimed_today");
    expect(takeState({ ...base, askida: askida({ myEligibility: { status: "too_new", daysLeft: 3 } }) })).toEqual({ kind: "too_new", daysLeft: 3 });
    expect(takeState({ ...base, coverable: 0, orderingBlocked: "closed", askida: askida() }).kind).toBe("empty");
    expect(takeState({ ...base, orderingBlocked: "closed", askida: askida() }).kind).toBe("ordering_blocked");
    expect(takeState({ ...base, orderingBlocked: "preorder_off", askida: askida() }).kind).toBe("blocked");
  });

  it("says each state in the spec's words", () => {
    expect(takeStateText({ kind: "claimed_today" })).toBe("Bugünkü ikramını aldın. Yarın yine gel.");
    expect(takeStateText({ kind: "too_new", daysLeft: 3 })).toBe("Askıdan almak için üyeliğinin 7 günlük olması gerekiyor. 3 gün kaldı.");
    expect(takeStateText({ kind: "empty" })).toBe("Askı şu an boş. Biri bıraktığında burada görünür.");
  });
});

describe("A8 after one's own donation", () => {
  it("counts the donor's own whole items and a match that completes one more", () => {
    // 217 peni = 7 çay. +30 → 247 = 8 (one is mine); +15 match → 262, still 8.
    expect(afterDonation(askida(), CAY, { peni: 30, matchedPeni: 15 })).toEqual({ itemsAvailable: 8, balancePeni: 262, own: 1, match: false });
    // 205 = 6 çay. +25 → 230 = 7 (mine); +12 → 242 = 8: the match hangs one more.
    expect(afterDonation(askida({ balancePeni: 205, itemsAvailable: 6 }), CAY, { peni: 25, matchedPeni: 12 })).toMatchObject({ own: 1, match: true, itemsAvailable: 8 });
    // 15 peni completes nothing: nothing hangs (D9).
    expect(afterDonation(askida({ balancePeni: 210 }), CAY, { peni: 15, matchedPeni: 0 })).toMatchObject({ own: 0, match: false });
    expect(afterDonation(askida(), null, { peni: 30, matchedPeni: 0 })).toBeNull();
  });

  it("toasts the item, or the peni for a custom amount, with the match as its second line", () => {
    expect(donationToast({ peni: 30, matchedPeni: 15, item: CAY })).toEqual({ title: "1 çay askıya asıldı.", description: "Kafe de 15 peni ekledi." });
    expect(donationToast({ peni: 45, matchedPeni: 0, item: null })).toEqual({ title: "45 peni askıya bırakıldı." });
  });
});
