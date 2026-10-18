import { addMonths, dayPay, defaultSettings, dueOn, localDateKey, monthDays, orderTotals, plusDays, rateOn, shiftEnds, startOfLocalDay, weekStartOf } from "@peni/core";
import type { Bill, BillLine, Cafe, MenuItem, Order, OrderLine, Payment, MoneyMovement, MovementKind, PayRate, Post, Shift, StaffMember, StaffRole, StockBatch, StockItem, StockMode, Supplier, TaskCheck, TaskItem, TaskList, Weekday, WorkDay } from "@peni/core";
import type { CustomerRecord, PeniApp } from "./app";
import { receiptPdf } from "./demo-receipt";

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

/** Demo café staff, one of each role, all with the same password. Leyla also manages Kuzguncuk. Hakan and Ece have till PINs. */
export const DEMO_STAFF_PASSWORD = process.env.PENI_DEMO_STAFF_PASSWORD ?? "demo-staff";
export const DEMO_STAFF = {
  leyla: { name: "Leyla Kara", email: "leyla@moda.test", roles: { moda: "owner", kuzguncuk: "manager" } },
  murat: { name: "Murat Aksu", email: "murat@moda.test", roles: { moda: "manager" } },
  hakan: { name: "Hakan Usta", email: "hakan@moda.test", roles: { moda: "chef" }, pin: "3690" },
  ece: { name: "Ece Tan", email: "ece@moda.test", roles: { moda: "barista" }, pin: "2580" },
  tarik: { name: "Tarık Ersoy", email: "tarik@kuzguncuk.test", roles: { kuzguncuk: "owner" } },
} as const satisfies Record<
  string,
  { name: string; email: string; roles: Partial<Record<"moda" | "kuzguncuk", StaffRole>>; pin?: string }
>;

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
export async function seed(app: PeniApp, opts: { sales?: boolean; drafts?: boolean } = {}): Promise<void> {
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

  await seedMenu(app, "cafe_moda", [
    { productId: "cay", name: "Çay", category: "Sıcak", priceKurus: 3_000, available: true, description: "İnce belli bardakta" },
    { productId: "turk", name: "Türk Kahvesi", category: "Sıcak", priceKurus: 9_000, available: true, description: "Yanında lokum" },
    { productId: "filtre", name: "Filtre Kahve", category: "Sıcak", priceKurus: 8_500, available: true, description: "Bu hafta Etiyopya Yirgacheffe" },
    { productId: "latte", name: "Latte", category: "Sıcak", priceKurus: 12_000, available: true, description: null },
    { productId: "limonata", name: "Ev Limonatası", category: "Soğuk", priceKurus: 11_000, available: true, description: "Taze nane ile" },
    { productId: "simit", name: "Simit", category: "Yiyecek", priceKurus: 2_500, available: true, description: "Sabah fırından" },
    { productId: "cheesecake", name: "San Sebastian", category: "Tatlı", priceKurus: 18_000, available: true, description: null },
  ]);
  await seedMenu(app, "cafe_kuzguncuk", [
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

  // ─────────────────────────────────────────── staff

  const tillStaff = {} as Record<Slug, { cafe: Cafe; member: StaffMember }>;
  const staffAt = {} as Record<string, StaffMember>; // `${email}:${slug}`
  for (const s of Object.values(DEMO_STAFF)) {
    const account = await app.staff.ensureAccount({ name: s.name, email: s.email, password: DEMO_STAFF_PASSWORD });
    // A day apart, so a person's cafés list in the same order in memory and in Postgres.
    for (const [i, [slug, role]] of (Object.entries(s.roles) as [Slug, StaffRole][]).entries()) {
      const pin = "pin" in s ? s.pin : undefined;
      const member = await app.at(daysAgo(90 - i), () => app.staff.join(account.id, CAFE_ID[slug], role, pin));
      staffAt[`${s.email}:${slug}`] = member;
      if (role === "barista" || (role === "owner" && !tillStaff[slug])) {
        tillStaff[slug] = { cafe: (await app.identity.getCafe(CAFE_ID[slug]))!, member };
      }
    }
  }

  // ─────────────────────────────────────────── stock and recipes (plan piece 17)

  await seedStock(app, {
    leyla: staffAt[`${DEMO_STAFF.leyla.email}:moda`]!.id,
    ece: staffAt[`${DEMO_STAFF.ece.email}:moda`]!.id,
    on,
    earlierToday,
  });
  await seedBills(app, {
    leyla: staffAt[`${DEMO_STAFF.leyla.email}:moda`]!.id,
    murat: staffAt[`${DEMO_STAFF.murat.email}:moda`]!.id,
    ece: staffAt[`${DEMO_STAFF.ece.email}:moda`]!.id,
    on,
  });
  await seedShifts(app, {
    leyla: staffAt[`${DEMO_STAFF.leyla.email}:moda`]!.id,
    murat: staffAt[`${DEMO_STAFF.murat.email}:moda`]!.id,
    hakan: staffAt[`${DEMO_STAFF.hakan.email}:moda`]!.id,
    ece: staffAt[`${DEMO_STAFF.ece.email}:moda`]!.id,
    on,
  });
  // Tests of bills and money keep the figures they were written against.
  if (opts.sales !== false)
    await seedSales(app, {
    murat: staffAt[`${DEMO_STAFF.murat.email}:moda`]!.id,
    ece: staffAt[`${DEMO_STAFF.ece.email}:moda`]!.id,
    leyla: staffAt[`${DEMO_STAFF.leyla.email}:moda`]!.id,
    on,
  });
  if (opts.drafts !== false) await seedDrafts(app);
  await seedTasks(app, {
    murat: staffAt[`${DEMO_STAFF.murat.email}:moda`]!.id,
    hakan: staffAt[`${DEMO_STAFF.hakan.email}:moda`]!.id,
    ece: staffAt[`${DEMO_STAFF.ece.email}:moda`]!.id,
    on,
  });

  // ─────────────────────────────────────────── people and memberships

  const people = new Map<string, CustomerRecord>();
  for (const c of Object.values(DEMO_CUSTOMERS)) people.set(c.id, { ...c, email: null, avatarUrl: null, profileVisible: c.id !== "cus_deniz" });
  for (const c of Object.values(DEMO_NEIGHBOURS)) people.set(c.id, { ...c, email: null, avatarUrl: null });
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
        app.sendGift(customer(o.from), { cafeSlug: o.slug, toPhone: customer(o.to).phone!, peni: o.peni, message: o.message, idempotencyKey: key }),
      ),
    );
    return key;
  };
  const giftId = (key: string, from: Who) => app.ledger.findByIdempotencyKey(`gift:${id(from)}:${key}`).then((t) => String(t!.meta.giftId));

  const donate = (who: Who, slug: Slug, at: Date, peni: number, showName: boolean) =>
    plan(at, () => app.at(at, () => app.donateToAskida(customer(who), { cafeSlug: slug, peni, showName, idempotencyKey: `seed_d_${++n}` })));
  const till = (slug: Slug, at: Date, peni: number) =>
    plan(at, () => app.at(at, () => app.tillDonation(tillStaff[slug], { peni, idempotencyKey: `seed_t_${++n}` })));

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

  // A neighbour's own event (D4), and a comment two neighbours reported to the café (plan piece 15).
  await post(
    {
      id: "post_member_event_1",
      cafeId: "cafe_moda",
      kind: "event",
      title: "Cumartesi satranç",
      body: "Tahtamı getiriyorum. Bilen de bilmeyen de gelsin, oynamayı öğretirim.",
      publishedAt: earlierToday(95),
      pinned: false,
      // The Saturday after the café's own Thursday table, so the card still leads with the café's.
      eventStartsAt: new Date(nextWeekday(now, 4, 15, 0).getTime() + 2 * DAY),
      eventCapacity: 6,
      hostCustomerId: id("zeynep"),
    },
    { rsvps: ["zeynep", "can", "emre"], reactions: ["selin"] },
  );
  await app.community.addComment("post_2", answer("cmt_spam_1", "kerem", "Az kullanılmış espresso makinesi satıyorum, çok ucuz. Mesaj atın.", on(1, 21, 10)));
  for (const who of ["selin", "irem"] as const) {
    await app.report((await app.identity.getCustomer(id(who)))!, "moda", { targetType: "comment", targetId: "cmt_spam_1", reason: "spam" });
  }

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

