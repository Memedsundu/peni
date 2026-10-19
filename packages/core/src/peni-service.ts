import type { Gift, Membership, PeniDirectory } from "./directory";
import { PeniError } from "./errors";
import { account, type Ledger, type LedgerTransaction } from "./ledger";
import { applyBps, assertWholeNumber, kurusToPeniCeil, type Kurus, type Peni } from "./money";
import { calculateEarn, planRedemption, type OrderLine, type RedemptionPlan } from "./rules";
import type { CafePeniSettings } from "./settings";
import { addDays, addHours, startOfLocalDay, startOfLocalMonth } from "./time";

export type Clock = () => Date;

export interface AskidaSnapshot {
  cafeId: string;
  balancePeni: Peni;
  /** How many of the reference item the pool can pay for right now. */
  itemsAvailable: number;
  referencePriceKurus: Kurus;
  claimedLast7Days: number;
  donatedLast7DaysPeni: Peni;
}

export type AskidaWallEvent =
  | {
      type: "donation";
      at: Date;
      peni: Peni;
      /** Only set when the donor chose to be named. */
      donorMembershipId: string | null;
    }
  | { type: "till_donation"; at: Date; peni: Peni }
  | { type: "cafe_match"; at: Date; peni: Peni }
  /** Who took from the askı is never exposed. */
  | { type: "claim"; at: Date; productId: string };

/**
 * Whether one member may take from the askı right now. It describes the person
 * only; whether the café has an askı and whether the pool can pay are separate.
 */
export type AskidaEligibility =
  | { status: "ok" }
  | { status: "claimed_today" }
  /** `daysLeft` is whole days, rounded up: "3 gün kaldı" until the moment it opens. */
  | { status: "too_new"; daysLeft: number }
  | { status: "blocked" }
  | { status: "not_member" };

/**
 * One line of a member's own peni history. Only movements of their own wallet
 * appear: what the askı pool pays for an ikram never touches a wallet, so a claim
 * can never show up in anyone's history, the taker's included.
 */
export type MemberHistoryKind =
  | "earn"
  | "redeem"
  | "gift_out"
  | "gift_in"
  | "gift_return"
  | "askida_donate"
  | "refund";

export interface MemberHistoryEntry {
  /** The ledger transaction id. */
  id: string;
  at: Date;
  kind: MemberHistoryKind;
  /** Signed: positive into the wallet, negative out of it. */
  peni: Peni;
  orderId: string | null;
  giftId: string | null;
}

export interface CafePeniReport {
  cafeId: string;
  since: Date;
  issuedPeni: Peni;
  redeemedPeni: Peni;
  askidaDonatedByMembersPeni: Peni;
  askidaTillDonationsPeni: Peni;
  askidaMatchedByCafePeni: Peni;
  askidaClaimedPeni: Peni;
  askidaClaims: number;
  /** All peni ever issued and not yet spent: what the café still owes in products. */
  outstandingPeni: Peni;
}

/**
 * Every peni rule lives here. Callers (web API, the till, jobs) never
 * touch the ledger directly.
 */
export class PeniService {
  constructor(
    private readonly ledger: Ledger,
    private readonly directory: PeniDirectory,
    private readonly clock: Clock = () => new Date(),
  ) {}

  // ---------------------------------------------------------------- wallet

  walletBalance(membershipId: string): Promise<Peni> {
    return this.ledger.balance(account.member(membershipId));
  }

  /**
   * Peni a paid order put in the member's wallet, net of anything a refund took
   * back. Null when the order earned nothing (not paid yet, or paid nothing at the till).
   */
  async earnedForOrder(orderId: string): Promise<Peni | null> {
    const earn = await this.ledger.findByIdempotencyKey(`earn:${orderId}`);
    if (!earn) return null;
    const wallet = earn.entries.find((e) => e.account.startsWith("member:"));
    if (!wallet) return null;
    const reversal = await this.ledger.findByIdempotencyKey(`reversal:${earn.id}`);
    const takenBack = reversal ? -inflow(reversal, wallet.account) : 0;
    return Math.max(0, wallet.delta - takenBack);
  }

