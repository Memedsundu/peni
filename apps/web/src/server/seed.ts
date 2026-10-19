import { defaultSettings, startOfLocalDay } from "@peni/core";
import type { Post } from "@peni/core";
import type { CustomerRecord, PeniApp } from "./app";

export const DEMO_CUSTOMERS = {
  ayse: { id: "cus_ayse", phone: "+905320000001", displayName: "Ayşe Yılmaz" },
  mehmet: { id: "cus_mehmet", phone: "+905320000002", displayName: "Mehmet Kaya" },
  deniz: { id: "cus_deniz", phone: "+905320000003", displayName: "Deniz Arslan" },
} as const;

/** Neighbours who make the cafés feel lived in. Oğuz is blocked at Kuzguncuk. */
export const DEMO_NEIGHBOURS = {
  zeynep: { id: "cus_zeynep", phone: "+905320000011", displayName: "Zeynep Demir", profileVisible: true },
  can: { id: "cus_can", phone: "+905320000012", displayName: "Can Öztürk", profileVisible: true },
  elif: { id: "cus_elif", phone: "+905320000013", displayName: "Elif Şahin", profileVisible: false },
  emre: { id: "cus_emre", phone: "+905320000014", displayName: "Emre Çelik", profileVisible: true },
  selin: { id: "cus_selin", phone: "+905320000015", displayName: "Selin Aydın", profileVisible: true },
  burak: { id: "cus_burak", phone: "+905320000016", displayName: "Burak Koç", profileVisible: false },
  oguz: { id: "cus_oguz", phone: "+905320000017", displayName: "Oğuz Yıldırım", profileVisible: false },
  irem: { id: "cus_irem", phone: "+905320000018", displayName: "İrem Güneş", profileVisible: true },
  kerem: { id: "cus_kerem", phone: "+905320000019", displayName: "Kerem Aksoy", profileVisible: false },
  nermin: { id: "cus_nermin", phone: "+905320000020", displayName: "Nermin Arıkan", profileVisible: true },
} as const;

type Who = keyof typeof DEMO_CUSTOMERS | keyof typeof DEMO_NEIGHBOURS;
type Slug = "moda" | "kuzguncuk";
const CAFE_ID: Record<Slug, string> = { moda: "cafe_moda", kuzguncuk: "cafe_kuzguncuk" };

const TZ = "Europe/Istanbul";
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/**
 * Demo data: two cafés, thirteen neighbours and two months of history, written
 * through the real code paths (the ledger, gifts, the askı) with the clock moved
 * back, so every screen has its states: a full wallet history, a weekly askı
 * line, a filling event, a question with answers and trends in the report.
 * Deterministic for a given day: no randomness beyond a fixed-seed generator.
 */
