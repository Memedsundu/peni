/** §4.6 and §12.1: every example in the spec, plus the full suffix tables. */
import { describe, expect, it } from "vitest";
import {
  capitalizeTr,
  coinInitials,
  coinLegend,
  dateBlock,
  dateline,
  dativeName,
  dativeTime,
  djb2,
  earnPreview,
  formatLongDate,
  formatNumber,
  formatPercent,
  formatPeni,
  formatPhone,
  formatTime,
  formatTL,
  goods,
  goodsLine,
  goodsName,
  greeting,
  initials,
  locativeTime,
  MINUS,
  numberWord,
  relDay,
  trLower,
  trUpper,
  usablePeni,
} from "../src/format";

describe("trUpper / trLower", () => {
  it('trUpper("sipariş ışık") === "SİPARİŞ IŞIK"', () => {
    expect(trUpper("sipariş ışık")).toBe("SİPARİŞ IŞIK");
  });
  it("keeps the Turkish i on every legend in the spec", () => {
    expect(trUpper("Peni masası")).toBe("PENİ MASASI");
    expect(trUpper("Günün sorusu")).toBe("GÜNÜN SORUSU");
    expect(trUpper("yiyecek")).toBe("YİYECEK");
    expect(trUpper("Kadıköy")).toBe("KADIKÖY");
    expect(trUpper("Moda Kahvesi")).toBe("MODA KAHVESİ");
    expect(trUpper("Jeton kesesi")).toBe("JETON KESESİ");
  });
  it("lower-cases the dotted and dotless I correctly", () => {
    expect(trLower("IŞIK İÇİN")).toBe("ışık için");
    expect(trLower("Çay")).toBe("çay");
  });
  it("capitalizeTr upper-cases only the first letter", () => {
    expect(capitalizeTr("yarın 14:30'a kadar")).toBe("Yarın 14:30'a kadar");
    expect(capitalizeTr("ısmarla")).toBe("Ismarla");
    expect(capitalizeTr("iyi günler")).toBe("İyi günler");
    expect(capitalizeTr("")).toBe("");
  });
});

describe("formatTL", () => {
  it('formatTL(12000) === "₺120"', () => expect(formatTL(12000)).toBe("₺120"));
  it('formatTL(3050) === "₺30,50"', () => expect(formatTL(3050)).toBe("₺30,50"));
  it("whole lira drop the kuruş, others keep two digits", () => {
    expect(formatTL(5500)).toBe("₺55");
    expect(formatTL(2501)).toBe("₺25,01");
    expect(formatTL(0)).toBe("₺0");
    expect(formatTL(123456)).toBe("₺1.234,56");
    expect(formatTL(100000)).toBe("₺1.000");
  });
  it("negative amounts use a true minus (U+2212), never a hyphen", () => {
    expect(MINUS).toBe("−");
    expect(formatTL(-3000)).toBe("−₺30");
    expect(formatTL(-9050)).toBe("−₺90,50");
    expect(formatTL(-3000)).not.toContain("-");
    expect(formatTL(-0)).toBe("₺0");
  });
});

describe("numbers", () => {
  it('formatPeni(1240) === "1.240 peni"', () => expect(formatPeni(1240)).toBe("1.240 peni"));
  it("formatPeni signs", () => {
    expect(formatPeni(90)).toBe("90 peni");
    expect(formatPeni(2, { signed: true })).toBe("+2 peni");
    expect(formatPeni(-90)).toBe("−90 peni");
    expect(formatPeni(0, { signed: true })).toBe("0 peni");
  });
  it("formatNumber, formatPercent, numberWord", () => {
    expect(formatNumber(1240)).toBe("1.240");
    expect(formatNumber(869)).toBe("869");
    expect(formatPercent(5)).toBe("%5");
    expect(formatPercent(50)).toBe("%50");
    expect(numberWord(1)).toBe("bir");
    expect(numberWord(2)).toBe("iki");
    expect(numberWord(12)).toBe("12");
  });
  it("formatPhone", () => {
    expect(formatPhone("+905321234567")).toBe("+90 532 123 45 67");
    expect(formatPhone("5321234567")).toBe("+90 532 123 45 67");
    expect(formatPhone("05321234567")).toBe("+90 532 123 45 67");
    expect(formatPhone("123")).toBe("123");
  });
});