  /** The member's own wallet history at one café, newest first. */
  async memberHistory(membershipId: string, limit = 100): Promise<MemberHistoryEntry[]> {
    const membership = await this.requireMembership(membershipId);
    const wallet = account.member(membership.id);
    const txs = await this.ledger.query({ cafeId: membership.cafeId, account: wallet });

    // An order the POS never took leaves no trace: hide its reservation and the release.
    const failed = new Set(
      txs.filter((t) => t.kind === "reversal" && t.meta.reason === "order_failed").map((t) => t.reversesId),
    );

    const entries: MemberHistoryEntry[] = [];
    for (const t of txs) {
      if (failed.has(t.id) || (t.kind === "reversal" && failed.has(t.reversesId))) continue;
      const kind = HISTORY_KIND[t.kind];
      const peni = inflow(t, wallet);
      if (!kind || peni === 0) continue;
      entries.push({
        id: t.id,
        at: t.createdAt,
        kind,
        peni,
        orderId: typeof t.meta.orderId === "string" ? t.meta.orderId : null,
        giftId: typeof t.meta.giftId === "string" ? t.meta.giftId : null,
      });
    }
    // Stable sort over the reversed list keeps same-instant entries newest first too.
    return entries
      .reverse()
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  }

  /** Called when the till marks an order paid. Safe to call twice for the same order. */
  async earnForPaidOrder(input: {
    membershipId: string;
    orderId: string;
    paidTotalKurus: Kurus;
  }): Promise<LedgerTransaction | null> {
    const membership = await this.requireMembership(input.membershipId);
    if (membership.blocked) return null;
    const settings = await this.directory.getSettings(membership.cafeId);
    const peni = calculateEarn(input.paidTotalKurus, settings);
    if (peni === 0) return null;

    return this.ledger.atomically(() =>
      this.ledger.post({
        cafeId: membership.cafeId,
        kind: "earn",
        entries: [
          { account: account.issuance(membership.cafeId), delta: -peni },
          { account: account.member(membership.id), delta: peni },
        ],
        idempotencyKey: `earn:${input.orderId}`,
        meta: { orderId: input.orderId, paidTotalKurus: input.paidTotalKurus },
        createdAt: this.clock(),
      }),
    );
  }

  /** Reserves peni against an order at the till. Released again if the order is not paid. */
  async redeemForOrder(input: {
    membershipId: string;
    orderId: string;
    lines: OrderLine[];
    requestedPeni: Peni;
  }): Promise<RedemptionPlan & { transaction: LedgerTransaction | null }> {
    const membership = await this.requireActiveMembership(input.membershipId);
    const settings = await this.directory.getSettings(membership.cafeId);

    return this.ledger.atomically(async () => {
      const balance = await this.ledger.balance(account.member(membership.id));
      const plan = planRedemption({ lines: input.lines, balance, requestedPeni: input.requestedPeni, settings });
      if (plan.appliedPeni === 0) return { ...plan, transaction: null };

      const transaction = await this.ledger.post({
        cafeId: membership.cafeId,
        kind: "redeem",
        entries: [
          { account: account.member(membership.id), delta: -plan.appliedPeni },
          { account: account.redemption(membership.cafeId), delta: plan.appliedPeni },
        ],
        idempotencyKey: `redeem:${input.orderId}`,
        meta: { orderId: input.orderId },
        createdAt: this.clock(),
      });
      return { ...plan, transaction };
    });
  }

