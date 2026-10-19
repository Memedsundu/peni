import { execSync } from "node:child_process";
import { Ledger, NO_PIN, PeniService, defaultSettings } from "@peni/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, createPrismaStores, type PrismaClient } from "../src";

// Runs against a real, disposable Postgres when TEST_DATABASE_URL is set; skipped otherwise.
// Never wipes data: every run uses fresh ids.
const url = process.env.TEST_DATABASE_URL;
const run = Math.random().toString(36).slice(2, 8);
const at = new Date("2026-10-16T09:00:00Z");

describe.skipIf(!url)("Prisma stores against Postgres", () => {
  let prisma: PrismaClient;
  let stores: ReturnType<typeof createPrismaStores>;
  const cafeId = `cafe_${run}`;
  const ayse = `cus_ayse_${run}`;
  const mehmet = `cus_mehmet_${run}`;

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    prisma = createPrismaClient(url);
    stores = createPrismaStores(prisma);
    await stores.identity.saveCafe({
      id: cafeId,
      slug: `moda-${run}`,
      name: "Moda Kahvesi",
      address: null,
      district: "Kadıköy",
      city: "İstanbul",
      coverImageUrl: null,
      referenceProductIds: ["cay"],
      hue: null,
    });
    for (const [id, phone] of [
      [ayse, `+90532${run.length}${Date.now() % 1_000_000}1`],
      [mehmet, `+90532${run.length}${Date.now() % 1_000_000}2`],
    ] as const) {
      await stores.identity.saveCustomer({ id, phone, email: null, displayName: id, avatarUrl: null, profileVisible: true });
    }
  });
  afterAll(() => prisma?.$disconnect());

  it("keeps cafés, settings and the menu", async () => {
    await stores.directory.saveSettings({ ...defaultSettings(cafeId), earnRateBps: 700, askidaProductIds: ["cay"] });
    expect(await stores.directory.getSettings(cafeId)).toMatchObject({ earnRateBps: 700, askidaProductIds: ["cay"], redeemableProductIds: null });
    const hot = { id: `cat_hot_${run}`, cafeId, name: "Sıcak", sortOrder: 1 };
    const sweet = { id: `cat_sweet_${run}`, cafeId, name: "Tatlı", sortOrder: 0 };
    await stores.menu.saveCategory(hot);
    await stores.menu.saveCategory(sweet);
    const base = { categoryId: hot.id, category: "", available: true };
    await stores.menu.saveProduct(cafeId, { ...base, productId: "turk", name: "Türk Kahvesi", priceKurus: 9_000, sortOrder: 1 });
    await stores.menu.saveProduct(cafeId, { ...base, productId: "cay", name: "Çay", priceKurus: 3_000, sortOrder: 0, description: "İnce belli" });
    await stores.menu.saveProduct(cafeId, { ...base, productId: "kek", name: "Kek", categoryId: sweet.id, priceKurus: 6_000 });
    await stores.menu.saveProduct(cafeId, { ...base, productId: "cay", name: "Çay", priceKurus: 3_500, sortOrder: 0 });
    await stores.menu.saveProduct(cafeId, { ...base, productId: "eski", name: "Eski", priceKurus: 1_000, archivedAt: at });
    expect((await stores.menu.listMenu(cafeId)).map((m) => [m.productId, m.category, m.priceKurus, m.description ?? null])).toEqual([
      ["kek", "Tatlı", 6_000, null],
      ["cay", "Sıcak", 3_500, null],
      ["turk", "Sıcak", 9_000, null],
    ]);
    expect((await stores.menu.listMenu(cafeId, { includeArchived: true })).map((m) => m.productId)).toContain("eski");
    expect((await stores.menu.listCategories(cafeId)).map((c) => c.name)).toEqual(["Tatlı", "Sıcak"]);
    await stores.menu.deleteCategory(cafeId, sweet.id);
    expect(await stores.menu.getProduct(cafeId, "kek")).toMatchObject({ categoryId: null, category: "" });
    expect(await stores.menu.getProduct(cafeId, "yok")).toBeNull();
    expect((await stores.identity.getCafeBySlug(`moda-${run}`))!.referenceProductIds).toEqual(["cay"]);
  });

  it("keeps memberships, member codes, sessions and lookups", async () => {
    const joinedAt = new Date("2026-09-01T00:00:00Z");
    await stores.directory.saveMembership({ id: `m_ayse_${run}`, cafeId, customerId: ayse, joinedAt, blocked: false });
    await stores.directory.saveMembership({ id: `m_mehmet_${run}`, cafeId, customerId: mehmet, joinedAt: at, blocked: false });
    expect((await stores.directory.findMembership(ayse, cafeId))!.id).toBe(`m_ayse_${run}`);
    expect((await stores.directory.listMemberships({ cafeId })).map((m) => m.customerId)).toEqual([ayse, mehmet]);

    const code = `T${run.slice(0, 2).toUpperCase()}-${run.slice(2, 5).toUpperCase()}`;
    expect(await stores.identity.setMemberCode(`m_ayse_${run}`, code)).toBe(true);
    expect(await stores.identity.setMemberCode(`m_mehmet_${run}`, code)).toBe(false);
    expect(await stores.identity.membershipIdForCode(code)).toBe(`m_ayse_${run}`);

    await stores.identity.createSession(ayse, `hash_${run}`, new Date(at.getTime() + 60_000));
    expect(await stores.identity.customerIdForSession(`hash_${run}`, at)).toBe(ayse);
    expect(await stores.identity.customerIdForSession(`hash_${run}`, new Date(at.getTime() + 120_000))).toBeNull();
    await stores.identity.revokeSession(`hash_${run}`, at);
    expect(await stores.identity.customerIdForSession(`hash_${run}`, at)).toBeNull();

    await stores.identity.recordLookup(ayse, at);
    await stores.identity.recordLookup(ayse, new Date(at.getTime() - 2 * 3_600_000));
    expect(await stores.identity.countLookups(ayse, new Date(at.getTime() - 3_600_000))).toBe(1);
  });

  it("keeps staff accounts, their cafés, sessions, sign-in failures and role changes", async () => {
    const accountId = `acct_${run}`;
    const email = `Selin.${run}@Moda.TEST`;
    await stores.staff.saveAccount({ id: accountId, email, name: "Selin", passwordHash: "x", customerId: mehmet, disabledAt: null });
    expect((await stores.staff.getAccountByEmail(email.toLowerCase()))!.id).toBe(accountId);
    expect((await stores.staff.accountForCustomer(mehmet))!.email).toBe(email.toLowerCase());

    await stores.staff.saveMember({ id: `sm_${run}`, cafeId, accountId, role: "chef", createdAt: at, removedAt: null, ...NO_PIN });
    await stores.staff.saveMember({ id: `sm_${run}`, cafeId, accountId, role: "manager", createdAt: at, removedAt: null, ...NO_PIN, pinHash: "p", pinFailures: 2 });
    expect(await stores.staff.memberAt(accountId, cafeId)).toMatchObject({ pinHash: "p", pinFailures: 2, pinLockedUntil: null });
    expect((await stores.staff.memberAt(accountId, cafeId))!.role).toBe("manager");
    expect((await stores.staff.listMembers(cafeId)).map((m) => m.id)).toEqual([`sm_${run}`]);

    const device = { id: `dev_${run}`, cafeId, name: "Kasa", createdAt: at, createdByMemberId: `sm_${run}`, lastSeenAt: null, revokedAt: null };
    await stores.staff.createDevice(device, `dh_${run}`);
    expect(await stores.staff.deviceForToken(`dh_${run}`)).toEqual(device);
    await stores.staff.createSession(accountId, `pin_${run}`, new Date(at.getTime() + 60_000), { cafeId, deviceId: device.id });
    expect(await stores.staff.sessionFor(`pin_${run}`)).toMatchObject({ method: "pin", cafeId, deviceId: device.id });
    await stores.staff.revokeSessionsOnDevice(device.id, at);
    expect((await stores.staff.sessionFor(`pin_${run}`))!.revokedAt).toEqual(at);
    await stores.staff.saveDevice({ ...device, revokedAt: at });
    expect(await stores.staff.listDevices(cafeId)).toEqual([]);

    await stores.staff.saveMember({ id: `sm_${run}`, cafeId, accountId, role: "manager", createdAt: at, removedAt: at, ...NO_PIN });
    expect(await stores.staff.membershipsOf(accountId)).toEqual([]);

    await stores.staff.createSession(accountId, `s1_${run}`, new Date(at.getTime() + 60_000));
    await stores.staff.createSession(accountId, `s2_${run}`, new Date(at.getTime() + 60_000));
    await stores.staff.revokeSessionsOf(accountId, at, `s2_${run}`);
    expect((await stores.staff.sessionFor(`s1_${run}`))!.revokedAt).toEqual(at);
    expect(await stores.staff.sessionFor(`s2_${run}`)).toMatchObject({ revokedAt: null, method: "password", cafeId: null, deviceId: null });

    await stores.staff.recordFailedSignIn(email, at);
    expect(await stores.staff.countFailedSignIns(email.toLowerCase(), new Date(at.getTime() - 1))).toBe(1);

    await stores.staff.replaceOverrides(cafeId, [{ role: "barista", permission: "stock.view", allowed: true }]);
    await stores.staff.replaceOverrides(cafeId, [
      { role: "chef", permission: "menu.edit", allowed: true },
      { role: "barista", permission: "till.history", allowed: false },
    ]);
    const saved = await stores.staff.listOverrides(cafeId);
    expect(saved).toHaveLength(2);
    expect(saved).toEqual(
      expect.arrayContaining([
        { role: "chef", permission: "menu.edit", allowed: true },
        { role: "barista", permission: "till.history", allowed: false },
      ]),
    );
  });

  it("keeps customer logins and email codes", async () => {
    const email = `ayse.${run}@example.com`;
    await stores.identity.saveCustomer({ ...(await stores.identity.getCustomer(ayse))!, email });
    expect((await stores.identity.getCustomerByEmail(email.toUpperCase()))!.id).toBe(ayse);
    await stores.identity.addLogin({ customerId: ayse, provider: "google", subject: `g_${run}`, email });
    await stores.identity.addLogin({ customerId: ayse, provider: "google", subject: `g_${run}`, email });
    await stores.identity.addLogin({ customerId: ayse, provider: "email", subject: email, email });
    expect(await stores.identity.findLogin("google", `g_${run}`)).toEqual({ customerId: ayse, provider: "google", subject: `g_${run}`, email });
    expect((await stores.identity.loginsOf(ayse)).map((l) => l.provider)).toEqual(["google", "email"]);

    const code = { id: `ec_${run}`, email, codeHash: "h", createdAt: at, expiresAt: new Date(at.getTime() + 600_000), attempts: 0, usedAt: null };
    await stores.identity.saveEmailCode(code);
    await stores.identity.saveEmailCode({ ...code, id: `ec2_${run}`, createdAt: new Date(at.getTime() + 1000) });
    expect((await stores.identity.liveEmailCode(email, at))!.id).toBe(`ec2_${run}`);
    await stores.identity.saveEmailCode({ ...code, id: `ec2_${run}`, createdAt: new Date(at.getTime() + 1000), usedAt: at, attempts: 1 });
    expect((await stores.identity.liveEmailCode(email, at))!.id).toBe(`ec_${run}`);
    expect(await stores.identity.liveEmailCode(email, new Date(at.getTime() + 700_000))).toBeNull();
    expect(await stores.identity.countEmailCodes(email, new Date(at.getTime() - 1))).toBe(2);
  });

  it("keeps the feed with reactions, RSVPs in order and comments", async () => {
    const postId = `post_${run}`;
    await stores.community.savePost({
      id: postId,
      cafeId,
      kind: "event",
      title: "Takas kütüphanesi",
      body: "Kitabını getir.",
      publishedAt: at,
      pinned: true,
      eventStartsAt: new Date("2026-10-22T16:00:00Z"),
      eventCapacity: 10,
    });
    await stores.community.addRsvp(postId, mehmet, new Date(at.getTime() + 1_000));
    await stores.community.addRsvp(postId, ayse, new Date(at.getTime() + 2_000));
    await stores.community.addRsvp(postId, ayse, new Date(at.getTime() + 3_000));
    expect(await stores.community.toggleReaction(postId, ayse, at)).toBe(true);
    expect(await stores.community.toggleReaction(postId, mehmet, at)).toBe(true);
    expect(await stores.community.toggleReaction(postId, mehmet, at)).toBe(false);
    await stores.community.addComment(postId, { id: `cmt_${run}`, customerId: ayse, body: "Geliyorum", createdAt: at });
    const post = (await stores.community.getPost(postId))!;
    expect(post).toMatchObject({ title: "Takas kütüphanesi", rsvps: [mehmet, ayse], reactions: [ayse] });
    expect(post.comments.map((c) => c.body)).toEqual(["Geliyorum"]);
    await stores.community.removeRsvp(postId, mehmet);
    expect((await stores.community.listPosts(cafeId))[0]!.rsvps).toEqual([ayse]);
  });

  it("keeps photos, hidden comments for moderators only, and posts taken down", async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    await stores.images.save({ id: `img_${run}`, cafeId, contentType: "image/png", bytes: png, uploadedBy: "staff_x", createdAt: at });
    const image = (await stores.images.get(`img_${run}`))!;
    expect([image.contentType, [...image.bytes]]).toEqual(["image/png", [...png]]);
    expect(await stores.images.get("img_nope")).toBeNull();

    const postId = `post_photo_${run}`;
    const post = { id: postId, cafeId, kind: "post" as const, title: null, body: "Yeni kavurduk", publishedAt: at, pinned: false, eventStartsAt: null, eventCapacity: null };
    await stores.community.savePost({ ...post, imageUrls: [`/api/v1/images/img_${run}`] });
    await stores.community.addComment(postId, { id: `cmt_a_${run}`, customerId: ayse, body: "Güzel", createdAt: at });
    await stores.community.addComment(postId, { id: `cmt_b_${run}`, customerId: mehmet, body: "Reklam", createdAt: at });
    await stores.community.setCommentHidden(postId, `cmt_b_${run}`, at);
    expect((await stores.community.getPost(postId))!.comments.map((c) => c.body)).toEqual(["Güzel"]);
    const forModerators = (await stores.community.getPost(postId, { hiddenComments: true }))!;
    expect(forModerators.comments.map((c) => [c.body, !!c.hiddenAt])).toEqual([["Güzel", false], ["Reklam", true]]);
    expect(forModerators.imageUrls).toEqual([`/api/v1/images/img_${run}`]);
    await stores.community.deleteComment(postId, `cmt_a_${run}`);
    await stores.community.setCommentHidden(postId, `cmt_b_${run}`, null);
    expect((await stores.community.getPost(postId))!.comments.map((c) => c.body)).toEqual(["Reklam"]);

    await stores.community.savePost({ ...post, hiddenAt: at });
    expect(await stores.community.getPost(postId)).toBeNull();
    expect((await stores.community.listPosts(cafeId)).map((p) => p.id)).not.toContain(postId);
  });

  it("keeps members' events, one report per member, and paused members", async () => {
    const event = {
      id: `post_m_${run}`, cafeId, kind: "event" as const, title: "Satranç", body: "", publishedAt: at, pinned: false,
      eventStartsAt: new Date(at.getTime() + 86_400_000), eventCapacity: 4, imageUrls: [], authorId: null, hostCustomerId: mehmet, hiddenAt: null,
    };
    await stores.community.savePost(event);
    expect((await stores.community.getPost(event.id))!.hostCustomerId).toBe(mehmet);
    await stores.community.savePost({ ...event, hiddenAt: at });
    expect(await stores.community.getPost(event.id)).toBeNull();
    expect((await stores.community.getPost(event.id, { hiddenPosts: true }))!.hiddenAt).toEqual(at);

    const report = {
      id: `rep_${run}`, cafeId, targetType: "post" as const, targetId: event.id, postId: event.id, reporterId: ayse, reason: "spam" as const,
      note: "Reklam", status: "open" as const, createdAt: at, resolvedAt: null, resolvedBy: null,
    };
    expect(await stores.reports.add(report)).toBe(true);
    expect(await stores.reports.add({ ...report, id: `rep_dup_${run}` })).toBe(false);
    expect(await stores.reports.listOpen(cafeId)).toEqual([report]);
    expect(await stores.reports.reportedBy(cafeId, ayse)).toEqual(new Set([`post:${event.id}`]));
    await stores.reports.resolve("post", event.id, "upheld", "sm_x", at);
    expect(await stores.reports.openFor("post", event.id)).toEqual([]);

    const m = (await stores.directory.findMembership(mehmet, cafeId))!;
    await stores.directory.saveMembership({ ...m, pausedAt: at });
    expect((await stores.directory.findMembership(mehmet, cafeId))!.pausedAt).toEqual(at);
    // Saving a membership without a pause leaves the pause alone.
    const { pausedAt: _p, ...unpaused } = m;
    await stores.directory.saveMembership({ ...unpaused, blocked: false });
    expect((await stores.directory.getMembership(m.id))!.pausedAt).toEqual(at);
    await stores.directory.saveMembership({ ...m, pausedAt: null });
    expect((await stores.directory.getMembership(m.id))!.pausedAt).toBeNull();
  });

  it("commits a gift with the ledger, and keeps its thank-you", async () => {
    const service = new PeniService(new Ledger(stores.ledger), stores.directory, () => at);
    await service.earnForPaidOrder({ membershipId: `m_ayse_${run}`, orderId: `o_${run}`, paidTotalKurus: 100_000 }); // 70 peni
    const gift = await service.sendGift({ fromMembershipId: `m_ayse_${run}`, toMembershipId: `m_mehmet_${run}`, peni: 30, idempotencyKey: `g_${run}` });
    await service.acceptGift(gift.id, `m_mehmet_${run}`);
    const accepted = (await stores.directory.getGift(gift.id))!;
    await stores.directory.saveGift({ ...accepted, thankedAt: at });
    expect(await stores.directory.getGift(gift.id)).toMatchObject({ status: "accepted", thankedAt: at });
    expect(await service.walletBalance(`m_mehmet_${run}`)).toBe(30);

    // A refused gift leaves no gift row behind.
    await expect(
      service.sendGift({ fromMembershipId: `m_ayse_${run}`, toMembershipId: `m_mehmet_${run}`, peni: 150, idempotencyKey: `g2_${run}` }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(await stores.directory.listGifts({ membershipId: `m_ayse_${run}` })).toHaveLength(1);
  });

  it("numbers orders per café and day even when tills ask at once, and keeps their lines", async () => {
    const day = "2026-10-16";
    const numbers = await Promise.all(Array.from({ length: 12 }, () => stores.orders.nextNumber(cafeId, day)));
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(await stores.orders.nextNumber(cafeId, "2026-10-17")).toBe(1);

    const line = (productId: string, unitPriceKurus: number, quantity: number, discountPercent = 0) => ({ productId, name: productId, unitPriceKurus, quantity, discountPercent });
    const base = {
      cafeId, businessDay: day, status: "open" as const, discountPercent: 0, createdByMemberId: "sm_x",
      paidAt: null, paidByMemberId: null, paymentMethod: null, tenderedKurus: null, changeKurus: null,
      voidedAt: null, voidedByMemberId: null, voidReason: null, refundedAt: null, refundedByMemberId: null, refundReason: null,
      refundKurus: null, deletedAt: null, deletedByMemberId: null, deleteReason: null,
    };
    const first = { ...base, id: `ord_1_${run}`, number: 1, createKey: `ck1_${run}`, createdAt: at, lines: [line("cay", 3_000, 2), line("simit", 2_500, 1, 10)], subtotalKurus: 8_500, discountKurus: 250, totalKurus: 8_250 };
    await stores.orders.saveOrder(first);
    await stores.orders.saveOrder({ ...base, id: `ord_2_${run}`, number: 2, createKey: `ck2_${run}`, createdAt: new Date(at.getTime() + 60_000), lines: [line("turk", 9_000, 1)], subtotalKurus: 9_000, discountKurus: 0, totalKurus: 9_000 });
    expect((await stores.orders.getOrder(cafeId, first.id))!.lines).toEqual(first.lines);

    // Paying replaces the lines and fields in one write.
    await stores.orders.saveOrder({ ...first, status: "paid", paidAt: at, paymentMethod: "cash", tenderedKurus: 10_000, changeKurus: 1_750, lines: [line("cay", 3_000, 2)] });
    expect(await stores.orders.getOrder(cafeId, first.id)).toMatchObject({ status: "paid", paymentMethod: "cash", changeKurus: 1_750, lines: [line("cay", 3_000, 2)] });
    expect((await stores.orders.findByCreateKey(cafeId, `ck1_${run}`))!.id).toBe(first.id);

    // A second order with the same create key is refused by the database.
    await expect(stores.orders.saveOrder({ ...first, id: `ord_dup_${run}`, number: 3 })).rejects.toThrow();

    expect((await stores.orders.listOrders(cafeId, { businessDay: day })).map((o) => o.number)).toEqual([2, 1]);
    expect((await stores.orders.listOrders(cafeId, { status: "paid" })).map((o) => o.number)).toEqual([1]);
    await stores.orders.saveOrder({ ...(await stores.orders.getOrder(cafeId, `ord_2_${run}`))!, deletedAt: at, deletedByMemberId: "sm_x", deleteReason: "Deneme" });
    expect((await stores.orders.listOrders(cafeId)).map((o) => o.number)).toEqual([1]);
    expect(await stores.orders.getOrder("cafe_other", first.id)).toBeNull();
  });

  it("keeps peni claims with one code per café and day", async () => {
    const day = "2026-10-20";
    const orderId = `ord_c_${run}`;
    const order = {
      id: orderId, cafeId, number: 1, businessDay: day, status: "paid" as const, discountPercent: 0, createdByMemberId: "sm_x",
      createKey: `ckc_${run}`, createdAt: at, lines: [{ productId: "cay", name: "Çay", unitPriceKurus: 3_000, quantity: 1, discountPercent: 0 }],
      subtotalKurus: 3_000, discountKurus: 0, totalKurus: 3_000, paidAt: at, paidByMemberId: "sm_x", paymentMethod: "cash" as const,
      tenderedKurus: null, changeKurus: null, voidedAt: null, voidedByMemberId: null, voidReason: null,
      refundedAt: null, refundedByMemberId: null, refundReason: null, refundKurus: null, deletedAt: null, deletedByMemberId: null, deleteReason: null,
    };
    await stores.orders.saveOrder(order);
    await stores.orders.saveOrder({ ...order, id: `${orderId}_2`, number: 2, createKey: `ckc2_${run}` });
    const claim = {
      id: `clm_${run}`, cafeId, orderId, businessDay: day, code: "0427", token: `tok_${run}`, peni: 5, createdAt: at,
      expiresAt: new Date("2026-10-20T21:00:00Z"), claimedAt: null, claimedByMembershipId: null, cancelledAt: null,
    };
    expect(await stores.claims.saveClaim(claim)).toBe(true);
    expect(await stores.claims.saveClaim({ ...claim, id: `clm2_${run}`, orderId: `${orderId}_2`, token: `tok2_${run}` })).toBe(false);
    expect([...(await stores.claims.codesUsed(cafeId, day))]).toEqual(["0427"]);
    expect(await stores.claims.saveClaim({ ...claim, cancelledAt: at })).toBe(true);
    expect(await stores.claims.getClaimByOrder(cafeId, orderId)).toEqual({ ...claim, cancelledAt: at });

    // Piece 10: found by its QR token or its code, and taken once inside the ledger's transaction.
    const open = { ...claim, id: `clm3_${run}`, orderId: `${orderId}_2`, code: "1234", token: `tok3_${run}`, peni: 9 };
    expect(await stores.claims.saveClaim(open)).toBe(true);
    expect((await stores.claims.getClaimByToken(`tok3_${run}`))!.id).toBe(open.id);
    expect((await stores.claims.getClaimByCode(cafeId, day, "1234"))!.id).toBe(open.id);
    expect(await stores.claims.getClaimByCode(cafeId, day, "9999")).toBeNull();
    const service = new PeniService(new Ledger(stores.ledger), stores.directory, () => at, stores.claims);
    const before = await service.walletBalance(`m_ayse_${run}`);
    await service.takeClaim(open.id, `m_ayse_${run}`);
    await expect(service.takeClaim(open.id, `m_mehmet_${run}`)).rejects.toMatchObject({ code: "CLAIM_TAKEN" });
    expect(await service.walletBalance(`m_ayse_${run}`)).toBe(before + 9);
    expect(await stores.claims.getClaim(open.id)).toMatchObject({ claimedAt: at, claimedByMembershipId: `m_ayse_${run}` });

    await stores.claims.recordMiss(ayse, at);
    await stores.claims.recordMiss(ayse, at);
    expect(await stores.claims.countMisses(ayse, at)).toBe(2);
    expect(await stores.claims.countMisses(mehmet, at)).toBe(0);
  });

  it("keeps one ödeme kodu per member, unique at the café, and spends through the ledger", async () => {
    const code = (membershipId: string, digits: string) => ({
      cafeId, membershipId, code: digits, createdAt: at, expiresAt: new Date(at.getTime() + 300_000),
    });
    expect(await stores.spendCodes.saveSpendCode(code(`m_ayse_${run}`, "111111"))).toBe(true);
    expect(await stores.spendCodes.saveSpendCode(code(`m_mehmet_${run}`, "111111"))).toBe(false);
    expect(await stores.spendCodes.saveSpendCode(code(`m_ayse_${run}`, "222222"))).toBe(true);
    expect(await stores.spendCodes.getSpendCode(cafeId, "111111")).toBeNull();
    expect((await stores.spendCodes.getSpendCode(cafeId, "222222"))!.membershipId).toBe(`m_ayse_${run}`);

    const service = new PeniService(new Ledger(stores.ledger), stores.directory, () => at, stores.claims, stores.spendCodes);
    expect((await service.spenderForCode(cafeId, "222222")).id).toBe(`m_ayse_${run}`);
    const before = await service.walletBalance(`m_ayse_${run}`);
    const spend = { membershipId: `m_ayse_${run}`, orderId: `o_spend_${run}`, key: `k_spend_${run}`, requestedPeni: 5, capPeni: 5 };
    expect(await service.spendAtTill(spend)).toBe(5);
    expect(await service.spendAtTill(spend)).toBe(5);
    expect(await service.walletBalance(`m_ayse_${run}`)).toBe(before - 5);
    await service.releaseOrder(cafeId, `o_spend_${run}`, "void");
    expect(await service.walletBalance(`m_ayse_${run}`)).toBe(before);
  });

  it("keeps payments with one per key at a café, oldest first per order", async () => {
    const orderId = `ord_c_${run}`; // made by the claims test above
    const payment = {
      id: `pay_${run}`, cafeId, orderId, kind: "sale" as const, method: "card" as const, status: "pending" as const, amountKurus: 3_000,
      tenderedKurus: null, changeKurus: null, terminal: "manual", deviceId: null, cashSessionId: null, key: `pk_${run}`, reason: null,
      startedAt: at, startedByMemberId: "sm_x", settledAt: null, settledByMemberId: null, reference: null, receiptNo: null, failure: null,
    };
    expect(await stores.payments.savePayment(payment)).toBe(true);
    // A double tap with the same key is refused; the first one is found by its key.
    expect(await stores.payments.savePayment({ ...payment, id: `pay_dup_${run}` })).toBe(false);
    expect((await stores.payments.findPaymentByKey(cafeId, `pk_${run}`))!.id).toBe(payment.id);
    const approved = { ...payment, status: "approved" as const, settledAt: at, settledByMemberId: "sm_x" };
    expect(await stores.payments.savePayment(approved)).toBe(true);
    const later = { ...payment, id: `pay_2_${run}`, kind: "refund" as const, key: `rk_${run}`, reason: "Soğuk", startedAt: new Date(at.getTime() + 60_000) };
    await stores.payments.savePayment(later);
    expect(await stores.payments.listPayments(cafeId, [orderId, "ord_none"])).toEqual([approved, later]);
    expect(await stores.payments.getPayment("cafe_other", payment.id)).toBeNull();
  });

  it("keeps one open drawer per café, its counts and moves, and the payments taken in it", async () => {
    const count = (countKurus: number, over = {}) => ({
      expectedKurus: null, countKurus, differenceKurus: 0, counts: null, note: null, at, byMemberId: "sm_x", ...over,
    });
    const first = { id: `cash_1_${run}`, cafeId, opening: count(50_000, { counts: { "20000": 2, "10000": 1 } }), closing: null, openKey: `ok1_${run}`, closeKey: null };
    expect(await stores.cash.saveSession(first)).toBe(true);
    // A second till opening at the same moment is refused by the database.
    expect(await stores.cash.saveSession({ ...first, id: `cash_2_${run}`, openKey: `ok2_${run}` })).toBe(false);
    expect(await stores.cash.openSession(cafeId)).toEqual(first);

    const move = { id: `cmv_${run}`, cafeId, sessionId: first.id, kind: "out" as const, amountKurus: 4_500, reason: "Süt", at, byMemberId: "sm_x", key: `mk_${run}` };
    expect(await stores.cash.saveMove(move)).toBe(true);
    expect(await stores.cash.saveMove({ ...move, id: `cmv_dup_${run}` })).toBe(false);
    expect(await stores.cash.listMoves(cafeId, first.id)).toEqual([move]);
    const payment = {
      id: `pay_cash_${run}`, cafeId, orderId: `ord_c_${run}`, kind: "sale" as const, method: "cash" as const, status: "approved" as const, amountKurus: 3_000,
      tenderedKurus: null, changeKurus: null, terminal: "manual", deviceId: null, cashSessionId: first.id, key: `pkcash_${run}`, reason: null,
      startedAt: at, startedByMemberId: "sm_x", settledAt: at, settledByMemberId: "sm_x", reference: null, receiptNo: null, failure: null,
    };
    await stores.payments.savePayment(payment);
    expect(await stores.payments.listCashSessionPayments(cafeId, first.id)).toEqual([payment]);

    const later = new Date(at.getTime() + 8 * 3_600_000);
    const closed = { ...first, closing: count(47_000, { expectedKurus: 48_500, differenceKurus: -1_500, note: "Bozuk para eksik", at: later }), closeKey: `ck_${run}` };
    expect(await stores.cash.saveSession(closed)).toBe(true);
    expect(await stores.cash.openSession(cafeId)).toBeNull();
    expect(await stores.cash.lastClosed(cafeId)).toEqual(closed);
    expect((await stores.cash.findByKey(cafeId, `ck_${run}`))!.id).toBe(first.id);
    // Once closed, the next one can open.
    expect(await stores.cash.saveSession({ ...first, id: `cash_3_${run}`, openKey: `ok3_${run}` })).toBe(true);
    expect((await stores.cash.listSessions(cafeId, 5)).map((s) => s.id)).toContain(first.id);
  });
});