describe("goods", () => {
  const ref = [
    { name: "Türk Kahvesi", priceKurus: 9000 },
    { name: "Çay", priceKurus: 3000 },
  ];
  it('"Sende 90 peni · ≈ 3 çay": the cheapest reference item, lower-cased', () => {
    expect(goods(90, ref)).toBe("3 çay");
  });
  it('the two-item line: "3 çay · 1 Türk kahvesi"', () => {
    expect(goodsLine(90, ref)).toBe("3 çay · 1 Türk kahvesi");
  });
  it("the second item appears only when it buys one", () => {
    expect(goodsLine(60, ref)).toBe("2 çay");
  });
  it("only whole items; null when n < 1", () => {
    expect(goods(29, ref)).toBeNull();
    expect(goodsLine(29, ref)).toBeNull();
    expect(goods(59, ref)).toBe("1 çay");
    expect(goods(0, ref)).toBeNull();
    expect(goods(90, [])).toBeNull();
    expect(goods(90, null)).toBeNull();
  });
  it("prices round up to whole peni: n = floor(peni / ceil(priceKurus/100))", () => {
    expect(goods(62, [{ name: "Simit", priceKurus: 3050 }])).toBe("2 simit");
    expect(goods(61, [{ name: "Simit", priceKurus: 3050 }])).toBe("1 simit");
  });
  it("goodsName keeps proper adjectives", () => {
    expect(goodsName("Çay")).toBe("çay");
    expect(goodsName("Türk Kahvesi")).toBe("Türk kahvesi");
    expect(goodsName("Filtre Kahve")).toBe("filtre kahve");
    expect(goodsName("Peynirli Poğaça")).toBe("peynirli poğaça");
    expect(goodsName("Rize Çayı")).toBe("Rize çayı");
  });
});

describe("dativeName", () => {
  it.each([
    ["Mehmet", "Mehmet'e"],
    ["Ayşe", "Ayşe'ye"],
    ["Can", "Can'a"],
    ["Öykü", "Öykü'ye"],
    ["Ali", "Ali'ye"],
    ["Deniz", "Deniz'e"],
    ["Ufuk", "Ufuk'a"],
    ["Zeynep", "Zeynep'e"],
    ["Okan", "Okan'a"],
    ["Burcu", "Burcu'ya"],
    ["Kemal", "Kemal'e"],
  ])("%s → %s", (name, expected) => {
    expect(dativeName(name)).toBe(expected);
  });
});

describe("dativeTime", () => {
  it.each([
    ["14:30", "14:30'a"],
    ["18:00", "18:00'e"],
    ["12:00", "12:00'ye"],
    ["16:00", "16:00'ya"],
    ["10:00", "10:00'a"],
  ])("§4.6 example %s → %s", (t, expected) => expect(dativeTime(t)).toBe(expected));

  const units: Record<number, string> = { 1: "e", 2: "ye", 3: "e", 4: "e", 5: "e", 6: "ya", 7: "ye", 8: "e", 9: "a" };
  const tens: Record<number, string> = { 10: "a", 20: "ye", 30: "a", 40: "a", 50: "ye" };
  it.each(Object.entries(units))("unit %s (minutes and hours)", (u, suffix) => {
    expect(dativeTime(`14:0${u}`)).toBe(`14:0${u}'${suffix}`);
    expect(dativeTime(`0${u}:00`)).toBe(`0${u}:00'${suffix}`);
    expect(dativeTime(`1${u}:00`)).toBe(`1${u}:00'${suffix}`);
  });
  it.each(Object.entries(tens))("tens %s", (t, suffix) => {
    expect(dativeTime(`09:${t}`)).toBe(`09:${t}'${suffix}`);
  });
  it("hours on the tens: 10:00, 20:00; and zero", () => {
    expect(dativeTime("20:00")).toBe("20:00'ye");
    expect(dativeTime("00:00")).toBe("00:00'a");
  });
  it("the last spoken number wins: minutes when non-zero", () => {
    expect(dativeTime("16:05")).toBe("16:05'e");
    expect(dativeTime("12:40")).toBe("12:40'a");
  });
  it("formats a Date in Istanbul time first", () => {
    expect(dativeTime(new Date("2026-10-16T11:30:00Z"))).toBe("14:30'a");
  });
});