  /**
   * An order that will never be paid (voided at the till):
   * peni spent on it goes back to the wallet and askı items go back to the askı.
   */
  async releaseOrder(cafeId: string, orderId: string, reason: string): Promise<LedgerTransaction[]> {
    return this.ledger.atomically(async () => {
      const spent = await this.ledger.query({ cafeId, kinds: ["redeem", "askida_claim"] });
      const reversed: LedgerTransaction[] = [];
      for (const tx of spent.filter((t) => t.meta.orderId === orderId)) {
        reversed.push(await this.ledger.reverse(tx.id, { orderId, reason }, this.clock()));
      }
      return reversed;
    });
  }

  /**
   * A paid order was refunded at the till. Spent peni and askı items are given
   * back; earned peni is taken back, but only as much as is still in the wallet.
   */
  async refundOrder(cafeId: string, orderId: string): Promise<LedgerTransaction[]> {
    return this.ledger.atomically(async () => {
      const related = (await this.ledger.query({ cafeId, kinds: ["earn", "redeem", "askida_claim"] })).filter(
        (t) => t.meta.orderId === orderId,
      );
      const result: LedgerTransaction[] = [];
      for (const tx of related) {
        if (tx.kind !== "earn") {
          result.push(await this.ledger.reverse(tx.id, { orderId, reason: "refund" }, this.clock()));
          continue;
        }
        const memberEntry = tx.entries.find((e) => e.account.startsWith("member:"))!;
        const available = await this.ledger.balance(memberEntry.account);
        const takeBack = Math.min(memberEntry.delta, available);
        if (takeBack <= 0) continue;
        result.push(
          await this.ledger.post({
            cafeId,
            kind: "reversal",
            entries: [
              { account: memberEntry.account, delta: -takeBack },
              { account: account.issuance(cafeId), delta: takeBack },
            ],
            idempotencyKey: `reversal:${tx.id}`,
            reversesId: tx.id,
            meta: { orderId, reason: "refund", reversedKind: "earn", shortfallPeni: memberEntry.delta - takeBack },
            createdAt: this.clock(),
          }),
        );
      }
      return result;
    });
  }

  // ---------------------------------------------------------------- gifts (ısmarlama)

  async sendGift(input: {
    fromMembershipId: string;
    toMembershipId: string;
    peni: Peni;
    message?: string | null;
    idempotencyKey: string;
  }): Promise<Gift> {
    assertPositivePeni(input.peni);
    if (input.fromMembershipId === input.toMembershipId) {
      throw new PeniError("GIFT_INVALID", "You cannot send a gift to yourself");
    }
    const from = await this.requireActiveMembership(input.fromMembershipId);
    const to = await this.requireActiveMembership(input.toMembershipId);
    if (from.cafeId !== to.cafeId) {
      throw new PeniError("CROSS_CAFE", "Gifts only work between members of the same café");
    }
    const settings = await this.directory.getSettings(from.cafeId);

    return this.ledger.atomically(async () => {
      const key = `gift:${input.idempotencyKey}`;
      const replay = await this.findGiftBySendKey(key);
      if (replay) return replay;

      const now = this.clock();
      const sentToday = await this.sumOutflow(from, "gift_send", startOfLocalDay(now, settings.timeZone));
      if (sentToday + input.peni > settings.dailyGiftLimitPeni) {
        throw new PeniError(
          "GIFT_LIMIT",
          `Daily gift limit is ${settings.dailyGiftLimitPeni} peni; ${sentToday} already sent today`,
        );
      }

      const giftId = crypto.randomUUID();
      const tx = await this.ledger.post({
        cafeId: from.cafeId,
        kind: "gift_send",
        entries: [
          { account: account.member(from.id), delta: -input.peni },
          { account: account.giftEscrow(from.cafeId), delta: input.peni },
        ],
        idempotencyKey: key,
        meta: { giftId, fromMembershipId: from.id, toMembershipId: to.id },
        createdAt: now,
      });
      const gift: Gift = {
        id: giftId,
        cafeId: from.cafeId,
        fromMembershipId: from.id,
        toMembershipId: to.id,
        peni: input.peni,
        message: input.message?.trim() || null,
        status: "pending",
        createdAt: now,
        expiresAt: addHours(now, settings.giftExpiryHours),
        resolvedAt: null,
        sendTransactionId: tx.id,
      };
      await this.directory.saveGift(gift);
      return gift;
    });
  }

