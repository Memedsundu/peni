/**
 * What a café pays for (decision N11): three plans, and two weeks of everything when a café
 * starts. A plan only hides; nothing is deleted when a café moves down, and it all comes
 * back when it moves up again.
 */
import type { Gift, GiftFilter, Membership, MembershipFilter, PeniDirectory } from "./directory";
import type { IdentityStore } from "./identity";
import type { CafePeniSettings } from "./settings";
import type { Permission } from "./staff";

export const CAFE_PLANS = ["topluluk", "penny", "isletme"] as const;
export type CafePlan = (typeof CAFE_PLANS)[number];

export function isCafePlan(value: string): value is CafePlan {
  return (CAFE_PLANS as readonly string[]).includes(value);
}

/** A new café has everything for this long. */
export const TRIAL_DAYS = 14;

export interface PlanDefinition {
  name: { tr: string; en: string };
  /** A month, in kuruş, before KDV. */
  monthlyKurus: number;
  /** A year paid at once, in kuruş, before KDV. Null: there's no yearly price. */
  yearlyKurus: number | null;
}

export const PLANS: Record<CafePlan, PlanDefinition> = {
  topluluk: { name: { tr: "Topluluk", en: "Community" }, monthlyKurus: 0, yearlyKurus: null },
  penny: { name: { tr: "Topluluk + Penny", en: "Community + Penny" }, monthlyKurus: 49_000, yearlyKurus: null },
  isletme: { name: { tr: "İşletme", en: "Business" }, monthlyKurus: 149_000, yearlyKurus: 1_490_000 },
};

/** The café page, its posts and events, and the team. */
const COMMUNITY: readonly Permission[] = ["posts.write", "posts.moderate", "team.view", "team.manage", "roles.manage", "settings.edit"];
/** Adds pennies and the askı on the café's own till, the menu they're priced from, and Müdavimler. */
const PENNY: readonly Permission[] = [...COMMUNITY, "peni.view", "peni.till", "menu.edit", "regulars.view"];

/** Everything else (the till, bills, stock, money, staff, reports, the assistant) is İşletme. */
export function planAllows(plan: CafePlan, permission: Permission): boolean {
  if (plan === "isletme") return true;
  return (plan === "penny" ? PENNY : COMMUNITY).includes(permission);
}

/** Whether customers can earn and spend pennies, and use the askı, at a café on this plan. */
export function planHasPenny(plan: CafePlan): boolean {
  return plan !== "topluluk";
}

/** The café's plan at `now`: everything while its trial lasts, then the plan it pays for. */
export function planOn(cafe: { plan: CafePlan; trialEndsAt: Date | null }, now: Date): CafePlan {
  return cafe.trialEndsAt && cafe.trialEndsAt > now ? "isletme" : cafe.plan;
}

/** When a trial started at `now` ends. */
export function trialEndFrom(now: Date): Date {
  return new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
}

/**
 * The café directory as everyone outside the stores reads it: at a café whose plan has no
 * pennies, pennies and the askı read as off, so earning, spending, gifts and the askı stop
 * there by the rules that already respect "off". The stored settings don't change, and
 * customers' balances stay; they work again when the café moves up.
 */
export class PlanAwareDirectory implements PeniDirectory {
  constructor(
    private readonly inner: PeniDirectory,
    private readonly identity: Pick<IdentityStore, "getCafe">,
    private readonly now: () => Date,
  ) {}

  async getSettings(cafeId: string): Promise<CafePeniSettings> {
    const [settings, cafe] = await Promise.all([this.inner.getSettings(cafeId), this.identity.getCafe(cafeId)]);
    if (!cafe || planHasPenny(planOn(cafe, this.now()))) return settings;
    return { ...settings, peniEnabled: false, askidaEnabled: false };
  }

  getMembership(id: string) {
    return this.inner.getMembership(id);
  }
  findMembership(customerId: string, cafeId: string) {
    return this.inner.findMembership(customerId, cafeId);
  }
  listMemberships(filter: MembershipFilter) {
    return this.inner.listMemberships(filter);
  }
  saveMembership(membership: Membership) {
    return this.inner.saveMembership(membership);
  }
  saveSettings(settings: CafePeniSettings) {
    return this.inner.saveSettings(settings);
  }
  getGift(id: string) {
    return this.inner.getGift(id);
  }
  saveGift(gift: Gift) {
    return this.inner.saveGift(gift);
  }
  listGifts(filter: GiftFilter) {
    return this.inner.listGifts(filter);
  }
}
