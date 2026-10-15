import type {
  AskidaDTO,
  CafeDetailDTO,
  CafeSummaryDTO,
  CreateOrderRequest,
  CustomerDTO,
  GiftDTO,
  MenuItemDTO,
  OrderDTO,
  OrderLineDTO,
  PostDTO,
  SessionDTO,
  StaffDashboardDTO,
  WalletDTO,
} from "@peni/api";
import {
  InMemoryDirectory,
  InMemoryLedgerStore,
  Ledger,
  PeniError,
  PeniService,
  StandalonePosAdapter,
  TERMINAL_STATUSES,
  initialFulfillment,
  transition,
  type CafePeniSettings,
  type FulfillmentAction,
  type FulfillmentState,
  type Gift,
  type MenuItem,
  type PosAdapter,
  type PosEvent,
} from "@peni/core";
import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * The Peni application layer: everything the HTTP routes call.
 *
 * Peni rules (wallets, gifts, askı) live in @peni/core's PeniService; this class
 * adds customers, cafés, orders, the community feed and the POS. In v0.1 it runs
 * on in-memory records seeded with demo data (see seed.ts). Postgres-backed
 * ledger and directory implementations already exist in @peni/db; moving the
 * remaining records there is the first roadmap item.
 */

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface CafeRecord {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  district: string | null;
  city: string | null;
  coverImageUrl: string | null;
  posKind: "standalone" | "shelby";
  appOrderingPaused: boolean;
}

export interface CustomerRecord {
  id: string;
  phone: string;
  displayName: string;
  avatarUrl: string | null;
  profileVisible: boolean;
}

interface OrderRecord {
  id: string;
  cafeId: string;
  customerId: string;
  membershipId: string;
  idempotencyKey: string;
  posOrderId: string | null;
  orderNumber: string | null;
  fulfillment: FulfillmentState;
  lines: OrderLineDTO[];
  subtotalKurus: number;
  peniDiscountKurus: number;
  askidaKurus: number;
  dueKurus: number;
  customerNote: string | null;
}

export interface PostRecord {
  id: string;
  cafeId: string;
  kind: "post" | "question" | "event";
  body: string;
  publishedAt: Date;
  pinned: boolean;
  eventStartsAt: Date | null;
  eventCapacity: number | null;
  reactions: Set<string>;
  rsvps: Set<string>;
  comments: { id: string; customerId: string; body: string; createdAt: Date }[];
}

interface PendingCode {
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

export interface Notification {
  customerId: string;
  template: string;
  orderId: string;
  at: Date;
}

const DEMO_CODE = "000000";

export class PeniApp {
  readonly directory = new InMemoryDirectory();
  readonly ledger = new Ledger(new InMemoryLedgerStore());
  readonly peni = new PeniService(this.ledger, this.directory);
  readonly pos = new StandalonePosAdapter();

  readonly cafes = new Map<string, CafeRecord>();
  readonly customers = new Map<string, CustomerRecord>();
  readonly posts = new Map<string, PostRecord>();
  readonly notifications: Notification[] = [];
  private readonly orders = new Map<string, OrderRecord>();
  private readonly sessions = new Map<string, string>(); // token hash → customer id
  private readonly codes = new Map<string, PendingCode>();
  private readonly memberIndex = new Map<string, string>(); // `${customerId}:${cafeId}` → membership id

  constructor(
    private readonly options: { demo: boolean; staffKey: string },
    /** POS per café kind. Shelby cafés get a ShelbyPosAdapter when configured. */
    private readonly posFor: (cafe: CafeRecord) => PosAdapter = () => this.pos,
  ) {}

  // ─────────────────────────────────────────────── auth (phone + SMS code)

  async requestCode(phone: string): Promise<{ sent: true; devCode?: string }> {
    const code = this.options.demo ? DEMO_CODE : String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.codes.set(phone, { codeHash: sha256(code), expiresAt: Date.now() + 5 * 60_000, attempts: 0 });
    if (!this.options.demo) {
      // TODO(sms): send through the SMS provider (see docs/roadmap.md). Never log the code.
      throw new AppError("SMS_NOT_CONFIGURED", "SMS provider is not configured", 503);
    }
    return { sent: true, devCode: code };
  }