/** Categories in the order they first appear, products in the order given. */
async function seedMenu(app: PeniApp, cafeId: string, items: (Omit<MenuItem, "categoryId" | "sortOrder">)[]): Promise<void> {
  const ids = new Map<string, string>();
  for (const [i, item] of items.entries()) {
    let categoryId = ids.get(item.category);
    if (!categoryId) {
      categoryId = `cat_${cafeId.replace(/^cafe_/, "")}_${ids.size + 1}`;
      ids.set(item.category, categoryId);
      await app.menu.saveCategory({ id: categoryId, cafeId, name: item.category, sortOrder: ids.size - 1 });
    }
    await app.menu.saveProduct(cafeId, { ...item, categoryId, sortOrder: i });
  }
}

/**
 * Moda's stock: what it bought two weeks ago, a count last week, some waste, today's sales so
 * far, and recipes for most of the menu. Milk and lemons are low and the cheesecake is out,
 * so Stok and Bugün have something to say. Kuzguncuk hasn't set stock up yet.
 */
async function seedStock(
  app: PeniApp,
  p: { leyla: string; ece: string; on: (daysAgo: number, hh: number, mm?: number) => Date; earlierToday: (minutes: number) => Date },
): Promise<void> {
  const cafeId = "cafe_moda";
  const g = (grams: number) => grams; // a kg item's thousandths are grams, a litre's are ml
  const kg = (n: number) => Math.round(n * 1000);
  const pcs = (n: number) => n * 1000;
  type Seeded = { id: string; name: string; kind: StockItem["kind"]; unit: StockItem["unit"]; start: number; min: number; cost: number | null };
  const items: Seeded[] = [
    { id: "stk_espresso", name: "Espresso çekirdeği", kind: "ingredient", unit: "kg", start: kg(4), min: kg(1), cost: 90_000 },
    { id: "stk_filtre", name: "Filtre kahve çekirdeği", kind: "ingredient", unit: "kg", start: kg(2), min: g(500), cost: 110_000 },
    { id: "stk_turk", name: "Türk kahvesi", kind: "ingredient", unit: "kg", start: kg(2), min: g(300), cost: 60_000 },
    { id: "stk_cay", name: "Dökme çay", kind: "ingredient", unit: "kg", start: kg(3), min: g(500), cost: 35_000 },
    { id: "stk_sut", name: "Süt", kind: "ingredient", unit: "l", start: kg(24), min: kg(5), cost: 4_500 },
    { id: "stk_limon", name: "Limon", kind: "ingredient", unit: "kg", start: kg(5), min: kg(1), cost: 6_000 },
    { id: "stk_nane", name: "Taze nane", kind: "ingredient", unit: "adet", start: pcs(6), min: pcs(2), cost: null },
    { id: "stk_simit", name: "Simit", kind: "ingredient", unit: "adet", start: pcs(40), min: pcs(10), cost: 1_000 },
    { id: "stk_sansebastian", name: "San Sebastian dilimi", kind: "ingredient", unit: "adet", start: pcs(12), min: pcs(2), cost: 6_500 },
    { id: "stk_lokum", name: "Lokum", kind: "ingredient", unit: "adet", start: pcs(300), min: pcs(50), cost: 150 },
    { id: "stk_bardak", name: "Karton bardak (8 oz)", kind: "supply", unit: "adet", start: pcs(500), min: pcs(100), cost: 250 },
    { id: "stk_kapak", name: "Bardak kapağı", kind: "supply", unit: "adet", start: pcs(500), min: pcs(100), cost: 120 },
  ];
  for (const i of items) {
    await app.stockStore.saveItem({
      id: i.id, cafeId, name: i.name, kind: i.kind, unit: i.unit, qtyMilli: 0, minMilli: i.min, costKurus: i.cost, archivedAt: null, createdAt: p.on(14, 9),
    });
  }
  let n = 0;
  const batch = async (
    batchKey: string,
    at: Date,
    reason: StockBatch["reason"],
    changes: ([string, number] | [string, { counted: number }])[],
    extra: Partial<StockBatch> = {},
  ) =>
    app.stockStore.applyBatch({
      cafeId, batchKey, reason, at, memberId: p.leyla, ...extra,
      changes: changes.map(([itemId, c]) => ({ id: `smv_seed_${++n}`, itemId, ...(typeof c === "number" ? { changeMilli: c } : { countedMilli: c.counted }) })),
    });

  for (const i of items) await batch(`add:seed_${i.id}`, p.on(14, 9), "start", [[i.id, i.start]]);
  // Two weeks of selling, as one move per item per week (the demo has no till orders that old).
  await batch("sale:seed_week1", p.on(7, 21), "sale", [
    ["stk_espresso", -kg(1.3)], ["stk_filtre", -g(600)], ["stk_turk", -g(700)], ["stk_cay", -g(900)], ["stk_sut", -kg(13)],
    ["stk_limon", -kg(2.4)], ["stk_simit", -pcs(22)], ["stk_sansebastian", -pcs(7)], ["stk_lokum", -pcs(80)], ["stk_bardak", -pcs(150)], ["stk_kapak", -pcs(150)],
  ], { memberId: p.ece });
  await batch("count:seed_week1", p.on(7, 22), "count", [
    ["stk_espresso", { counted: kg(2.65) }], ["stk_sut", { counted: kg(10.5) }], ["stk_simit", { counted: pcs(17) }], ["stk_sansebastian", { counted: pcs(5) }],
  ], { note: "Pazar sayımı" });
  // Deliveries come with bills (seedBills writes the bills themselves).
  await batch("bill:bil_seed_sut2:1", p.on(6, 10), "bill", [["stk_sut", kg(12)]], { note: "Moda Süt" });
  await batch("bill:bil_seed_simit:1", p.on(6, 10, 5), "bill", [["stk_simit", pcs(30)]], { note: "Fırıncı Hasan", memberId: p.ece });
  await batch("waste:seed_1", p.on(4, 18), "waste", [["stk_sut", -kg(2)]], { why: "expired", memberId: p.ece });
  await batch("waste:seed_2", p.on(2, 15), "waste", [["stk_sansebastian", -pcs(1)]], { why: "broken", note: "Vitrinden düştü", memberId: p.ece });
  await batch("sale:seed_week2", p.on(1, 21), "sale", [
    ["stk_espresso", -kg(1.1)], ["stk_filtre", -g(550)], ["stk_turk", -g(600)], ["stk_cay", -g(800)], ["stk_sut", -kg(16.8)],
    ["stk_limon", -kg(2.2)], ["stk_simit", -pcs(33)], ["stk_sansebastian", -pcs(4)], ["stk_lokum", -pcs(70)], ["stk_bardak", -pcs(140)], ["stk_kapak", -pcs(140)],
  ], { memberId: p.ece });
  await batch("sale:seed_today", p.earlierToday(90), "sale", [["stk_espresso", -g(144)], ["stk_sut", -g(1_600)], ["stk_cay", -g(60)], ["stk_simit", -pcs(4)]], { memberId: p.ece });

  const recipe = (productId: string, mode: StockMode, lines: [string, number][]) =>
    app.stockStore.saveRecipe({ cafeId, productId, mode, lines: lines.map(([itemId, qtyMilli]) => ({ itemId, qtyMilli })) });
  await recipe("cay", "recipe", [["stk_cay", g(3)]]);
  await recipe("turk", "recipe", [["stk_turk", g(7)], ["stk_lokum", pcs(1)]]);
  await recipe("filtre", "recipe", [["stk_filtre", g(15)]]);
  await recipe("latte", "recipe", [["stk_espresso", g(18)], ["stk_sut", g(200)]]);
  await recipe("limonata", "recipe", [["stk_limon", g(150)], ["stk_nane", 200]]);
  await recipe("simit", "counted", [["stk_simit", pcs(1)]]);
  await recipe("cheesecake", "counted", [["stk_sansebastian", pcs(1)]]);
}