describe("locativeTime", () => {
  it.each([
    ["14:30", "14:30'da"],
    ["15:00", "15:00'te"],
    ["13:00", "13:00'te"],
    ["14:00", "14:00'te"],
    ["18:00", "18:00'de"],
    ["16:00", "16:00'da"],
    ["09:40", "09:40'ta"],
  ])("§4.6 example %s → %s", (t, expected) => expect(locativeTime(t)).toBe(expected));

  const units: Record<number, string> = { 1: "de", 2: "de", 3: "te", 4: "te", 5: "te", 6: "da", 7: "de", 8: "de", 9: "da" };
  const tens: Record<number, string> = { 10: "da", 20: "de", 30: "da", 40: "ta", 50: "de" };
  it.each(Object.entries(units))("unit %s (minutes and hours)", (u, suffix) => {
    expect(locativeTime(`14:0${u}`)).toBe(`14:0${u}'${suffix}`);
    expect(locativeTime(`0${u}:00`)).toBe(`0${u}:00'${suffix}`);
  });
  it.each(Object.entries(tens))("tens %s", (t, suffix) => {
    expect(locativeTime(`09:${t}`)).toBe(`09:${t}'${suffix}`);
  });
  it("hours on the tens and zero", () => {
    expect(locativeTime("10:00")).toBe("10:00'da");
    expect(locativeTime("20:00")).toBe("20:00'de");
    expect(locativeTime("00:00")).toBe("00:00'da");
  });
  it('"Kabul edilmezse peni yarın 14:30\'da sana döner."', () => {
    const at = new Date("2026-10-17T11:30:00Z");
    const now = new Date("2026-10-16T11:30:00Z");
    expect(`Kabul edilmezse peni ${relDay(at, now)} ${locativeTime(at)} sana döner.`).toBe(
      "Kabul edilmezse peni yarın 14:30'da sana döner.",
    );
  });
});

describe("relDay", () => {
  const now = new Date("2026-10-16T09:00:00Z"); // Friday 12:00 in Istanbul
  it("bugün, dün, yarın", () => {
    expect(relDay("2026-10-16T05:00:00Z", now)).toBe("bugün");
    expect(relDay("2026-10-15T10:00:00Z", now)).toBe("dün");
    expect(relDay("2026-10-17T10:00:00Z", now)).toBe("yarın");
  });
  it("a weekday name within 7 days", () => {
    expect(relDay("2026-10-12T10:00:00Z", now)).toBe("Pazartesi");
    expect(relDay("2026-10-10T10:00:00Z", now)).toBe("Cumartesi");
    expect(relDay("2026-10-21T10:00:00Z", now)).toBe("Çarşamba");
  });
  it('otherwise "12 Eki"', () => {
    expect(relDay("2026-10-09T10:00:00Z", now)).toBe("9 Eki");
    expect(relDay("2026-09-12T10:00:00Z", now)).toBe("12 Eyl");
    expect(relDay("2025-10-12T10:00:00Z", now)).toBe("12 Eki 2025");
  });
  it("counts days in Istanbul, not UTC", () => {
    // 22:30 UTC on the 15th is 01:30 on the 16th in Istanbul.
    expect(relDay("2026-10-15T22:30:00Z", now)).toBe("bugün");
  });
  it('builds "Yarın 14:30\'a kadar kabul edebilirsin."', () => {
    const expires = new Date("2026-10-17T11:30:00Z");
    expect(`${capitalizeTr(relDay(expires, now))} ${dativeTime(expires)} kadar kabul edebilirsin.`).toBe(
      "Yarın 14:30'a kadar kabul edebilirsin.",
    );
  });
});

describe("dates", () => {
  it("formatTime and formatLongDate", () => {
    expect(formatTime("2026-10-16T16:00:00Z")).toBe("19:00");
    expect(formatTime("2026-10-16T06:05:00Z")).toBe("09:05");
    expect(formatLongDate("2026-10-16T09:00:00Z")).toBe("16 Ekim 2026");
  });
  it('dateBlock: "PER" / "22" / "EKİ"', () => {
    expect(dateBlock("2026-10-22T16:00:00Z")).toEqual({ weekday: "PER", day: "22", month: "EKİ", short: "22 Eki Per" });
  });
  it("dateline", () => {
    const date = new Date("2026-10-16T09:00:00Z");
    expect(dateline({ name: "Moda Kahvesi", district: "Kadıköy" }, date)).toBe("MODA KAHVESİ GAZETESİ · 16 EKİM 2026 · KADIKÖY");
    expect(dateline({ name: "Moda Kahvesi", district: "Kadıköy" }, date, { compact: true })).toBe(
      "MODA KAHVESİ GAZETESİ · 16 EKİM 2026",
    );
    expect(dateline({ name: "Moda Kahvesi", district: null }, date)).toBe("MODA KAHVESİ GAZETESİ · 16 EKİM 2026");
  });
});

