import type {
  AskidaDTO,
  CafeDetailDTO,
  CafeHue,
  CafeSummaryDTO,
  CreateOrderRequest,
  CustomerDTO,
  FullWalletDTO,
  GiftDTO,
  GiftPreviewDTO,
  LedgerEntryDTO,
  MeDTO,
  MemberLookupDTO,
  MenuItemDTO,
  OrderDTO,
  OrderLineDTO,
  PauseDuration,
  PostDTO,
  RecentRecipientDTO,
  RefItemDTO,
  SessionDTO,
  StaffCafeDTO,
  StaffDashboardDTO,
  StaffReportFieldsDTO,
  StaffRole,
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
  memberCode,
  normalizeMemberCode,
  prepTimeStats,
  startOfLocalDay,
  startOfNextLocalDay,
  transition,
  type AskidaWallEvent,
  type CafePeniReport,
  type CafePeniSettings,
  type FulfillmentAction,
  type FulfillmentState,
  type Gift,
  type MenuItem,
  type PosAdapter,
  type PosEvent,
} from "@peni/core";
import { goods, initials as initialsOf, trUpper } from "@peni/brand/format";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { buildIcs } from "./ics";

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
  /** A timed pause resumes by itself at this moment. [G20] */
  pausedUntil?: Date | null;
  /** Items that read peni as goods ("3 çay"). Defaults to the cheapest askı items. [G1] */
  referenceProductIds?: string[];
  /** The café's own colourway, once it picks one. [G9] */
  hue?: CafeHue | null;
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
  /** Read from the ledger when the order is paid, and again after a refund. [G7] */
  earnedPeni?: number | null;
}

export interface PostRecord {
  id: string;
  cafeId: string;
  kind: "post" | "question" | "event";
  /** Event topic. [G4] */
  title?: string | null;
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

export interface PeniAppOptions {
  demo: boolean;
  staffKey: string;
  /** Defaults to the system clock. Tests move it to check pauses and day boundaries. */
  clock?: () => Date;
}

const DEMO_CODE = "000000";
const NEW_GUEST_NAME = "Yeni misafir";
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Gift recipient lookups per customer per hour. [G6] */
export const LOOKUP_LIMIT_PER_HOUR = 20;
/** A Peni masası lasts this long in calendars. */
const EVENT_LENGTH_MS = 2 * HOUR_MS;

export class PeniApp {
  readonly directory = new InMemoryDirectory();
  readonly ledger = new Ledger(new InMemoryLedgerStore());
  readonly peni: PeniService;
  readonly pos: StandalonePosAdapter;

  readonly cafes = new Map<string, CafeRecord>();
  readonly customers = new Map<string, CustomerRecord>();
  readonly posts = new Map<string, PostRecord>();
  readonly notifications: Notification[] = [];
  private readonly orders = new Map<string, OrderRecord>();
  private readonly sessions = new Map<string, string>(); // token hash to customer id
  private readonly codes = new Map<string, PendingCode>();
  private readonly memberIndex = new Map<string, string>(); // `${customerId}:${cafeId}` to membership id
  private readonly memberCodes = new Map<string, string>(); // membership id to Peni kodu
  private readonly membersByCode = new Map<string, string>(); // Peni kodu to membership id
  private readonly staffRoles = new Map<string, { cafeId: string; role: StaffRole }[]>(); // customer id to cafés
  private readonly unnamed = new Set<string>(); // customers who have not told us their name yet
  private readonly lookups = new Map<string, number[]>(); // customer id to lookup times (ms)
  private readonly thanks = new Map<string, Date>(); // gift id to when the recipient said thanks
  private clockOverride: Date | null = null;

  constructor(
    private readonly options: PeniAppOptions,
    /** POS per café kind. Shelby cafés get a ShelbyPosAdapter when configured. */
    private readonly posFor: (cafe: CafeRecord) => PosAdapter = () => this.pos,
  ) {
    this.peni = new PeniService(this.ledger, this.directory, () => this.now());
    this.pos = new StandalonePosAdapter({ clock: () => this.now() });
  }

  /** The app's clock. Everything time-based (orders, ledger, pauses, codes) reads it. */
  now(): Date {
    return this.clockOverride ? new Date(this.clockOverride) : (this.options.clock?.() ?? new Date());
  }

