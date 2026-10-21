import type { OrderDTO, OrderListDTO, PaymentAnswerDTO, PaymentDTO, PeniCheckDTO, TillAskidaDTO, TillMenuDTO } from "@peni/api";
import { goodsName } from "@peni/brand/format";
import {
  amountPaid,
  calculateEarn,
  claimIsOpen,
  kurusToPeniCeil,
  localDateKey,
  randomClaimCode,
  startOfNextLocalDay,
  type ClaimStore,
  type PeniClaim,
  orderProblem,
  orderTotals,
  lineTotal,
  type MenuStore,
  type Order,
  type OrderLine,
  type OrderStatus,
  type OrderStore,
  type Payment,
  type PaymentMethod,
  type PeniDirectory,
  type PeniService,
  type Permission,
  tillSpendCap,
  type StaffStore,
} from "@peni/core";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { AppError } from "./errors";
import type { CashService } from "./cash";
import type { PaymentActor, PaymentService } from "./payments";
import { requirePermission, type StaffContext } from "./staff";

export const REASON_MAX = 200;

type LineInput = { productId: string; quantity: number; discountPercent?: number };

/**
 * The till's orders (plan piece 6). Built from Shelby's rules, minus its traps:
 * one order per sale however often payment is retried, prices and totals only from
 * the server, whole kuruş, numbers that restart each local day, and "Sil" that hides
 * an order instead of erasing it.
 */
export class OrderService {
  constructor(
    private readonly orders: OrderStore,
    private readonly claims: ClaimStore,
    private readonly menu: MenuStore,
    private readonly staff: StaffStore,
    private readonly directory: PeniDirectory,
    private readonly payments: PaymentService,
    private readonly cash: CashService,
    private readonly peni: PeniService,
    private readonly now: () => Date,
  ) {
    // However a payment gets approved, by the barista or later by the terminal, its order moves on.
    payments.onApproved = (payment) => this.applyPayment(payment);
  }

  /** Stock the order uses once paid, and gives back when refunded (piece 17). Set by the app. */
  stock: { used(order: Order, memberId: string | null): Promise<void>; refunded(order: Order, memberId: string | null): Promise<void> } | null = null;

  /** "Ayşe Y." for a wallet's membership, shown to the barista. Set by the app. */
  peniMemberName: (membershipId: string) => Promise<string> = async () => "Üye";

  /** The till's tabs and tiles: categories in order, with what can be sold right now. */
  async tillMenu(ctx: StaffContext): Promise<TillMenuDTO> {
    this.require(ctx, "till.use");
    const [categories, products] = await Promise.all([this.menu.listCategories(ctx.cafe.id), this.menu.listMenu(ctx.cafe.id)]);
    return {
      categories: categories
        .map((c) => ({
          id: c.id,
          name: c.name,
          products: products
            .filter((p) => p.categoryId === c.id && p.available)
            .map((p) => ({ productId: p.productId, name: p.name, priceKurus: p.priceKurus, imageUrl: p.imageUrl ?? null })),
        }))
        .filter((c) => c.products.length > 0),
    };
  }

  /** Starts an order when the barista goes to pay. The same `createKey` twice gives the same order. */
  async create(ctx: StaffContext, input: { createKey: string; lines: LineInput[]; discountPercent?: number }): Promise<OrderDTO> {
    this.require(ctx, "till.use");
    const existing = await this.orders.findByCreateKey(ctx.cafe.id, input.createKey);
    if (existing) return this.dto(ctx, existing);
    const now = this.now();
    const businessDay = await this.today(ctx, now);
    const lines = await this.priced(ctx, input.lines);
    const discountPercent = input.discountPercent ?? 0;
    this.check(lines, discountPercent);
    const order: Order = {
      id: `ord_${randomUUID()}`,
      cafeId: ctx.cafe.id,
      number: await this.orders.nextNumber(ctx.cafe.id, businessDay),
      businessDay,
      status: "open",
      lines,
      discountPercent,
      ...orderTotals(lines, discountPercent),
      createdAt: now,
      createdByMemberId: ctx.member.id,
      createKey: input.createKey,
      paidAt: null,
      paidByMemberId: null,
      paymentMethod: null,
      tenderedKurus: null,
      changeKurus: null,
      voidedAt: null,
      voidedByMemberId: null,
      voidReason: null,
      refundedAt: null,
      refundedByMemberId: null,
      refundReason: null,
      refundKurus: null,
      deletedAt: null,
      deletedByMemberId: null,
      deleteReason: null,
    };
    try {
      await this.orders.saveOrder(order);
    } catch (error) {
      // Two taps raced past the check above: the database kept one, so answer with it.
      const winner = await this.orders.findByCreateKey(ctx.cafe.id, input.createKey);
      if (winner) return this.dto(ctx, winner);
      throw error;
    }
    return this.dto(ctx, order);
  }

