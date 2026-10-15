import type { CafePeniSettings, Gift, GiftFilter, Membership, PeniDirectory } from "@peni/core";
import { defaultSettings } from "@peni/core";
import type { PrismaClient } from "./generated/client";

export class PrismaDirectory implements PeniDirectory {
  constructor(private readonly prisma: PrismaClient) {}

  async getMembership(id: string): Promise<Membership | null> {
    return this.prisma.membership.findUnique({ where: { id } });
  }

  async saveMembership(m: Membership): Promise<void> {
    await this.prisma.membership.update({
      where: { id: m.id },
      data: { blocked: m.blocked, preorderEnabled: m.preorderEnabled, consecutiveNoShows: m.consecutiveNoShows },
    });
  }

  async getSettings(cafeId: string): Promise<CafePeniSettings> {
    const cafe = await this.prisma.cafe.findUnique({ where: { id: cafeId }, include: { settings: true } });
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
      noShowStrikeLimit: s.noShowStrikeLimit,
    };
  }

  async getGift(id: string): Promise<Gift | null> {
    return this.prisma.gift.findUnique({ where: { id } });
  }

  async saveGift(g: Gift): Promise<void> {
    await this.prisma.gift.upsert({ where: { id: g.id }, create: g, update: { status: g.status, resolvedAt: g.resolvedAt } });
  }

  async listGifts(f: GiftFilter): Promise<Gift[]> {
    return this.prisma.gift.findMany({
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