export async function seed(app: PeniApp): Promise<void> {
  const now = app.now();
  const today = startOfLocalDay(now, TZ);
  /** `daysAgo` local days back at hh:mm in Istanbul (no DST there, so plain arithmetic holds). */
  const on = (daysAgo: number, hh: number, mm = 0) => new Date(today.getTime() - daysAgo * DAY + (hh * 60 + mm) * MIN);
  /** `minutes` before now, but never before local midnight (so it is always today, and never in the future). */
  const earlierToday = (minutes: number) => new Date(Math.max(today.getTime(), now.getTime() - minutes * MIN));
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
  const rand = mulberry32(1554); // Tahtakale's first coffeehouse

  // ─────────────────────────────────────────── cafés, menus, rules

  await app.identity.saveCafe({
    id: "cafe_moda",
    slug: "moda",
    name: "Moda Kahvesi",
    address: "Moda Cd. No: 42",
    district: "Kadıköy",
    city: "İstanbul",
    coverImageUrl: null,
    referenceProductIds: ["cay", "turk"],
    // Moda chose its own colourway (G9); without a choice the hash would give mürekkep.
    hue: "lacivert",
  });
  await app.identity.saveCafe({
    id: "cafe_kuzguncuk",
    slug: "kuzguncuk",
    name: "Kuzguncuk Kıraathanesi",
    address: "İcadiye Cd. No: 7",
    district: "Üsküdar",
    city: "İstanbul",
    coverImageUrl: null,
    referenceProductIds: [],
    hue: null,
  });

  await app.menu.setMenu("cafe_moda", [
    { productId: "cay", name: "Çay", category: "Sıcak", priceKurus: 3_000, available: true, description: "İnce belli bardakta" },
    { productId: "turk", name: "Türk Kahvesi", category: "Sıcak", priceKurus: 9_000, available: true, description: "Yanında lokum" },
    { productId: "filtre", name: "Filtre Kahve", category: "Sıcak", priceKurus: 8_500, available: true, description: "Bu hafta Etiyopya Yirgacheffe" },
    { productId: "latte", name: "Latte", category: "Sıcak", priceKurus: 12_000, available: true, description: null },
    { productId: "limonata", name: "Ev Limonatası", category: "Soğuk", priceKurus: 11_000, available: true, description: "Taze nane ile" },
    { productId: "simit", name: "Simit", category: "Yiyecek", priceKurus: 2_500, available: true, description: "Sabah fırından" },
    { productId: "cheesecake", name: "San Sebastian", category: "Tatlı", priceKurus: 18_000, available: true, description: null },
  ]);
  await app.menu.setMenu("cafe_kuzguncuk", [
    { productId: "cay", name: "Çay", category: "Sıcak", priceKurus: 2_500, available: true, description: "Demlikte, tavşan kanı" },
    { productId: "turk", name: "Türk Kahvesi", category: "Sıcak", priceKurus: 8_000, available: true, description: null },
    { productId: "sahlep", name: "Salep", category: "Sıcak", priceKurus: 10_000, available: true, description: "Tarçınlı" },
    { productId: "pogaca", name: "Peynirli Poğaça", category: "Yiyecek", priceKurus: 4_000, available: true, description: null },
  ]);

  await app.directory.saveSettings({
    ...defaultSettings("cafe_moda"),
    earnRateBps: 500,
    askidaProductIds: ["cay", "filtre", "simit"],
    askidaMatchBps: 5_000,
    askidaMatchMonthlyCapPeni: 500,
  });
  await app.directory.saveSettings({
    ...defaultSettings("cafe_kuzguncuk"),
    earnRateBps: 700,
    askidaProductIds: ["cay", "pogaca"],
    askidaMinMembershipDays: 7,
  });

  // ─────────────────────────────────────────── people and memberships

  const people = new Map<string, CustomerRecord>();
  for (const c of Object.values(DEMO_CUSTOMERS)) people.set(c.id, { ...c, avatarUrl: null, profileVisible: c.id !== "cus_deniz" });
  for (const c of Object.values(DEMO_NEIGHBOURS)) people.set(c.id, { ...c, avatarUrl: null });
  for (const c of people.values()) await app.identity.saveCustomer(c);

  const id = (who: Who) => (who in DEMO_CUSTOMERS ? DEMO_CUSTOMERS[who as keyof typeof DEMO_CUSTOMERS] : DEMO_NEIGHBOURS[who as keyof typeof DEMO_NEIGHBOURS]).id;
  const customer = (who: Who) => people.get(id(who))!;
  const members: Record<Slug, Partial<Record<Who, string>>> = { moda: {}, kuzguncuk: {} };
  const join = async (who: Who, slug: Slug, joinedDaysAgo: number) => {
    members[slug][who] = await app.ensureMembership(id(who), CAFE_ID[slug], daysAgo(joinedDaysAgo));
  };

  await join("ayse", "moda", 40);
  await join("mehmet", "moda", 20);
  await join("deniz", "moda", 3);
  await join("zeynep", "moda", 95);
  await join("can", "moda", 62);
  await join("elif", "moda", 48);
  await join("emre", "moda", 33);
  await join("selin", "moda", 27);
  await join("burak", "moda", 15);
  await join("oguz", "moda", 12);
  await join("irem", "moda", 9);
  await join("kerem", "moda", 8);
  await join("nermin", "kuzguncuk", 120);
  await join("can", "kuzguncuk", 30);
  await join("oguz", "kuzguncuk", 18);
  await join("ayse", "kuzguncuk", 10);
  await join("deniz", "kuzguncuk", 4); // too new for the askı there: 3 days left

  // ─────────────────────────────────────────── the timeline, in order

  const steps: { at: Date; run: () => Promise<unknown> }[] = [];
  const plan = (at: Date, run: () => Promise<unknown>) => void steps.push({ at, run });
  let n = 0;

  /** A purchase at the till where the member showed their Peni kodu. */
  const walkIn = (who: Who, slug: Slug, at: Date, tl: number) =>
    plan(at, () =>
      app.at(at, () =>
        app.peni.earnForPaidOrder({ membershipId: members[slug][who]!, orderId: `till_seed_${++n}`, paidTotalKurus: tl * 100 }),
      ),
    );

  /** One item taken from the askı at the till. */
  const claim = (who: Who, slug: Slug, at: Date, productId: string) =>
    plan(at, async () => {
      const item = (await app.menu.listMenu(CAFE_ID[slug])).find((m) => m.productId === productId)!;
      await app.at(at, () =>
        app.peni.claimFromAskida({
          membershipId: members[slug][who]!,
          orderId: `till_seed_${++n}`,
          productId,
          unitPriceKurus: item.priceKurus,
        }),
      );
    });

  const gift = (o: { from: Who; to: Who; slug: Slug; at: Date; peni: number; message: string }) => {
    const key = `seed_gift_${++n}`;
    plan(o.at, () =>
      app.at(o.at, () =>
        app.sendGift(customer(o.from), { cafeSlug: o.slug, toPhone: customer(o.to).phone, peni: o.peni, message: o.message, idempotencyKey: key }),
      ),
    );
    return key;
  };
  const giftId = (key: string, from: Who) => app.ledger.findByIdempotencyKey(`gift:${id(from)}:${key}`).then((t) => String(t!.meta.giftId));

  const donate = (who: Who, slug: Slug, at: Date, peni: number, showName: boolean) =>
    plan(at, () => app.at(at, () => app.donateToAskida(customer(who), { cafeSlug: slug, peni, showName, idempotencyKey: `seed_d_${++n}` })));
  const till = (slug: Slug, at: Date, peni: number) =>
    plan(at, () => app.at(at, () => app.tillDonation(slug, { peni, idempotencyKey: `seed_t_${++n}` })));

  // Two months of walk-in visits: what most of the peni in circulation comes from.
  const regulars: [Who, Slug, number, number, number][] = [
    // who, café, from days ago, visits, typical spend (TL)
    ["zeynep", "moda", 60, 14, 160],
    ["can", "moda", 58, 10, 140],
    ["elif", "moda", 47, 8, 190],
    ["ayse", "moda", 39, 20, 270],
    ["emre", "moda", 32, 7, 150],
    ["selin", "moda", 26, 6, 170],
    ["mehmet", "moda", 19, 3, 300],
    ["burak", "moda", 14, 3, 120],
    ["oguz", "moda", 11, 3, 110],
    ["irem", "moda", 8, 5, 200],
    ["kerem", "moda", 7, 2, 130],
    ["nermin", "kuzguncuk", 60, 12, 120],
    ["can", "kuzguncuk", 29, 4, 110],
    ["oguz", "kuzguncuk", 17, 3, 90],
    ["ayse", "kuzguncuk", 9, 2, 140],
  ];
  for (const [who, slug, from, visits, spend] of regulars) {
    for (let v = 0; v < visits; v++) {
      const day = Math.max(1, Math.round(from - ((from - 1) * v) / visits - rand() * 2));
      const tl = Math.round((spend * (0.7 + rand() * 0.6)) / 5) * 5;
      walkIn(who, slug, on(day, 9 + Math.floor(rand() * 10), Math.floor(rand() * 60)), tl);
    }
  }

  // The askı over the last nine days. Takers are never named, anywhere.
  till("moda", on(9, 10, 15), 85);
  donate("ayse", "moda", on(6, 8, 5), 60, true);
  claim("kerem", "moda", on(6, 9, 30), "simit");
  claim("elif", "moda", on(5, 8, 40), "cay");
  donate("zeynep", "moda", on(4, 18, 30), 30, true);
  claim("burak", "moda", on(3, 16, 20), "cay");
  donate("can", "moda", on(2, 13, 0), 30, false);
  claim("oguz", "moda", on(2, 11, 5), "cay");
  donate("irem", "moda", on(1, 17, 45), 25, true);
  till("moda", on(1, 19, 10), 60);
  till("kuzguncuk", on(5, 12, 0), 75);
  claim("oguz", "kuzguncuk", on(4, 10, 20), "cay");

  // Gifts: one thanked, one that ran out, two still waiting.
  const toMehmet = gift({ from: "ayse", to: "mehmet", slug: "moda", at: on(3, 12, 10), peni: 30, message: "Geçen haftaki çayın karşılığı." });
  plan(on(3, 13, 2), async () => {
    const giftKey = await giftId(toMehmet, "ayse");
    await app.at(on(3, 13, 2), () => app.resolveGift(customer("mehmet"), giftKey, "accept"));
    await app.at(on(3, 13, 4), () => app.thankGift(customer("mehmet"), giftKey));
  });
  gift({ from: "ayse", to: "deniz", slug: "moda", at: on(2, 10, 0), peni: 30, message: "Mahalleye hoş geldin." });
  plan(on(1, 10, 5), () => app.at(on(1, 10, 5), () => app.peni.expireGifts()));
  const fromNermin = gift({ from: "nermin", to: "ayse", slug: "kuzguncuk", at: on(5, 15, 0), peni: 25, message: "Bostan sohbetine bekleriz." });
  plan(on(5, 18, 20), async () =>
    app.at(on(5, 18, 20), async () => app.resolveGift(customer("ayse"), await giftId(fromNermin, "nermin"), "accept")),
  );

  // Today.
  claim("mehmet", "moda", earlierToday(190), "cay");
  gift({ from: "mehmet", to: "ayse", slug: "moda", at: earlierToday(120), peni: 30, message: "Afiyet olsun!" });
  gift({ from: "ayse", to: "zeynep", slug: "moda", at: earlierToday(50), peni: 45, message: "Takas rafı fikri için sağ ol." });
  steps.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const step of steps) await step.run();

  // Oğuz is blocked at Kuzguncuk (staff decision; the reason is never shown to anyone).
  const blocked = (await app.directory.getMembership(members.kuzguncuk.oguz!))!;
  await app.directory.saveMembership({ ...blocked, blocked: true });

  // ─────────────────────────────────────────── the feed

  type Activity = { reactions?: Who[]; rsvps?: Who[]; comments?: { id: string; customerId: string; body: string; createdAt: Date }[] };
  /** RSVPs and reactions land a minute apart from publishing, in the order given. */
  const post = async (p: Post, extra: Activity = {}) => {
    await app.community.savePost(p);
    let t = p.publishedAt.getTime();
    for (const who of extra.rsvps ?? []) await app.community.addRsvp(p.id, id(who), new Date((t += MIN)));
    for (const who of extra.reactions ?? []) await app.community.toggleReaction(p.id, id(who), new Date((t += MIN)));
    for (const c of extra.comments ?? []) await app.community.addComment(p.id, c);
  };
  const answer = (cid: string, who: Who, body: string, at: Date) => ({ id: cid, customerId: id(who), body, createdAt: at });

  await post(
    {
      id: "post_event_1",
      cafeId: "cafe_moda",
      kind: "event",
      title: "Mahalleye bir takas kütüphanesi kursak?",
      body: "Büyük masada buluşuyoruz. Okuduğun bir kitabı getir, bir başkasını al; rafı nereye kuracağımızı birlikte seçelim. Herkes davetli, fikri olan da olmayan da.",
      publishedAt: on(1, 10, 0),
      pinned: true,
      eventStartsAt: nextWeekday(now, 4, 19, 0),
      eventCapacity: 14,
    },
    { rsvps: ["ayse", "zeynep", "can", "elif", "emre", "selin"], reactions: ["mehmet", "irem"] },
  );
  const asked = earlierToday(200);
  await post(
    {
      id: "post_question_1",
      cafeId: "cafe_moda",
      kind: "question",
      title: null,
      body: "Moda'da en sevdiğin, kimsenin bilmediği köşe neresi?",
      publishedAt: asked,
      pinned: true,
      eventStartsAt: null,
      eventCapacity: null,
    },
    {
      reactions: ["mehmet", "zeynep", "selin"],
      comments: [
        answer("cmt_1", "mehmet", "Yel değirmeni parkının arkasındaki bank. Gün batımı başka.", earlierToday(170)),
        answer("cmt_2", "zeynep", "Bahariye'deki eski sahafın üst katı. Sorarsan çay da koyuyorlar.", earlierToday(120)),
        answer("cmt_3", "elif", "İskelenin arkasındaki taşlar, sabah yedide. Martılardan başka kimse yok.", earlierToday(75)),
        answer("cmt_4", "emre", "Kırmızı kapılı sokak. Adı yok ama herkes öyle diyor.", earlierToday(30)),
      ],
    },
  );
  await post(
    {
      id: "post_1",
      cafeId: "cafe_moda",
      kind: "post",
      title: null,
      body: "Yeni hasat Etiyopya Yirgacheffe geldi. Bu hafta filtre kahve onunla demleniyor.",
      publishedAt: on(2, 9, 0),
      pinned: false,
      eventStartsAt: null,
      eventCapacity: null,
    },
    {
      reactions: ["ayse", "zeynep", "selin", "emre"],
      comments: [
        answer("cmt_5", "selin", "Dün denedim; çiçeksi, çok hafif.", on(1, 16, 20)),
        answer("cmt_6", "can", "Çekirdek olarak da satıyor musunuz?", on(1, 18, 5)),
      ],
    },
  );
  await post({
    id: "post_2",
    cafeId: "cafe_moda",
    kind: "post",
    title: null,
    body: "Pazar sabahları simit fırından sıcak geliyor; 08:30'dan itibaren masada.",
    publishedAt: on(5, 8, 0),
    pinned: false,
    eventStartsAt: null,
    eventCapacity: null,
  });
  await post(
    {
      id: "post_event_past",
      cafeId: "cafe_moda",
      kind: "event",
      title: "Eski Moda fotoğraflarını birlikte okuyalım",
      body: "Evindeki eski fotoğrafları getir; kim, nerede, ne zaman, birlikte çözelim.",
      publishedAt: on(12, 11, 0),
      pinned: false,
      eventStartsAt: on(6, 19, 0),
      eventCapacity: 12,
    },
    { rsvps: ["ayse", "mehmet", "zeynep", "can", "elif", "emre", "selin", "burak", "irem"] },
  );

  await post(
    {
      id: "post_k1",
      cafeId: "cafe_kuzguncuk",
      kind: "event",
      title: "Kuzguncuk'un bostanları",
      body: "Emekli tarih öğretmenimiz Nermin Hanım anlatıyor. Sonra bostana birlikte yürüyoruz.",
      publishedAt: on(3, 9, 30),
      pinned: true,
      eventStartsAt: nextWeekday(now, 6, 11, 0),
      eventCapacity: 20,
    },
    { rsvps: ["nermin", "can", "oguz", "ayse"] },
  );
  await post({
    id: "post_k2",
    cafeId: "cafe_kuzguncuk",
    kind: "post",
    title: null,
    body: "Salep sezonu başladı. Tarçını bol, şekeri az isteyen söylesin.",
    publishedAt: on(1, 9, 0),
    pinned: false,
    eventStartsAt: null,
    eventCapacity: null,
  });
}

/** The next `weekday` (0 = Sunday) at hh:mm in Istanbul, never today. */
function nextWeekday(now: Date, weekday: number, hh: number, mm: number): Date {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  const todayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
  const ahead = (weekday - todayIdx + 7) % 7 || 7;
  return new Date(startOfLocalDay(now, TZ).getTime() + ahead * DAY + (hh * 60 + mm) * MIN);
}

/** Small fixed-seed PRNG, so the demo looks the same on every start. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