  /** Changes an open order's lines or discount, repriced from the menu. */
  async update(ctx: StaffContext, id: string, input: { lines: LineInput[]; discountPercent?: number }): Promise<OrderDTO> {
    this.require(ctx, "till.use");
    const order = await this.find(ctx, id);
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "This order is already closed", 409);
    // The peni were worked out for these lines: they go back first.
    const paid = await this.payments.list(ctx.cafe.id, [order.id]);
    if (peniKurusOf(paid) > 0) throw new AppError("PENI_ON_ORDER", "Give the pennies back before changing the order", 409);
    if (askidaKurusOf(paid) > 0) throw new AppError("ASKIDA_ON_ORDER", "Put the askı items back before changing the order", 409);
    const lines = await this.priced(ctx, input.lines);
    const discountPercent = input.discountPercent ?? order.discountPercent;
    this.check(lines, discountPercent);
    // A payment still waiting was for the old total.
    await this.payments.clearPending(actor(ctx), order.id);
    const next = { ...order, lines, discountPercent, ...orderTotals(lines, discountPercent) };
    await this.orders.saveOrder(next);
    return this.dto(ctx, next);
  }

  /**
   * "Nakit" or "Kart": starts a payment for what's left to pay, through the till's
   * terminal (piece 8). With the manual terminal (D24), cash is approved at once and a
   * card waits for the barista's tap once the terminal approves it. For cash, what was
   * handed over is optional; when given, the change is worked out. The same `payKey`
   * again answers with the same payment.
   */
  async pay(ctx: StaffContext, id: string, input: { method: PaymentMethod; payKey: string; tenderedKurus?: number }): Promise<PaymentAnswerDTO> {
    this.require(ctx, "till.use");
    const order = await this.find(ctx, id);
    const again = await this.payments.findByKey(ctx.cafe.id, input.payKey);
    if (again) {
      if (again.orderId !== order.id) throw new AppError("PAY_KEY_REUSED", "This payment belongs to another order", 409);
      return this.answer(ctx, again);
    }
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "This order is already closed", 409);
    // Tapping "Nakit" after backing out of "Kart" moves on from the card.
    await this.payments.clearPending(actor(ctx), order.id);
    const due = order.totalKurus - amountPaid(await this.payments.list(ctx.cafe.id, [order.id]));
    let tenderedKurus: number | null = null;
    let changeKurus: number | null = null;
    if (input.method === "cash" && input.tenderedKurus !== undefined) {
      if (input.tenderedKurus < due) throw new AppError("TENDERED_TOO_LOW", "Less than the total was handed over", 400);
      tenderedKurus = input.tenderedKurus;
      changeKurus = input.tenderedKurus - due;
    }
    const payment = await this.payments.start(actor(ctx), {
      orderId: order.id,
      kind: "sale",
      method: input.method,
      amountKurus: due,
      tenderedKurus,
      changeKurus,
      key: input.payKey,
      reason: null,
      cashSessionId: await this.drawer(ctx, input.method),
    });
    return this.answer(ctx, payment);
  }

  /** Where a payment stands, for a till waiting on the terminal. */
  async payment(ctx: StaffContext, orderId: string, paymentId: string): Promise<PaymentAnswerDTO> {
    this.require(ctx, "till.use");
    return this.answer(ctx, await this.paymentOf(ctx, orderId, paymentId));
  }

  /** "Onaylandı": the barista saw the terminal approve the card. */
  async confirmPayment(ctx: StaffContext, orderId: string, paymentId: string): Promise<PaymentAnswerDTO> {
    this.require(ctx, "till.use");
    const payment = await this.paymentOf(ctx, orderId, paymentId);
    return this.answer(ctx, await this.payments.confirm(actor(ctx), payment.id));
  }

  /** Closing the card sheet, or "Reddedildi" when the terminal said no. The order stays open. */
  async cancelPayment(ctx: StaffContext, orderId: string, paymentId: string, input: { declined?: boolean } = {}): Promise<PaymentAnswerDTO> {
    this.require(ctx, "till.use");
    const payment = await this.paymentOf(ctx, orderId, paymentId);
    return this.answer(ctx, await this.payments.cancel(actor(ctx), payment.id, input));
  }

  /** "Peni" (plan piece 11): whose wallet the customer's ödeme kodu opens, and how much can go on the order. */
  async checkPeni(ctx: StaffContext, orderId: string, input: { code: string }): Promise<PeniCheckDTO> {
    this.require(ctx, "till.use");
    const order = await this.find(ctx, orderId);
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "This order is already closed", 409);
    const member = await this.peni.spenderForCode(ctx.cafe.id, input.code);
    const payments = await this.payments.list(ctx.cafe.id, [order.id]);
    this.sameWallet(payments, member.id);
    const balancePeni = await this.peni.walletBalance(member.id);
    return { name: await this.peniMemberName(member.id), balancePeni, maxPeni: Math.min(balancePeni, await this.spendCap(order, payments)) };
  }

  /**
   * Takes peni from the wallet the ödeme kodu opens, as a payment approved at once. Peni
   * can pay any part of the order (D11); the rest goes on cash or card, and the order is
   * paid when nothing's left. The same `payKey` again takes them once.
   */
  async usePeni(ctx: StaffContext, orderId: string, input: { code: string; peni: number; payKey: string }): Promise<PaymentAnswerDTO> {
    this.require(ctx, "till.use");
    const order = await this.find(ctx, orderId);
    const again = await this.payments.findByKey(ctx.cafe.id, input.payKey);
    if (again) {
      if (again.orderId !== order.id) throw new AppError("PAY_KEY_REUSED", "This payment belongs to another order", 409);
      return this.answer(ctx, again);
    }
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "This order is already closed", 409);
    const member = await this.peni.spenderForCode(ctx.cafe.id, input.code);
    // A card still waiting was for the whole amount.
    await this.payments.clearPending(actor(ctx), order.id);
    const payments = await this.payments.list(ctx.cafe.id, [order.id]);
    this.sameWallet(payments, member.id);
    const peni = await this.peni.spendAtTill({
      membershipId: member.id,
      orderId: order.id,
      key: input.payKey,
      requestedPeni: input.peni,
      capPeni: await this.spendCap(order, payments),
    });
    const payment = await this.payments.start(actor(ctx), {
      orderId: order.id,
      kind: "sale",
      method: "peni",
      amountKurus: peni * 100,
      tenderedKurus: null,
      changeKurus: null,
      key: input.payKey,
      reason: null,
      cashSessionId: (await this.cash.current(ctx.cafe.id))?.id ?? null,
      reference: member.id,
    });
    return this.answer(ctx, payment);
  }

  /** "Peni'yi geri ver": the peni on an unpaid order go back to the wallet, say to change the order. */
  async returnPeni(ctx: StaffContext, orderId: string): Promise<OrderDTO> {
    this.require(ctx, "till.use");
    const order = await this.find(ctx, orderId);
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "This order is already closed", 409);
    await this.givePeniBack(ctx, order, null);
    return this.dto(ctx, order);
  }

  /** Peni back to the wallet on an order nobody will pay: recorded as a peni refund, reversed in the ledger. */
  private async givePeniBack(ctx: StaffContext, order: Order, why: string | null): Promise<void> {
    const payments = await this.payments.list(ctx.cafe.id, [order.id]);
    const peniKurus = peniKurusOf(payments);
    if (peniKurus <= 0) return;
    await this.peni.releaseOrder(order.cafeId, order.id, "returned", ["redeem"]);
    await this.payments.start(actor(ctx), {
      orderId: order.id,
      kind: "refund",
      method: "peni",
      amountKurus: peniKurus,
      tenderedKurus: null,
      changeKurus: null,
      key: `peni-back:${randomUUID()}`,
      reason: why,
      cashSessionId: null,
      reference: walletOf(payments),
    });
  }

  /** The askı as the till sees it (plan piece 13): the pool and how many of each askı item it pays for. */
  async tillAskida(ctx: StaffContext): Promise<TillAskidaDTO> {
    this.require(ctx, "till.use");
    const settings = await this.directory.getSettings(ctx.cafe.id);
    const balancePeni = await this.peni.askidaBalance(ctx.cafe.id);
    const menu = await this.menu.listMenu(ctx.cafe.id);
    const items = menu
      .filter((p) => p.available && settings.askidaProductIds.includes(p.productId))
      .sort((a, b) => a.priceKurus - b.priceKurus)
      .map((p) => {
        const peni = Math.max(1, kurusToPeniCeil(p.priceKurus));
        return { productId: p.productId, name: p.name, priceKurus: p.priceKurus, peni, available: Math.floor(balancePeni / peni) };
      });
    return { enabled: settings.askidaEnabled, balancePeni, items: settings.askidaEnabled ? items : [] };
  }

  /**
   * "Askıdan ver" (plan piece 13, D8): the askı pays for askı items already on the order,
   * for whoever asks, on trust: no account, no limit. It's a payment approved at once;
   * the rest of the order is paid as usual. The same `payKey` again pays once.
   */
  async giveAskida(ctx: StaffContext, orderId: string, input: { productId: string; quantity: number; payKey: string }): Promise<PaymentAnswerDTO> {
    this.require(ctx, "till.use");
    const order = await this.find(ctx, orderId);
    const again = await this.payments.findByKey(ctx.cafe.id, input.payKey);
    if (again) {
      if (again.orderId !== order.id) throw new AppError("PAY_KEY_REUSED", "This payment belongs to another order", 409);
      return this.answer(ctx, again);
    }
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "This order is already closed", 409);
    await this.payments.clearPending(actor(ctx), order.id);
    const payments = await this.payments.list(ctx.cafe.id, [order.id]);
    const line = order.lines.find((l) => l.productId === input.productId);
    const given = askidaGiven(payments).get(input.productId) ?? 0;
    if (!line || given + input.quantity > line.quantity) {
      throw new AppError("ASKIDA_NOT_ON_ORDER", "Add the item to the order before giving it from the askı", 409);
    }
    // What these items cost on this order, discounts included, and never more than is left to pay.
    const share = Math.round(((lineTotal(line) * input.quantity) / line.quantity) * (100 - order.discountPercent)) / 100;
    const amountKurus = Math.min(Math.round(share), order.totalKurus - amountPaid(payments));
    if (amountKurus <= 0) throw new AppError("ASKIDA_NOT_ON_ORDER", "Nothing left to pay on this order", 409);
    await this.peni.giveFromAskidaAtTill({
      cafeId: order.cafeId,
      orderId: order.id,
      key: input.payKey,
      peni: kurusToPeniCeil(amountKurus),
      productId: input.productId,
      quantity: input.quantity,
    });
    const payment = await this.payments.start(actor(ctx), {
      orderId: order.id,
      kind: "sale",
      method: "askida",
      amountKurus,
      tenderedKurus: null,
      changeKurus: null,
      key: input.payKey,
      reason: null,
      cashSessionId: (await this.cash.current(ctx.cafe.id))?.id ?? null,
      reference: askidaRef(input.productId, input.quantity),
    });
    return this.answer(ctx, payment);
  }

  /** "Askıya geri koy": what the askı paid for on an unpaid order goes back to it, say to change the order. */
  async returnAskida(ctx: StaffContext, orderId: string): Promise<OrderDTO> {
    this.require(ctx, "till.use");
    const order = await this.find(ctx, orderId);
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "This order is already closed", 409);
    await this.giveAskidaBack(ctx, order, null);
    return this.dto(ctx, order);
  }

  /** Askı items on an order nobody will pay go back on the askı: a refund of the askı's payments, reversed in the ledger. */
  private async giveAskidaBack(ctx: StaffContext, order: Order, why: string | null): Promise<void> {
    const kurus = askidaKurusOf(await this.payments.list(ctx.cafe.id, [order.id]));
    if (kurus <= 0) return;
    await this.peni.releaseOrder(order.cafeId, order.id, "returned", ["askida_claim"]);
    await this.payments.start(actor(ctx), {
      orderId: order.id,
      kind: "refund",
      method: "askida",
      amountKurus: kurus,
      tenderedKurus: null,
      changeKurus: null,
      key: `askida-back:${randomUUID()}`,
      reason: why,
      cashSessionId: null,
    });
  }

  /**
   * "Askıya bırak" lines go on the askı once the order is paid: what the guest paid for
   * them, discounts included, in whole peni. Recorded once per order.
   */
  private async hang(order: Order, staffMemberId: string): Promise<void> {
    const hung = order.lines.filter((l) => isHang(l.productId));
    if (hung.length === 0) return;
    const settings = await this.directory.getSettings(order.cafeId);
    if (!settings.askidaEnabled) return;
    const kurus = hung.reduce((s, l) => s + lineTotal(l), 0) * ((100 - order.discountPercent) / 100);
    const peni = Math.floor(kurus / 100);
    if (peni <= 0) return;
    await this.peni.recordTillDonation({ cafeId: order.cafeId, peni, staffUserId: staffMemberId, idempotencyKey: `order:${order.id}`, orderId: order.id });
  }

  /** One wallet per order, so it's always clear whose peni to give back. */
  private sameWallet(payments: Payment[], membershipId: string): void {
    const wallet = peniKurusOf(payments) > 0 ? walletOf(payments) : null;
    if (wallet && wallet !== membershipId) throw new AppError("PENI_OTHER_WALLET", "Someone else's pennies are on this order", 409);
  }

  private async spendCap(order: Order, payments: Payment[]): Promise<number> {
    return tillSpendCap({
      lines: order.lines.map((l) => ({ productId: l.productId, totalKurus: lineTotal(l) })),
      orderTotalKurus: order.totalKurus,
      dueKurus: order.totalKurus - amountPaid(payments),
      peniOnOrder: peniKurusOf(payments) / 100,
      settings: await this.directory.getSettings(order.cafeId),
    });
  }

  /**
   * Moves an order on once one of its payments is approved, whoever approved it: paid
   * when the sales cover the total, refunded when the refund goes through.
   */
  private async applyPayment(payment: Payment): Promise<void> {
    const order = await this.orders.getOrder(payment.cafeId, payment.orderId);
    if (!order) return;
    if (payment.kind === "sale") {
      if (order.status !== "open") return;
      if (amountPaid(await this.payments.list(order.cafeId, [order.id])) < order.totalKurus) return;
      // Before the order shows paid, so a retry that catches up records it too (once).
      await this.hang(order, payment.startedByMemberId);
      await this.useStock(() => this.stock?.used({ ...order, lines: order.lines.filter((l) => !isHang(l.productId)) }, payment.startedByMemberId));
      await this.orders.saveOrder({
        ...order,
        status: "paid",
        paidAt: payment.settledAt,
        paidByMemberId: payment.startedByMemberId,
        paymentMethod: payment.method,
        tenderedKurus: payment.tenderedKurus,
        changeKurus: payment.changeKurus,
      });
      return;
    }
    if (order.status !== "paid") return;
    // Paid two ways (peni and cash, say), it's refunded once both have gone back.
    const payments = await this.payments.list(order.cafeId, [order.id]);
    if (amountPaid(payments) > 0) return;
    await this.useStock(() => this.stock?.refunded(order, payment.startedByMemberId));
    await this.orders.saveOrder({
      ...order,
      status: "refunded",
      refundedAt: payment.settledAt,
      refundedByMemberId: payment.startedByMemberId,
      refundReason: payment.reason,
      refundKurus: payments.filter((p) => p.kind === "refund" && p.status === "approved").reduce((s, p) => s + p.amountKurus, 0),
    });
    // Peni go with the money: peni spent on it go back to the wallet, a code nobody used
    // closes, and peni already taken come back out of the wallet (as much as is left).
    await this.peni.refundOrder(order.cafeId, order.id);
    // What the guest left on the askı comes back off it, as much as is still there.
    await this.peni.unhangOrder(order.cafeId, order.id);
  }

  /** Stock never holds up a sale or a refund: if it can't be recorded, the sale still goes through. */
  private async useStock(fn: () => Promise<void> | undefined): Promise<void> {
    try {
      await fn();
    } catch (error) {
      console.error("stock: could not record", error);
    }
  }

  /**
   * The open drawer session a payment belongs to (piece 9). Cash goes in or out of the
   * drawer, so it needs one open; a card is stamped too when one is, for the day's check
   * against the terminal's own total.
   */
  private async drawer(ctx: StaffContext, method: PaymentMethod): Promise<string | null> {
    const session = await this.cash.current(ctx.cafe.id);
    if (!session && method === "cash") throw new AppError("CASH_CLOSED", "Open the drawer before taking cash", 409);
    return session?.id ?? null;
  }

  private async paymentOf(ctx: StaffContext, orderId: string, paymentId: string): Promise<Payment> {
    const payment = await this.payments.get(ctx.cafe.id, paymentId);
    if (payment.orderId !== orderId) throw new AppError("PAYMENT_NOT_FOUND", "No such payment", 404);
    return payment;
  }

  /** A payment and its order, with the peni claim once a sale has gone through. */
  private async answer(ctx: StaffContext, payment: Payment): Promise<PaymentAnswerDTO> {
    let order = await this.find(ctx, payment.orderId);
    const behind = payment.status === "approved" && (payment.kind === "sale" ? order.status === "open" : order.status === "paid");
    if (behind) {
      // The payment was saved but its order wasn't moved on (a crash between the two): catch up.
      await this.applyPayment(payment);
      order = await this.find(ctx, payment.orderId);
    }
    const claim = payment.kind === "sale" && order.status === "paid" ? await this.issueClaim(order) : null;
    const dto = await this.withClaim(ctx, order, claim);
    return { payment: dto.payments.find((p) => p.id === payment.id)!, order: dto };
  }

  /**
   * The peni the customer can take for a paid order (plan piece 7): a QR token and a
   * 4-digit code for the customer screen, open until the end of the café's day. Nothing
   * is credited here; the customer takes it (piece 10, `PeniApp.takeClaim`). No claim when the café has peni off
   * or the order earns nothing.
   */
  private async issueClaim(order: Order): Promise<PeniClaim | null> {
    const existing = await this.claims.getClaimByOrder(order.cafeId, order.id);
    if (existing) return existing;
    const settings = await this.directory.getSettings(order.cafeId);
    // Peni and the askı earn nothing: only what was paid in money does.
    const paid = await this.payments.list(order.cafeId, [order.id]);
    const peni = calculateEarn(order.totalKurus - peniKurusOf(paid) - askidaKurusOf(paid), settings);
    if (peni === 0) return null;
    const now = this.now();
    const businessDay = localDateKey(now, settings.timeZone);
    const used = await this.claims.codesUsed(order.cafeId, businessDay);
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = randomClaimCode(() => randomInt(10_000) / 10_000);
      if (used.has(code)) continue;
      const claim: PeniClaim = {
        id: `clm_${randomUUID()}`,
        cafeId: order.cafeId,
        orderId: order.id,
        businessDay,
        code,
        token: randomBytes(16).toString("base64url"),
        peni,
        createdAt: now,
        expiresAt: startOfNextLocalDay(now, settings.timeZone),
        claimedAt: null,
        claimedByMembershipId: null,
        cancelledAt: null,
      };
      // Another till took the code a moment ago: try again with a fresh one.
      if (await this.claims.saveClaim(claim)) return claim;
      used.add(code);
    }
    throw new AppError("CLAIM_CODE_BUSY", "No free penny code right now", 503);
  }

  private async withClaim(ctx: StaffContext, order: Order, claim: PeniClaim | null): Promise<OrderDTO> {
    const dto = await this.dto(ctx, order);
    const open = claim && claimIsOpen(claim, this.now());
    return { ...dto, claim: open ? { code: claim.code, token: claim.token, peni: claim.peni, expiresAt: claim.expiresAt.toISOString() } : null };
  }

  /** "İptal": an order that was never paid. Needs a reason. */
  async void(ctx: StaffContext, id: string, input: { reason: string }): Promise<OrderDTO> {
    this.require(ctx, "till.correct");
    const order = await this.find(ctx, id);
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "Only an unpaid order can be voided; refund a paid one", 409);
    const why = reason(input.reason);
    await this.payments.clearPending(actor(ctx), order.id);
    await this.givePeniBack(ctx, order, why);
    await this.giveAskidaBack(ctx, order, why);
    const next: Order = { ...order, status: "voided", voidedAt: this.now(), voidedByMemberId: ctx.member.id, voidReason: why };
    await this.orders.saveOrder(next);
    return this.dto(ctx, next);
  }

  /**
   * "İade": all of a paid order's money goes back, the way it was paid, through the same
   * terminal interface as the sale. Needs a reason. With the manual terminal the barista
   * hands the cash back or refunds the card on the terminal, and it's recorded at once.
   */
  async refund(ctx: StaffContext, id: string, input: { reason: string }): Promise<OrderDTO> {
    this.require(ctx, "till.correct");
    const order = await this.find(ctx, id);
    if (order.status !== "paid") throw new AppError("ORDER_NOT_PAID", "Only a paid order can be refunded", 409);
    const why = reason(input.reason);
    await this.payments.clearPending(actor(ctx), order.id);
    const payments = await this.payments.list(ctx.cafe.id, [order.id]);
    // Each way it was paid goes back the same way: the askı and peni first, then the money.
    const owed = (["askida", "peni", "cash", "card"] as const)
      .map((method) => ({ method, amountKurus: amountPaid(payments.filter((p) => p.method === method)) }))
      .filter((x) => x.amountKurus > 0);
    const drawers = await Promise.all(owed.map((x) => (x.method === "peni" || x.method === "askida" ? null : this.drawer(ctx, x.method))));
    for (const [i, x] of owed.entries()) {
      await this.payments.start(actor(ctx), {
        orderId: order.id,
        kind: "refund",
        method: x.method,
        amountKurus: x.amountKurus,
        tenderedKurus: null,
        changeKurus: null,
        key: `refund:${randomUUID()}`,
        reason: why,
        cashSessionId: drawers[i]!,
        reference: x.method === "peni" ? walletOf(payments) : null,
      });
    }
    return this.dto(ctx, await this.find(ctx, id));
  }

  /** "Sil": the order leaves the lists and reports but stays on record, with who and why. */
  async remove(ctx: StaffContext, id: string, input: { reason: string }): Promise<{ ok: true }> {
    this.require(ctx, "till.delete");
    const order = await this.find(ctx, id);
    await this.orders.saveOrder({ ...order, deletedAt: this.now(), deletedByMemberId: ctx.member.id, deleteReason: reason(input.reason) });
    return { ok: true };
  }

  async get(ctx: StaffContext, id: string): Promise<OrderDTO> {
    const order = await this.find(ctx, id);
    // The barista who is taking an order can always see it; older ones need "till.history".
    if (!(order.status === "open" && ctx.permissions.has("till.use"))) this.require(ctx, "till.history");
    return this.dto(ctx, order);
  }

  /** "Satışlar": one day's orders, newest first, with the day's sums. Defaults to today. */
  async list(ctx: StaffContext, filter: { businessDay?: string; status?: OrderStatus } = {}): Promise<OrderListDTO> {
    this.require(ctx, "till.history");
    const businessDay = filter.businessDay ?? (await this.today(ctx, this.now()));
    const all = await this.orders.listOrders(ctx.cafe.id, { businessDay, limit: 1000 });
    const paid = all.filter((o) => o.status === "paid" || o.status === "refunded");
    const sum = (os: Order[]) => os.reduce((s, o) => s + o.totalKurus, 0);
    // An order can be paid two ways, so the ways are summed from its payments.
    const stillPaid = all.filter((o) => o.status === "paid");
    const salePayments = (await this.payments.list(ctx.cafe.id, stillPaid.map((o) => o.id))).filter((p) => p.kind === "sale" && p.status === "approved");
    const byMethod = (m: PaymentMethod) => salePayments.filter((p) => p.method === m).reduce((s, p) => s + p.amountKurus, 0);
    return {
      businessDay,
      orders: await this.dtos(ctx, all.filter((o) => !filter.status || o.status === filter.status)),
      summary: {
        paidCount: all.filter((o) => o.status === "paid").length,
        salesKurus: sum(all.filter((o) => o.status === "paid")),
        cashKurus: byMethod("cash"),
        cardKurus: byMethod("card"),
        peniKurus: byMethod("peni"),
        askidaKurus: byMethod("askida"),
        refundedCount: paid.filter((o) => o.status === "refunded").length,
        refundedKurus: paid.reduce((s, o) => s + (o.refundKurus ?? 0), 0),
        voidedCount: all.filter((o) => o.status === "voided").length,
        openCount: all.filter((o) => o.status === "open").length,
      },
    };
  }

  private async priced(ctx: StaffContext, input: LineInput[]): Promise<OrderLine[]> {
    const menu = new Map((await this.menu.listMenu(ctx.cafe.id)).map((p) => [p.productId, p]));
    // One line per product, as on Shelby's till: the same product twice adds up.
    const merged = new Map<string, LineInput>();
    for (const l of input) {
      const prev = merged.get(l.productId);
      merged.set(l.productId, prev ? { ...prev, quantity: prev.quantity + l.quantity } : { ...l });
    }
    const settings = [...merged.keys()].some(isHang) ? await this.directory.getSettings(ctx.cafe.id) : null;
    return [...merged.values()].map((l) => {
      const productId = isHang(l.productId) ? l.productId.slice(HANG.length) : l.productId;
      const product = menu.get(productId);
      if (!product || !product.available) throw new AppError("PRODUCT_UNAVAILABLE", "A product in the order isn't on sale", 409);
      if (settings && productId !== l.productId && !(settings.askidaEnabled && settings.askidaProductIds.includes(productId))) {
        throw new AppError("PRODUCT_NOT_ELIGIBLE", "This product can't go on the askı", 409);
      }
      // "Askıya bırak": the same price, a line of its own, named for what it is.
      const name = productId === l.productId ? product.name : `Askıya ${goodsName(product.name)}`;
      return { productId: l.productId, name, unitPriceKurus: product.priceKurus, quantity: l.quantity, discountPercent: l.discountPercent ?? 0 };
    });
  }

  private check(lines: OrderLine[], discountPercent: number): void {
    const problem = orderProblem(lines, discountPercent);
    if (problem) throw new AppError(problem, "Check the order", 400);
  }

  private async find(ctx: StaffContext, id: string): Promise<Order> {
    const order = await this.orders.getOrder(ctx.cafe.id, id);
    if (!order || order.deletedAt) throw new AppError("ORDER_NOT_FOUND", "No such order", 404);
    return order;
  }

  private async dto(ctx: StaffContext, order: Order): Promise<OrderDTO> {
    return (await this.dtos(ctx, [order]))[0]!;
  }

  /** Orders as the till shows them, with their payments and everyone's names. */
  private async dtos(ctx: StaffContext, orders: Order[]): Promise<OrderDTO[]> {
    const payments = await this.payments.list(ctx.cafe.id, orders.map((o) => o.id));
    const names = await this.names(orders, payments);
    const confirmBy = new Map<string, PaymentDTO["confirmBy"]>();
    for (const p of payments.filter((x) => x.status === "pending")) {
      const how = await this.payments.confirmation(p);
      confirmBy.set(p.id, how === "terminal" ? "terminal" : "staff");
    }
    const wallets = new Map<string, string>();
    for (const id of new Set(payments.filter((p) => p.method === "peni" && p.reference).map((p) => p.reference!))) {
      wallets.set(id, await this.peniMemberName(id));
    }
    return orders.map((o) => this.toDTO(ctx, o, payments.filter((p) => p.orderId === o.id), names, confirmBy, wallets));
  }

  private toDTO(
    ctx: StaffContext,
    o: Order,
    payments: Payment[],
    names: Map<string, string>,
    confirmBy: Map<string, PaymentDTO["confirmBy"]>,
    wallets: Map<string, string>,
  ): OrderDTO {
    const peniKurus = peniKurusOf(payments);
    const wallet = walletOf(payments);
    const name = (id: string | null) => (id ? (names.get(id) ?? "Eski ekip üyesi") : null);
    const refundWaiting = payments.some((p) => p.kind === "refund" && p.status === "pending");
    return {
      id: o.id,
      number: o.number,
      businessDay: o.businessDay,
      status: o.status,
      lines: o.lines.map((l) => ({ ...l, totalKurus: lineTotal(l), hang: isHang(l.productId) })),
      discountPercent: o.discountPercent,
      subtotalKurus: o.subtotalKurus,
      discountKurus: o.discountKurus,
      totalKurus: o.totalKurus,
      itemCount: o.lines.reduce((s, l) => s + l.quantity, 0),
      createdAt: o.createdAt.toISOString(),
      takenBy: name(o.createdByMemberId)!,
      paidAt: o.paidAt?.toISOString() ?? null,
      paymentMethod: o.paymentMethod,
      tenderedKurus: o.tenderedKurus,
      changeKurus: o.changeKurus,
      voided: o.voidedAt ? { at: o.voidedAt.toISOString(), by: name(o.voidedByMemberId)!, reason: o.voidReason ?? "" } : null,
      refunded: o.refundedAt
        ? { at: o.refundedAt.toISOString(), by: name(o.refundedByMemberId)!, reason: o.refundReason ?? "", amountKurus: o.refundKurus ?? 0 }
        : null,
      dueKurus: o.status === "open" ? o.totalKurus - amountPaid(payments) : 0,
      peni: peniKurus > 0 && o.status !== "refunded" && o.status !== "voided" ? { peni: peniKurus / 100, name: (wallet && wallets.get(wallet)) || "Üye" } : null,
      askida: askidaOn(o, payments),
      canVoid: o.status === "open" && ctx.permissions.has("till.correct"),
      canRefund: o.status === "paid" && !refundWaiting && ctx.permissions.has("till.correct"),
      canDelete: ctx.permissions.has("till.delete"),
      payments: payments.map((p) => ({
        id: p.id,
        kind: p.kind,
        method: p.method,
        status: p.status,
        amountKurus: p.amountKurus,
        tenderedKurus: p.tenderedKurus,
        changeKurus: p.changeKurus,
        terminal: p.terminal,
        confirmBy: confirmBy.get(p.id) ?? null,
        startedAt: p.startedAt.toISOString(),
        startedBy: name(p.startedByMemberId)!,
        settledAt: p.settledAt?.toISOString() ?? null,
        settledBy: name(p.settledByMemberId),
        reference: p.reference,
        receiptNo: p.receiptNo,
        failure: p.failure,
        reason: p.reason,
      })),
      claim: null,
    };
  }

  /** The café's local date: orders are numbered and listed by it. */
  private async today(ctx: StaffContext, now: Date): Promise<string> {
    return localDateKey(now, (await this.directory.getSettings(ctx.cafe.id)).timeZone);
  }

  /** Names of everyone who touched these orders, people who have left the team included. */
  private async names(orders: Order[], payments: Payment[]): Promise<Map<string, string>> {
    const ids = new Set(
      [
        ...orders.flatMap((o) => [o.createdByMemberId, o.paidByMemberId, o.voidedByMemberId, o.refundedByMemberId]),
        ...payments.flatMap((p) => [p.startedByMemberId, p.settledByMemberId]),
      ].filter((x): x is string => !!x),
    );
    const out = new Map<string, string>();
    for (const id of ids) {
      const member = await this.staff.getMember(id);
      const account = member && (await this.staff.getAccount(member.accountId));
      if (account) out.set(id, account.name);
    }
    return out;
  }

  private require(ctx: StaffContext, permission: Permission): void {
    requirePermission(ctx, permission);
  }
}

