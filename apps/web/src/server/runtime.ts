import { PeniApp } from "./app";
import { seed } from "./seed";

const globalForPeni = globalThis as unknown as { peniApp?: Promise<PeniApp> };

/** One app instance per server process (kept across dev hot reloads). */
export function getApp(): Promise<PeniApp> {
  globalForPeni.peniApp ??= (async () => {
    const demo = process.env.PENI_DEMO !== "0";
    const app = new PeniApp({ demo, staffKey: process.env.PENI_DEMO_STAFF_KEY ?? "demo-staff" });
    if (demo) await seed(app);
    return app;
  })();
  return globalForPeni.peniApp;
}
