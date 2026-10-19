import { createPrismaClient, createPrismaStores } from "@peni/db";
import { PeniApp, inMemoryStores } from "./app";
import { seed } from "./seed";

const globalForPeni = globalThis as unknown as { peniApp?: Promise<PeniApp> };

/**
 * One app instance per server process (kept across dev hot reloads).
 *
 * With DATABASE_URL set, every record lives in Postgres; without it, in memory.
 * In demo mode (PENI_DEMO, on unless "0") an empty database gets the demo cafés
 * and their history once; an in-memory app gets them on every start.
 */
export function getApp(): Promise<PeniApp> {
  globalForPeni.peniApp ??= (async () => {
    const demo = process.env.PENI_DEMO !== "0";
    const url = process.env.DATABASE_URL;
    const stores = url ? createPrismaStores(createPrismaClient(url)) : inMemoryStores();
    const app = new PeniApp({ demo }, stores);
    if (demo && (await app.identity.listCafes()).length === 0) await seed(app);
    return app;
  })();
  return globalForPeni.peniApp;
}