/** Peni on an order: approved peni payments less peni given back, in kuruş. */
function peniKurusOf(payments: Payment[]): number {
  return amountPaid(payments.filter((p) => p.method === "peni"));
}

/** What the askı paid on an order: approved askı payments less what went back, in kuruş. */
function askidaKurusOf(payments: Payment[]): number {
  return amountPaid(payments.filter((p) => p.method === "askida"));
}

/** An askı payment's `reference`: "2x cay" is two teas. */
function askidaRef(productId: string, quantity: number): string {
  return `${quantity}x${productId}`;
}

/** Askı items still paid for by the askı on an order, per product. Once given back, none are. */
function askidaGiven(payments: Payment[]): Map<string, number> {
  const out = new Map<string, number>();
  if (askidaKurusOf(payments) <= 0) return out;
  for (const p of payments.filter((x) => x.method === "askida" && x.kind === "sale" && x.status === "approved")) {
    const m = /^(\d+)x(.+)$/.exec(p.reference ?? "");
    if (m) out.set(m[2]!, (out.get(m[2]!) ?? 0) + Number(m[1]));
  }
  return out;
}

function askidaOn(o: Order, payments: Payment[]): OrderDTO["askida"] {
  const kurus = askidaKurusOf(payments);
  if (kurus <= 0 || o.status === "refunded" || o.status === "voided") return null;
  const names = new Map(o.lines.map((l) => [l.productId, l.name]));
  return { kurus, items: [...askidaGiven(payments)].map(([productId, quantity]) => ({ productId, name: names.get(productId) ?? productId, quantity })) };
}

/** "Askıya bırak" lines carry the askı item's id behind this. */
const HANG = "askida:";
function isHang(productId: string): boolean {
  return productId.startsWith(HANG);
}

/** The wallet an order's peni came from. */
function walletOf(payments: Payment[]): string | null {
  return payments.find((p) => p.method === "peni" && p.kind === "sale" && p.status === "approved")?.reference ?? null;
}

function actor(ctx: StaffContext): PaymentActor {
  return { cafeId: ctx.cafe.id, memberId: ctx.member.id, deviceId: ctx.deviceId };
}

function reason(raw: string): string {
  const r = raw.trim();
  if (!r) throw new AppError("REASON_REQUIRED", "Write a reason", 400);
  if (r.length > REASON_MAX) throw new AppError("REASON_TOO_LONG", "Keep the reason short", 400);
  return r;
}
