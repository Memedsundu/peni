import type { Order, OrderFilter, OrderStore } from "@peni/core";
import type { Db } from "./db";
import type { Prisma } from "./generated/client";

const WITH_LINES = { lines: { orderBy: { position: "asc" } } } as const;
type Row = Prisma.OrderGetPayload<{ include: typeof WITH_LINES }>;

function toOrder({ lines, ...o }: Row): Order {
  return {
    ...o,
    lines: lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      unitPriceKurus: l.unitPriceKurus,
      quantity: l.quantity,
      discountPercent: l.discountPercent,
    })),
  };
}

export class PrismaOrderStore implements OrderStore {
  constructor(private readonly db: Db) {}

  async nextNumber(cafeId: string, businessDay: string): Promise<number> {
    // One statement, so two tills asking at once still get different numbers.
    const [row] = await this.db().$queryRaw<{ last: number }[]>`
      INSERT INTO "OrderCounter" ("cafeId", "businessDay", "last") VALUES (${cafeId}, ${businessDay}, 1)
      ON CONFLICT ("cafeId", "businessDay") DO UPDATE SET "last" = "OrderCounter"."last" + 1
      RETURNING "last"`;
    return row!.last;
  }

  async saveOrder({ lines, ...order }: Order): Promise<void> {
    const db = this.db();
    const data = { ...order };
    const lineRows = lines.map((l, position) => ({ position, ...l }));
    await db.order.upsert({
      where: { id: order.id },
      create: { ...data, lines: { create: lineRows } },
      update: { ...data, lines: { deleteMany: {}, create: lineRows } },
    });
  }

  async getOrder(cafeId: string, id: string): Promise<Order | null> {
    const row = await this.db().order.findFirst({ where: { id, cafeId }, include: WITH_LINES });
    return row ? toOrder(row) : null;
  }

  async findByCreateKey(cafeId: string, createKey: string): Promise<Order | null> {
    const row = await this.db().order.findUnique({ where: { cafeId_createKey: { cafeId, createKey } }, include: WITH_LINES });
    return row ? toOrder(row) : null;
  }

  async listOrders(cafeId: string, filter: OrderFilter = {}): Promise<Order[]> {
    const rows = await this.db().order.findMany({
      where: {
        cafeId,
        deletedAt: null,
        ...(filter.businessDay ? { businessDay: filter.businessDay } : {}),
        ...(filter.from || filter.through
          ? { businessDay: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.through ? { lte: filter.through } : {}) } }
          : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { number: "desc" }],
      take: filter.limit ?? 200,
      include: WITH_LINES,
    });
    return rows.map(toOrder);
  }
}
