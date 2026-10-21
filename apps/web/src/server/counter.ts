import type { PeniCheckDTO, PennyCounterCodeDTO, PennyCounterDTO, PennyGiveDTO, PennySpendDTO } from "@peni/api";
import {
  calculateEarn,
  claimState,
  localDateKey,
  tillSpendCap,
  type CafePeniSettings,
  type ClaimStore,
  type PeniClaim,
  type PeniDirectory,
  type PeniService,
  type StaffStore,
} from "@peni/core";
import { createHash } from "node:crypto";
import { AppError } from "./errors";
import type { OrderService } from "./orders";
import { requirePermission, type StaffContext } from "./staff";

/**
 * The penny screen (N11): pennies and the askı for a café that takes the money on its own
 * till, on the Topluluk + Penny plan. Staff type what the customer paid and turn the screen
 * round to show the code, take pennies off a bill the customer pays elsewhere, and give from
 * the askı. The same codes, wallets and askı as Penny's own till; there's just no order.
 */
export class PennyCounterService {
  constructor(
    private readonly d: {
      claims: ClaimStore;
      staff: StaffStore;
      directory: PeniDirectory;
      peni: PeniService;
      till: OrderService;
      /** "Ayşe Y.", for the barista to check against the customer. */
      memberName: (membershipId: string) => Promise<string>;
      now: () => Date;
    },
  ) {}

  async view(ctx: StaffContext): Promise<PennyCounterDTO> {
    requirePermission(ctx, "peni.till");
    const settings = await this.d.directory.getSettings(ctx.cafe.id);
    const day = localDateKey(this.d.now(), settings.timeZone);
    const claims = await this.d.claims.listCounterClaims(ctx.cafe.id, day);
    return {
      on: settings.peniEnabled,
      earnRatePercent: settings.earnRateBps / 100,
      maxSpendPercent: settings.maxRedeemShareBps / 100,
      codes: await Promise.all(claims.map((c) => this.codeDTO(c))),
      askida: await this.d.till.askidaAt(ctx.cafe.id),
    };
  }

  /** A penny code for what the customer just paid on the café's till. The same key again gives the same code. */
  async give(ctx: StaffContext, input: { amountKurus: number; key: string }): Promise<PennyGiveDTO> {
    requirePermission(ctx, "peni.till");
    const id = `clm_c_${createHash("sha256").update(`${ctx.cafe.id}:${input.key}`).digest("hex").slice(0, 24)}`;
    let claim = await this.d.claims.getClaim(id);
    if (!claim) {
      const settings = await this.on(ctx);
      const peni = calculateEarn(input.amountKurus, settings);
      if (peni === 0) throw new AppError("PENNY_TOO_SMALL", "This sale earns no pennies", 409);
      claim = await this.d.till.openClaim({ id, cafeId: ctx.cafe.id, orderId: null, peni, paidKurus: input.amountKurus, staffMemberId: ctx.member.id });
    }
    return { ...(await this.view(ctx)), given: await this.codeDTO(claim) };
  }

  /** Takes back a code nobody has used yet, say when the amount was typed wrong. */
  async cancel(ctx: StaffContext, claimId: string): Promise<PennyCounterDTO> {
    requirePermission(ctx, "peni.till");
    const claim = await this.d.claims.getClaim(claimId);
    if (!claim || claim.cafeId !== ctx.cafe.id || claim.orderId !== null) throw new AppError("NOT_FOUND", "No such penny code", 404);
    const state = claimState(claim, this.d.now());
    if (state === "claimed") throw new AppError("CLAIM_TAKEN", "The customer already took these pennies", 409);
    if (state === "open") await this.d.claims.saveClaim({ ...claim, cancelledAt: this.d.now() });
    return this.view(ctx);
  }

  /** Whose wallet the customer's ödeme kodu opens, and how much of this bill pennies can pay. */
  async check(ctx: StaffContext, input: { code: string; amountKurus: number }): Promise<PeniCheckDTO> {
    requirePermission(ctx, "peni.till");
    const settings = await this.on(ctx);
    const member = await this.d.peni.spenderForCode(ctx.cafe.id, input.code);
    const balancePeni = await this.d.peni.walletBalance(member.id);
    return { name: await this.d.memberName(member.id), balancePeni, maxPeni: Math.min(balancePeni, cap(input.amountKurus, settings)) };
  }

  /** Takes pennies off the wallet for the bill; the café gives that much off on its own till. The same key again takes them once. */
  async spend(ctx: StaffContext, input: { code: string; amountKurus: number; peni: number; key: string }): Promise<PennySpendDTO> {
    requirePermission(ctx, "peni.till");
    const settings = await this.on(ctx);
    const member = await this.d.peni.spenderForCode(ctx.cafe.id, input.code);
    const peni = await this.d.peni.spendAtTill({
      membershipId: member.id,
      orderId: null,
      key: `counter:${ctx.cafe.id}:${input.key}`,
      requestedPeni: input.peni,
      capPeni: cap(input.amountKurus, settings),
    });
    return { name: await this.d.memberName(member.id), peni, balancePeni: await this.d.peni.walletBalance(member.id) };
  }

  /** "Askıdan ver": one askı item for whoever asks, on trust, as at the till. The same key again gives it once. */
  async giveAskida(ctx: StaffContext, input: { productId: string; key: string }): Promise<PennyCounterDTO> {
    requirePermission(ctx, "peni.till");
    const item = (await this.d.till.askidaAt(ctx.cafe.id)).items.find((i) => i.productId === input.productId);
    if (!item) throw new AppError("PRODUCT_NOT_ELIGIBLE", "This isn't an askı item", 409);
    await this.d.peni.giveFromAskidaAtTill({
      cafeId: ctx.cafe.id,
      orderId: null,
      key: `counter:${ctx.cafe.id}:${input.key}`,
      peni: item.peni,
      productId: item.productId,
      quantity: 1,
    });
    return this.view(ctx);
  }

  private async on(ctx: StaffContext): Promise<CafePeniSettings> {
    const settings = await this.d.directory.getSettings(ctx.cafe.id);
    if (!settings.peniEnabled) throw new AppError("PENNY_OFF", "Pennies are off at this café", 409);
    return settings;
  }

  private async codeDTO(c: PeniClaim): Promise<PennyCounterCodeDTO> {
    const member = c.staffMemberId ? await this.d.staff.getMember(c.staffMemberId) : null;
    const account = member ? await this.d.staff.getAccount(member.accountId) : null;
    return {
      id: c.id,
      code: c.code,
      token: c.token,
      peni: c.peni,
      paidKurus: c.paidKurus ?? 0,
      givenBy: account?.name.split(" ")[0] ?? "",
      state: claimState(c, this.d.now()),
      createdAt: c.createdAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
    };
  }
}

/**
 * The most pennies a bill on the café's own till can take: the café's share rule, within the
 * bill. The screen doesn't know what's on the bill, so a café that lets pennies pay only for
 * some items checks that itself.
 */
function cap(amountKurus: number, settings: CafePeniSettings): number {
  return tillSpendCap({
    lines: [{ productId: "", totalKurus: amountKurus }],
    orderTotalKurus: amountKurus,
    dueKurus: amountKurus,
    peniOnOrder: 0,
    settings: { ...settings, redeemableProductIds: null },
  });
}