/**
 * Moda's suppliers and a month of bills (plan piece 18). The two deliveries of last week
 * moved stock in seedStock; the older bills came before Peni counted stock, so their
 * amounts are in the starting counts. Prices match the items' prices on Stok.
 */
async function seedBills(app: PeniApp, p: { leyla: string; murat: string; ece: string; on: (daysAgo: number, hh: number, mm?: number) => Date }): Promise<void> {
  const cafeId = "cafe_moda";
  const timeZone = (await app.directory.getSettings(cafeId)).timeZone;
  const day = (daysAgo: number) => localDateKey(p.on(daysAgo, 12), timeZone);
  const supplier = (id: string, name: string, more: Partial<Supplier> = {}): Supplier => ({
    id, cafeId, name, phone: null, email: null, taxNo: null, iban: null, note: null, archivedAt: null, createdAt: p.on(30, 9), ...more,
  });
  const suppliers = [
    supplier("sup_seed_sut", "Moda Süt", { phone: "0532 410 22 18", note: "Salı ve cuma sabah getirir." }),
    supplier("sup_seed_kahve", "Kuzey Kahve Kavurma", {
      phone: "0216 345 67 89", email: "siparis@kuzeykahve.test", taxNo: "5730412298", iban: "TR330006100519786457841326", note: "30 gün vadeli çalışıyoruz.",
    }),
    supplier("sup_seed_firin", "Fırıncı Hasan", { phone: "0535 902 11 40" }),
    supplier("sup_seed_ambalaj", "Ambalaj Dünyası", { email: "satis@ambalajdunyasi.test" }),
    supplier("sup_seed_elektrik", "Boğaziçi Elektrik"),
    supplier("sup_seed_ev", "Ali Rıza Bey (mal sahibi)", { iban: "TR120001200945200058000017" }),
  ];
  for (const s of suppliers) await app.billStore.saveSupplier(s);

  const stock = (itemId: string, name: string, category: BillLine["category"], qtyMilli: number, totalKurus: number): BillLine => ({ itemId, name, category, qtyMilli, totalKurus });
  const other = (name: string, category: BillLine["category"], totalKurus: number): BillLine => ({ itemId: null, name, category, qtyMilli: null, totalKurus });
  const thisMonth = day(0).slice(0, 8);
  const rentPaidOn = [`${thisMonth}03`, day(0)].sort()[0]!;
  const bills: (Omit<Bill, "cafeId" | "totalKurus" | "kdv" | "documentId" | "paidKurus" | "paidAt" | "payments" | "version" | "voidedAt" | "voidedById" | "voidReason" | "updatedAt" | "createKey"> & {
    paid?: { method: Bill["payments"][number]["method"]; on: string; daysAgo: number };
  })[] = [
    {
      id: "bil_seed_ambalaj", supplierId: "sup_seed_ambalaj", number: "A-20418", date: day(20), dueDate: null, note: null,
      lines: [stock("stk_bardak", "Karton bardak (8 oz)", "supplies", 1_000_000, 250_000), stock("stk_kapak", "Bardak kapağı", "supplies", 1_000_000, 120_000)],
      createdById: p.leyla, createdAt: p.on(20, 15), paid: { method: "credit", on: day(20), daysAgo: 20 },
    },
    {
      id: "bil_seed_sut1", supplierId: "sup_seed_sut", number: null, date: day(16), dueDate: null, note: null,
      lines: [stock("stk_sut", "Süt", "ingredients", 20_000, 86_000)],
      createdById: p.ece, createdAt: p.on(16, 9), paid: { method: "cash", on: day(16), daysAgo: 16 },
    },
    {
      id: "bil_seed_kahve", supplierId: "sup_seed_kahve", number: "KK-2026-1187", date: day(15), dueDate: day(-15), note: "Ekim kavrumu",
      lines: [
        stock("stk_espresso", "Espresso çekirdeği", "ingredients", 4_000, 360_000),
        stock("stk_filtre", "Filtre kahve çekirdeği", "ingredients", 2_000, 220_000),
        stock("stk_turk", "Türk kahvesi", "ingredients", 2_000, 120_000),
      ],
      createdById: p.leyla, createdAt: p.on(15, 11),
    },
    {
      id: "bil_seed_elektrik", supplierId: "sup_seed_elektrik", number: "EL-0928114", date: day(10), dueDate: day(2), note: null,
      lines: [other("Elektrik, geçen ay", "utilities", 385_000)],
      createdById: p.leyla, createdAt: p.on(10, 18),
    },
    {
      id: "bil_seed_sut2", supplierId: "sup_seed_sut", number: null, date: day(6), dueDate: null, note: null,
      lines: [stock("stk_sut", "Süt", "ingredients", 12_000, 54_000)],
      createdById: p.leyla, createdAt: p.on(6, 10), paid: { method: "loan", on: day(6), daysAgo: 6 },
    },
    {
      id: "bil_seed_simit", supplierId: "sup_seed_firin", number: null, date: day(6), dueDate: null, note: "Hafta sonu ödenecek",
      lines: [stock("stk_simit", "Simit", "ingredients", 30_000, 30_000)],
      createdById: p.ece, createdAt: p.on(6, 10, 5),
    },
    {
      id: "bil_seed_kira", supplierId: "sup_seed_ev", number: null, date: `${thisMonth}01`, dueDate: `${thisMonth}05`, note: null,
      lines: [other("Dükkân kirası", "rent", 4_500_000)],
      createdById: p.leyla, createdAt: new Date(`${thisMonth}01T08:00:00Z`), paid: { method: "check", on: rentPaidOn, daysAgo: 0 },
    },
  ];
  for (const { paid, ...b } of bills) {
    const totalKurus = b.lines.reduce((s, l) => s + l.totalKurus, 0);
    const paidAt = paid ? (paid.on === rentPaidOn && b.id === "bil_seed_kira" ? new Date(`${rentPaidOn}T09:00:00Z`) : p.on(paid.daysAgo, 17)) : null;
    await app.billStore.saveBill({
      ...b, cafeId, totalKurus, kdv: [], documentId: null, paidKurus: paid ? totalKurus : 0, paidAt, payments: [], version: 1,
      voidedAt: null, voidedById: null, voidReason: null, updatedAt: b.createdAt, createKey: `seed:${b.id}`,
    });
    if (paid) {
      await app.billStore.addPayment({
        id: `bpy_${b.id}`, cafeId, billId: b.id, amountKurus: totalKurus, method: paid.method, paidOn: paid.on,
        account: paid.method === "cash" ? "reserve" : null, memberId: p.leyla, createdAt: paidAt!,
      });
    }
  }
  await seedDebts(app, { ...p, day, rentPaidOn });
  await seedMoney(app, { ...p, day });
}