  /** Demo seeding only: runs `fn` as if the time were `when`, so history lands on past days. */
  async at<T>(when: Date, fn: () => Promise<T>): Promise<T> {
    const previous = this.clockOverride;
    this.clockOverride = when;
    try {
      return await fn();
    } finally {
      this.clockOverride = previous;
    }
  }

  // ─────────────────────────────────────────────── auth (phone + SMS code)

  async requestCode(phone: string): Promise<{ sent: true; devCode?: string }> {
    const code = this.options.demo ? DEMO_CODE : String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.codes.set(phone, { codeHash: sha256(code), expiresAt: this.now().getTime() + 5 * 60_000, attempts: 0 });
    if (!this.options.demo) {
      // TODO(sms): send through the SMS provider (see docs/roadmap.md). Never log the code.
      throw new AppError("SMS_NOT_CONFIGURED", "SMS provider is not configured", 503);
    }
    return { sent: true, devCode: code };
  }

  async verifyCode(phone: string, code: string, displayName?: string): Promise<SessionDTO> {
    const pending = this.codes.get(phone);
    if (!pending || pending.expiresAt < this.now().getTime()) throw new AppError("CODE_INVALID", "Code expired", 401);
    if (++pending.attempts > 5) {
      this.codes.delete(phone);
      throw new AppError("RATE_LIMITED", "Too many attempts", 429);
    }
    if (pending.codeHash !== sha256(code)) throw new AppError("CODE_INVALID", "Wrong code", 401);
    this.codes.delete(phone);

    let customer = [...this.customers.values()].find((c) => c.phone === phone);
    if (!customer) {
      const name = displayName?.trim();
      customer = {
        id: `cus_${crypto.randomUUID()}`,
        phone,
        displayName: name || NEW_GUEST_NAME,
        avatarUrl: null,
        profileVisible: false,
      };
      this.customers.set(customer.id, customer);
      if (!name) this.unnamed.add(customer.id);
    } else if (displayName?.trim() && this.unnamed.has(customer.id)) {
      customer.displayName = displayName.trim();
      this.unnamed.delete(customer.id);
    }
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(sha256(token), customer.id);
    return {
      token,
      customer: toCustomerDTO(customer),
      isNew: this.unnamed.has(customer.id),
      staffCafes: this.staffCafesFor(customer.id),
    };
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

  // ─────────────────────────────────────────────── me (profile, staff cafés)

  me(customer: CustomerRecord): MeDTO {
    return { customer: toCustomerDTO(customer), staffCafes: this.staffCafesFor(customer.id) };
  }

  /** "Adın" and "Profilim görünsün". [G18] */
  updateProfile(customer: CustomerRecord, input: { displayName?: string; profileVisible?: boolean }): MeDTO {
    const name = input.displayName?.trim();
    if (name) {
      customer.displayName = name;
      this.unnamed.delete(customer.id);
    }
    if (input.profileVisible !== undefined) customer.profileVisible = input.profileVisible;
    return this.me(customer);
  }

  /** Makes a customer staff at a café, so their session offers the café panel. [G19] */
  grantStaff(customerId: string, cafeSlug: string, role: StaffRole): void {
    const cafe = this.requireCafe(cafeSlug);
    const roles = (this.staffRoles.get(customerId) ?? []).filter((r) => r.cafeId !== cafe.id);
    this.staffRoles.set(customerId, [...roles, { cafeId: cafe.id, role }]);
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
    const prep = this.prepStats(cafe.id);

    return {
      ...(await this.cafeSummary(cafe, customer)),
      address: cafe.address,
      earnRatePercent: settings.earnRateBps / 100,
      maxRedeemSharePercent: settings.maxRedeemShareBps / 100,
      menu: menu.map((m) => toMenuDTO(m, settings)),
      askida: await this.askida(cafe, settings, menu, { membershipId: membership?.id ?? null }),
      posts: this.postsFor(cafe.id, customer, settings.timeZone),
      membership: membership
        ? {
            id: membership.id,
            balancePeni: await this.peni.walletBalance(membership.id),
            preorderEnabled: membership.preorderEnabled,
            joinedAt: membership.joinedAt.toISOString(),
            noShowStrikes: membership.consecutiveNoShows,
            memberCode: this.memberCodeFor(membership.id),
          }
        : null,
      medianPrepMinutes: prep?.medianMinutes ?? null,
      prepMinutesRange: prep ? { low: prep.lowMinutes, high: prep.highMinutes } : null,
    };
  }

  async join(slug: string, customer: CustomerRecord): Promise<CafeDetailDTO> {
    const cafe = this.requireCafe(slug);
    await this.ensureMembership(customer.id, cafe.id);
    return this.cafeDetail(slug, customer);
  }

  async ensureMembership(customerId: string, cafeId: string, joinedAt = this.now()): Promise<string> {
    const key = `${customerId}:${cafeId}`;
    const existing = this.memberIndex.get(key);
    if (existing) return existing;
    const id = `mem_${crypto.randomUUID()}`;
    this.memberIndex.set(key, id);
    this.memberCodeFor(id);
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

  /** The Peni kodu of a membership: derived from its id, re-rolled only on a collision. [G7b] */
  memberCodeFor(membershipId: string): string {
    const known = this.memberCodes.get(membershipId);
    if (known) return known;
    let attempt = 0;
    let code = memberCode(membershipId, attempt);
    while (this.membersByCode.has(code)) code = memberCode(membershipId, ++attempt);
    this.memberCodes.set(membershipId, code);
    this.membersByCode.set(code, membershipId);
    return code;
  }

  /** Which membership a Peni kodu belongs to, however the till typed it. */
  membershipForCode(code: string): string | null {
    const normalized = normalizeMemberCode(code);
    return normalized ? (this.membersByCode.get(normalized) ?? null) : null;
  }

  /**
   * Gift recipient check [G6]: reveals only "Mehmet K.", only to members of the same
   * café, and only 20 times an hour per customer. Every lookup counts, hits or not.
   */
  async lookupMember(customer: CustomerRecord, slug: string, phone: string): Promise<MemberLookupDTO> {
    const cafe = this.requireCafe(slug);
    this.requireMembershipId(customer.id, cafe.id);
    this.consumeLookup(customer.id);
    if (phone === customer.phone) throw new AppError("GIFT_INVALID", "You cannot treat yourself", 400);
    const recipient = [...this.customers.values()].find((c) => c.phone === phone);
    const membershipId = recipient ? this.memberIndex.get(`${recipient.id}:${cafe.id}`) : undefined;
    const membership = membershipId ? await this.directory.getMembership(membershipId) : null;
    if (!recipient || !membership || membership.blocked) {
      throw new AppError("RECIPIENT_NOT_MEMBER", "No member with this number at this café", 404);
    }
    const { firstName, lastInitial } = nameParts(recipient.displayName);
    return { firstName, lastInitial };
  }

  // ─────────────────────────────────────────────── wallet & gifts

  async wallet(customer: CustomerRecord): Promise<FullWalletDTO> {
    // Stand-in for the background job: unaccepted gifts go home after 24 hours.
    await this.peni.expireGifts();

    const cafes: WalletDTO["cafes"] = [];
    const gifts: GiftDTO[] = [];
    const ledger: LedgerEntryDTO[] = [];
    const recents: { cafe: CafeRecord; recipientId: string; at: Date }[] = [];

    for (const [key, membershipId] of this.memberIndex) {
      if (!key.startsWith(`${customer.id}:`)) continue;
      const cafe = this.cafeById(key.slice(customer.id.length + 1));
      const settings = await this.directory.getSettings(cafe.id);
      const menu = await this.posFor(cafe).listMenu(cafe.id);
      cafes.push({
        cafeSlug: cafe.slug,
        cafeName: cafe.name,
        membershipId,
        balancePeni: await this.peni.walletBalance(membershipId),
        district: cafe.district,
        refItems: refItemsFor(cafe, settings, menu),
        memberCode: this.memberCodeFor(membershipId),
        hue: cafe.hue ?? null,
      });

      for (const g of await this.directory.listGifts({ membershipId })) {
        const dto = await this.giftDTO(g, membershipId);
        // A gift the sender took back never reaches the recipient's wallet.
        if (dto.direction === "in" && dto.cancelledBySender) continue;
        gifts.push(dto);
        if (dto.direction === "out") recents.push({ cafe, recipientId: g.toMembershipId, at: g.createdAt });
      }

      for (const entry of await this.peni.memberHistory(membershipId)) {
        const gift = entry.giftId ? await this.directory.getGift(entry.giftId) : null;
        const order = entry.orderId ? this.orders.get(entry.orderId) : undefined;
        ledger.push({
          id: entry.id,
          at: entry.at.toISOString(),
          cafeSlug: cafe.slug,
          cafeName: cafe.name,
          kind: entry.kind,
          peni: entry.peni,
          orderId: order?.id ?? null,
          orderNumber: order?.orderNumber ?? null,
          giftId: entry.giftId,
          counterpartName: gift
            ? this.nameForMembership(entry.kind === "gift_in" ? gift.fromMembershipId : gift.toMembershipId)
            : null,
        });
      }
    }

    gifts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    ledger.sort((a, b) => b.at.localeCompare(a.at));
    return {
      totalPeni: cafes.reduce((s, c) => s + c.balancePeni, 0),
      cafes,
      gifts,
      recentRecipients: this.recentRecipients(recents),
      ledger,
    };
  }

  async sendGift(
    customer: CustomerRecord,
    input: { cafeSlug: string; toPhone: string; peni: number; message?: string; idempotencyKey: string },
  ): Promise<GiftDTO> {
    const cafe = this.requireCafe(input.cafeSlug);
    const from = this.requireMembershipId(customer.id, cafe.id);
    if (input.toPhone === customer.phone) throw new PeniError("GIFT_INVALID", "You cannot send a gift to yourself");
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

  /** "Geri al": the sender takes back a pending gift. [G17] */
  async cancelGift(customer: CustomerRecord, giftId: string): Promise<GiftDTO> {
    const gift = await this.directory.getGift(giftId);
    if (!gift) throw new AppError("NOT_FOUND", "Gift not found", 404);
    const membershipId = this.requireMembershipId(customer.id, gift.cafeId);
    return this.giftDTO(await this.peni.cancelGift(giftId, membershipId), membershipId);
  }

  /** "Teşekkür et": once per accepted gift; asking again changes nothing. [G15] */
  async thankGift(customer: CustomerRecord, giftId: string): Promise<GiftDTO> {
    const gift = await this.directory.getGift(giftId);
    if (!gift) throw new AppError("NOT_FOUND", "Gift not found", 404);
    const membershipId = this.requireMembershipId(customer.id, gift.cafeId);
    if (gift.toMembershipId !== membershipId) throw new AppError("FORBIDDEN", "Only the recipient can say thanks", 403);
    if (gift.status !== "accepted") throw new AppError("GIFT_NOT_ACCEPTED", "Accept the gift first", 409);
    if (!this.thanks.has(gift.id)) this.thanks.set(gift.id, this.now());
    return this.giftDTO(gift, membershipId);
  }

  /** Public view of a shared gift link, personalised when the visitor is signed in. [G11] */
  async giftPreview(giftId: string, viewer: CustomerRecord | null): Promise<GiftPreviewDTO> {
    await this.peni.expireGifts();
    const gift = await this.directory.getGift(giftId);
    if (!gift) throw new AppError("NOT_FOUND", "Gift not found", 404);
    const cafe = this.cafeById(gift.cafeId);
    const settings = await this.directory.getSettings(cafe.id);
    const refItems = refItemsFor(cafe, settings, await this.posFor(cafe).listMenu(cafe.id));
    const viewerMembership = viewer ? this.memberIndex.get(`${viewer.id}:${cafe.id}`) : undefined;
    return {
      id: gift.id,
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      fromFirstName: nameParts(this.nameForMembership(gift.fromMembershipId)).firstName,
      peni: gift.peni,
      goods: goods(gift.peni, refItems),
      refItems,
      status: gift.status,
      expiresAt: gift.expiresAt.toISOString(),
      viewer: !viewer
        ? "signed_out"
        : viewerMembership === gift.toMembershipId
          ? "recipient"
          : viewerMembership === gift.fromMembershipId
            ? "sender"
            : viewerMembership
              ? "member"
              : "guest",
    };
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
    const menu = await this.posFor(cafe).listMenu(cafe.id);
    return { balancePeni: (await this.askida(cafe, settings, menu, { wallSize: 0 })).balancePeni };
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
    this.refreshPause(cafe);
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
        fulfillment: initialFulfillment(this.now()),
        lines,
        subtotalKurus,
        peniDiscountKurus,
        askidaKurus,
        dueKurus: subtotalKurus - peniDiscountKurus - askidaKurus,
        customerNote: input.customerNote?.trim() || null,
        earnedPeni: null,
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

  /**
   * Pauses or resumes app orders [G20]. `true` pauses with no end and `false` (or
   * null) resumes, as before; `{ minutes }` and `"end_of_day"` resume by themselves.
   */
  async setPaused(slug: string, pause: boolean | PauseDuration | null) {
    const cafe = this.requireCafe(slug);
    const now = this.now();
    if (pause === false || pause === null) {
      cafe.appOrderingPaused = false;
      cafe.pausedUntil = null;
    } else if (pause === true) {
      cafe.appOrderingPaused = true;
      cafe.pausedUntil = null;
    } else if (pause === "end_of_day") {
      const { timeZone } = await this.directory.getSettings(cafe.id);
      cafe.appOrderingPaused = true;
      cafe.pausedUntil = startOfNextLocalDay(now, timeZone);
    } else {
      cafe.appOrderingPaused = true;
      cafe.pausedUntil = new Date(now.getTime() + pause.minutes * 60_000);
    }
    return { appOrderingPaused: cafe.appOrderingPaused, pausedUntil: cafe.pausedUntil?.toISOString() ?? null };
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
      // A walk-in order at the till: the member showed their Peni kodu (or the till sent the membership id).
      const hint = event.membershipHint;
      if (hint) {
        const membershipId = "membershipId" in hint ? hint.membershipId : this.membershipForCode(hint.memberCode);
        if (!membershipId) throw new AppError("NOT_FOUND", "Unknown Peni kodu", 404);
        await this.peni.earnForPaidOrder({
          membershipId,
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
        order!.earnedPeni = await this.peni.earnedForOrder(order!.id);
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
    this.refreshPause(cafe);
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.posFor(cafe).listMenu(cafe.id);
    const now = this.now();
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const previousSince = new Date(now.getTime() - 60 * DAY_MS);
    const report = await this.peni.cafeReport(cafe.id, since);
    const previous = await this.peni.cafeReport(cafe.id, previousSince, since);
    const orders = [...this.orders.values()]
      .filter((o) => o.cafeId === cafe.id)
      .filter((o) => !TERMINAL_STATUSES.includes(o.fulfillment.status) || this.closedRecently(o.fulfillment.closedAt))
      .sort((a, b) => a.fulfillment.submittedAt.getTime() - b.fulfillment.submittedAt.getTime())
      .map((o) => this.orderDTO(o));
    const members = [...this.directory.memberships.values()].filter((m) => m.cafeId === cafe.id);

    return {
      cafe: {
        id: cafe.id,
        slug: cafe.slug,
        name: cafe.name,
        posKind: cafe.posKind,
        acceptingOrders: !cafe.appOrderingPaused && (await this.posFor(cafe).isAcceptingOrders(cafe.id)),
        appOrderingPaused: cafe.appOrderingPaused,
        pausedUntil: cafe.pausedUntil?.toISOString() ?? null,
      },
      orders,
      askida: await this.askida(cafe, settings, menu),
      report: {
        ...report,
        sinceIso: since.toISOString(),
        previous: {
          ...reportFields(previous, previousSince),
          untilIso: since.toISOString(),
          memberCount: members.filter((m) => m.joinedAt < since).length,
        },
      },
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
      if (post.eventCapacity && post.rsvps.size >= post.eventCapacity) throw new AppError("EVENT_FULL", "Event is full", 409);
      post.rsvps.add(customer.id);
    }
    return { ok: true as const };
  }

  comment(customer: CustomerRecord, slug: string, postId: string, body: string) {
    const post = this.requirePost(slug, postId, customer);
    post.comments.push({ id: `cmt_${crypto.randomUUID()}`, customerId: customer.id, body, createdAt: this.now() });
    return { ok: true as const };
  }

  /** A Peni masası as an .ics file. Public, so a phone can hand the link to its calendar. [G22] */
  eventIcs(slug: string, postId: string): { filename: string; body: string } {
    const cafe = this.requireCafe(slug);
    const post = this.posts.get(postId);
    if (!post || post.cafeId !== cafe.id || post.kind !== "event" || !post.eventStartsAt) {
      throw new AppError("NOT_FOUND", "Event not found", 404);
    }
    const location = [cafe.name, cafe.address, cafe.district, cafe.city].filter(Boolean).join(", ");
    return {
      filename: `peni-masasi-${post.eventStartsAt.toISOString().slice(0, 10)}.ics`,
      body: buildIcs({
        uid: `${post.id}@peni`,
        stamp: this.now(),
        start: post.eventStartsAt,
        end: new Date(post.eventStartsAt.getTime() + EVENT_LENGTH_MS),
        summary: postTitle(post),
        location,
        description: post.title ? post.body : null,
      }),
    };
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
    const result = transition(order.fulfillment, action, actor, this.now(), reason);
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
      order.earnedPeni = await this.peni.earnedForOrder(order.id);
    }
    if (result.notify) {
      // TODO(push): deliver through Expo push to the customer's devices.
      this.notifications.push({ customerId: order.customerId, template: result.notify, orderId: order.id, at: this.now() });
    }
    return this.orderDTO(order);
  }

  private async cafeSummary(cafe: CafeRecord, customer: CustomerRecord | null): Promise<CafeSummaryDTO> {
    this.refreshPause(cafe);
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.posFor(cafe).listMenu(cafe.id);
    const reference = askidaReference(cafe, settings, menu);
    const snap = await this.peni.askidaSnapshot(cafe.id, reference?.priceKurus ?? 100);
    const membershipId = customer ? this.memberIndex.get(`${customer.id}:${cafe.id}`) : undefined;
    return {
      id: cafe.id,
      slug: cafe.slug,
      name: cafe.name,
      district: cafe.district,
      city: cafe.city,
      coverImageUrl: cafe.coverImageUrl,
      acceptingOrders: !cafe.appOrderingPaused && (await this.posFor(cafe).isAcceptingOrders(cafe.id)),
      askidaItemsAvailable: reference ? snap.itemsAvailable : 0,
      isMember: !!membershipId,
      balancePeni: membershipId ? await this.peni.walletBalance(membershipId) : null,
      earnRatePercent: settings.earnRateBps / 100,
      refItems: refItemsFor(cafe, settings, menu),
      nextEvent: this.nextEvent(cafe.id),
      hue: cafe.hue ?? null,
    };
  }

  private async askida(
    cafe: CafeRecord,
    settings: CafePeniSettings,
    menu: MenuItem[],
    opts: { wallSize?: number; membershipId?: string | null } = {},
  ): Promise<AskidaDTO> {
    const wallSize = opts.wallSize ?? 15;
    const reference = askidaReference(cafe, settings, menu);
    const snap = await this.peni.askidaSnapshot(cafe.id, reference?.priceKurus ?? 100);
    // Claims are never listed, not even anonymously with a time: only donations reach the wall (§17).
    const wall =
      wallSize > 0
        ? (await this.peni.askidaWall(cafe.id, wallSize * 3))
            .filter((e): e is Exclude<AskidaWallEvent, { type: "claim" }> => e.type !== "claim")
            .slice(0, wallSize)
        : [];
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
          return { type: e.type, at, peni: e.peni };
        }),
      ),
      myEligibility: await this.peni.askidaEligibility(opts.membershipId ?? null),
      matchPercent: await this.peni.askidaMatchPercent(cafe.id),
    };
  }

  private postsFor(cafeId: string, customer: CustomerRecord | null, timeZone: string): PostDTO[] {
    const today = startOfLocalDay(this.now(), timeZone);
    const viewer = customer?.id ?? null;
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
        reactedByMe: !!viewer && p.reactions.has(viewer),
        rsvpedByMe: !!viewer && p.rsvps.has(viewer),
        comments: p.comments.map((c) => ({
          id: c.id,
          authorName: this.publicName(this.customers.get(c.customerId)),
          body: c.body,
          createdAt: c.createdAt.toISOString(),
        })),
        title: p.title ?? null,
        attendees: [...p.rsvps].map((id) => {
          const c = this.customers.get(id);
          const me = id === viewer;
          return { initials: c && (me || c.profileVisible) ? initialsOf(c.displayName) : null, me };
        }),
        answeredTodayByMe:
          p.kind === "question" && !!viewer && p.comments.some((c) => c.customerId === viewer && c.createdAt >= today),
      }));
  }

