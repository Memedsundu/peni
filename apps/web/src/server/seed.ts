import { defaultSettings, startOfLocalDay } from "@peni/core";
import type { PeniApp, PostRecord } from "./app";

export const DEMO_CUSTOMERS = {
  ayse: { id: "cus_ayse", phone: "+905320000001", displayName: "Ayşe Yılmaz" },
  mehmet: { id: "cus_mehmet", phone: "+905320000002", displayName: "Mehmet Kaya" },
  deniz: { id: "cus_deniz", phone: "+905320000003", displayName: "Deniz Arslan" },
} as const;

/**
 * Neighbours who make the cafés feel lived in. In demo mode anyone can sign in
 * with one of these numbers and the code 000000 to see their state:
 * Kerem (pre-ordering off after two no-shows), Oğuz (blocked at Kuzguncuk).
 */
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
 * through the real code paths (orders, the ledger, gifts) with the clock moved
 * back, so every screen has its states: an earn on the fiş, a full HAREKETLER
 * list, a weekly askı line, a filling long table, a question with answers, an
 * ETA from real taps, live tickets on the Tezgâh and trends in the report.
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
    pausedUntil: null,
    referenceProductIds: ["cay", "turk"],
    hue: null,
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
    pausedUntil: null,
    hue: null,
  });

  app.pos.setMenu("cafe_moda", [
    { productId: "cay", name: "Çay", category: "Sıcak", priceKurus: 3_000, available: true, description: "İnce belli bardakta" },
    { productId: "turk", name: "Türk Kahvesi", category: "Sıcak", priceKurus: 9_000, available: true, description: "Yanında lokum" },
    { productId: "filtre", name: "Filtre Kahve", category: "Sıcak", priceKurus: 8_500, available: true, description: "Bu hafta Etiyopya Yirgacheffe" },
    { productId: "latte", name: "Latte", category: "Sıcak", priceKurus: 12_000, available: true, description: null },
    { productId: "limonata", name: "Ev Limonatası", category: "Soğuk", priceKurus: 11_000, available: true, description: "Taze nane ile" },
    { productId: "simit", name: "Simit", category: "Yiyecek", priceKurus: 2_500, available: true, description: "Sabah fırından" },
    { productId: "cheesecake", name: "San Sebastian", category: "Tatlı", priceKurus: 18_000, available: true, description: null },
  ]);
  app.pos.setMenu("cafe_kuzguncuk", [
    { productId: "cay", name: "Çay", category: "Sıcak", priceKurus: 2_500, available: true, description: "Demlikte, tavşan kanı" },
    { productId: "turk", name: "Türk Kahvesi", category: "Sıcak", priceKurus: 8_000, available: true, description: null },
    { productId: "sahlep", name: "Salep", category: "Sıcak", priceKurus: 10_000, available: true, description: "Tarçınlı" },
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
    askidaMinMembershipDays: 7,
  });

  // ─────────────────────────────────────────── people and memberships

  for (const c of Object.values(DEMO_CUSTOMERS)) {
    app.customers.set(c.id, { ...c, avatarUrl: null, profileVisible: c.id !== "cus_deniz" });
  }
  for (const c of Object.values(DEMO_NEIGHBOURS)) app.customers.set(c.id, { ...c, avatarUrl: null });

  const id = (who: Who) => (who in DEMO_CUSTOMERS ? DEMO_CUSTOMERS[who as keyof typeof DEMO_CUSTOMERS] : DEMO_NEIGHBOURS[who as keyof typeof DEMO_NEIGHBOURS]).id;
  const customer = (who: Who) => app.customers.get(id(who))!;
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
        app.handlePosEvent({
          type: "order.paid",
          posOrderId: `till_seed_${++n}`,
          peniOrderId: null,
          membershipHint: { memberCode: app.memberCodeFor(members[slug][who]!) },
          paidTotalKurus: tl * 100,
          paidAt: at.toISOString(),
        }),
      ),
    );

  type End = "submitted" | "accepted" | "ready" | "collected" | "rejected" | "no_show";
  /** An app order walked through by the barista, minute by minute. */
  const order = (o: {
    who: Who;
    slug: Slug;
    at: Date;
    lines: [string, number][];
    end: End;
    askida?: string;
    usePeni?: number;
    note?: string;
    prep?: number;
    pickup?: number;
    reason?: string;
  }) =>
    plan(o.at, async () => {
      const after = (min: number) => new Date(Math.min(o.at.getTime() + min * MIN, Math.max(o.at.getTime(), now.getTime())));
      const created = await app.at(o.at, () =>
        app.createOrder(customer(o.who), {
          cafeSlug: o.slug,
          lines: o.lines.map(([productId, quantity]) => ({ productId, quantity })),
          usePeni: o.usePeni ?? 0,
          askidaProductId: o.askida ?? null,
          customerNote: o.note,
          idempotencyKey: `seed_order_${++n}`,
        }),
      );
      const staff = (min: number, action: "accept" | "ready" | "collect" | "reject" | "no_show") =>
        app.at(after(min), () => app.staffTransition(o.slug, created.id, action, o.reason));
      if (o.end === "submitted") return;
      if (o.end === "rejected") return staff(2, "reject");
      await staff(1, "accept");
      if (o.end === "accepted") return;
      const ready = 1 + (o.prep ?? 6);
      await staff(ready, "ready");
      if (o.end === "ready") return;
      if (o.end === "no_show") return staff(ready + 25, "no_show");
      await staff(ready + (o.pickup ?? 3), "collect");
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
  order({ who: "kerem", slug: "moda", at: on(6, 9, 30), lines: [["simit", 1], ["cay", 1]], askida: "simit", end: "collected", prep: 4 });
  order({ who: "elif", slug: "moda", at: on(5, 8, 40), lines: [["cay", 1], ["simit", 1]], askida: "cay", end: "collected", prep: 3 });
  donate("zeynep", "moda", on(4, 18, 30), 30, true);
  order({ who: "burak", slug: "moda", at: on(3, 16, 20), lines: [["cay", 1]], askida: "cay", end: "collected", prep: 4 });
  donate("can", "moda", on(2, 13, 0), 30, false);
  order({ who: "oguz", slug: "moda", at: on(2, 11, 5), lines: [["cay", 1], ["simit", 1]], askida: "cay", end: "collected", prep: 5 });
  donate("irem", "moda", on(1, 17, 45), 25, true);
  till("moda", on(1, 19, 10), 60);
  till("kuzguncuk", on(5, 12, 0), 75);
  order({ who: "oguz", slug: "kuzguncuk", at: on(4, 10, 20), lines: [["cay", 1], ["pogaca", 1]], askida: "cay", end: "collected", prep: 5 });

  // Ayşe's own orders: Siparişlerim has a past, and "Her zamanki" is Latte + Simit.
  order({ who: "ayse", slug: "moda", at: on(6, 9, 40), lines: [["latte", 1], ["simit", 1]], end: "collected", prep: 6 });
  order({ who: "ayse", slug: "moda", at: on(4, 15, 20), lines: [["turk", 2]], usePeni: 30, end: "collected", prep: 8 });
  order({ who: "ayse", slug: "moda", at: on(3, 10, 5), lines: [["latte", 1]], end: "rejected", reason: "Malzeme bitti" });
  order({ who: "ayse", slug: "moda", at: on(1, 8, 50), lines: [["latte", 1], ["simit", 1]], end: "collected", prep: 5 });
  order({ who: "ayse", slug: "kuzguncuk", at: on(8, 11, 30), lines: [["cay", 2], ["pogaca", 1]], end: "collected", prep: 4 });
  order({ who: "ayse", slug: "kuzguncuk", at: on(5, 16, 0), lines: [["sahlep", 1]], end: "collected", prep: 7 });

  // Mehmet missed one pickup, then came back.
  order({ who: "mehmet", slug: "moda", at: on(7, 12, 15), lines: [["filtre", 1]], end: "collected", prep: 5 });
  order({ who: "mehmet", slug: "moda", at: on(2, 17, 30), lines: [["latte", 1]], end: "no_show", prep: 6 });

  // Kerem missed two in a row: pre-ordering is off for him at Moda.
  order({ who: "kerem", slug: "moda", at: on(4, 17, 40), lines: [["latte", 1]], end: "no_show", prep: 6 });
  order({ who: "kerem", slug: "moda", at: on(2, 18, 10), lines: [["filtre", 1]], end: "no_show", prep: 5 });

  // A busy week at Moda: enough real taps (20+) for "genelde 5–8 dk".
  const usual: Partial<Record<Who, [string, number][][]>> = {
    zeynep: [[["filtre", 1]], [["filtre", 1], ["simit", 1]]],
    can: [[["cay", 2]], [["turk", 1]]],
    elif: [[["latte", 1]], [["latte", 1], ["cheesecake", 1]]],
    emre: [[["turk", 1]], [["filtre", 1]]],
    selin: [[["limonata", 1]], [["latte", 1]]],
    burak: [[["cay", 1], ["simit", 1]]],
    irem: [[["latte", 1], ["simit", 1]]],
  };
  const prepMinutes = [4, 5, 6, 6, 7, 7, 7, 8, 8, 9];
  const regularsAtModa = Object.keys(usual) as Who[];
  for (let day = 7; day >= 1; day--) {
    const count = 3 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const who = regularsAtModa[Math.floor(rand() * regularsAtModa.length)]!;
      const options = usual[who]!;
      order({
        who,
        slug: "moda",
        at: on(day, 8 + Math.floor(rand() * 11), Math.floor(rand() * 60)),
        lines: options[Math.floor(rand() * options.length)]!,
        end: "collected",
        prep: prepMinutes[Math.floor(rand() * prepMinutes.length)]!,
        pickup: 1 + Math.floor(rand() * 5),
      });
    }
  }
  order({ who: "nermin", slug: "kuzguncuk", at: on(6, 10, 10), lines: [["turk", 1]], end: "collected", prep: 6 });
  order({ who: "can", slug: "kuzguncuk", at: on(3, 15, 45), lines: [["sahlep", 2]], end: "collected", prep: 8 });

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
  order({ who: "mehmet", slug: "moda", at: earlierToday(190), lines: [["cay", 1], ["simit", 1]], askida: "cay", end: "collected", prep: 3 });
  gift({ from: "mehmet", to: "ayse", slug: "moda", at: earlierToday(120), peni: 30, message: "Afiyet olsun!" });
  gift({ from: "ayse", to: "zeynep", slug: "moda", at: earlierToday(50), peni: 45, message: "Takas rafı fikri için sağ ol." });
  // Live tickets on the Tezgâh: one ready, one being made, one just in.
  order({ who: "emre", slug: "moda", at: earlierToday(16), lines: [["filtre", 1], ["cheesecake", 1]], usePeni: 20, end: "ready", prep: 6 });
  order({ who: "can", slug: "moda", at: earlierToday(8), lines: [["cay", 2]], end: "accepted" });
  order({ who: "zeynep", slug: "moda", at: earlierToday(2), lines: [["latte", 1], ["simit", 1]], note: "az şekerli, yulaf sütlü", end: "submitted" });
  order({ who: "nermin", slug: "kuzguncuk", at: earlierToday(4), lines: [["sahlep", 1]], note: "Tarçını bol olsun.", end: "submitted" });

  steps.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const step of steps) await step.run();

  // Oğuz is blocked at Kuzguncuk (staff decision; the reason is never shown to anyone).
  const blocked = (await app.directory.getMembership(members.kuzguncuk.oguz!))!;
  await app.directory.saveMembership({ ...blocked, blocked: true });

  // ─────────────────────────────────────────── the Masa

  const post = (p: Omit<PostRecord, "reactions" | "rsvps" | "comments">, extra?: Partial<PostRecord>): void => {
    app.posts.set(p.id, { ...p, reactions: new Set(), rsvps: new Set(), comments: [], ...extra });
  };
  const ids = (...who: Who[]) => new Set(who.map(id));
  const answer = (cid: string, who: Who, body: string, at: Date) => ({ id: cid, customerId: id(who), body, createdAt: at });

  post(
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
    { rsvps: ids("ayse", "zeynep", "can", "elif", "emre", "selin"), reactions: ids("mehmet", "irem") },
  );
  const asked = earlierToday(200);
  post(
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
      reactions: ids("mehmet", "zeynep", "selin"),
      comments: [
        answer("cmt_1", "mehmet", "Yel değirmeni parkının arkasındaki bank. Gün batımı başka.", earlierToday(170)),
        answer("cmt_2", "zeynep", "Bahariye'deki eski sahafın üst katı. Sorarsan çay da koyuyorlar.", earlierToday(120)),
        answer("cmt_3", "elif", "İskelenin arkasındaki taşlar, sabah yedide. Martılardan başka kimse yok.", earlierToday(75)),
        answer("cmt_4", "emre", "Kırmızı kapılı sokak. Adı yok ama herkes öyle diyor.", earlierToday(30)),
      ],
    },
  );
  post(
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
      reactions: ids("ayse", "zeynep", "selin", "emre"),
      comments: [
        answer("cmt_5", "selin", "Dün denedim; çiçeksi, çok hafif.", on(1, 16, 20)),
        answer("cmt_6", "can", "Çekirdek olarak da satıyor musunuz?", on(1, 18, 5)),
      ],
    },
  );
  post({
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
  post(
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
    { rsvps: ids("ayse", "mehmet", "zeynep", "can", "elif", "emre", "selin", "burak", "irem") },
  );

  post(
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
    { rsvps: ids("nermin", "can", "oguz", "ayse") },
  );
  post({
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