/**
 * Nakit ve banka (plan piece 20): Leyla started keeping the money in Peni 18 days ago,
 * just before the cash milk bill, which came out of the reserve. The card payment went
 * from the bank, Murat was paid back from the reserve, and money was moved and corrected
 * the way a week goes. No month is closed: September is there to close.
 */
async function seedMoney(app: PeniApp, p: { leyla: string; murat: string; on: (daysAgo: number, hh: number, mm?: number) => Date; day: (daysAgo: number) => string }): Promise<void> {
  const cafeId = "cafe_moda";
  await app.books.saveStart({ cafeId, startedOn: p.day(18), memberId: p.leyla, createdAt: p.on(18, 9) });
  const move = (id: string, account: "reserve" | "bank", amountKurus: number, kind: MovementKind, source: string, daysAgo: number, extra: Partial<MoneyMovement> = {}): MoneyMovement => ({
    id, cafeId, account, amountKurus, kind, counterpart: null, source, day: p.day(daysAgo), note: null, memberId: p.leyla, createdAt: p.on(daysAgo, 9), ...extra,
  });
  await app.books.addMovements([
    move("mmv_seed_open_r", "reserve", 1_200_000, "opening", "opening", 18),
    move("mmv_seed_open_b", "bank", 18_500_000, "opening", "opening", 18),
    move("mmv_seed_sut1", "reserve", -86_000, "bill", "bill_payment:bpy_bil_seed_sut1", 16, { createdAt: p.on(16, 17) }),
    move("mmv_seed_card", "bank", -200_000, "card", "card_payment:cpy_seed_1", 12, { createdAt: p.on(12, 11) }),
    move("mmv_seed_tr_r", "reserve", -500_000, "transfer", "manual:seed_transfer", 9, { counterpart: "bank", note: "Haftalık yatırma", createdAt: p.on(9, 18) }),
    move("mmv_seed_tr_b", "bank", 500_000, "transfer", "manual:seed_transfer", 9, { counterpart: "reserve", note: "Haftalık yatırma", createdAt: p.on(9, 18) }),
    move("mmv_seed_lrp", "reserve", -20_000, "repayment", "repayment:lrp_seed_1", 3, { createdAt: p.on(3, 19) }),
    move("mmv_seed_fix", "bank", -4_750, "correction", "manual:seed_fix", 2, { note: "Ekstrede hesap işletim ücreti", createdAt: p.on(2, 10) }),
  ]);
}