  async verifyCode(phone: string, code: string, displayName?: string): Promise<SessionDTO> {
    const pending = this.codes.get(phone);
    if (!pending || pending.expiresAt < Date.now()) throw new AppError("CODE_INVALID", "Code expired", 401);
    if (++pending.attempts > 5) {
      this.codes.delete(phone);
      throw new AppError("RATE_LIMITED", "Too many attempts", 429);
    }
    if (pending.codeHash !== sha256(code)) throw new AppError("CODE_INVALID", "Wrong code", 401);
    this.codes.delete(phone);

    let customer = [...this.customers.values()].find((c) => c.phone === phone);
    if (!customer) {
      customer = {
        id: `cus_${crypto.randomUUID()}`,
        phone,
        displayName: displayName?.trim() || "Yeni misafir",
        avatarUrl: null,
        profileVisible: false,
      };
      this.customers.set(customer.id, customer);
    }
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(sha256(token), customer.id);
    return { token, customer: toCustomerDTO(customer) };
  }

  customerForToken(token: string | null): CustomerRecord | null {
    if (!token) return null;
    const id = this.sessions.get(sha256(token));
    return id ? (this.customers.get(id) ?? null) : null;
  }

  /** Demo only: a session for a seeded customer, so the web demo can sign in with one tap. */
  createSessionFor(customerId: string): string {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(sha256(token), customerId);
    return token;
  }

  isStaffKey(key: string | null): boolean {
    return !!key && key === this.options.staffKey;
  }

  // ─────────────────────────────────────────────── cafés

  async listCafes(customer: CustomerRecord | null): Promise<CafeSummaryDTO[]> {
    return Promise.all([...this.cafes.values()].map((c) => this.cafeSummary(c, customer)));
  }

  async cafeDetail(slug: string, customer: CustomerRecord | null): Promise<CafeDetailDTO> {
    const cafe = this.requireCafe(slug);
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.posFor(cafe).listMenu(cafe.id);
    const membershipId = customer ? this.memberIndex.get(`${customer.id}:${cafe.id}`) : undefined;
    const membership = membershipId ? await this.directory.getMembership(membershipId) : null;

    return {
      ...(await this.cafeSummary(cafe, customer)),
      address: cafe.address,
      earnRatePercent: settings.earnRateBps / 100,
      maxRedeemSharePercent: settings.maxRedeemShareBps / 100,
      menu: menu.map((m) => toMenuDTO(m, settings)),
      askida: await this.askida(cafe, settings, menu),
      posts: this.postsFor(cafe.id, customer),
      membership: membership
        ? {
            id: membership.id,
            balancePeni: await this.peni.walletBalance(membership.id),
            preorderEnabled: membership.preorderEnabled,
            joinedAt: membership.joinedAt.toISOString(),
          }
        : null,
    };
  }

  async join(slug: string, customer: CustomerRecord): Promise<CafeDetailDTO> {
    const cafe = this.requireCafe(slug);
    await this.ensureMembership(customer.id, cafe.id);
    return this.cafeDetail(slug, customer);
  }

  async ensureMembership(customerId: string, cafeId: string, joinedAt = new Date()): Promise<string> {
    const key = `${customerId}:${cafeId}`;
    const existing = this.memberIndex.get(key);
    if (existing) return existing;
    const id = `mem_${crypto.randomUUID()}`;
    this.memberIndex.set(key, id);
    await this.directory.saveMembership({
      id,
      cafeId,
      customerId,
      joinedAt,
      blocked: false,
      preorderEnabled: true,
      consecutiveNoShows: 0,
    });
    return id;
  }

  // ─────────────────────────────────────────────── wallet & gifts

  async wallet(customer: CustomerRecord): Promise<WalletDTO> {
    const cafes: WalletDTO["cafes"] = [];
    const gifts: GiftDTO[] = [];
    for (const [key, membershipId] of this.memberIndex) {
      if (!key.startsWith(`${customer.id}:`)) continue;
      const cafe = this.cafeById(key.slice(customer.id.length + 1));
      cafes.push({
        cafeSlug: cafe.slug,
        cafeName: cafe.name,
        membershipId,
        balancePeni: await this.peni.walletBalance(membershipId),
      });
      for (const g of await this.directory.listGifts({ membershipId })) gifts.push(this.giftDTO(g, membershipId));
    }
    gifts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { totalPeni: cafes.reduce((s, c) => s + c.balancePeni, 0), cafes, gifts };
  }

