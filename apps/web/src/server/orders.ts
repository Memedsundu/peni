import type { OrderDTO, OrderListDTO, TillMenuDTO } from "@peni/api";
import {
  localDateKey,
  orderProblem,
  orderTotals,
  lineTotal,
  type MenuStore,
  type Order,
  type OrderLine,
  type OrderStatus,
  type OrderStore,
  type PaymentMethod,
  type PeniDirectory,
  type Permission,
  type StaffStore,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
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
    private readonly menu: MenuStore,
    private readonly staff: StaffStore,
    private readonly directory: PeniDirectory,
    private readonly now: () => Date,
  ) {}

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
      payKey: null,
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
    const next = { ...order, lines, discountPercent, ...orderTotals(lines, discountPercent) };
    await this.orders.saveOrder(next);
    return this.dto(ctx, next);
  }

  /**
   * Records the payment. Peni can't drive the card terminal yet (D24), so the barista
   * runs it and taps "Kart" once it's approved. For cash, what was handed over is
   * optional; when given, the change is worked out. A retry with the same `payKey`
   * answers as the first time.
   */
  async pay(ctx: StaffContext, id: string, input: { method: PaymentMethod; payKey: string; tenderedKurus?: number }): Promise<OrderDTO> {
    this.require(ctx, "till.use");
    const order = await this.find(ctx, id);
    if (order.status === "paid" && order.payKey === input.payKey) return this.dto(ctx, order);
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "This order is already closed", 409);
    let tenderedKurus: number | null = null;
    let changeKurus: number | null = null;
    if (input.method === "cash" && input.tenderedKurus !== undefined) {
      if (input.tenderedKurus < order.totalKurus) throw new AppError("TENDERED_TOO_LOW", "Less than the total was handed over", 400);
      tenderedKurus = input.tenderedKurus;
      changeKurus = input.tenderedKurus - order.totalKurus;
    }
    const paid: Order = {
      ...order,
      status: "paid",
      paidAt: this.now(),
      paidByMemberId: ctx.member.id,
      paymentMethod: input.method,
      tenderedKurus,
      changeKurus,
      payKey: input.payKey,
    };
    await this.orders.saveOrder(paid);
    return this.dto(ctx, paid);
  }

  /** "İptal": an order that was never paid. Needs a reason. */
  async void(ctx: StaffContext, id: string, input: { reason: string }): Promise<OrderDTO> {
    this.require(ctx, "till.correct");
    const order = await this.find(ctx, id);
    if (order.status !== "open") throw new AppError("ORDER_NOT_OPEN", "Only an unpaid order can be voided; refund a paid one", 409);
    const next: Order = { ...order, status: "voided", voidedAt: this.now(), voidedByMemberId: ctx.member.id, voidReason: reason(input.reason) };
    await this.orders.saveOrder(next);
    return this.dto(ctx, next);
  }

  /** "İade": all of a paid order's money goes back, the way it was paid. Needs a reason. */
  async refund(ctx: StaffContext, id: string, input: { reason: string }): Promise<OrderDTO> {
    this.require(ctx, "till.correct");
    const order = await this.find(ctx, id);
    if (order.status !== "paid") throw new AppError("ORDER_NOT_PAID", "Only a paid order can be refunded", 409);
    const next: Order = {
      ...order,
      status: "refunded",
      refundedAt: this.now(),
      refundedByMemberId: ctx.member.id,
      refundReason: reason(input.reason),
      refundKurus: order.totalKurus,
    };
    await this.orders.saveOrder(next);
    return this.dto(ctx, next);
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
    const names = await this.names(all);
    const paid = all.filter((o) => o.status === "paid" || o.status === "refunded");
    const sum = (os: Order[]) => os.reduce((s, o) => s + o.totalKurus, 0);
    return {
      businessDay,
      orders: all.filter((o) => !filter.status || o.status === filter.status).map((o) => this.toDTO(ctx, o, names)),
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
    return this.toDTO(ctx, order, await this.names([order]));
  }

  private toDTO(ctx: StaffContext, o: Order, names: Map<string, string>): OrderDTO {
    const name = (id: string | null) => (id ? (names.get(id) ?? "Eski ekip üyesi") : null);
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
      canRefund: o.status === "paid" && ctx.permissions.has("till.correct"),
      canDelete: ctx.permissions.has("till.delete"),
    };
  }

  /** The café's local date: orders are numbered and listed by it. */
  private async today(ctx: StaffContext, now: Date): Promise<string> {
    return localDateKey(now, (await this.directory.getSettings(ctx.cafe.id)).timeZone);
  }

  /** Names of everyone who touched these orders, people who have left the team included. */
  private async names(orders: Order[]): Promise<Map<string, string>> {
    const ids = new Set(
      orders.flatMap((o) => [o.createdByMemberId, o.paidByMemberId, o.voidedByMemberId, o.refundedByMemberId]).filter((x): x is string => !!x),
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

function reason(raw: string): string {
  const r = raw.trim();
  if (!r) throw new AppError("REASON_REQUIRED", "Write a reason", 400);
  if (r.length > REASON_MAX) throw new AppError("REASON_TOO_LONG", "Keep the reason short", 400);
  return r;
}