/**
 * Vardiyalar and Puantaj ve maaş (plan piece 21): the same week, every week, from the start
 * of last month to next week. Next week is still a draft. Hours are in up to four days ago,
 * as planned except for a day Ece was ill and two evenings Hakan stayed on; the last three
 * days are for the manager to fill in. Last month's pay went out by bank early this month,
 * except part of Hakan's, which waits. Ece got a raise this month.
 */
async function seedShifts(app: PeniApp, p: { leyla: string; murat: string; hakan: string; ece: string; on: (daysAgo: number, hh: number, mm?: number) => Date }): Promise<void> {
  const cafeId = "cafe_moda";
  const timeZone = (await app.directory.getSettings(cafeId)).timeZone;
  const today = localDateKey(p.on(0, 12), timeZone);
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonths(thisMonth, -1);
  const at = (day: string, hh: number) => new Date(`${day}T${String(hh - 3).padStart(2, "0")}:00:00Z`);
  const h = (hh: number, mm = 0) => hh * 60 + mm;
  // Monday is 0. Who works when, the same every week.
  const pattern: { weekday: number; start: number; end: number; who: string[]; note?: string }[] = [
    { weekday: 0, start: h(8), end: h(16), who: [p.ece] },
    { weekday: 0, start: h(12), end: h(20), who: [p.murat] },
    { weekday: 1, start: h(8), end: h(16), who: [p.ece] },
    { weekday: 1, start: h(9), end: h(17), who: [p.hakan] },
    { weekday: 1, start: h(12), end: h(20), who: [p.murat] },
    { weekday: 2, start: h(9), end: h(17), who: [p.hakan] },
    { weekday: 2, start: h(12), end: h(20), who: [p.murat] },
    { weekday: 3, start: h(8), end: h(16), who: [p.ece] },
    { weekday: 3, start: h(9), end: h(17), who: [p.hakan] },
    { weekday: 3, start: h(12), end: h(20), who: [p.murat] },
    { weekday: 4, start: h(8), end: h(16), who: [p.ece] },
    { weekday: 4, start: h(9), end: h(17), who: [p.hakan] },
    { weekday: 4, start: h(12), end: h(20), who: [p.murat] },
    { weekday: 5, start: h(9), end: h(18), who: [p.ece, p.hakan], note: "Hafta sonu kahvaltısı" },
    { weekday: 6, start: h(10), end: h(18), who: [p.murat] },
  ];
  const first = weekStartOf(monthDays(lastMonth).from);
  const last = plusDays(weekStartOf(today), 7);
  const shifts: Shift[] = [];
  for (let week = first; week <= last; week = plusDays(week, 7)) {
    pattern.forEach((x, i) => {
      const day = plusDays(week, x.weekday);
      shifts.push({
        id: `shf_seed_${day}_${i}`, cafeId, day, startMinutes: x.start, endMinutes: x.end, memberIds: x.who, note: x.note ?? null,
        createdById: p.murat, createdAt: at(plusDays(week, -4), 15), updatedAt: at(plusDays(week, -4), 15),
      });
    });
    if (week < last) await app.shiftStore.saveWeek({ cafeId, weekStart: week, publishedAt: at(plusDays(week, -3), 10), publishedById: p.murat });
  }
  await app.shiftStore.addShifts(shifts);

  const rates: PayRate[] = [
    { id: "prt_seed_ece", cafeId, memberId: p.ece, fromDay: plusDays(today, -120), kurusPerHour: 15_000, byId: p.leyla, createdAt: p.on(120, 10) },
    { id: "prt_seed_ece2", cafeId, memberId: p.ece, fromDay: monthDays(thisMonth).from, kurusPerHour: 16_500, byId: p.leyla, createdAt: p.on(20, 10) },
    { id: "prt_seed_hakan", cafeId, memberId: p.hakan, fromDay: plusDays(today, -120), kurusPerHour: 20_000, byId: p.leyla, createdAt: p.on(120, 10) },
    { id: "prt_seed_murat", cafeId, memberId: p.murat, fromDay: plusDays(today, -120), kurusPerHour: 22_000, byId: p.leyla, createdAt: p.on(120, 10) },
  ];
  for (const r of rates) await app.shiftStore.saveRate(r);

  const entered = plusDays(today, -4);
  const days = new Map<string, WorkDay>();
  for (const s of shifts) {
    if (s.day < monthDays(lastMonth).from || s.day > entered) continue;
    for (const memberId of s.memberIds) {
      const k = `${memberId}|${s.day}`;
      const minutes = (days.get(k)?.minutes ?? 0) + s.endMinutes - s.startMinutes;
      days.set(k, { cafeId, memberId, day: s.day, minutes, note: null, byId: p.murat, updatedAt: at(s.day, 21) });
    }
  }
  const tweak = (memberId: string, day: string, minutes: number) => {
    const d = days.get(`${memberId}|${day}`);
    if (d) d.minutes = minutes;
  };
  // Ece was ill on a Thursday last month; Hakan stayed an hour longer on two Fridays.
  const thursday = plusDays(weekStartOf(monthDays(lastMonth).from), 14 + 3);
  tweak(p.ece, thursday, 0);
  tweak(p.hakan, plusDays(thursday, 1), h(9));
  tweak(p.hakan, plusDays(thursday, 8), h(9));
  await app.shiftStore.setWorkDays(cafeId, [...days.values()], []);

  // Last month's pay: what each earned, by bank, on the 2nd; Hakan's ₺5.000 short.
  const payDay = `${thisMonth}-02`;
  const startedOn = (await app.books.getStart(cafeId))?.startedOn ?? null;
  const owed = new Map<string, number>();
  for (const d of days.values()) if (d.day.startsWith(lastMonth)) owed.set(d.memberId, (owed.get(d.memberId) ?? 0) + dayPay(d.minutes, rateOn(rates, d.memberId, d.day)));
  for (const [i, [memberId, earned]] of [...owed].entries()) {
    const amountKurus = memberId === p.hakan ? earned - 500_000 : earned;
    const id = `ppo_seed_${i}`;
    const account = startedOn && payDay >= startedOn ? ("bank" as const) : null;
    await app.shiftStore.addPayout({ id, cafeId, memberId, month: lastMonth, amountKurus, method: "bank", account, paidOn: payDay, note: null, byId: p.leyla, createdAt: at(payDay, 11) });
    if (account) {
      await app.books.addMovements([
        { id: `mmv_${id}`, cafeId, account, amountKurus: -amountKurus, kind: "wages", counterpart: null, source: `pay:${id}`, day: payDay, note: null, memberId: p.leyla, createdAt: at(payDay, 11) },
      ]);
    }
  }
}

