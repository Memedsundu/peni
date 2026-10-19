import type {
  AskidaDTO,
  CafeDetailDTO,
  CafeHue,
  CafeSummaryDTO,
  CustomerDTO,
  FullWalletDTO,
  GiftDTO,
  GiftPreviewDTO,
  LedgerEntryDTO,
  MeDTO,
  MemberLookupDTO,
  MenuItemDTO,
  PostDTO,
  RecentRecipientDTO,
  RefItemDTO,
  StaffCafeDTO,
  StaffDashboardDTO,
  StaffReportFieldsDTO,
  StaffRole,
  WalletDTO,
} from "@peni/api";
import {
  InMemoryDirectory,
  InMemoryMenuStore,
  InMemoryLedgerStore,
  Ledger,
  PeniError,
  PeniService,
  memberCode,
  normalizeMemberCode,
  startOfLocalDay,
  type AskidaWallEvent,
  type CafePeniReport,
  type CafePeniSettings,
  type Gift,
  type MenuItem,
} from "@peni/core";
import { goods, initials as initialsOf, trUpper } from "@peni/brand/format";
import { createHash, randomBytes } from "node:crypto";
import { buildIcs } from "./ics";

/**
 * The Peni application layer: everything the HTTP routes call.
 *
 * Peni rules (wallets, gifts, askı) live in @peni/core's PeniService; this class
 * adds customers, cafés, menus and the community feed. For now it runs on
 * in-memory records seeded with demo data (see seed.ts). Postgres-backed ledger
 * and directory implementations already exist in @peni/db; moving the remaining
 * records there is the next piece of the plan (docs/plan.md, piece 1).
 */

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * `instanceof AppError` fails after a dev hot reload: the app singleton keeps
 * throwing errors built from the old copy of this module. Match the shape too.
 */
export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) return true;
  if (!(error instanceof Error) || error.name !== "AppError") return false;
  const { code, status } = error as Partial<AppError>;
  return typeof code === "string" && typeof status === "number";
}

export interface CafeRecord {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  district: string | null;
  city: string | null;
  coverImageUrl: string | null;
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

export interface PeniAppOptions {
  demo: boolean;
  staffKey: string;
  /** Defaults to the system clock. Tests move it to check day boundaries. */
  clock?: () => Date;
}

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
  readonly menu = new InMemoryMenuStore();

  readonly cafes = new Map<string, CafeRecord>();
  readonly customers = new Map<string, CustomerRecord>();
  readonly posts = new Map<string, PostRecord>();
  private readonly sessions = new Map<string, string>(); // token hash to customer id
  private readonly memberIndex = new Map<string, string>(); // `${customerId}:${cafeId}` to membership id
  private readonly memberCodes = new Map<string, string>(); // membership id to Peni kodu
  private readonly membersByCode = new Map<string, string>(); // Peni kodu to membership id
  private readonly staffRoles = new Map<string, { cafeId: string; role: StaffRole }[]>(); // customer id to cafés
  private readonly lookups = new Map<string, number[]>(); // customer id to lookup times (ms)
  private readonly thanks = new Map<string, Date>(); // gift id to when the recipient said thanks
  private clockOverride: Date | null = null;

  constructor(private readonly options: PeniAppOptions) {
    this.peni = new PeniService(this.ledger, this.directory, () => this.now());
  }

  /** The app's clock. Everything time-based (ledger, gifts, events) reads it. */
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

  // ─────────────────────────────────────────────── sessions

  customerForToken(token: string | null): CustomerRecord | null {
    if (!token) return null;
    const id = this.sessions.get(sha256(token));
    return id ? (this.customers.get(id) ?? null) : null;
  }

  /**
   * Demo only: a session for a seeded customer, so the web demo can sign in with one tap.
   * Google, Apple and email sign-in replace it (plan piece 3).
   */
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
    if (name) customer.displayName = name;
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
    const menu = await this.menu.listMenu(cafe.id);
    const membershipId = customer ? this.memberIndex.get(`${customer.id}:${cafe.id}`) : undefined;
    const membership = membershipId ? await this.directory.getMembership(membershipId) : null;

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
            joinedAt: membership.joinedAt.toISOString(),
            memberCode: this.memberCodeFor(membership.id),
          }
        : null,
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
    await this.directory.saveMembership({ id, cafeId, customerId, joinedAt, blocked: false });
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
      const menu = await this.menu.listMenu(cafe.id);
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
        ledger.push({
          id: entry.id,
          at: entry.at.toISOString(),
          cafeSlug: cafe.slug,
          cafeName: cafe.name,
          kind: entry.kind,
          peni: entry.peni,
          orderId: entry.orderId,
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
    const refItems = refItemsFor(cafe, settings, await this.menu.listMenu(cafe.id));
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
    const menu = await this.menu.listMenu(cafe.id);
    return { balancePeni: (await this.askida(cafe, settings, menu, { wallSize: 0 })).balancePeni };
  }

  // ─────────────────────────────────────────────── staff dashboard

  async staffDashboard(slug: string): Promise<StaffDashboardDTO> {
    const cafe = this.requireCafe(slug);
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.menu.listMenu(cafe.id);
    const now = this.now();
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const previousSince = new Date(now.getTime() - 60 * DAY_MS);
    const report = await this.peni.cafeReport(cafe.id, since);
    const previous = await this.peni.cafeReport(cafe.id, previousSince, since);
    const members = [...this.directory.memberships.values()].filter((m) => m.cafeId === cafe.id);

    return {
      cafe: { id: cafe.id, slug: cafe.slug, name: cafe.name },
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

  private async cafeSummary(cafe: CafeRecord, customer: CustomerRecord | null): Promise<CafeSummaryDTO> {
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.menu.listMenu(cafe.id);
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
