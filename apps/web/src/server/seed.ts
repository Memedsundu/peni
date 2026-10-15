import { defaultSettings } from "@peni/core";
import type { PeniApp, PostRecord } from "./app";

export const DEMO_CUSTOMERS = {
  ayse: { id: "cus_ayse", phone: "+905320000001", displayName: "Ayşe Yılmaz" },
  mehmet: { id: "cus_mehmet", phone: "+905320000002", displayName: "Mehmet Kaya" },
  deniz: { id: "cus_deniz", phone: "+905320000003", displayName: "Deniz Arslan" },
} as const;

/** Demo data: two cafés, three neighbours, a few weeks of history. */
export async function seed(app: PeniApp): Promise<void> {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  app.cafes.set("cafe_moda", {
    id: "cafe_moda",
    slug: "moda",
    name: "Moda Kahvesi",
    address: "Moda Cd. No: 42",
    district: "Kadıköy",
    city: "İstanbul",
    coverImageUrl: null,
    posKind: "standalone",
    appOrderingPaused: false,
  });
  app.cafes.set("cafe_kuzguncuk", {
    id: "cafe_kuzguncuk",
    slug: "kuzguncuk",
    name: "Kuzguncuk Kıraathanesi",
    address: "İcadiye Cd. No: 7",
    district: "Üsküdar",
    city: "İstanbul",
    coverImageUrl: null,
    posKind: "standalone",
    appOrderingPaused: false,
  });

  app.pos.setMenu("cafe_moda", [
    { productId: "cay", name: "Çay", category: "Sıcak", priceKurus: 3_000, available: true, description: "İnce belli bardakta" },
    { productId: "turk", name: "Türk Kahvesi", category: "Sıcak", priceKurus: 9_000, available: true, description: "Yanında lokum" },
    { productId: "filtre", name: "Filtre Kahve", category: "Sıcak", priceKurus: 8_500, available: true, description: null },
    { productId: "latte", name: "Latte", category: "Sıcak", priceKurus: 12_000, available: true, description: null },
    { productId: "limonata", name: "Ev Limonatası", category: "Soğuk", priceKurus: 11_000, available: true, description: null },
    { productId: "simit", name: "Simit", category: "Yiyecek", priceKurus: 2_500, available: true, description: null },
    { productId: "cheesecake", name: "San Sebastian", category: "Tatlı", priceKurus: 18_000, available: true, description: null },
  ]);
  app.pos.setMenu("cafe_kuzguncuk", [
    { productId: "cay", name: "Çay", category: "Sıcak", priceKurus: 2_500, available: true, description: null },
    { productId: "turk", name: "Türk Kahvesi", category: "Sıcak", priceKurus: 8_000, available: true, description: null },
    { productId: "sahlep", name: "Salep", category: "Sıcak", priceKurus: 10_000, available: true, description: null },
    { productId: "pogaca", name: "Peynirli Poğaça", category: "Yiyecek", priceKurus: 4_000, available: true, description: null },
  ]);

  app.directory.settings.set("cafe_moda", {
    ...defaultSettings("cafe_moda"),
    earnRateBps: 500,
    askidaProductIds: ["cay", "filtre", "simit"],
    askidaMatchBps: 5_000,
    askidaMatchMonthlyCapPeni: 500,
  });
  app.directory.settings.set("cafe_kuzguncuk", {
    ...defaultSettings("cafe_kuzguncuk"),
    earnRateBps: 700,
    askidaProductIds: ["cay", "pogaca"],
  });

  for (const c of Object.values(DEMO_CUSTOMERS)) {
    app.customers.set(c.id, { ...c, avatarUrl: null, profileVisible: c.id !== "cus_deniz" });
  }

  const ayseModa = await app.ensureMembership("cus_ayse", "cafe_moda", daysAgo(40));
  const mehmetModa = await app.ensureMembership("cus_mehmet", "cafe_moda", daysAgo(20));
  await app.ensureMembership("cus_deniz", "cafe_moda", daysAgo(3));
  await app.ensureMembership("cus_ayse", "cafe_kuzguncuk", daysAgo(10));

  // History: paid orders earn peni.
  for (const [i, kurus] of [120_000, 86_000, 64_000, 210_000].entries()) {
    await app.peni.earnForPaidOrder({ membershipId: ayseModa, orderId: `seed_ayse_${i}`, paidTotalKurus: kurus });
  }
  await app.peni.earnForPaidOrder({ membershipId: mehmetModa, orderId: "seed_mehmet_0", paidTotalKurus: 90_000 });

  // The askı: Ayşe leaves two teas under her name, a guest paid for filter coffee at the till.
  await app.peni.donateToAskida({ membershipId: ayseModa, peni: 60, showName: true, idempotencyKey: "seed_d1" });
  await app.peni.recordTillDonation({ cafeId: "cafe_moda", peni: 85, staffUserId: "staff_seed", idempotencyKey: "seed_t1" });

  const post = (p: Omit<PostRecord, "reactions" | "rsvps" | "comments">, extra?: Partial<PostRecord>): void => {
    app.posts.set(p.id, { ...p, reactions: new Set(), rsvps: new Set(), comments: [], ...extra });
  };
  const nextThursday = new Date();
  nextThursday.setDate(nextThursday.getDate() + ((4 - nextThursday.getDay() + 7) % 7 || 7));
  nextThursday.setHours(19, 0, 0, 0);

  post(
    {
      id: "post_event_1",
      cafeId: "cafe_moda",
      kind: "event",
      body: "Peni masası · Perşembe 19:00\nKonu: Mahalleye bir takas kütüphanesi kursak?\nBüyük masada buluşuyoruz. Herkes davetli, fikri olan da olmayan da.",
      publishedAt: daysAgo(1),
      pinned: true,
      eventStartsAt: nextThursday,
      eventCapacity: 14,
    },
    { rsvps: new Set(["cus_ayse"]) },
  );
  post(
    {
      id: "post_question_1",
      cafeId: "cafe_moda",
      kind: "question",
      body: "Günün sorusu: Moda'da en sevdiğin, kimsenin bilmediği köşe neresi?",
      publishedAt: daysAgo(0.2),
      pinned: false,
      eventStartsAt: null,
      eventCapacity: null,
    },
    {
      reactions: new Set(["cus_mehmet"]),
      comments: [
        { id: "cmt_1", customerId: "cus_mehmet", body: "Yel değirmeni parkının arkasındaki bank. Gün batımı başka.", createdAt: daysAgo(0.1) },
      ],
    },
  );
  post({
    id: "post_1",
    cafeId: "cafe_moda",
    kind: "post",
    body: "Yeni hasat Etiyopya Yirgacheffe geldi. Bu hafta filtre kahve onunla demleniyor.",
    publishedAt: daysAgo(2),
    pinned: false,
    eventStartsAt: null,
    eventCapacity: null,
  });
  post({
    id: "post_k1",
    cafeId: "cafe_kuzguncuk",
    kind: "event",
    body: "Peni sohbeti · Cumartesi 11:00\nEmekli tarih öğretmenimiz Nermin Hanım anlatıyor: Kuzguncuk'un bostanları.",
    publishedAt: daysAgo(3),
    pinned: true,
    eventStartsAt: new Date(Date.now() + 3 * 86_400_000),
    eventCapacity: 20,
  });
}