/**
 * What those payments left owed (plan piece 19): the packaging went on the credit card,
 * the rent was paid with a check due later this month, and Murat paid last week's milk
 * out of his own pocket and has had some of it back. The card's days follow the seed's
 * clock so its statement has closed and fallen due, part of it unpaid, whatever today is.
 */
async function seedDebts(
  app: PeniApp,
  p: { leyla: string; murat: string; on: (daysAgo: number, hh: number, mm?: number) => Date; day: (daysAgo: number) => string; rentPaidOn: string },
): Promise<void> {
  const cafeId = "cafe_moda";
  const dayOfMonth = (daysAgo: number) => Math.min(28, Number(p.day(daysAgo).slice(8)));
  await app.debtStore.saveCard({ cafeId, name: "İş kartı", limitKurus: 10_000_000, statementDay: dayOfMonth(20), dueDay: dayOfMonth(10), updatedAt: p.on(30, 9) });
  await app.debtStore.addCardPayment({ id: "cpy_seed_1", cafeId, amountKurus: 200_000, method: "bank", paidOn: p.day(12), account: "bank", memberId: p.leyla, createdAt: p.on(12, 11) });

  await app.debtStore.saveCheck({
    id: "chk_seed_kira", cafeId, number: "0048213", bankName: "Ziraat Bankası", payee: null, supplierId: "sup_seed_ev", amountKurus: 4_500_000,
    writtenOn: p.rentPaidOn, dueDate: p.day(-12), note: null, billPaymentId: "bpy_bil_seed_kira", cashedOn: null, cashedById: null,
    createdById: p.leyla, createdAt: new Date(`${p.rentPaidOn}T09:00:00Z`),
  });

  await app.debtStore.saveLoan({
    id: "lon_seed_sut2", cafeId, lenderKey: `member:${p.murat}`, lenderMemberId: p.murat, lenderName: "Murat Aksu", amountKurus: 54_000,
    borrowedOn: p.day(6), dueDate: null, note: null, billPaymentId: "bpy_bil_seed_sut2", createdById: p.leyla, createdAt: p.on(6, 17),
  });
  await app.debtStore.addRepayment({
    id: "lrp_seed_1", cafeId, lenderKey: `member:${p.murat}`, amountKurus: 20_000, method: "cash", paidOn: p.day(3), account: "reserve", memberId: p.leyla, createdAt: p.on(3, 19),
  });
}

/**
 * Görevler (piece 22): opening for the first shift, closing for the last, the weekly
 * cleaning for baristas and the kitchen's for the chef. The last week mostly done, with
 * a closing left half done one night and a skipped job, so Bugün has something to say.
 */