  async sendGift(
    customer: CustomerRecord,
    input: { cafeSlug: string; toPhone: string; peni: number; message?: string; idempotencyKey: string },
  ): Promise<GiftDTO> {
    const cafe = this.requireCafe(input.cafeSlug);
    const from = this.requireMembershipId(customer.id, cafe.id);
    const recipient = [...this.customers.values()].find((c) => c.phone === input.toPhone);
    const to = recipient ? this.memberIndex.get(`${recipient.id}:${cafe.id}`) : undefined;
    if (!to) throw new AppError("RECIPIENT_NOT_MEMBER", "Recipient is not a member of this café", 404);
    const gift = await this.peni.sendGift({
      fromMembershipId: from,
      toMembershipId: to,
      peni: input.peni,
      message: input.message,
      idempotencyKey: `${customer.id}:${input.idempotencyKey}`,
    });
    return this.giftDTO(gift, from);
  }

  async resolveGift(customer: CustomerRecord, giftId: string, action: "accept" | "decline"): Promise<GiftDTO> {
    const gift = await this.directory.getGift(giftId);
    if (!gift) throw new AppError("NOT_FOUND", "Gift not found", 404);
    const membershipId = this.requireMembershipId(customer.id, gift.cafeId);
    const resolved =
      action === "accept"
        ? await this.peni.acceptGift(giftId, membershipId)
        : await this.peni.declineGift(giftId, membershipId);
    return this.giftDTO(resolved, membershipId);
  }

  // ─────────────────────────────────────────────── askıda kahve

  async donateToAskida(
    customer: CustomerRecord,
    input: { cafeSlug: string; peni: number; showName: boolean; idempotencyKey: string },
  ) {
    const cafe = this.requireCafe(input.cafeSlug);
    const membershipId = this.requireMembershipId(customer.id, cafe.id);
    const { matchedPeni } = await this.peni.donateToAskida({
      membershipId,
      peni: input.peni,
      showName: input.showName,
      idempotencyKey: `${customer.id}:${input.idempotencyKey}`,
    });
    return { balancePeni: await this.peni.walletBalance(membershipId), matchedPeni };
  }

  async tillDonation(slug: string, input: { peni: number; idempotencyKey: string }) {
    const cafe = this.requireCafe(slug);
    await this.peni.recordTillDonation({
      cafeId: cafe.id,
      peni: input.peni,
      staffUserId: "staff",
      idempotencyKey: input.idempotencyKey,
    });
    const settings = await this.directory.getSettings(cafe.id);
    return { balancePeni: (await this.askida(cafe, settings, await this.posFor(cafe).listMenu(cafe.id))).balancePeni };
  }

  // ─────────────────────────────────────────────── orders

