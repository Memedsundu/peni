import type { MenuItem, PendingOrderInput, PendingOrderRef, PosAdapter } from "./adapter";

/** For cafés without a POS integration: the menu and pending orders live in Peni. */
export class StandalonePosAdapter implements PosAdapter {
  readonly kind = "standalone" as const;
  private readonly menus = new Map<string, MenuItem[]>();
  private readonly open = new Map<string, boolean>();
  private readonly counters = new Map<string, number>();
  readonly orders = new Map<string, PendingOrderInput & PendingOrderRef & { cancelledReason: string | null }>();

  setMenu(cafeId: string, items: MenuItem[]): void {
    this.menus.set(cafeId, items.map((i) => ({ ...i })));
  }

  setAcceptingOrders(cafeId: string, accepting: boolean): void {
    this.open.set(cafeId, accepting);
  }

  async listMenu(cafeId: string) {
    return (this.menus.get(cafeId) ?? []).map((i) => ({ ...i }));
  }

  async isAcceptingOrders(cafeId: string) {
    return this.open.get(cafeId) ?? true;
  }

  async createPendingOrder(input: PendingOrderInput): Promise<PendingOrderRef> {
    const n = (this.counters.get(input.cafeId) ?? 0) + 1;
    this.counters.set(input.cafeId, n);
    const ref = { posOrderId: `standalone_${input.peniOrderId}`, orderNumber: `P-${String(n).padStart(3, "0")}` };
    this.orders.set(ref.posOrderId, { ...input, ...ref, cancelledReason: null });
    return ref;
  }

  async cancelPendingOrder(posOrderId: string, reason: string) {
    const order = this.orders.get(posOrderId);
    if (order) order.cancelledReason = reason;
  }
}
