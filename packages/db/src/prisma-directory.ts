import type { CafePeniSettings, Gift, GiftFilter, Membership, MembershipFilter, PeniDirectory } from "@peni/core";
import { defaultSettings } from "@peni/core";
import type { Db } from "./db";

const MEMBERSHIP = { id: true, cafeId: true, customerId: true, joinedAt: true, blocked: true } as const;

export class PrismaDirectory implements PeniDirectory {
  constructor(private readonly db: Db) {}

  async getMembership(id: string): Promise<Membership | null> {
    return this.db().membership.findUnique({ where: { id }, select: MEMBERSHIP });
  }

  async findMembership(customerId: string, cafeId: string): Promise<Membership | null> {
    return this.db().membership.findUnique({ where: { customerId_cafeId: { customerId, cafeId } }, select: MEMBERSHIP });
  }

  async listMemberships(f: MembershipFilter): Promise<Membership[]> {
    return this.db().membership.findMany({
      where: { ...(f.cafeId ? { cafeId: f.cafeId } : {}), ...(f.customerId ? { customerId: f.customerId } : {}) },
      select: MEMBERSHIP,
      orderBy: { joinedAt: "asc" },
    });
  }

  async saveMembership(m: Membership): Promise<void> {
    await this.db().membership.upsert({
      where: { id: m.id },
      create: { id: m.id, cafeId: m.cafeId, customerId: m.customerId, joinedAt: m.joinedAt, blocked: m.blocked },
      update: { blocked: m.blocked },
    });
  }

  async getSettings(cafeId: string): Promise<CafePeniSettings> {
    const cafe = await this.db().cafe.findUnique({ where: { id: cafeId }, include: { settings: true } });
    const base = defaultSettings(cafeId);
    if (!cafe) return base;
    const s = cafe.settings;
    if (!s) return { ...base, timeZone: cafe.timeZone };
    return {
      cafeId,
      timeZone: cafe.timeZone,
      peniEnabled: s.peniEnabled,
      earnRateBps: s.earnRateBps,
      maxRedeemShareBps: s.maxRedeemShareBps,
      redeemableProductIds: s.redeemAllProducts ? null : s.redeemableProductIds,
      dailyGiftLimitPeni: s.dailyGiftLimitPeni,
      giftExpiryHours: s.giftExpiryHours,
      askidaEnabled: s.askidaEnabled,
      askidaProductIds: s.askidaProductIds,
      askidaClaimsPerDay: s.askidaClaimsPerDay,
      askidaMinMembershipDays: s.askidaMinMembershipDays,
      askidaMatchBps: s.askidaMatchBps,
      askidaMatchMonthlyCapPeni: s.askidaMatchMonthlyCapPeni,
    };
  }

  /** The café row must exist; its time zone is stored on it. */
  async saveSettings(s: CafePeniSettings): Promise<void> {
    const data = {
      peniEnabled: s.peniEnabled,
      earnRateBps: s.earnRateBps,
      maxRedeemShareBps: s.maxRedeemShareBps,
      redeemAllProducts: s.redeemableProductIds === null,
      redeemableProductIds: s.redeemableProductIds ?? [],
      dailyGiftLimitPeni: s.dailyGiftLimitPeni,
      giftExpiryHours: s.giftExpiryHours,
      askidaEnabled: s.askidaEnabled,
      askidaProductIds: s.askidaProductIds,
      askidaClaimsPerDay: s.askidaClaimsPerDay,
      askidaMinMembershipDays: s.askidaMinMembershipDays,
      askidaMatchBps: s.askidaMatchBps,
      askidaMatchMonthlyCapPeni: s.askidaMatchMonthlyCapPeni,
    };
    await this.db().cafe.update({
      where: { id: s.cafeId },
      data: { timeZone: s.timeZone, settings: { upsert: { create: data, update: data } } },
    });
  }

  async getGift(id: string): Promise<Gift | null> {
    return this.db().gift.findUnique({ where: { id } });
  }

  async saveGift(g: Gift): Promise<void> {
    const { thankedAt, ...rest } = g;
    await this.db().gift.upsert({
      where: { id: g.id },
      create: { ...rest, thankedAt: thankedAt ?? null },
      update: { status: g.status, resolvedAt: g.resolvedAt, ...(thankedAt !== undefined ? { thankedAt } : {}) },
    });
  }

  async listGifts(f: GiftFilter): Promise<Gift[]> {
    return this.db().gift.findMany({
      where: {
        ...(f.cafeId ? { cafeId: f.cafeId } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.expiresBefore ? { expiresAt: { lte: f.expiresBefore } } : {}),
        ...(f.membershipId
          ? { OR: [{ fromMembershipId: f.membershipId }, { toMembershipId: f.membershipId }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