async function seedTasks(app: PeniApp, p: { murat: string; hakan: string; ece: string; on: (daysAgo: number, hh: number, mm?: number) => Date }): Promise<void> {
  const cafeId = "cafe_moda";
  const timeZone = (await app.directory.getSettings(cafeId)).timeZone;
  const today = localDateKey(p.on(0, 12), timeZone);
  const since = plusDays(today, -60);
  const every: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
  const lists: { id: string; name: string; assign: TaskList["assign"]; items: { title: string; note?: string; days?: Weekday[] }[] }[] = [
    {
      id: "tsl_seed_open",
      name: "Açılış",
      assign: "first",
      items: [
        { title: "Işıkları ve müziği aç" },
        { title: "Espresso makinesini ısıt, ilk iki shot'u dök", note: "Süreyi kontrol et: 25–30 saniye." },
        { title: "Vitrini doldur" },
        { title: "Kasayı aç ve sayımı gir" },
      ],
    },
    {
      id: "tsl_seed_close",
      name: "Kapanış",
      assign: "last",
      items: [
        { title: "Makineye back-flush yap" },
        { title: "Süt sürahilerini ve pitcher'ları yıka" },
        { title: "Tezgahı ve zemini sil" },
        { title: "Çöpleri çıkar" },
        { title: "Kasayı say ve kapat" },
      ],
    },
    {
      id: "tsl_seed_weekly",
      name: "Haftalık temizlik",
      assign: "barista",
      items: [
        { title: "Buzdolabının içini sil", days: [1] },
        { title: "Öğütücüyü fırçala", days: [3] },
        { title: "Camları sil", days: [5] },
      ],
    },
    {
      id: "tsl_seed_kitchen",
      name: "Mutfak",
      assign: "chef",
      items: [
        { title: "Kurabiye hamurunu hazırla", days: [2, 3, 4, 5, 6] },
        { title: "Son kullanma tarihlerine bak", days: [1, 4] },
      ],
    },
  ];
  const items: TaskItem[] = [];
  for (const [n, l] of lists.entries()) {
    await app.taskStore.saveList({
      id: l.id, cafeId, name: l.name, assign: l.assign, sortOrder: n, archivedAt: null, createdById: p.murat, createdAt: p.on(60, 10), updatedAt: p.on(60, 10),
    });
    l.items.forEach((x, i) =>
      items.push({ id: `${l.id}_${i}`, cafeId, listId: l.id, title: x.title, note: x.note ?? null, days: x.days ?? every, sortOrder: i, fromDay: since, untilDay: null }),
    );
  }
  await app.taskStore.saveItems(items);

  // Who did them: the first or last shift's people, the barista or the chef on that day.
  const listOf = new Map(lists.map((l) => [l.id, l]));
  const shifts = await app.shiftStore.listShifts(cafeId, plusDays(today, -7), today);
  const checks: TaskCheck[] = [];
  for (let back = 7; back >= 0; back--) {
    const day = plusDays(today, -back);
    const ends = shiftEnds(shifts.filter((s) => s.day === day));
    for (const item of items.filter((i) => dueOn(i, day))) {
      const list = listOf.get(item.listId)!;
      const who = list.assign === "first" ? ends.first[0] : list.assign === "last" ? ends.last[0] : list.assign === "chef" ? p.hakan : p.ece;
      const n = item.sortOrder;
      // Today: the morning's opening is done but for the till; nothing else yet.
      if (back === 0 && (list.id !== "tsl_seed_open" || n === 3)) continue;
      // Three nights ago the closing was left half done.
      if (back === 3 && list.id === "tsl_seed_close" && n >= 3) continue;
      // The kitchen skipped a day.
      if (back === 2 && list.id === "tsl_seed_kitchen") continue;
      const skipped = back === 4 && list.id === "tsl_seed_weekly";
      const hour = list.id === "tsl_seed_close" ? 20 : list.id === "tsl_seed_open" ? 8 : 15;
      checks.push({
        cafeId, itemId: item.id, day, status: skipped ? "skipped" : "done", note: skipped ? "Merdiven yoktu, yarın" : null,
        title: item.title, listName: list.name, byId: who ?? p.murat, at: p.on(back, hour, 10 + n * 4),
      });
    }
  }
  for (const c of checks) await app.taskStore.saveCheck(c);
}

/**
 * Raporlar (plan piece 23): Moda's till from the start of last month to yesterday, so the
 * charts have weeks to compare. Busier at weekends and in the morning and late afternoon;
 * cash and card; a few line and order discounts and two refunds. Today stays empty so the
 * till starts the day at #1. Last month's own bills come with it, so its profit is real.
 */