  async acceptGift(giftId: string, byMembershipId: string): Promise<Gift> {
    return this.ledger.atomically(async () => {
      const gift = await this.requirePendingGift(giftId);
      if (gift.toMembershipId !== byMembershipId) {
        throw new PeniError("FORBIDDEN", "Only the recipient can accept a gift");
      }
      const now = this.clock();
      if (gift.expiresAt <= now) {
        await this.returnGift(gift, "expired");
        throw new PeniError("GIFT_NOT_PENDING", "This gift has expired and went back to the sender");
      }
      await this.ledger.post({
        cafeId: gift.cafeId,
        kind: "gift_accept",
        entries: [
          { account: account.giftEscrow(gift.cafeId), delta: -gift.peni },
          { account: account.member(gift.toMembershipId), delta: gift.peni },
        ],
        idempotencyKey: `gift_resolve:${gift.id}`,
        meta: { giftId: gift.id },
        createdAt: now,
      });
      const accepted: Gift = { ...gift, status: "accepted", resolvedAt: now };
      await this.directory.saveGift(accepted);
      return accepted;
    });
  }

  /** The recipient declines, or the sender takes the gift back before it is accepted. */
  async declineGift(giftId: string, byMembershipId: string): Promise<Gift> {
    return this.ledger.atomically(async () => {
      const gift = await this.requirePendingGift(giftId);
      if (gift.toMembershipId !== byMembershipId && gift.fromMembershipId !== byMembershipId) {
        throw new PeniError("FORBIDDEN", "Only the sender or recipient can decline a gift");
      }
      return this.returnGift(gift, "declined", gift.fromMembershipId === byMembershipId);
    });
  }

  /** "Geri al": the sender takes back a gift that has not been accepted yet. */
  async cancelGift(giftId: string, byMembershipId: string): Promise<Gift> {
    return this.ledger.atomically(async () => {
      const gift = await this.requirePendingGift(giftId);
      if (gift.fromMembershipId !== byMembershipId) {
        throw new PeniError("FORBIDDEN", "Only the sender can take a gift back");
      }
      if (gift.expiresAt <= this.clock()) {
        await this.returnGift(gift, "expired");
        throw new PeniError("GIFT_NOT_PENDING", "This gift has expired and already went back to the sender");
      }
      return this.returnGift(gift, "declined", true);
    });
  }

  /** True when the sender took the gift back (the recipient did not decline it). */
  async giftCancelledBySender(giftId: string): Promise<boolean> {
    const resolution = await this.ledger.findByIdempotencyKey(`gift_resolve:${giftId}`);
    return resolution?.kind === "gift_return" && resolution.meta.cancelledBySender === true;
  }

  /** Background job: returns every expired, unaccepted gift to its sender. */
  async expireGifts(): Promise<Gift[]> {
    return this.ledger.atomically(async () => {
      const due = await this.directory.listGifts({ status: "pending", expiresBefore: this.clock() });
      const expired: Gift[] = [];
      for (const gift of due) expired.push(await this.returnGift(gift, "expired"));
      return expired;
    });
  }

  // ---------------------------------------------------------------- askıda kahve