  async createOrder(customer: CustomerRecord, input: CreateOrderRequest) {
    const cafe = this.requireCafe(input.cafeSlug);
    const membershipId = this.requireMembershipId(customer.id, cafe.id);
    const membership = (await this.directory.getMembership(membershipId))!;
    if (membership.blocked) throw new PeniError("MEMBERSHIP_BLOCKED", "Membership is blocked");
    if (!membership.preorderEnabled) throw new PeniError("PREORDER_DISABLED", "Pre-ordering is off for this member");

    const replay = [...this.orders.values()].find(
      (o) => o.customerId === customer.id && o.idempotencyKey === input.idempotencyKey,
    );
    if (replay) return this.orderDTO(replay);

    const pos = this.posFor(cafe);
    if (cafe.appOrderingPaused || !(await pos.isAcceptingOrders(cafe.id))) {
      throw new PeniError("ORDERING_CLOSED", "Café is not taking app orders right now");
    }

    // Prices always come from the café's menu, never from the client.
    const menu = new Map((await pos.listMenu(cafe.id)).map((m) => [m.productId, m]));
    const lines: OrderLineDTO[] = [];
    for (const l of input.lines) {
      const item = menu.get(l.productId);
      if (!item || !item.available) throw new AppError("VALIDATION", `${l.productId} is not available`);
      lines.push({
        productId: item.productId,
        name: item.name,
        unitPriceKurus: item.priceKurus,
        quantity: l.quantity,
        note: l.note?.trim() || null,
        fromAskida: false,
      });
    }

    const orderId = `ord_${crypto.randomUUID()}`;
    let askidaKurus = 0;
    let peniDiscountKurus = 0;
    try {
      if (input.askidaProductId) {
        const idx = lines.findIndex((l) => l.productId === input.askidaProductId);
        if (idx < 0) throw new AppError("VALIDATION", "The askı item must be part of the order");
        const line = lines[idx]!;
        // One unit comes from the askı; split it out if the customer ordered more.
        if (line.quantity > 1) {
          line.quantity -= 1;
          lines.splice(idx + 1, 0, { ...line, quantity: 1, fromAskida: true });
        } else {
          line.fromAskida = true;
        }
        const claim = await this.peni.claimFromAskida({
          membershipId,
          orderId,
          productId: line.productId,
          unitPriceKurus: line.unitPriceKurus,
        });
        askidaKurus = claim.discountKurus;
      }

      if (input.usePeni > 0) {
        const redemption = await this.peni.redeemForOrder({
          membershipId,
          orderId,
          lines: lines.filter((l) => !l.fromAskida),
          requestedPeni: input.usePeni,
        });
        peniDiscountKurus = redemption.discountKurus;
      }

      const subtotalKurus = lines.reduce((s, l) => s + l.unitPriceKurus * l.quantity, 0);
      const ref = await pos.createPendingOrder({
        cafeId: cafe.id,
        peniOrderId: orderId,
        customerDisplayName: customer.displayName,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPriceKurus: l.unitPriceKurus, note: l.note })),
        customerNote: input.customerNote?.trim() || null,
        peniDiscountKurus,
        askidaKurus,
      });

