/** Shared copy builders reproduce the spec's strings exactly (§6.2, §9, §11). */
import { describe, expect, it } from "vitest";
import { askiCaption, askiCopy, cartCopy, elapsedChip, masaCopy, orderCopy, staffCopy, statusWords } from "../src/copy";

describe("status words (§11)", () => {
  it("match the table", () => {
    expect(statusWords).toEqual({
      submitted: "İletildi",
      accepted: "Hazırlanıyor",
      ready: "Hazır",
      collected: "Teslim edildi",
      rejected: "Kafe yetişemedi",
      cancelled: "İptal edildi",
      no_show: "Teslim alınmadı",
    });
  });
});

describe("askı caption (§6.2)", () => {
  const base = { itemsAvailable: 7, referenceItemName: "Çay", claimsPerDay: 1, claimedLast7Days: 12, donatedLast7DaysPeni: 235 };
  it("three lines", () => {
    expect(askiCaption(base)).toEqual({
      line1: "Askıda 7 çay bekliyor",
      line2: "İsteyen alır, günde bir tane.",
      line3: "Bu hafta 12 ikram içildi · 235 peni bırakıldı",
    });
  });
  it("empty pool, two per day", () => {
    const c = askiCaption({ ...base, itemsAvailable: 0, claimsPerDay: 2 });
    expect(c.line1).toBe("Askı şu an boş.");
    expect(c.line2).toBe("İsteyen alır, günde iki tane.");
  });
  it("hides the ikram count below 3 (D8) and a zero peni part", () => {
    expect(askiCaption({ ...base, claimedLast7Days: 2 }).line3).toBe("Bu hafta 235 peni bırakıldı");
    expect(askiCaption({ ...base, donatedLast7DaysPeni: 0 }).line3).toBe("Bu hafta 12 ikram içildi");
    expect(askiCaption({ ...base, claimedLast7Days: 2, donatedLast7DaysPeni: 0 }).line3).toBeNull();
  });
  it("keeps Türk capitalised", () => {
    expect(askiCaption({ ...base, referenceItemName: "Türk Kahvesi" }).line1).toBe("Askıda 7 Türk kahvesi bekliyor");
  });
  it("sheet and toast strings", () => {
    expect(askiCopy.cardLine(7, "Çay")).toBe("Askıda 7 çay");
    expect(askiCopy.cardLine(0, "Çay")).toBe("Askı boş");
    expect(askiCopy.giveSheet.chip("Çay", 30)).toBe("1 çay · 30 peni");
    expect(askiCopy.giveSheet.submitItem("Çay", 30)).toBe("1 çay bırak · 30 peni");
    expect(askiCopy.giveSheet.submitCustom(45)).toBe("45 peni bırak");
    expect(askiCopy.giveSheet.match(50)).toBe("Kafe her bağışa %50 ekliyor.");
    expect(askiCopy.hungToast(1, "Çay")).toBe("1 çay askıya asıldı.");
    expect(askiCopy.matchToast(15)).toBe("Kafe de 15 peni ekledi.");
    expect(askiCopy.takeStates.tooNew(3)).toBe("Askıdan almak için üyeliğinin 7 günlük olması gerekiyor. 3 gün kaldı.");
    expect(askiCopy.till.submit(2, "Çay", 60)).toBe("Askıya ekle · 2 çay (60 peni)");
    expect(askiCopy.till.toast(2, "Çay")).toBe("Askıya 2 çay eklendi.");
    expect(askiCopy.donorLine("Ayşe K.", "1 çay", "bugün")).toBe("Ayşe K. 1 çay bıraktı · bugün");
  });
});

describe("order fiş (§9.4)", () => {
  it("ready body, with and without payment", () => {
    expect(orderCopy.readyBody("P-003", 5500)).toBe("Kasada P-003 kodunu söyle, ₺55 öde.");
    expect(orderCopy.readyBody("P-003", 0)).toBe("Kasada P-003 kodunu söyle. Ödeme yok.");
    expect(orderCopy.readyTitle("P-003")).toBe("Hazır · P-003");
  });
  it("rejected and earned lines", () => {
    expect(orderCopy.rejectedPeniBack(90)).toBe("Kullandığın 90 penin cüzdanına döndü.");
    expect(orderCopy.rejectedAskiBack("Çay")).toBe("Askıdaki çay yerine döndü.");
    expect(orderCopy.earned(2)).toBe("+2 peni cüzdanında");
    expect(orderCopy.legend("Moda Kahvesi")).toBe("MODA KAHVESİ · SİPARİŞ");
    expect(orderCopy.chip("P-003", "accepted")).toBe("P-003 · Hazırlanıyor");
  });
});

describe("cart (§9.3)", () => {
  it("peni toggle, earn preview, submit", () => {
    expect(cartCopy.usePeni(55)).toBe("55 penini kullan");
    expect(cartCopy.usePeniCap(55)).toBe("Bu siparişte en fazla 55 peni kullanabilirsin.");
    expect(cartCopy.earnPreview(2)).toEqual({ before: "Kasada ödeyince ", amount: "+2 peni", after: " kazanırsın" });
    expect(cartCopy.submit(5500)).toBe("Siparişi gönder · ₺55");
    expect(cartCopy.submit(0)).toBe("Siparişi gönder");
    expect(cartCopy.itemCount(2)).toBe("2 ürün");
    expect(cartCopy.line(1, "Latte")).toBe("1 × Latte");
  });
});

describe("masa and staff", () => {
  it("seats text (§6.5)", () => {
    expect(masaCopy.seats(6, 14)).toBe("6/14 yer dolu");
    expect(masaCopy.seats(6, 14, true)).toBe("6/14 yer dolu · sen de geliyorsun");
    expect(masaCopy.seats(14, 14)).toBe("Masa doldu");
  });
  it("elapsed chips (§9.10)", () => {
    expect(elapsedChip(3)).toEqual({ label: "3 dk", icon: "Clock", tone: "neutral" });
    expect(elapsedChip(7)).toEqual({ label: "7 dk", icon: "Timer", tone: "warning" });
    expect(elapsedChip(12)).toEqual({ label: "12 dk · gecikiyor", icon: "AlarmClock", tone: "danger" });
  });
  it("staff strings", () => {
    expect(staffCopy.payment(5500)).toBe("Kasada ₺55");
    expect(staffCopy.payment(0)).toBe("Kasada ödeme yok");
    expect(staffCopy.newOrdersTitle(2)).toBe("(2) Yeni sipariş · Tezgâh");
    expect(staffCopy.pausedBanner(12)).toBe("Uygulama siparişleri durdu · 12 dk kaldı");
    expect(staffCopy.segment("Yeni", 2)).toBe("Yeni (2)");
    expect(staffCopy.report.askiInSplit(420, 210, 150)).toBe("üyeler 420 · kasa 210 · kafe 150");
  });
});