  /**
   * A member puts peni into the café's open askı. Anyone at the café can later
   * take an askı item with it. The café may add a matching share on top.
   */
  async donateToAskida(input: {
    membershipId: string;
    peni: Peni;
    showName: boolean;
    idempotencyKey: string;
  }): Promise<{ donation: LedgerTransaction; matchedPeni: Peni }> {
    assertPositivePeni(input.peni);
    const membership = await this.requireActiveMembership(input.membershipId);
    const settings = await this.requireAskida(membership.cafeId);

    return this.ledger.atomically(async () => {
      const now = this.clock();
      const donation = await this.ledger.post({
        cafeId: membership.cafeId,
        kind: "askida_donate",
        entries: [
          { account: account.member(membership.id), delta: -input.peni },
          { account: account.askida(membership.cafeId), delta: input.peni },
        ],
        idempotencyKey: `askida_donate:${input.idempotencyKey}`,
        meta: { donorMembershipId: membership.id, showName: input.showName },
        createdAt: now,
      });
      const matchedPeni = await this.matchDonation(donation, input.peni, settings, now);
      return { donation, matchedPeni };
    });
  }

  /** A guest paid for an askı coffee in cash at the till. Staff records it so it appears in the pool. */
  async recordTillDonation(input: {
    cafeId: string;
    peni: Peni;
    staffUserId: string;
    idempotencyKey: string;
  }): Promise<LedgerTransaction> {
    assertPositivePeni(input.peni);
    await this.requireAskida(input.cafeId);
    return this.ledger.atomically(() =>
      this.ledger.post({
        cafeId: input.cafeId,
        kind: "askida_till",
        entries: [
          { account: account.tillDonation(input.cafeId), delta: -input.peni },
          { account: account.askida(input.cafeId), delta: input.peni },
        ],
        idempotencyKey: `askida_till:${input.idempotencyKey}`,
        meta: { staffUserId: input.staffUserId },
        createdAt: this.clock(),
      }),
    );
  }

  /** A member takes one askı item for an order. The pool pays; the member's own wallet is untouched. */
  async claimFromAskida(input: {
    membershipId: string;
    orderId: string;
    productId: string;
    unitPriceKurus: Kurus;
  }): Promise<{ transaction: LedgerTransaction; peni: Peni; discountKurus: Kurus }> {
    const membership = await this.requireActiveMembership(input.membershipId);
    const settings = await this.requireAskida(membership.cafeId);
    if (!settings.askidaProductIds.includes(input.productId)) {
      throw new PeniError("PRODUCT_NOT_ELIGIBLE", "This product cannot be taken from the askı");
    }

    return this.ledger.atomically(async () => {
      const now = this.clock();
      const eligibility = await this.checkAskidaEligibility(membership, settings, now);
      if (eligibility.status === "too_new") {
        throw new PeniError(
          "ASKIDA_TOO_NEW",
          `Members can take from the askı after ${settings.askidaMinMembershipDays} days`,
        );
      }
      if (eligibility.status === "claimed_today") {
        throw new PeniError("ASKIDA_LIMIT", `Askı limit is ${settings.askidaClaimsPerDay} per day`);
      }
      const peni = kurusToPeniCeil(input.unitPriceKurus);
      const pool = await this.ledger.balance(account.askida(membership.cafeId));
      if (pool < peni) throw new PeniError("ASKIDA_EMPTY", "The askı is empty right now");

      const transaction = await this.ledger.post({
        cafeId: membership.cafeId,
        kind: "askida_claim",
        entries: [
          { account: account.askida(membership.cafeId), delta: -peni },
          { account: account.redemption(membership.cafeId), delta: peni },
        ],
        idempotencyKey: `askida_claim:${input.orderId}`,
        meta: { claimantMembershipId: membership.id, orderId: input.orderId, productId: input.productId },
        createdAt: now,
      });
      return { transaction, peni, discountKurus: input.unitPriceKurus };
    });
  }

  /**
   * What the take sheet should say before the member tries. `null` means the
   * viewer has no membership here (signed out, or not joined).
   */
  async askidaEligibility(membershipId: string | null): Promise<AskidaEligibility> {
    const membership = membershipId ? await this.directory.getMembership(membershipId) : null;
    if (!membership) return { status: "not_member" };
    if (membership.blocked) return { status: "blocked" };
    const settings = await this.directory.getSettings(membership.cafeId);
    return this.checkAskidaEligibility(membership, settings, this.clock());
  }