      const order: OrderRecord = {
        id: orderId,
        cafeId: cafe.id,
        customerId: customer.id,
        membershipId,
        idempotencyKey: input.idempotencyKey,
        posOrderId: ref.posOrderId,
        orderNumber: ref.orderNumber,
        fulfillment: initialFulfillment(new Date()),
        lines,
        subtotalKurus,
        peniDiscountKurus,
        askidaKurus,
        dueKurus: subtotalKurus - peniDiscountKurus - askidaKurus,
        customerNote: input.customerNote?.trim() || null,
      };
      this.orders.set(order.id, order);
      return this.orderDTO(order);
    } catch (error) {
      // Anything reserved for this order goes back: askı item to the pool, peni to the wallet.
      await this.peni.releaseOrder(cafe.id, orderId, "order_failed");
      throw error;
    }
  }

  ordersFor(customer: CustomerRecord): OrderDTO[] {
    return [...this.orders.values()]
      .filter((o) => o.customerId === customer.id)
      .sort((a, b) => b.fulfillment.submittedAt.getTime() - a.fulfillment.submittedAt.getTime())
      .map((o) => this.orderDTO(o));
  }

  orderFor(customer: CustomerRecord, orderId: string): OrderDTO {
    const order = this.orders.get(orderId);
    if (!order || order.customerId !== customer.id) throw new AppError("NOT_FOUND", "Order not found", 404);
    return this.orderDTO(order);
  }

  async cancelOrder(customer: CustomerRecord, orderId: string): Promise<OrderDTO> {
    const order = this.orders.get(orderId);
    if (!order || order.customerId !== customer.id) throw new AppError("NOT_FOUND", "Order not found", 404);
    return this.applyTransition(order, "cancel", "customer");
  }

  async staffTransition(slug: string, orderId: string, action: FulfillmentAction, reason?: string) {
    const cafe = this.requireCafe(slug);
    const order = this.orders.get(orderId);
    if (!order || order.cafeId !== cafe.id) throw new AppError("NOT_FOUND", "Order not found", 404);
    if (action === "collect" && cafe.posKind === "shelby") {
      throw new AppError("INVALID_TRANSITION", "Shelby cafés close orders from the till; Shelby notifies Peni when paid");
    }
    return this.applyTransition(order, action, "staff", reason);
  }

  setPaused(slug: string, paused: boolean) {
    const cafe = this.requireCafe(slug);
    cafe.appOrderingPaused = paused;
    return { appOrderingPaused: paused };
  }

  /** Webhook from the POS (Shelby). Safe to receive twice. */
  async handlePosEvent(event: PosEvent): Promise<void> {
    const order = [...this.orders.values()].find(
      (o) => o.posOrderId === event.posOrderId || (event.peniOrderId && o.id === event.peniOrderId),
    );
    if (event.type === "order.paid") {
      if (order) {
        if (!TERMINAL_STATUSES.includes(order.fulfillment.status)) {
          await this.applyTransition(order, "collect", "system", undefined, event.paidTotalKurus);
        }
        return;
      }
      // A walk-in order at the till: the member scanned their Peni code.
      if (event.membershipHint) {
        await this.peni.earnForPaidOrder({
          membershipId: event.membershipHint.membershipId,
          orderId: `pos:${event.posOrderId}`,
          paidTotalKurus: event.paidTotalKurus,
        });
      }
      return;
    }
    if (event.type === "order.refunded") {
      const cafeId = order?.cafeId ?? null;
      if (cafeId) {
        await this.peni.refundOrder(cafeId, order!.id);
      }
      return;
    }
    if (event.type === "order.cancelled" && order && !TERMINAL_STATUSES.includes(order.fulfillment.status)) {
      const action = order.fulfillment.status === "ready" ? "no_show" : "reject";
      await this.applyTransition(order, action, action === "no_show" ? "system" : "staff", "Kasada iptal edildi");
    }
  }

  // ─────────────────────────────────────────────── staff dashboard

  async staffDashboard(slug: string): Promise<StaffDashboardDTO> {
    const cafe = this.requireCafe(slug);
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.posFor(cafe).listMenu(cafe.id);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const report = await this.peni.cafeReport(cafe.id, since);
    const orders = [...this.orders.values()]
      .filter((o) => o.cafeId === cafe.id)
      .filter((o) => !TERMINAL_STATUSES.includes(o.fulfillment.status) || isToday(o.fulfillment.closedAt))
      .sort((a, b) => a.fulfillment.submittedAt.getTime() - b.fulfillment.submittedAt.getTime())
      .map((o) => this.orderDTO(o));

    return {
      cafe: {
        id: cafe.id,
        slug: cafe.slug,
        name: cafe.name,
        posKind: cafe.posKind,
        acceptingOrders: !cafe.appOrderingPaused && (await this.posFor(cafe).isAcceptingOrders(cafe.id)),
        appOrderingPaused: cafe.appOrderingPaused,
      },
      orders,
      askida: await this.askida(cafe, settings, menu),
      report: { ...report, sinceIso: since.toISOString() },
      memberCount: [...this.memberIndex.keys()].filter((k) => k.endsWith(`:${cafe.id}`)).length,
    };
  }

  // ─────────────────────────────────────────────── community

  react(customer: CustomerRecord, slug: string, postId: string) {
    const post = this.requirePost(slug, postId, customer);
    if (post.reactions.has(customer.id)) post.reactions.delete(customer.id);
    else post.reactions.add(customer.id);
    return { ok: true as const };
  }

  rsvp(customer: CustomerRecord, slug: string, postId: string) {
    const post = this.requirePost(slug, postId, customer);
    if (post.kind !== "event") throw new AppError("VALIDATION", "Only events take RSVPs");
    if (post.rsvps.has(customer.id)) post.rsvps.delete(customer.id);
    else {
      if (post.eventCapacity && post.rsvps.size >= post.eventCapacity) throw new AppError("VALIDATION", "Event is full");
      post.rsvps.add(customer.id);
    }
    return { ok: true as const };
  }

  comment(customer: CustomerRecord, slug: string, postId: string, body: string) {
    const post = this.requirePost(slug, postId, customer);
    post.comments.push({ id: `cmt_${crypto.randomUUID()}`, customerId: customer.id, body, createdAt: new Date() });
    return { ok: true as const };
  }

  // ─────────────────────────────────────────────── internals

  private async applyTransition(
    order: OrderRecord,
    action: FulfillmentAction,
    actor: "customer" | "staff" | "system",
    reason?: string,
    paidTotalKurus?: number,
  ): Promise<OrderDTO> {
    const cafe = this.cafeById(order.cafeId);
    const result = transition(order.fulfillment, action, actor, new Date(), reason);
    order.fulfillment = result.state;

    if (result.releaseReservations) {
      // Discounts stay on the record as history; the ledger reversal is what returns the peni.
      await this.peni.releaseOrder(order.cafeId, order.id, action);
      if (order.posOrderId) await this.posFor(cafe).cancelPendingOrder(order.posOrderId, reason ?? action);
    }
    if (action === "no_show") await this.peni.recordPickupOutcome(order.membershipId, "no_show");
    if (action === "collect") {
      await this.peni.recordPickupOutcome(order.membershipId, "collected");
      // Peni is earned on what the guest actually paid, never on the part covered by peni or the askı.
      await this.peni.earnForPaidOrder({
        membershipId: order.membershipId,
        orderId: order.id,
        paidTotalKurus: paidTotalKurus ?? order.dueKurus,
      });
    }
    if (result.notify) {
      // TODO(push): deliver through Expo push to the customer's devices.
      this.notifications.push({ customerId: order.customerId, template: result.notify, orderId: order.id, at: new Date() });
    }
    return this.orderDTO(order);
  }

  private async cafeSummary(cafe: CafeRecord, customer: CustomerRecord | null): Promise<CafeSummaryDTO> {
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.posFor(cafe).listMenu(cafe.id);
    const askida = await this.askida(cafe, settings, menu, 0);
    return {
      id: cafe.id,
      slug: cafe.slug,
      name: cafe.name,
      district: cafe.district,
      city: cafe.city,
      coverImageUrl: cafe.coverImageUrl,
      acceptingOrders: !cafe.appOrderingPaused && (await this.posFor(cafe).isAcceptingOrders(cafe.id)),
      askidaItemsAvailable: askida.itemsAvailable,
      isMember: !!customer && this.memberIndex.has(`${customer.id}:${cafe.id}`),
    };
  }

  private async askida(cafe: CafeRecord, settings: CafePeniSettings, menu: MenuItem[], wallSize = 15): Promise<AskidaDTO> {
    const askidaItems = menu.filter((m) => settings.askidaProductIds.includes(m.productId));
    const reference = askidaItems.sort((a, b) => a.priceKurus - b.priceKurus)[0] ?? null;
    const snap = await this.peni.askidaSnapshot(cafe.id, reference?.priceKurus ?? 100);
    const names = new Map(menu.map((m) => [m.productId, m.name]));
    const wall = wallSize > 0 ? await this.peni.askidaWall(cafe.id, wallSize) : [];
    return {
      enabled: settings.askidaEnabled,
      balancePeni: snap.balancePeni,
      itemsAvailable: reference ? snap.itemsAvailable : 0,
      referenceItemName: reference?.name ?? null,
      claimedLast7Days: snap.claimedLast7Days,
      donatedLast7DaysPeni: snap.donatedLast7DaysPeni,
      claimsPerDay: settings.askidaClaimsPerDay,
      wall: await Promise.all(
        wall.map(async (e) => {
          const at = e.at.toISOString();
          if (e.type === "donation") {
            return { type: "donation" as const, at, peni: e.peni, donorName: await this.memberName(e.donorMembershipId) };
          }
          if (e.type === "claim") return { type: "claim" as const, at, itemName: names.get(e.productId) ?? "Bir ürün" };
          return { type: e.type, at, peni: e.peni };
        }),
      ),
    };
  }

  private postsFor(cafeId: string, customer: CustomerRecord | null): PostDTO[] {
    return [...this.posts.values()]
      .filter((p) => p.cafeId === cafeId)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.getTime() - a.publishedAt.getTime())
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        body: p.body,
        publishedAt: p.publishedAt.toISOString(),
        pinned: p.pinned,
        eventStartsAt: p.eventStartsAt?.toISOString() ?? null,
        eventCapacity: p.eventCapacity,
        reactionCount: p.reactions.size,
        commentCount: p.comments.length,
        rsvpCount: p.rsvps.size,
        reactedByMe: !!customer && p.reactions.has(customer.id),
        rsvpedByMe: !!customer && p.rsvps.has(customer.id),
        comments: p.comments.map((c) => ({
          id: c.id,
          authorName: this.publicName(this.customers.get(c.customerId)),
          body: c.body,
          createdAt: c.createdAt.toISOString(),
        })),
      }));
  }

  private orderDTO(o: OrderRecord): OrderDTO {
    const cafe = this.cafeById(o.cafeId);
    const f = o.fulfillment;
    return {
      id: o.id,
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      orderNumber: o.orderNumber,
      status: f.status,
      customerName: this.customers.get(o.customerId)?.displayName ?? "Misafir",
      lines: o.lines,
      subtotalKurus: o.subtotalKurus,
      peniDiscountKurus: o.peniDiscountKurus,
      askidaKurus: o.askidaKurus,
      dueKurus: o.subtotalKurus - o.peniDiscountKurus - o.askidaKurus,
      customerNote: o.customerNote,
      rejectionReason: f.rejectionReason,
      submittedAt: f.submittedAt.toISOString(),
      acceptedAt: f.acceptedAt?.toISOString() ?? null,
      readyAt: f.readyAt?.toISOString() ?? null,
      closedAt: f.closedAt?.toISOString() ?? null,
    };
  }

  private giftDTO(g: Gift, viewerMembershipId: string): GiftDTO {
    const cafe = this.cafeById(g.cafeId);
    return {
      id: g.id,
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      peni: g.peni,
      message: g.message,
      status: g.status,
      fromName: this.nameForMembership(g.fromMembershipId),
      toName: this.nameForMembership(g.toMembershipId),
      direction: g.toMembershipId === viewerMembershipId ? "in" : "out",
      createdAt: g.createdAt.toISOString(),
      expiresAt: g.expiresAt.toISOString(),
    };
  }

  /** Gifts are between people who know each other, so the real display name is shown. */
  private nameForMembership(membershipId: string): string {
    for (const [key, id] of this.memberIndex) {
      if (id === membershipId) return this.customers.get(key.split(":")[0]!)?.displayName ?? "Misafir";
    }
    return "Misafir";
  }

  private async memberName(membershipId: string | null): Promise<string | null> {
    if (!membershipId) return null;
    const m = await this.directory.getMembership(membershipId);
    const c = m ? this.customers.get(m.customerId) : undefined;
    return c ? firstNameAndInitial(c.displayName) : null;
  }

  /** In the community, hidden profiles show as "Bir üye". */
  private publicName(c: CustomerRecord | undefined): string {
    if (!c) return "Bir üye";
    return c.profileVisible ? c.displayName : "Bir üye";
  }

  private requirePost(slug: string, postId: string, customer: CustomerRecord): PostRecord {
    const cafe = this.requireCafe(slug);
    const post = this.posts.get(postId);
    if (!post || post.cafeId !== cafe.id) throw new AppError("NOT_FOUND", "Post not found", 404);
    this.requireMembershipId(customer.id, cafe.id);
    return post;
  }

  private requireCafe(slug: string): CafeRecord {
    const cafe = [...this.cafes.values()].find((c) => c.slug === slug);
    if (!cafe) throw new AppError("NOT_FOUND", "Café not found", 404);
    return cafe;
  }

  private cafeById(id: string): CafeRecord {
    const cafe = this.cafes.get(id);
    if (!cafe) throw new AppError("NOT_FOUND", "Café not found", 404);
    return cafe;
  }

  private requireMembershipId(customerId: string, cafeId: string): string {
    const id = this.memberIndex.get(`${customerId}:${cafeId}`);
    if (!id) throw new AppError("NOT_A_MEMBER", "Join the café first", 403);
    return id;
  }
}

function toCustomerDTO(c: CustomerRecord): CustomerDTO {
  return { id: c.id, phone: c.phone, displayName: c.displayName, avatarUrl: c.avatarUrl, profileVisible: c.profileVisible };
}

function toMenuDTO(m: MenuItem, settings: CafePeniSettings): MenuItemDTO {
  return {
    productId: m.productId,
    name: m.name,
    category: m.category,
    priceKurus: m.priceKurus,
    available: m.available,
    description: m.description ?? null,
    askida: settings.askidaEnabled && settings.askidaProductIds.includes(m.productId),
  };
}

function firstNameAndInitial(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : (first ?? name);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isToday(d: Date | null): boolean {
  return !!d && Date.now() - d.getTime() < 12 * 3_600_000;
}