async function seedSales(app: PeniApp, p: { murat: string; ece: string; leyla: string; on: (daysAgo: number, hh: number, mm?: number) => Date }): Promise<void> {
  const cafeId = "cafe_moda";
  const timeZone = (await app.directory.getSettings(cafeId)).timeZone;
  const day = (daysAgo: number) => localDateKey(p.on(daysAgo, 12), timeZone);
  const rand = mulberry32(1908);
  const menu = new Map((await app.menu.listMenu(cafeId)).map((m) => [m.productId, m]));
  const weights: [string, number][] = [["cay", 30], ["latte", 18], ["turk", 14], ["filtre", 12], ["simit", 12], ["cheesecake", 8], ["limonata", 6]];
  const pick = () => {
    let r = rand() * 100;
    for (const [id, w] of weights) if ((r -= w) < 0) return id;
    return "cay";
  };
  // Orders per hour from 08:00 to 21:00.
  const hourWeights = [3, 8, 9, 7, 5, 6, 6, 5, 7, 7, 5, 4, 3, 2];
  const hourOf = () => {
    let r = rand() * hourWeights.reduce((a, b) => a + b, 0);
    for (const [i, w] of hourWeights.entries()) if ((r -= w) < 0) return 8 + i;
    return 21;
  };
  const first = monthDays(addMonths(day(0).slice(0, 7), -1)).from;
  const back = Math.round((Date.parse(`${day(0)}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000);
  const refundOn = new Set([back - 9, 11]);

  for (let ago = back; ago >= 1; ago--) {
    const businessDay = day(ago);
    const weekday = new Date(`${businessDay}T12:00:00Z`).getUTCDay();
    const base = weekday === 6 ? 85 : weekday === 0 ? 75 : 55;
    const count = Math.round(base * (0.85 + rand() * 0.3));
    const times = Array.from({ length: count }, () => hourOf() * 60 + Math.floor(rand() * 60)).sort((a, b) => a - b);
    for (const [i, minute] of times.entries()) {
      const lines: OrderLine[] = [];
      const n = rand() < 0.55 ? 1 : rand() < 0.75 ? 2 : 3;
      for (let k = 0; k < n; k++) {
        const productId = pick();
        const same = lines.find((l) => l.productId === productId);
        if (same) same.quantity += 1;
        else {
          const m = menu.get(productId)!;
          lines.push({ productId, name: m.name, unitPriceKurus: m.priceKurus, quantity: productId === "cay" && rand() < 0.3 ? 2 : 1, discountPercent: rand() < 0.03 ? 10 : 0 });
        }
      }
      const discountPercent = rand() < 0.02 ? 15 : 0;
      const t = orderTotals(lines, discountPercent);
      const at = p.on(ago, Math.floor(minute / 60), minute % 60);
      const by = rand() < 0.75 ? p.ece : p.murat;
      const method: Payment["method"] = rand() < 0.42 ? "cash" : "card";
      const refunded = refundOn.has(ago) && i === 5;
      const id = `ord_seed_${businessDay}_${i + 1}`;
      const order: Order = {
        id, cafeId, number: i + 1, businessDay, status: refunded ? "refunded" : "paid", lines, discountPercent, ...t,
        createdAt: new Date(at.getTime() - 40_000), createdByMemberId: by, createKey: `seed:${id}`,
        paidAt: at, paidByMemberId: by, paymentMethod: method, tenderedKurus: null, changeKurus: null,
        voidedAt: null, voidedByMemberId: null, voidReason: null,
        refundedAt: refunded ? new Date(at.getTime() + 15 * 60_000) : null, refundedByMemberId: refunded ? p.murat : null,
        refundReason: refunded ? "Yanlış sipariş" : null, refundKurus: refunded ? t.totalKurus : null,
        deletedAt: null, deletedByMemberId: null, deleteReason: null,
      };
      await app.orderStore.saveOrder(order);
      const payment = (kind: Payment["kind"], when: Date, member: string): Payment => ({
        id: `pay_seed_${businessDay}_${i + 1}${kind === "refund" ? "_r" : ""}`, cafeId, orderId: id, kind, method, amountKurus: t.totalKurus,
        tenderedKurus: null, changeKurus: null, status: "approved", terminal: "manual", deviceId: null, cashSessionId: null,
        key: `seed:${kind}:${id}`, reason: kind === "refund" ? "Yanlış sipariş" : null, startedAt: when, startedByMemberId: member,
        settledAt: when, settledByMemberId: member, reference: null, receiptNo: null, failure: null,
      });
      await app.paymentStore.savePayment(payment("sale", at, by));
      if (refunded) await app.paymentStore.savePayment(payment("refund", order.refundedAt!, p.murat));
    }
  }

  // Last month's bills, all paid: rent, electricity, coffee, milk twice a week, simit.
  const month = first.slice(0, 7);
  const on = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const bill = (id: string, supplierId: string, date: string, lines: BillLine[], method: "cash" | "bank" | "card") => ({ id, supplierId, date, lines, method });
  const milk = [2, 5, 9, 12, 16, 19, 23, 26].map((d) =>
    bill(`bil_seed_lm_sut_${d}`, "sup_seed_sut", on(d), [{ itemId: "stk_sut", name: "Süt", category: "ingredients", qtyMilli: 18_000, totalKurus: 77_400 }], "cash"),
  );
  const bills = [
    bill("bil_seed_lm_kira", "sup_seed_ev", on(1), [{ itemId: null, name: "Dükkân kirası", category: "rent", qtyMilli: null, totalKurus: 4_500_000 }], "bank"),
    bill("bil_seed_lm_elektrik", "sup_seed_elektrik", on(8), [{ itemId: null, name: "Elektrik", category: "utilities", qtyMilli: null, totalKurus: 361_000 }], "bank"),
    bill(
      "bil_seed_lm_kahve",
      "sup_seed_kahve",
      on(12),
      [
        { itemId: "stk_espresso", name: "Espresso çekirdeği", category: "ingredients", qtyMilli: 4_000, totalKurus: 352_000 },
        { itemId: "stk_filtre", name: "Filtre kahve çekirdeği", category: "ingredients", qtyMilli: 2_000, totalKurus: 214_000 },
        { itemId: "stk_turk", name: "Türk kahvesi", category: "ingredients", qtyMilli: 2_000, totalKurus: 116_000 },
      ],
      "bank",
    ),
    bill("bil_seed_lm_simit", "sup_seed_firin", on(20), [{ itemId: "stk_simit", name: "Simit", category: "ingredients", qtyMilli: 120_000, totalKurus: 120_000 }], "cash"),
    bill("bil_seed_lm_temizlik", "sup_seed_ambalaj", on(14), [{ itemId: null, name: "Temizlik malzemesi", category: "supplies", qtyMilli: null, totalKurus: 64_000 }], "card"),
    ...milk,
  ];
  // Bills from the day the café started keeping its money on would need its moves too.
  for (const b of bills.filter((x) => x.date < day(18))) {
    const totalKurus = b.lines.reduce((s, l) => s + l.totalKurus, 0);
    const at = new Date(`${b.date}T09:00:00Z`);
    await app.billStore.saveBill({
      id: b.id, cafeId, supplierId: b.supplierId, number: null, date: b.date, dueDate: null, note: null, lines: b.lines, totalKurus, kdv: [], documentId: null, paidKurus: totalKurus,
      paidAt: at, payments: [], version: 1, voidedAt: null, voidedById: null, voidReason: null, createdById: p.leyla, createdAt: at, updatedAt: at, createKey: `seed:${b.id}`,
    });
    await app.billStore.addPayment({ id: `bpy_${b.id}`, cafeId, billId: b.id, amountKurus: totalKurus, method: b.method, paidOn: b.date, account: null, memberId: p.leyla, createdAt: at });
  }
}

/**
 * Taslaklar (piece 24): Murat photographed a packaging bill this morning and the assistant
 * read it into a draft for Leyla to check. Only with the demo's stand-in, which answers at
 * once; a real model reads it the first time Taslaklar opens.
 */
async function seedDrafts(app: PeniApp): Promise<void> {
  if (app.assistant.mode === "off") return;
  const murat = await app.staff.at((await app.staff.signIn(DEMO_STAFF.murat.email, DEMO_STAFF_PASSWORD)).token, "moda");
  const today = localDateKey(app.now(), TZ).split("-").reverse().join(".");
  const pdf = receiptPdf([
    { text: "AMBALAJ DÜNYASI TİC. LTD. ŞTİ.", bold: true },
    { text: "Ihlamurkuyu Sk. No:12 Kadiköy/Istanbul" },
    { text: "VKN 0123456789" },
    { text: "" },
    { text: `FATURA NO: A-20511     TARIH: ${today}` },
    { text: "----------------------------------------" },
    { text: "Karton bardak 8 oz" },
    { text: "  1000 adet x 1,45            1.450,00" },
    { text: "Peçete" },
    { text: "  20 paket x 18,00              360,00" },
    { text: "----------------------------------------" },
    { text: "KDV %20                         301,67" },
    { text: "TOPLAM (KDV DAHIL)            1.810,00", bold: true },
  ]);
  await app.assistant.upload(murat, pdf, "ambalaj-dunyasi.pdf");
  if (app.assistant.mode === "demo") await app.jobs.runDue();
}
