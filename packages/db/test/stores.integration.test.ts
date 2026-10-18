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

  it("keeps stock items, applies each batch once, counts against the amount at that moment, and keeps recipes", async () => {
    const item = (id: string, name: string, unit: "kg" | "l" | "adet") => ({
      id: `${id}_${run}`, cafeId, name, kind: "ingredient" as const, unit, qtyMilli: 0, minMilli: 500, costKurus: 90_000, archivedAt: null, createdAt: at,
    });
    const beans = item("stk_beans", "Kahve çekirdeği", "kg");
    const milk = item("stk_milk", "Süt", "l");
    for (const i of [beans, milk]) await stores.stock.saveItem(i);
    const batch = (batchKey: string, reason: "start" | "sale" | "count", changes: Parameters<typeof stores.stock.applyBatch>[0]["changes"]) =>
      stores.stock.applyBatch({ cafeId, batchKey: `${batchKey}_${run}`, reason, at, changes });

    await batch("start", "start", [{ id: `m1_${run}`, itemId: beans.id, changeMilli: 2_000 }, { id: `m2_${run}`, itemId: milk.id, changeMilli: 5_000 }]);
    // Two tills selling at once: both land, in whatever order.
    const sales = await Promise.all(
      [1, 2, 3].map((n) => batch(`sale:o${n}`, "sale", [{ id: `s${n}a_${run}`, itemId: milk.id, changeMilli: -200 }, { id: `s${n}b_${run}`, itemId: beans.id, changeMilli: -18 }])),
    );
    expect(sales.every((m) => m?.length === 2)).toBe(true);
    // A retried sale changes nothing.
    expect(await batch("sale:o1", "sale", [{ id: `s1x_${run}`, itemId: milk.id, changeMilli: -200 }])).toBeNull();
    expect((await stores.stock.getItem(cafeId, milk.id))!.qtyMilli).toBe(4_400);

    // A count says what's there; the move is the difference.
    const [counted] = (await batch("count1", "count", [{ id: `c1_${run}`, itemId: beans.id, countedMilli: 1_900 }]))!;
    expect(counted).toMatchObject({ changeMilli: -46, afterMilli: 1_900 });
    // Details never overwrite the amount.
    await stores.stock.saveItem({ ...beans, name: "Çekirdek (Brezilya)", qtyMilli: 0 });
    expect(await stores.stock.getItem(cafeId, beans.id)).toMatchObject({ name: "Çekirdek (Brezilya)", qtyMilli: 1_900 });
    expect((await stores.stock.listMoves(cafeId, { itemId: beans.id, limit: 10 })).map((m) => m.reason).sort()).toEqual(["count", "sale", "sale", "sale", "start"]);
    expect(await stores.stock.listBatch(cafeId, `sale:o2_${run}`)).toHaveLength(2);

    const recipe = { cafeId, productId: `latte_${run}`, mode: "recipe" as const, lines: [{ itemId: beans.id, qtyMilli: 18 }, { itemId: milk.id, qtyMilli: 200 }] };
    await stores.stock.saveRecipe(recipe);
    await stores.stock.saveRecipe({ ...recipe, lines: [{ itemId: milk.id, qtyMilli: 220 }, { itemId: beans.id, qtyMilli: 18 }] });
    expect(await stores.stock.getRecipe(cafeId, recipe.productId)).toEqual({ ...recipe, lines: [{ itemId: milk.id, qtyMilli: 220 }, { itemId: beans.id, qtyMilli: 18 }] });
    expect(await stores.stock.listRecipes(cafeId)).toHaveLength(1);
  });

  it("keeps suppliers and bills with their lines and payments, finds them by month, item and what is owed, and prices from the newest bill", async () => {
    const item = { id: `stk_bill_milk_${run}`, cafeId, name: "Süt", kind: "ingredient" as const, unit: "l" as const, qtyMilli: 0, minMilli: 0, costKurus: null, archivedAt: null, createdAt: at };
    await stores.stock.saveItem(item);
    const supplier = { id: `sup_${run}`, cafeId, name: "Moda Süt", phone: null, email: null, taxNo: "5730412298", iban: null, note: null, archivedAt: null, createdAt: at };
    await stores.bills.saveSupplier(supplier);
    await stores.bills.saveSupplier({ ...supplier, phone: "0532 410 22 18" });
    expect(await stores.bills.getSupplier(cafeId, supplier.id)).toMatchObject({ phone: "0532 410 22 18", taxNo: "5730412298" });

    const bill = (id: string, date: string, qty: number, kurus: number) => ({
      id: `${id}_${run}`, cafeId, supplierId: supplier.id, number: null, date, dueDate: null, note: null,
      lines: [{ itemId: item.id, name: "Süt", category: "ingredients" as const, qtyMilli: qty, totalKurus: kurus }],
      totalKurus: kurus, kdv: [] as { ratePct: number; amountKurus: number }[], documentId: null as string | null, paidKurus: 0, paidAt: null, payments: [], version: 1, voidedAt: null, voidedById: null, voidReason: null,
      createdById: "stf_x", createdAt: at, updatedAt: at, createKey: `${id}_key_${run}`,
    });
    const sep = bill("bil_sep", "2026-09-28", 20_000, 86_000);
    const oct = bill("bil_oct", "2026-10-10", 12_000, 54_000);
    const late = bill("bil_late", "2026-10-02", 10_000, 40_000);
    for (const b of [sep, oct, late]) await stores.bills.saveBill(b);
    // KDV and the scan it came from (piece 25) come back as saved.
    await stores.bills.saveBill({ ...late, kdv: [{ ratePct: 1, amountKurus: 396 }], documentId: "doc_x" });
    expect(await stores.bills.getBill(cafeId, late.id)).toMatchObject({ kdv: [{ ratePct: 1, amountKurus: 396 }], documentId: "doc_x" });
    // A correction replaces the lines.
    await stores.bills.saveBill({
      ...oct, version: 2, totalKurus: 59_000,
      lines: [oct.lines[0]!, { itemId: null, name: "Kasa depozitosu", category: "other", qtyMilli: null, totalKurus: 5_000 }],
    });
    expect((await stores.bills.getBill(cafeId, oct.id))!.lines.map((l) => l.name)).toEqual(["Süt", "Kasa depozitosu"]);
    expect((await stores.bills.findBillByKey(cafeId, oct.createKey))!.version).toBe(2);
    // Entered late, dated earlier: the October 10th bill still sets the price.
    expect(await stores.bills.lastPrice(cafeId, item.id)).toEqual({ billId: oct.id, date: "2026-10-10", qtyMilli: 12_000, totalKurus: 54_000 });

    await stores.bills.addPayment({ id: `bpy_${run}`, cafeId, billId: sep.id, amountKurus: 86_000, method: "cash", paidOn: "2026-09-28", account: "drawer", memberId: "stf_x", createdAt: at });
    await stores.bills.saveBill({ ...sep, paidKurus: 86_000, paidAt: at });
    expect((await stores.bills.getBill(cafeId, sep.id))!.payments).toEqual([
      { id: `bpy_${run}`, cafeId, billId: sep.id, amountKurus: 86_000, method: "cash", paidOn: "2026-09-28", account: "drawer", memberId: "stf_x", createdAt: at },
    ]);
    await stores.bills.saveBill({ ...oct, version: 3, voidedAt: at, voidedById: "stf_x", voidReason: "İki kez" });

    const ids = async (q: Parameters<typeof stores.bills.listBills>[1]) => (await stores.bills.listBills(cafeId, q)).map((b) => b.id);
    expect(await ids({})).toEqual([late.id, sep.id]);
    expect(await ids({ includeVoided: true })).toEqual([oct.id, late.id, sep.id]);
    expect(await ids({ from: "2026-10-01", to: "2026-10-31", includeVoided: true })).toEqual([oct.id, late.id]);
    expect(await ids({ unpaid: true })).toEqual([late.id]);
    expect(await ids({ itemId: item.id, supplierId: supplier.id, limit: 1 })).toEqual([late.id]);
    // A voided bill no longer prices anything.
    expect((await stores.bills.lastPrice(cafeId, item.id))!.billId).toBe(late.id);

    // Paid in parts; the credit card's charges are the payments by "credit".
    const part = { cafeId, billId: late.id, method: "credit" as const, account: null, memberId: "stf_x", createdAt: at };
    await stores.bills.addPayment({ ...part, id: `bpy_late2_${run}`, amountKurus: 15_000, paidOn: "2026-10-05" });
    await stores.bills.addPayment({ ...part, id: `bpy_late1_${run}`, amountKurus: 10_000, paidOn: "2026-10-03" });
    expect((await stores.bills.listPayments(cafeId, { method: "credit" })).map((p) => p.id)).toEqual([`bpy_late1_${run}`, `bpy_late2_${run}`]);
    expect(await stores.bills.listPayments(cafeId)).toHaveLength(3);
    expect(await stores.bills.getPayment(cafeId, `bpy_late1_${run}`)).toMatchObject({ amountKurus: 10_000, method: "credit" });
    expect(await stores.bills.getPayment("cafe_elsewhere", `bpy_late1_${run}`)).toBeNull();
    await stores.bills.removePayment(cafeId, `bpy_${run}`);
    expect((await stores.bills.getBill(cafeId, sep.id))!.payments).toEqual([]);

    // Inside the ledger's transaction, a bill and its stock commit or roll back together.
    await expect(
      stores.ledger.atomically(async () => {
        await stores.bills.saveBill(bill("bil_rollback", "2026-10-11", 1_000, 4_500));
        await stores.stock.applyBatch({ cafeId, batchKey: `bill:rollback_${run}:1`, reason: "bill", at, changes: [{ id: `rb_${run}`, itemId: item.id, changeMilli: 1_000 }] });
        throw new Error("no");
      }),
    ).rejects.toThrow("no");
    expect(await stores.bills.getBill(cafeId, `bil_rollback_${run}`)).toBeNull();
    expect((await stores.stock.getItem(cafeId, item.id))!.qtyMilli).toBe(0);
  });
  it("keeps checks, loans with their repayments, and the credit card with its payments", async () => {
    const payment = { id: `bpy_debt_${run}`, cafeId, billId: `bil_debt_${run}`, amountKurus: 450_000, method: "check" as const, paidOn: "2026-10-01", account: null, memberId: "stf_x", createdAt: at };
    await stores.bills.saveBill({
      id: payment.billId, cafeId, supplierId: null, number: null, date: "2026-10-01", dueDate: null, note: null,
      lines: [{ itemId: null, name: "Kira", category: "rent", qtyMilli: null, totalKurus: 450_000 }],
      totalKurus: 450_000, kdv: [], documentId: null, paidKurus: 450_000, paidAt: at, payments: [], version: 1, voidedAt: null, voidedById: null, voidReason: null,
      createdById: "stf_x", createdAt: at, updatedAt: at, createKey: `debt_${run}`,
    });
    await stores.bills.addPayment(payment);
    const check = {
      id: `chk_${run}`, cafeId, number: "0012345", bankName: "Ziraat", payee: "Ali Rıza Bey", supplierId: null, amountKurus: 450_000,
      writtenOn: "2026-10-01", dueDate: "2026-10-28", note: null, billPaymentId: payment.id, cashedOn: null, cashedById: null, createdById: "stf_x", createdAt: at,
    };
    await stores.debts.saveCheck(check);
    await stores.debts.saveCheck({ ...check, id: `chk2_${run}`, number: "0012346", dueDate: "2026-10-20", billPaymentId: null });
    expect((await stores.debts.listChecks(cafeId, { open: true })).filter((c) => c.id.endsWith(run)).map((c) => c.number)).toEqual(["0012346", "0012345"]);
    expect(await stores.debts.findCheckByPayment(cafeId, payment.id)).toEqual(check);
    await stores.debts.saveCheck({ ...check, cashedOn: "2026-10-28", cashedById: "stf_x" });
    expect((await stores.debts.listChecks(cafeId, { open: true })).map((c) => c.id)).not.toContain(check.id);
    // A check written for a bill payment keeps that payment from being removed under it.
    await expect(stores.bills.removePayment(cafeId, payment.id)).rejects.toThrow();
    await stores.debts.removeCheck(cafeId, check.id);
    await stores.bills.removePayment(cafeId, payment.id);

    const lender = `member:stf_lender_${run}`;
    const loan = {
      id: `lon_${run}`, cafeId, lenderKey: lender, lenderMemberId: `stf_lender_${run}`, lenderName: "Murat Aksu", amountKurus: 54_000,
      borrowedOn: "2026-10-10", dueDate: null, note: null, billPaymentId: null, createdById: "stf_x", createdAt: at,
    };
    await stores.debts.saveLoan(loan);
    await stores.debts.saveLoan({ ...loan, id: `lon0_${run}`, borrowedOn: "2026-10-02", amountKurus: 10_000 });
    expect((await stores.debts.listLoans(cafeId, { lenderKey: lender })).map((l) => l.id)).toEqual([`lon0_${run}`, loan.id]);
    await stores.debts.addRepayment({ id: `lrp_${run}`, cafeId, lenderKey: lender, amountKurus: 20_000, method: "cash", paidOn: "2026-10-13", account: null, memberId: "stf_x", createdAt: at });
    expect(await stores.debts.listRepayments(cafeId, { lenderKey: lender })).toHaveLength(1);
    expect(await stores.debts.getRepayment(cafeId, `lrp_${run}`)).toMatchObject({ amountKurus: 20_000 });
    await stores.debts.removeRepayment(cafeId, `lrp_${run}`);
    await stores.debts.removeLoan(cafeId, `lon0_${run}`);
    expect(await stores.debts.listLoans(cafeId, { lenderKey: lender })).toHaveLength(1);

    const card = { cafeId, name: "Kafe kartı", limitKurus: 10_000_000, statementDay: 26, dueDay: 5, updatedAt: at };
    await stores.debts.saveCard(card);
    await stores.debts.saveCard({ ...card, limitKurus: 5_000_000 });
    expect(await stores.debts.getCard(cafeId)).toMatchObject({ limitKurus: 5_000_000, statementDay: 26 });
    await stores.debts.addCardPayment({ id: `cpy_${run}`, cafeId, amountKurus: 200_000, method: "bank", paidOn: "2026-10-12", account: "bank", memberId: "stf_x", createdAt: at });
    expect(await stores.debts.listCardPayments(cafeId)).toEqual([{ id: `cpy_${run}`, cafeId, amountKurus: 200_000, method: "bank", paidOn: "2026-10-12", account: "bank", memberId: "stf_x", createdAt: at }]);
    await stores.debts.removeCardPayment(cafeId, `cpy_${run}`);
    expect(await stores.debts.getCardPayment(cafeId, `cpy_${run}`)).toBeNull();
  });
  it("keeps the reserve's and the bank's movements and the month closes", async () => {
    expect(await stores.books.saveStart({ cafeId, startedOn: "2026-09-28", memberId: "stf_x", createdAt: at })).toBe(true);
    expect(await stores.books.saveStart({ cafeId, startedOn: "2026-10-01", memberId: "stf_x", createdAt: at })).toBe(false);
    expect(await stores.books.getStart(cafeId)).toMatchObject({ startedOn: "2026-09-28" });
    const m = { cafeId, amountKurus: 1_200_000, kind: "opening" as const, counterpart: null, source: "opening", day: "2026-09-28", note: null, memberId: "stf_x", createdAt: at };
    await stores.books.addMovements([
      { ...m, id: `mmv_r_${run}`, account: "reserve" },
      { ...m, id: `mmv_b_${run}`, account: "bank", amountKurus: 8_500_000 },
      { ...m, id: `mmv_t1_${run}`, account: "reserve", amountKurus: -500_000, kind: "transfer", counterpart: "bank", source: `manual:${run}`, day: "2026-10-07" },
      { ...m, id: `mmv_t2_${run}`, account: "bank", amountKurus: 500_000, kind: "transfer", counterpart: "reserve", source: `manual:${run}`, day: "2026-10-07" },
    ]);
    // The same source and account again is left as it is.
    await stores.books.addMovements([{ ...m, id: `mmv_again_${run}`, account: "reserve", amountKurus: 1 }]);
    expect(await stores.books.totals(cafeId)).toEqual({ reserve: 700_000, bank: 9_000_000 });
    expect(await stores.books.totals(cafeId, "2026-09-30")).toEqual({ reserve: 1_200_000, bank: 8_500_000 });
    expect((await stores.books.listMovements(cafeId, { account: "bank" })).map((x) => x.amountKurus)).toEqual([500_000, 8_500_000]);
    expect(await stores.books.listMovements(cafeId, { since: "2026-10-01" })).toHaveLength(2);
    expect(await stores.books.listBySource(cafeId, `manual:${run}`)).toHaveLength(2);
    await stores.books.removeBySource(cafeId, `manual:${run}`);
    expect(await stores.books.totals(cafeId)).toEqual({ reserve: 1_200_000, bank: 8_500_000 });

    const summary = {
      month: "2026-09", from: "2026-09-01", to: "2026-09-30", sales: { cashKurus: 0, cardKurus: 0, totalKurus: 0 },
      bills: { count: 0, totalKurus: 0, paidKurus: {} }, wages: { earnedKurus: 0, paidKurus: 0 },
      money: { drawerKurus: null, reserveKurus: 1_200_000, bankKurus: 8_500_000 },
      owed: { billsKurus: 0, checksKurus: 0, loansKurus: 0, cardKurus: 0, wagesKurus: 0, totalKurus: 0 },
    };
    const close = { id: `mcl_${run}`, cafeId, month: "2026-09", closedAt: at, closedById: "stf_x", note: null, summary, reopenedAt: null, reopenedById: null, reopenReason: null };
    expect(await stores.books.saveClose(close)).toBe(true);
    // One standing close per month: a second one is refused until the first is reopened.
    expect(await stores.ledger.atomically(() => stores.books.saveClose({ ...close, id: `mcl2_${run}` }))).toBe(false);
    expect(await stores.books.saveClose({ ...close, reopenedAt: at, reopenedById: "stf_x", reopenReason: "Eksik fatura" })).toBe(true);
    expect(await stores.books.saveClose({ ...close, id: `mcl2_${run}` })).toBe(true);
    expect((await stores.books.listCloses(cafeId)).map((c) => [c.id, c.reopenReason])).toEqual(
      expect.arrayContaining([[`mcl_${run}`, "Eksik fatura"], [`mcl2_${run}`, null]]),
    );
    expect(await stores.books.getClose(cafeId, `mcl_${run}`)).toMatchObject({ summary, reopenReason: "Eksik fatura" });
  });
  it("keeps shifts, published weeks, hours per day, rates, payouts and pay closes", async () => {
    const shift = { id: `shf_${run}`, cafeId, day: "2026-10-13", startMinutes: 480, endMinutes: 960, memberIds: ["stf_a", "stf_b"], note: null, createdById: "stf_x", createdAt: at, updatedAt: at };
    await stores.shifts.saveShift(shift);
    await stores.shifts.addShifts([{ ...shift, id: `shf2_${run}`, day: "2026-10-12", memberIds: ["stf_a"] }, { ...shift, memberIds: [] }]);
    expect((await stores.shifts.listShifts(cafeId, "2026-10-12", "2026-10-18")).map((s) => [s.id, s.memberIds])).toEqual([
      [`shf2_${run}`, ["stf_a"]],
      [`shf_${run}`, ["stf_a", "stf_b"]],
    ]);
    await stores.shifts.saveShift({ ...shift, endMinutes: 1440, note: "Kapanış" });
    expect(await stores.shifts.getShift(cafeId, shift.id)).toMatchObject({ endMinutes: 1440, note: "Kapanış" });
    await stores.shifts.removeShift(cafeId, `shf2_${run}`);
    expect(await stores.shifts.listShifts(cafeId, "2026-10-12", "2026-10-12")).toEqual([]);

    await stores.shifts.saveWeek({ cafeId, weekStart: "2026-10-12", publishedAt: at, publishedById: "stf_x" });
    await stores.shifts.saveWeek({ cafeId, weekStart: "2026-10-12", publishedAt: null, publishedById: null });
    expect(await stores.shifts.getWeek(cafeId, "2026-10-12")).toMatchObject({ publishedAt: null });

    const day = { cafeId, memberId: "stf_a", day: "2026-10-13", minutes: 480, note: null, byId: "stf_x", updatedAt: at };
    await stores.shifts.setWorkDays(cafeId, [day, { ...day, day: "2026-10-14", minutes: 300 }], []);
    await stores.shifts.setWorkDays(cafeId, [{ ...day, minutes: 450 }], [{ memberId: "stf_a", day: "2026-10-14" }]);
    expect((await stores.shifts.listWorkDays(cafeId, "2026-10-01", "2026-10-31")).map((d) => [d.day, d.minutes])).toEqual([["2026-10-13", 450]]);

    const rate = { id: `prt_${run}`, cafeId, memberId: "stf_a", fromDay: "2026-10-01", kurusPerHour: 15_000, byId: "stf_x", createdAt: at };
    await stores.shifts.saveRate(rate);
    // Same person, same day: the new rate replaces the old.
    await stores.shifts.saveRate({ ...rate, id: `prt2_${run}`, kurusPerHour: 16_000 });
    expect((await stores.shifts.listRates(cafeId)).map((r) => [r.id, r.kurusPerHour])).toEqual([[`prt2_${run}`, 16_000]]);
    await stores.shifts.removeRate(cafeId, `prt2_${run}`);
    expect(await stores.shifts.listRates(cafeId)).toEqual([]);

    const payout = { id: `ppo_${run}`, cafeId, memberId: "stf_a", month: "2026-09", amountKurus: 300_000, method: "bank" as const, account: "bank" as const, paidOn: "2026-10-05", note: null, byId: "stf_x", createdAt: at };
    await stores.shifts.addPayout(payout);
    await stores.shifts.addPayout({ ...payout, amountKurus: 1 });
    expect(await stores.shifts.listPayouts(cafeId, { month: "2026-09" })).toEqual([payout]);
    expect(await stores.shifts.listPayouts(cafeId, { paidThrough: "2026-10-04" })).toEqual([]);
    await stores.shifts.removePayout(cafeId, payout.id);
    expect(await stores.shifts.getPayout(cafeId, payout.id)).toBeNull();

    const summary = { month: "2026-09", minutes: 600, earnedKurus: 150_000, paidKurus: 0, people: [{ memberId: "stf_a", name: "Ece", role: "barista" as const, minutes: 600, earnedKurus: 150_000, paidKurus: 0 }] };
    const close = { id: `pcl_${run}`, cafeId, month: "2026-09", closedAt: at, closedById: "stf_x", note: null, summary, reopenedAt: null, reopenedById: null, reopenReason: null };
    expect(await stores.shifts.savePayClose(close)).toBe(true);
    expect(await stores.ledger.atomically(() => stores.shifts.savePayClose({ ...close, id: `pcl2_${run}` }))).toBe(false);
    expect(await stores.shifts.savePayClose({ ...close, reopenedAt: at, reopenedById: "stf_x", reopenReason: "Eksik gün" })).toBe(true);
    expect(await stores.shifts.savePayClose({ ...close, id: `pcl2_${run}` })).toBe(true);
    expect(await stores.shifts.getPayClose(cafeId, close.id)).toMatchObject({ summary, reopenReason: "Eksik gün" });
    expect(await stores.shifts.listPayCloses(cafeId)).toHaveLength(2);
  });

  it("keeps task lists, items with their days, checks per day, the morning email and who muted it", async () => {
    const at = new Date("2026-10-16T09:00:00Z");
    const list = { id: `tsl_${run}`, cafeId, name: "Açılış", assign: "first" as const, sortOrder: 0, archivedAt: null, createdById: "stf_x", createdAt: at, updatedAt: at };
    await stores.tasks.saveList(list);
    await stores.tasks.saveList({ ...list, id: `tsl2_${run}`, name: "Eski", archivedAt: at });
    expect((await stores.tasks.listLists(cafeId)).map((l) => l.name)).toEqual(["Açılış"]);
    expect(await stores.tasks.listLists(cafeId, { includeArchived: true })).toHaveLength(2);
    expect(await stores.tasks.getList(cafeId, list.id)).toEqual(list);

    const item = { id: `tsi_${run}`, cafeId, listId: list.id, title: "Makineyi aç", note: null, days: [1, 2, 3] as (1 | 2 | 3)[], sortOrder: 1, fromDay: "2026-10-12", untilDay: null };
    await stores.tasks.saveItems([item, { ...item, id: `tsi0_${run}`, title: "Kapıyı aç", sortOrder: 0 }]);
    await stores.tasks.saveItems([{ ...item, untilDay: "2026-10-20" }]);
    expect((await stores.tasks.listItems(cafeId)).map((i) => [i.title, i.untilDay])).toEqual([
      ["Kapıyı aç", null],
      ["Makineyi aç", "2026-10-20"],
    ]);

    const check = { cafeId, itemId: item.id, day: "2026-10-14", status: "done" as const, note: null, title: "Makineyi aç", listName: "Açılış", byId: "stf_a", at };
    await stores.tasks.saveCheck(check);
    await stores.tasks.saveCheck({ ...check, status: "skipped", note: "Arızalı" });
    expect(await stores.tasks.listChecks(cafeId, "2026-10-14", "2026-10-14")).toEqual([{ ...check, status: "skipped", note: "Arızalı" }]);
    await stores.tasks.removeCheck(cafeId, item.id, "2026-10-14");
    expect(await stores.tasks.listChecks(cafeId, "2026-10-01", "2026-10-31")).toEqual([]);

    const digest = { cafeId, day: "2026-10-16", sentAt: at, recipients: 3 };
    expect(await stores.tasks.addDigest(digest)).toBe(true);
    expect(await stores.tasks.addDigest({ ...digest, recipients: 1 })).toBe(false);
    expect(await stores.tasks.getDigest(cafeId, "2026-10-16")).toEqual(digest);
    await stores.tasks.setMuted(cafeId, "stf_a", true);
    await stores.tasks.setMuted(cafeId, "stf_a", true);
    expect(await stores.tasks.listMuted(cafeId)).toEqual(["stf_a"]);
    await stores.tasks.setMuted(cafeId, "stf_a", false);
    expect(await stores.tasks.listMuted(cafeId)).toEqual([]);
  });

  it("keeps documents, drafts, jobs and the assistant's log; two passes never take the same job", async () => {
    const doc = { id: `doc_${run}`, cafeId, name: "fis.pdf", contentType: "application/pdf" as const, bytes: new Uint8Array([37, 80, 68, 70, 45]), size: 5, sha256: "ab".repeat(32), uploadedBy: "stf_a", emailId: null, sender: null, createdAt: at };
    await stores.assistant.saveDocument(doc);
    expect(await stores.assistant.getDocument(cafeId, doc.id)).toEqual(doc);
    expect(await stores.assistant.getDocument("cafe_other", doc.id)).toBeNull();

    const proposal = { supplierId: null, supplierName: "Moda Süt", supplierTaxNumber: null, number: "A1", date: "2026-10-14", dueDate: null, totalKurus: 12_000, lines: [{ itemId: null, name: "Süt", category: "ingredients" as const, qtyMilli: 24_000, totalKurus: 12_000, readName: "SÜT 1 LT", readQtyMilli: 24_000, readUnit: "adet", matchedBy: null }], kdv: [] };
    const draft = { id: `drf_${run}`, cafeId, kind: "bill" as const, status: "open" as const, title: "Moda Süt", proposal, doubts: ["Tarih silik."], documentId: doc.id, jobId: null, createdAt: at, decidedById: null, decidedAt: null, resultId: null, changed: [], dismissReason: null, duplicateOf: null as { kind: "bill" | "draft"; id: string; title: string; why: "file" | "number" | "dayTotal" } | null, outcome: null, entry: null as { text: string; voice: boolean } | null };
    await stores.assistant.saveDraft(draft);
    await stores.assistant.saveDraft({ ...draft, id: `drf2_${run}`, createdAt: new Date(at.getTime() + 1000) });
    expect(await stores.assistant.getDraft(cafeId, draft.id)).toEqual(draft);
    expect(await stores.assistant.countOpenDrafts(cafeId)).toBe(2);
    // The same file again is found by its hash; its draft by the document.
    expect((await stores.assistant.findDocuments(cafeId, doc.sha256)).map((d) => [d.id, "bytes" in d])).toEqual([[doc.id, false]]);
    expect(await stores.assistant.findDocuments(cafeId, "cd".repeat(32))).toEqual([]);
    expect(await stores.assistant.getDocumentInfo(cafeId, doc.id)).toEqual({ ...doc, bytes: undefined });
    expect(await stores.assistant.getDocumentInfo("cafe_other", doc.id)).toBeNull();
    expect((await stores.assistant.getDraftByDocument(cafeId, doc.id))?.documentId).toBe(doc.id);
    const dup = { ...draft, id: `drf3_${run}`, documentId: null, duplicateOf: { kind: "bill" as const, id: "bil_1", title: "Moda Süt · ₺120", why: "number" as const } };
    await stores.assistant.saveDraft(dup);
    expect(await stores.assistant.getDraft(cafeId, dup.id)).toEqual(dup);
    await stores.assistant.saveDraft({ ...dup, status: "dismissed" });
    // A Z report checked (piece 27) keeps what the person saw.
    const z = {
      ...draft,
      id: `drf4_${run}`,
      kind: "zreport" as const,
      createdAt: new Date(at.getTime() - 1000),
      documentId: null,
      status: "confirmed" as const,
      proposal: { date: "2026-10-14", zNumber: "0412", totalKurus: 120_000, cashKurus: 40_000, cardKurus: 80_000, otherKurus: null, receipts: 31, refundsKurus: null, kdv: [] },
      outcome: { note: "Bir iade kasaya girilmedi", matched: 2, unmatched: 1, differenceKurus: -5_000, correctionKurus: null },
    };
    await stores.assistant.saveDraft(z);
    expect(await stores.assistant.getDraft(cafeId, z.id)).toEqual(z);
    // A quick entry (piece 28) keeps what was said, and how it was paid.
    const said = {
      ...draft,
      id: `drf5_${run}`,
      documentId: null,
      createdAt: new Date(at.getTime() - 2000),
      status: "dismissed" as const,
      proposal: { ...draft.proposal, paid: { method: "cash" as const } },
      entry: { text: "Tesisatçıya 450 lira nakit ödedim", voice: true },
    };
    await stores.assistant.saveDraft(said);
    expect(await stores.assistant.getDraft(cafeId, said.id)).toEqual(said);

    // What people confirmed lines to be: one per supplier and read name.
    const match = { cafeId, supplierId: null, readKey: "süt 1 lt", itemId: "stk_sut", perUnitMilli: 1000, updatedAt: at };
    await stores.assistant.saveLineMatch(match);
    await stores.assistant.saveLineMatch({ ...match, perUnitMilli: 500 });
    await stores.assistant.saveLineMatch({ ...match, supplierId: "sup_x", itemId: "stk_krema" });
    expect((await stores.assistant.listLineMatches(cafeId)).sort((a, b) => a.itemId.localeCompare(b.itemId))).toEqual([
      { ...match, supplierId: "sup_x", itemId: "stk_krema" },
      { ...match, perUnitMilli: 500 },
    ]);
    await stores.assistant.deleteLineMatch(cafeId, null, "süt 1 lt");
    expect((await stores.assistant.listLineMatches(cafeId)).map((m) => m.supplierId)).toEqual(["sup_x"]);
    const done = { ...draft, status: "confirmed" as const, decidedById: "stf_a", decidedAt: at, resultId: "bil_1", changed: ["date"] };
    await stores.assistant.saveDraft(done);
    expect((await stores.assistant.listDrafts(cafeId, { limit: 10 })).map((d) => d.id)).toEqual([`drf2_${run}`, draft.id, `drf3_${run}`, `drf4_${run}`, `drf5_${run}`]);
    expect(await stores.assistant.listDrafts(cafeId, { status: "confirmed", limit: 10 })).toEqual([done, z]);

    // Due jobs are taken once each, even by two passes at the same moment.
    const old = new Date("2000-01-01T00:00:00Z");
    const now = new Date("2000-01-02T00:00:00Z");
    const until = new Date("2100-01-01T00:00:00Z");
    const job = (n: number) => ({ id: `job${n}_${run}`, cafeId, kind: "document.read", payload: { documentId: doc.id }, status: "queued" as const, attempts: 0, runAt: new Date(old.getTime() + n), lockedUntil: null, lastError: null, result: null, createdAt: at, finishedAt: null });
    for (const n of [1, 2, 3, 4]) await stores.assistant.addJob(job(n));
    await stores.assistant.addJob({ ...job(5), runAt: new Date("2000-01-03T00:00:00Z") });
    const [a, b] = await Promise.all([stores.assistant.claimJobs(now, 3, until), stores.assistant.claimJobs(now, 3, until)]);
    const mine = [...a, ...b].filter((j) => j.cafeId === cafeId);
    expect(mine.map((j) => j.id).sort()).toEqual([1, 2, 3, 4].map((n) => `job${n}_${run}`));
    expect(mine.every((j) => j.status === "running" && j.attempts === 1 && j.lockedUntil?.getTime() === until.getTime())).toBe(true);
    for (const j of mine) await stores.assistant.saveJob({ ...j, status: "done", lockedUntil: null, result: { draftId: draft.id }, finishedAt: at });
    expect(await stores.assistant.getJob(`job1_${run}`)).toMatchObject({ status: "done", result: { draftId: draft.id }, payload: { documentId: doc.id } });
    expect((await stores.assistant.listJobs(cafeId, { kinds: ["document.read"], since: at })).length).toBe(5);
    await stores.assistant.saveJob({ ...job(5), status: "done", finishedAt: at });

    const event = { id: `aie_${run}`, cafeId, at, kind: "ai.call" as const, memberId: "stf_a", purpose: "document.read", model: "gpt-5-mini", inputTokens: 900, outputTokens: 120, ms: 4200, ok: true, detail: null, draftId: draft.id, documentId: doc.id, jobId: null };
    await stores.assistant.addEvent(event);
    await stores.assistant.addEvent({ ...event, id: `aie2_${run}`, at: new Date(at.getTime() + 1000), kind: "draft.confirmed", inputTokens: 0, outputTokens: 0, model: null });
    expect((await stores.assistant.listEvents(cafeId, { limit: 10 })).map((e) => e.kind)).toEqual(["draft.confirmed", "ai.call"]);
    expect(await stores.assistant.listEvents(cafeId, { limit: 10, before: new Date(at.getTime() + 1000) })).toEqual([event]);
    expect(await stores.assistant.usage(cafeId, at, new Date(at.getTime() + 86_400_000))).toEqual({ calls: 1, inputTokens: 900, outputTokens: 120 });
  });

  it("keeps each café's inbox address and the emails that reached it, each email once", async () => {
    const inbox = { cafeId, token: `t${run}`.slice(0, 16), enabled: true, createdAt: at, updatedAt: at };
    await stores.assistant.saveInbox(inbox);
    expect(await stores.assistant.getInbox(cafeId)).toEqual(inbox);
    expect(await stores.assistant.findInbox(inbox.token)).toEqual(inbox);
    await stores.assistant.saveInbox({ ...inbox, enabled: false, token: `u${run}`.slice(0, 16) });
    expect(await stores.assistant.findInbox(inbox.token)).toBeNull();
    expect((await stores.assistant.getInbox(cafeId))?.enabled).toBe(false);

    const email = { id: `eml_${run}`, cafeId, providerId: `re_${run}`, sender: "e-fatura@sut.test", subject: "Fatura MS-0412", receivedAt: at, documents: [], skipped: [] };
    // Two deliveries at once: one takes it.
    const taken = await Promise.all([stores.assistant.addInboundEmail(email), stores.assistant.addInboundEmail({ ...email, id: `eml2_${run}` })]);
    expect(taken.sort()).toEqual([false, true]);
    const kept = (await stores.assistant.findInboundEmail(cafeId, email.providerId))!;
    const done = { ...kept, documents: [{ documentId: `doc_${run}`, name: "fatura.pdf" }], skipped: [{ name: "fatura.xml", why: "type" as const }] };
    await stores.assistant.saveInboundEmail(done);
    await stores.assistant.addInboundEmail({ ...email, id: `eml3_${run}`, providerId: `re3_${run}`, receivedAt: new Date(at.getTime() + 1000) });
    expect((await stores.assistant.listInboundEmails(cafeId, { limit: 10 })).map((e) => e.providerId)).toEqual([`re3_${run}`, email.providerId]);
    expect(await stores.assistant.listInboundEmails(cafeId, { limit: 10, since: new Date(at.getTime() + 500) })).toHaveLength(1);
    expect(await stores.assistant.findInboundEmail(cafeId, email.providerId)).toEqual(done);
  });

  it("keeps each person's chats with the assistant and the café's saved reports", async () => {
    const report = { title: "Saat saat satış", measure: "sales" as const, by: "hour" as const, period: "thisMonth" as const, from: null, through: null, compare: "previous" as const, products: ["latte"], categories: [], chart: "bar" as const };
    const asked = { id: `msg_q_${run}`, role: "user" as const, text: "Bu ay saat saat?", at, key: `k_${run}`, subject: { kind: "report" as const, section: "hours" as const, from: "2026-10-01", through: "2026-10-18" }, sources: [], report: null, failed: false };
    const answer = { ...asked, id: `msg_a_${run}`, role: "assistant" as const, text: "En yoğun saat 09:00.", key: null, subject: null, sources: [{ kind: "page" as const, label: "raporlar", href: "/panel/raporlar" }], report: { spec: report, result: { total: 1 } } };
    const chat = { id: `cht_${run}`, cafeId, memberId: "stf_a", messages: [asked, answer], createdAt: at, updatedAt: at };
    await stores.chat.saveChat(chat);
    await stores.chat.saveChat({ ...chat, id: `cht2_${run}`, messages: [], createdAt: new Date(at.getTime() + 1000) });
    expect(await stores.chat.getChat(cafeId, chat.id)).toEqual(chat);
    expect(await stores.chat.getChat("other", chat.id)).toBeNull();
    expect((await stores.chat.latestChat(cafeId, "stf_a"))?.id).toBe(`cht2_${run}`);
    expect(await stores.chat.questionsSince(cafeId, "stf_a", at)).toBe(1);
    expect(await stores.chat.questionsSince(cafeId, "stf_a", new Date(at.getTime() + 1))).toBe(0);

    const saved = { id: `rep_${run}`, cafeId, memberId: "stf_a", spec: report, createdAt: at, key: `rk_${run}` };
    expect(await stores.chat.addSavedReport(saved)).toEqual(saved);
    // The same key again keeps the first.
    expect((await stores.chat.addSavedReport({ ...saved, id: `rep2_${run}` })).id).toBe(saved.id);
    expect(await stores.chat.listSavedReports(cafeId)).toEqual([saved]);
    await stores.chat.deleteSavedReport(cafeId, saved.id);
    expect(await stores.chat.listSavedReports(cafeId)).toEqual([]);
  });
});