  /** The café's match share as a percentage (50 = "Kafe her bağışa %50 ekliyor"), or null when no match would be added. */
  async askidaMatchPercent(cafeId: string): Promise<number | null> {
    const settings = await this.directory.getSettings(cafeId);
    if (!settings.askidaEnabled || settings.askidaMatchBps <= 0 || settings.askidaMatchMonthlyCapPeni <= 0) return null;
    const matched = await this.matchedThisMonth(cafeId, settings, this.clock());
    return matched < settings.askidaMatchMonthlyCapPeni ? settings.askidaMatchBps / 100 : null;
  }

  async askidaSnapshot(cafeId: string, referencePriceKurus: Kurus): Promise<AskidaSnapshot> {
    const since = addDays(this.clock(), -7);
    const balancePeni = await this.ledger.balance(account.askida(cafeId));
    const recent = await this.ledger.query({ cafeId, since });
    const reversedIds = new Set(recent.filter((t) => t.reversesId).map((t) => t.reversesId));
    const live = recent.filter((t) => !reversedIds.has(t.id));
    const unitPeni = Math.max(1, kurusToPeniCeil(referencePriceKurus));

    return {
      cafeId,
      balancePeni,
      itemsAvailable: Math.floor(balancePeni / unitPeni),
      referencePriceKurus,
      claimedLast7Days: live.filter((t) => t.kind === "askida_claim").length,
      donatedLast7DaysPeni: live
        .filter((t) => t.kind === "askida_donate" || t.kind === "askida_till" || t.kind === "askida_match")
        .reduce((sum, t) => sum + inflow(t, account.askida(cafeId)), 0),
    };
  }

  /** Public "askı wall": newest first. Donors are named only if they asked to be; takers never are. */
  async askidaWall(cafeId: string, limit = 20): Promise<AskidaWallEvent[]> {
    const pool = account.askida(cafeId);
    const all = await this.ledger.query({ cafeId, account: pool });
    const reversedIds = new Set(all.filter((t) => t.reversesId).map((t) => t.reversesId));
    const events: AskidaWallEvent[] = [];
    for (const t of all) {
      if (t.kind === "reversal" || reversedIds.has(t.id)) continue;
      const peni = Math.abs(t.entries.find((e) => e.account === pool)!.delta);
      if (t.kind === "askida_donate") {
        events.push({
          type: "donation",
          at: t.createdAt,
          peni,
          donorMembershipId: t.meta.showName ? String(t.meta.donorMembershipId) : null,
        });
      } else if (t.kind === "askida_till") {
        events.push({ type: "till_donation", at: t.createdAt, peni });
      } else if (t.kind === "askida_match") {
        events.push({ type: "cafe_match", at: t.createdAt, peni });
      } else if (t.kind === "askida_claim") {
        events.push({ type: "claim", at: t.createdAt, productId: String(t.meta.productId) });
      }
    }
    return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  }

  // ---------------------------------------------------------------- reporting