  private nextEvent(cafeId: string): CafeSummaryDTO["nextEvent"] {
    const now = this.now();
    const next = [...this.posts.values()]
      .filter((p) => p.cafeId === cafeId && p.kind === "event" && p.eventStartsAt && p.eventStartsAt > now)
      .sort((a, b) => a.eventStartsAt!.getTime() - b.eventStartsAt!.getTime())[0];
    return next ? { postId: next.id, startsAt: next.eventStartsAt!.toISOString(), title: postTitle(next) } : null;
  }

  /** Accept-to-ready time over collected orders of the last 30 days. Null below 20 orders. [G14] */
  private prepStats(cafeId: string) {
    const since = this.now().getTime() - 30 * DAY_MS;
    return prepTimeStats(
      [...this.orders.values()]
        .filter((o) => o.cafeId === cafeId && (o.fulfillment.closedAt?.getTime() ?? 0) >= since)
        .map((o) => o.fulfillment),
    );
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
      earnedPeni: f.status === "collected" ? (o.earnedPeni ?? null) : null,
      memberCode: this.memberCodeFor(o.membershipId),
    };
  }

  private async giftDTO(g: Gift, viewerMembershipId: string): Promise<GiftDTO> {
    const cafe = this.cafeById(g.cafeId);
    const direction = g.toMembershipId === viewerMembershipId ? "in" : "out";
    return {
      id: g.id,
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      peni: g.peni,
      message: g.message,
      status: g.status,
      fromName: this.nameForMembership(g.fromMembershipId),
      toName: this.nameForMembership(g.toMembershipId),
      direction,
      createdAt: g.createdAt.toISOString(),
      expiresAt: g.expiresAt.toISOString(),
      canCancel: direction === "out" && g.status === "pending" && g.expiresAt > this.now(),
      cancelledBySender: g.status === "declined" && (await this.peni.giftCancelledBySender(g.id)),
      thankedAt: this.thanks.get(g.id)?.toISOString() ?? null,
    };
  }

  /** "Son ısmarladıkların": per café, newest first, one row per person, at most 5 each. [G6] */
  private recentRecipients(sent: { cafe: CafeRecord; recipientId: string; at: Date }[]): RecentRecipientDTO[] {
    const seen = new Set<string>();
    const perCafe = new Map<string, number>();
    const out: RecentRecipientDTO[] = [];
    for (const s of [...sent].sort((a, b) => b.at.getTime() - a.at.getTime())) {
      const key = `${s.cafe.id}:${s.recipientId}`;
      const count = perCafe.get(s.cafe.id) ?? 0;
      if (seen.has(key) || count >= 5) continue;
      const customer = this.customerForMembership(s.recipientId);
      if (!customer) continue;
      seen.add(key);
      perCafe.set(s.cafe.id, count + 1);
      const { firstName, lastInitial } = nameParts(customer.displayName);
      out.push({
        cafeSlug: s.cafe.slug,
        phone: customer.phone,
        firstName,
        lastInitial,
        initials: initialsOf(customer.displayName),
        lastGiftAt: s.at.toISOString(),
      });
    }
    return out;
  }

  private consumeLookup(customerId: string): void {
    const now = this.now().getTime();
    const recent = (this.lookups.get(customerId) ?? []).filter((t) => t > now - HOUR_MS);
    if (recent.length >= LOOKUP_LIMIT_PER_HOUR) {
      this.lookups.set(customerId, recent);
      throw new AppError("LOOKUP_LIMITED", "Too many lookups; try again later", 429);
    }
    recent.push(now);
    this.lookups.set(customerId, recent);
  }

  /** A timed pause that has run out resumes on the next read. [G20] */
  private refreshPause(cafe: CafeRecord): void {
    if (cafe.appOrderingPaused && cafe.pausedUntil && cafe.pausedUntil <= this.now()) {
      cafe.appOrderingPaused = false;
      cafe.pausedUntil = null;
    }
  }

  private closedRecently(d: Date | null): boolean {
    return !!d && this.now().getTime() - d.getTime() < 12 * HOUR_MS;
  }

  private staffCafesFor(customerId: string): StaffCafeDTO[] {
    return (this.staffRoles.get(customerId) ?? []).flatMap(({ cafeId, role }) => {
      const cafe = this.cafes.get(cafeId);
      return cafe ? [{ slug: cafe.slug, name: cafe.name, role }] : [];
    });
  }

  private customerForMembership(membershipId: string): CustomerRecord | undefined {
    for (const [key, id] of this.memberIndex) {
      if (id === membershipId) return this.customers.get(key.split(":")[0]!);
    }
    return undefined;
  }

  /** Gifts are between people who know each other, so the real display name is shown. */
  private nameForMembership(membershipId: string): string {
    return this.customerForMembership(membershipId)?.displayName ?? "Misafir";
  }

  private async memberName(membershipId: string | null): Promise<string | null> {
    if (!membershipId) return null;
    const m = await this.directory.getMembership(membershipId);
    const c = m ? this.customers.get(m.customerId) : undefined;
    return c ? firstNameAndInitial(c.displayName) : null;
  }

  /** In the community, hidden profiles show as "Bir üye"; visible ones as "Ayşe Y.". */
  private publicName(c: CustomerRecord | undefined): string {
    if (!c) return "Bir üye";
    return c.profileVisible ? firstNameAndInitial(c.displayName) : "Bir üye";
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

/** The askı counts in this item: the café's first reference item that is on the askı, else the cheapest askı item. */
function askidaReference(cafe: CafeRecord, settings: CafePeniSettings, menu: MenuItem[]): MenuItem | null {
  const askidaItems = menu.filter((m) => settings.askidaProductIds.includes(m.productId));
  const preferred = (cafe.referenceProductIds ?? []).map((id) => askidaItems.find((m) => m.productId === id)).find(Boolean);
  return preferred ?? [...askidaItems].sort((a, b) => a.priceKurus - b.priceKurus)[0] ?? null;
}

/** Up to two reference items, cheapest first: the café's own picks, else its cheapest askı items. [G1] */
function refItemsFor(cafe: CafeRecord, settings: CafePeniSettings, menu: MenuItem[]): RefItemDTO[] {
  const chosen = (cafe.referenceProductIds ?? []).flatMap((id) => menu.filter((m) => m.productId === id));
  const pool = chosen.length > 0 ? chosen : menu.filter((m) => settings.askidaProductIds.includes(m.productId));
  return [...pool]
    .sort((a, b) => a.priceKurus - b.priceKurus)
    .slice(0, 2)
    .map((m) => ({ name: m.name, priceKurus: m.priceKurus }));
}

function postTitle(p: PostRecord): string {
  return p.title?.trim() || p.body.split("\n")[0]!.trim();
}

function reportFields(r: CafePeniReport, since: Date): StaffReportFieldsDTO {
  return {
    sinceIso: since.toISOString(),
    issuedPeni: r.issuedPeni,
    redeemedPeni: r.redeemedPeni,
    askidaDonatedByMembersPeni: r.askidaDonatedByMembersPeni,
    askidaTillDonationsPeni: r.askidaTillDonationsPeni,
    askidaMatchedByCafePeni: r.askidaMatchedByCafePeni,
    askidaClaimedPeni: r.askidaClaimedPeni,
    askidaClaims: r.askidaClaims,
    outstandingPeni: r.outstandingPeni,
  };
}

function nameParts(name: string): { firstName: string; lastInitial: string | null } {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  const initial = last ? Array.from(last)[0] : undefined;
  return { firstName: first ?? name, lastInitial: initial ? trUpper(initial) : null };
}

function firstNameAndInitial(name: string): string {
  const { firstName, lastInitial } = nameParts(name);
  return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
