import type { Recipe, StockBatch, StockItem, StockMove, StockReason, StockStore } from "@peni/core";
import type { Db } from "./db";
import { Prisma, type PrismaClient, type StockMove as MoveRow } from "./generated/client";

type Tx = Prisma.TransactionClient;

const isUniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Thrown inside the transaction to roll the batch back when its key was used already. */
class BatchExists extends Error {}

function toMove(r: MoveRow): StockMove {
  return {
    id: r.id,
    cafeId: r.cafeId,
    itemId: r.itemId,
    changeMilli: r.changeMilli,
    afterMilli: r.afterMilli,
    reason: r.reason,
    why: r.why,
    note: r.note,
    orderId: r.orderId,
    memberId: r.memberId,
    at: r.at,
    batchKey: r.batchKey,
  };
}

export class PrismaStockStore implements StockStore {
  constructor(private readonly db: Db) {}

  async listItems(cafeId: string, opts: { includeArchived?: boolean } = {}): Promise<StockItem[]> {
    const rows = await this.db().stockItem.findMany({ where: { cafeId, ...(opts.includeArchived ? {} : { archivedAt: null }) } });
    return rows.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }

  async getItem(cafeId: string, id: string): Promise<StockItem | null> {
    return this.db().stockItem.findFirst({ where: { id, cafeId } });
  }

  async saveItem(item: StockItem): Promise<void> {
    const { qtyMilli, ...details } = item;
    await this.db().stockItem.upsert({ where: { id: item.id }, create: { ...details, qtyMilli }, update: details });
  }

  async applyBatch(batch: StockBatch): Promise<StockMove[] | null> {
    const run = async (tx: Tx) => {
      // Lock the batch's items in a fixed order, so two sales using milk and cups never wait on each other in a circle.
      const ids = [...new Set(batch.changes.map((c) => c.itemId))].sort();
      const locked = await tx.$queryRaw<{ id: string; qtyMilli: number }[]>`
        SELECT "id", "qtyMilli" FROM "StockItem" WHERE "cafeId" = ${batch.cafeId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
      const qty = new Map(locked.map((r) => [r.id, r.qtyMilli]));
      const moves: StockMove[] = [];
      for (const change of batch.changes) {
        const before = qty.get(change.itemId);
        if (before === undefined) throw new Error(`No stock item ${change.itemId}`);
        const changeMilli = "countedMilli" in change ? change.countedMilli - before : change.changeMilli;
        qty.set(change.itemId, before + changeMilli);
        moves.push({
          id: change.id,
          cafeId: batch.cafeId,
          itemId: change.itemId,
          changeMilli,
          afterMilli: before + changeMilli,
          reason: batch.reason,
          why: batch.why ?? null,
          note: batch.note ?? null,
          orderId: batch.orderId ?? null,
          memberId: batch.memberId ?? null,
          at: batch.at,
          batchKey: batch.batchKey,
        });
      }
      try {
        await tx.stockMove.createMany({ data: moves });
      } catch (error) {
        if (isUniqueClash(error)) throw new BatchExists();
        throw error;
      }
      for (const [id, qtyMilli] of qty) await tx.stockItem.update({ where: { id }, data: { qtyMilli } });
      return moves;
    };
    if (batch.changes.length === 0) return [];
    try {
      const db = this.db();
      // Inside the ledger's transaction already (a sale's payment): use it; else open one.
      return "$transaction" in db ? await (db as PrismaClient).$transaction(run) : await run(db);
    } catch (error) {
      if (error instanceof BatchExists) return null;
      throw error;
    }
  }

  async listBatch(cafeId: string, batchKey: string): Promise<StockMove[]> {
    return (await this.db().stockMove.findMany({ where: { cafeId, batchKey }, orderBy: { id: "asc" } })).map(toMove);
  }

  async listMoves(cafeId: string, opts: { itemId?: string; reasons?: StockReason[]; limit: number }): Promise<StockMove[]> {
    const rows = await this.db().stockMove.findMany({
      where: { cafeId, ...(opts.itemId ? { itemId: opts.itemId } : {}), ...(opts.reasons ? { reason: { in: opts.reasons } } : {}) },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: opts.limit,
    });
    return rows.map(toMove);
  }

  async getRecipe(cafeId: string, productId: string): Promise<Recipe | null> {
    const r = await this.db().stockRecipe.findUnique({
      where: { cafeId_productId: { cafeId, productId } },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    return r ? { cafeId, productId, mode: r.mode, lines: r.lines.map((l) => ({ itemId: l.itemId, qtyMilli: l.qtyMilli })) } : null;
  }

  async listRecipes(cafeId: string): Promise<Recipe[]> {
    const rows = await this.db().stockRecipe.findMany({ where: { cafeId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    return rows.map((r) => ({ cafeId, productId: r.productId, mode: r.mode, lines: r.lines.map((l) => ({ itemId: l.itemId, qtyMilli: l.qtyMilli })) }));
  }

  async saveRecipe(recipe: Recipe): Promise<void> {
    const { cafeId, productId } = recipe;
    const run = async (tx: Tx) => {
      await tx.stockRecipe.upsert({
        where: { cafeId_productId: { cafeId, productId } },
        create: { cafeId, productId, mode: recipe.mode },
        update: { mode: recipe.mode },
      });
      await tx.stockRecipeLine.deleteMany({ where: { cafeId, productId } });
      await tx.stockRecipeLine.createMany({ data: recipe.lines.map((l, i) => ({ cafeId, productId, itemId: l.itemId, qtyMilli: l.qtyMilli, sortOrder: i })) });
    };
    const db = this.db();
    if ("$transaction" in db) await (db as PrismaClient).$transaction(run);
    else await run(db);
  }
}