  /**
   * Totals for `[since, until)`. Without `until` the window runs to now. With it,
   * `outstandingPeni` is what was still owed at `until` (for "against the previous 30 days").
   */
  async cafeReport(cafeId: string, since: Date, until?: Date): Promise<CafePeniReport> {
    const txs = (await this.ledger.query({ cafeId, since })).filter((t) => !until || t.createdAt < until);
    const sumInto = (kind: string, acc: string) =>
      txs.filter((t) => t.kind === kind).reduce((s, t) => s + inflow(t, acc), 0);
    /** Net inflow into `acc` from reversals of `kind`; it carries the opposite sign of the original. */
    const reversalInflow = (kind: string, acc: string) =>
      txs
        .filter((t) => t.kind === "reversal" && t.meta.reversedKind === kind)
        .reduce((s, t) => s + inflow(t, acc), 0);

    const pool = account.askida(cafeId);
    const sink = account.redemption(cafeId);
    const claimTxs = txs.filter((t) => t.kind === "askida_claim");
    const reversedIds = new Set(txs.filter((t) => t.reversesId).map((t) => t.reversesId));

    const systemAccounts = [account.issuance(cafeId), account.tillDonation(cafeId), sink];
    const systemBalance = until
      ? (await this.ledger.query({ cafeId }))
          .filter((t) => t.createdAt < until)
          .reduce((s, t) => s + systemAccounts.reduce((a, acc) => a + inflow(t, acc), 0), 0)
      : (await this.ledger.balance(systemAccounts[0]!)) +
        (await this.ledger.balance(systemAccounts[1]!)) +
        (await this.ledger.balance(systemAccounts[2]!));

    return {
      cafeId,
      since,
      issuedPeni: -sumInto("earn", account.issuance(cafeId)) - reversalInflow("earn", account.issuance(cafeId)),
      redeemedPeni: sumInto("redeem", sink) + reversalInflow("redeem", sink),
      askidaDonatedByMembersPeni: sumInto("askida_donate", pool),
      askidaTillDonationsPeni: sumInto("askida_till", pool),
      askidaMatchedByCafePeni: sumInto("askida_match", pool),
      askidaClaimedPeni: sumInto("askida_claim", sink) + reversalInflow("askida_claim", sink),
      askidaClaims: claimTxs.filter((t) => !reversedIds.has(t.id)).length,
      outstandingPeni: -systemBalance,
    };
  }

  // ---------------------------------------------------------------- internals

  private async matchDonation(
    donation: LedgerTransaction,
    peni: Peni,
    settings: CafePeniSettings,
    now: Date,
  ): Promise<Peni> {
    if (settings.askidaMatchBps <= 0 || settings.askidaMatchMonthlyCapPeni <= 0) return 0;
    const matchedThisMonth = await this.matchedThisMonth(donation.cafeId, settings, now);
    const match = Math.min(
      applyBps(peni, settings.askidaMatchBps),
      settings.askidaMatchMonthlyCapPeni - matchedThisMonth,
    );
    if (match <= 0) return 0;
    await this.ledger.post({
      cafeId: donation.cafeId,
      kind: "askida_match",
      entries: [
        { account: account.issuance(donation.cafeId), delta: -match },
        { account: account.askida(donation.cafeId), delta: match },
      ],
      idempotencyKey: `askida_match:${donation.id}`,
      meta: { donationTransactionId: donation.id },
      createdAt: now,
    });
    return match;
  }

  private async returnGift(gift: Gift, status: "declined" | "expired", cancelledBySender = false): Promise<Gift> {
    const now = this.clock();
    await this.ledger.post({
      cafeId: gift.cafeId,
      kind: "gift_return",
      entries: [
        { account: account.giftEscrow(gift.cafeId), delta: -gift.peni },
        { account: account.member(gift.fromMembershipId), delta: gift.peni },
      ],
      idempotencyKey: `gift_resolve:${gift.id}`,
      meta: { giftId: gift.id, status, ...(cancelledBySender ? { cancelledBySender: true } : {}) },
      createdAt: now,
    });
    const resolved: Gift = { ...gift, status, resolvedAt: now };
    await this.directory.saveGift(resolved);
    return resolved;
  }

  /** A replayed send returns the gift created the first time instead of a second gift. */
  private async findGiftBySendKey(key: string): Promise<Gift | null> {
    const tx = await this.ledger.findByIdempotencyKey(key);
    return tx ? this.directory.getGift(String(tx.meta.giftId)) : null;
  }

