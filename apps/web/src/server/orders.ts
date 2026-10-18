import type { OrderDTO, OrderListDTO, PaymentAnswerDTO, PaymentDTO, TillMenuDTO } from "@peni/api";
import {
  amountPaid,
  calculateEarn,
  claimIsOpen,
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
  type Permission,
  type StaffStore,
} from "@peni/core";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { AppError } from "./errors";
import type { CashService } from "./cash";
import type { PaymentActor, PaymentService } from "./payments";
import type { StaffContext } from "./staff";

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
    private readonly now: () => Date,
  ) {
    // However a payment gets approved, by the barista or later by the terminal, its order moves on.
    payments.onApproved = (payment) => this.applyPayment(payment);
  }

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
    await this.orders.saveOrder({
      ...order,
      status: "refunded",
      refundedAt: payment.settledAt,
      refundedByMemberId: payment.startedByMemberId,
      refundReason: payment.reason,
      refundKurus: payment.amountKurus,
    });
    // A claim nobody took yet goes with the money. Peni already claimed is taken back
    // with the refund once claiming exists (piece 10).
    const claim = await this.claims.getClaimByOrder(order.cafeId, order.id);
    if (claim && claimIsOpen(claim, this.now())) await this.claims.saveClaim({ ...claim, cancelledAt: this.now() });
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
   * is credited here; the app claims it (piece 10). No claim when the café has peni off
   * or the order earns nothing.
   */
  private async issueClaim(order: Order): Promise<PeniClaim | null> {
    const existing = await this.claims.getClaimByOrder(order.cafeId, order.id);
    if (existing) return existing;
    const settings = await this.directory.getSettings(order.cafeId);
    const peni = calculateEarn(order.totalKurus, settings);
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
    throw new AppError("CLAIM_CODE_BUSY", "No free peni code right now", 503);
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
    await this.payments.clearPending(actor(ctx), order.id);
    const next: Order = { ...order, status: "voided", voidedAt: this.now(), voidedByMemberId: ctx.member.id, voidReason: reason(input.reason) };
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
    const method = order.paymentMethod ?? "cash";
    const cashSessionId = await this.drawer(ctx, method);
    await this.payments.clearPending(actor(ctx), order.id);
    await this.payments.start(actor(ctx), {
      orderId: order.id,
      kind: "refund",
      method,
      amountKurus: order.totalKurus,
      tenderedKurus: null,
      changeKurus: null,
      key: `refund:${randomUUID()}`,
      reason: why,
      cashSessionId,
    });
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
    return {
      businessDay,
      orders: await this.dtos(ctx, all.filter((o) => !filter.status || o.status === filter.status)),
      summary: {
        paidCount: all.filter((o) => o.status === "paid").length,
        salesKurus: sum(all.filter((o) => o.status === "paid")),
        cashKurus: sum(all.filter((o) => o.status === "paid" && o.paymentMethod === "cash")),
        cardKurus: sum(all.filter((o) => o.status === "paid" && o.paymentMethod === "card")),
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
    return [...merged.values()].map((l) => {
      const product = menu.get(l.productId);
      if (!product || !product.available) throw new AppError("PRODUCT_UNAVAILABLE", "A product in the order isn't on sale", 409);
      return { productId: l.productId, name: product.name, unitPriceKurus: product.priceKurus, quantity: l.quantity, discountPercent: l.discountPercent ?? 0 };
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
    return orders.map((o) => this.toDTO(ctx, o, payments.filter((p) => p.orderId === o.id), names, confirmBy));
  }

  private toDTO(ctx: StaffContext, o: Order, payments: Payment[], names: Map<string, string>, confirmBy: Map<string, PaymentDTO["confirmBy"]>): OrderDTO {
    const name = (id: string | null) => (id ? (names.get(id) ?? "Eski ekip üyesi") : null);
    const refundWaiting = payments.some((p) => p.kind === "refund" && p.status === "pending");
    return {
      id: o.id,
      number: o.number,
      businessDay: o.businessDay,
      status: o.status,
      lines: o.lines.map((l) => ({ ...l, totalKurus: lineTotal(l) })),
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
    if (ctx.permissions.has(permission)) return;
    if (ctx.rolePermissions.has(permission)) throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    throw new AppError("FORBIDDEN", "Your role can't do this", 403);
  }
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