describe("greeting", () => {
  it.each([
    ["2026-10-16T02:00:00Z", "Günaydın"], // 05:00
    ["2026-10-16T07:59:00Z", "Günaydın"], // 10:59
    ["2026-10-16T08:00:00Z", "İyi günler"], // 11:00
    ["2026-10-16T13:59:00Z", "İyi günler"], // 16:59
    ["2026-10-16T14:00:00Z", "İyi akşamlar"], // 17:00
    ["2026-10-16T18:59:00Z", "İyi akşamlar"], // 21:59
    ["2026-10-16T19:00:00Z", "İyi geceler"], // 22:00
    ["2026-10-16T01:59:00Z", "İyi geceler"], // 04:59
  ])("%s → %s", (iso, expected) => expect(greeting(new Date(iso))).toBe(expected));
});

describe("initials and the coin", () => {
  it("initials: up to 2 letters, trUpper", () => {
    expect(initials("Ayşe Kaya")).toBe("AK");
    expect(initials("Veysel Sundu")).toBe("VS");
    expect(initials("ismail")).toBe("İ");
    expect(initials("Ayşe K.")).toBe("AK");
    expect(initials("ılgaz su ışık")).toBe("II");
    expect(initials("")).toBe("");
    expect(initials(null)).toBe("");
  });
  it('coinInitials: "M" over "K · İ"', () => {
    expect(coinInitials({ name: "Moda Kahvesi", district: "Kadıköy", city: "İstanbul" })).toEqual({ top: "M", bottom: "K · İ" });
    expect(coinInitials({ name: "Moda Kahvesi", district: "Kadıköy", city: null })).toEqual({ top: "M", bottom: null });
    expect(coinInitials({ name: "ılık", district: "üsküdar", city: "istanbul" })).toEqual({ top: "I", bottom: "Ü · İ" });
  });
  it('coinLegend: "MODA KAHVESİ · KADIKÖY", name only over 30, then "…"', () => {
    expect(coinLegend("Moda Kahvesi", "Kadıköy")).toBe("MODA KAHVESİ · KADIKÖY");
    expect(coinLegend("Kuzguncuk Kıraathanesi", "Üsküdar")).toBe("KUZGUNCUK KIRAATHANESİ");
    const long = coinLegend("Büyük Mahalle Kıraathanesi ve Kitabevi", "Beşiktaş");
    expect([...long].length).toBeLessThanOrEqual(30);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("djb2", () => {
  it("is the djb2 hash over code points", () => {
    expect(djb2("")).toBe(5381);
    expect(djb2("a")).toBe((5381 * 33 + 97) >>> 0);
  });
});

describe("peni arithmetic", () => {
  it("earnPreview(5500, 5) === 2", () => expect(earnPreview(5500, 5)).toBe(2));
  it("earnPreview floors and never goes negative", () => {
    expect(earnPreview(12000, 5)).toBe(6);
    expect(earnPreview(1900, 5)).toBe(0);
    expect(earnPreview(0, 5)).toBe(0);
  });
  it('usablePeni caps by share: "Bu siparişte en fazla 55 peni kullanabilirsin."', () => {
    expect(usablePeni({ balance: 90, subtotalKurus: 11000, askidaKurus: 0, maxRedeemSharePercent: 50 })).toBe(55);
  });
  it("usablePeni caps by balance, by the askı-reduced subtotal, and by the due amount", () => {
    expect(usablePeni({ balance: 30, subtotalKurus: 11000, askidaKurus: 0, maxRedeemSharePercent: 50 })).toBe(30);
    expect(usablePeni({ balance: 500, subtotalKurus: 15000, askidaKurus: 3000, maxRedeemSharePercent: 50 })).toBe(60);
    expect(usablePeni({ balance: 500, subtotalKurus: 15000, askidaKurus: 3000, maxRedeemSharePercent: 100 })).toBe(120);
    expect(usablePeni({ balance: 500, subtotalKurus: 15050, askidaKurus: 0, maxRedeemSharePercent: 100 })).toBe(150);
    expect(usablePeni({ balance: 0, subtotalKurus: 15000, askidaKurus: 0, maxRedeemSharePercent: 100 })).toBe(0);
    expect(usablePeni({ balance: 50, subtotalKurus: 3000, askidaKurus: 3000, maxRedeemSharePercent: 100 })).toBe(0);
  });
});