  private async sumOutflow(membership: Membership, kind: "gift_send", since: Date): Promise<Peni> {
    const acc = account.member(membership.id);
    const txs = await this.ledger.query({ cafeId: membership.cafeId, kinds: [kind], since, account: acc });
    return txs.reduce((sum, t) => sum - inflow(t, acc), 0);
  }

  private async checkAskidaEligibility(
    membership: Membership,
    settings: CafePeniSettings,
    now: Date,
  ): Promise<Exclude<AskidaEligibility, { status: "not_member" }>> {
    if (membership.blocked) return { status: "blocked" };
    const opensAt = addDays(membership.joinedAt, settings.askidaMinMembershipDays);
    if (opensAt > now) {
      return { status: "too_new", daysLeft: Math.max(1, Math.ceil((opensAt.getTime() - now.getTime()) / DAY_MS)) };
    }
    const claimsToday = await this.countActiveClaims(membership, startOfLocalDay(now, settings.timeZone));
    if (claimsToday >= settings.askidaClaimsPerDay) return { status: "claimed_today" };
    return { status: "ok" };
  }

  private async matchedThisMonth(cafeId: string, settings: CafePeniSettings, now: Date): Promise<Peni> {
    const since = startOfLocalMonth(now, settings.timeZone);
    const matches = await this.ledger.query({ cafeId, kinds: ["askida_match"], since });
    return matches.reduce((sum, t) => sum + inflow(t, account.askida(cafeId)), 0);
  }

  private async countActiveClaims(membership: Membership, since: Date): Promise<number> {
    const txs = await this.ledger.query({ cafeId: membership.cafeId, kinds: ["askida_claim", "reversal"], since });
    const reversedIds = new Set(txs.filter((t) => t.reversesId).map((t) => t.reversesId));
    return txs.filter(
      (t) => t.kind === "askida_claim" && t.meta.claimantMembershipId === membership.id && !reversedIds.has(t.id),
    ).length;
  }

  private async requireMembership(id: string): Promise<Membership> {
    const membership = await this.directory.getMembership(id);
    if (!membership) throw new PeniError("NOT_FOUND", `Membership ${id} not found`);
    return membership;
  }

  private async requireActiveMembership(id: string): Promise<Membership> {
    const membership = await this.requireMembership(id);
    if (membership.blocked) throw new PeniError("MEMBERSHIP_BLOCKED", "This membership is blocked");
    return membership;
  }

  private async requirePendingGift(id: string): Promise<Gift> {
    const gift = await this.directory.getGift(id);
    if (!gift) throw new PeniError("NOT_FOUND", `Gift ${id} not found`);
    if (gift.status !== "pending") throw new PeniError("GIFT_NOT_PENDING", `Gift is already ${gift.status}`);
    return gift;
  }

  private async requireAskida(cafeId: string): Promise<CafePeniSettings> {
    const settings = await this.directory.getSettings(cafeId);
    if (!settings.askidaEnabled) throw new PeniError("ASKIDA_DISABLED", "This café has no askı");
    return settings;
  }
}

const DAY_MS = 86_400_000;

/** Ledger kinds that move a member's own wallet, as they read in their history. */
const HISTORY_KIND: Partial<Record<LedgerTransaction["kind"], MemberHistoryKind>> = {
  earn: "earn",
  redeem: "redeem",
  gift_send: "gift_out",
  gift_accept: "gift_in",
  gift_return: "gift_return",
  askida_donate: "askida_donate",
  // A released or refunded order: spent peni coming back, or earned peni taken back.
  reversal: "refund",
};

function assertPositivePeni(peni: Peni): void {
  assertWholeNumber(peni, "peni");
  if (peni <= 0) throw new PeniError("INVALID_TRANSACTION", "Amount must be at least 1 peni");
}

/** Net amount `tx` moved into `accountId` (negative if it moved out). */
function inflow(tx: LedgerTransaction, accountId: string): number {
  return tx.entries.filter((e) => e.account === accountId).reduce((s, e) => s + e.delta, 0);
}
