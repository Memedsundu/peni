// Sets what a café pays for (decision N11), by hand until there's online payment.
//
//   DATABASE_URL=… pnpm --filter @peni/web set-plan                    every café's plan
//   DATABASE_URL=… pnpm --filter @peni/web set-plan moda isletme       moda pays for İşletme
//   DATABASE_URL=… pnpm --filter @peni/web set-plan moda --trial       two weeks of everything from now
//   DATABASE_URL=… pnpm --filter @peni/web set-plan moda --end-trial   ends a running trial
//
// Plans: topluluk (free), penny (Topluluk + Penny), isletme (everything). Nothing is
// deleted when a café moves down; its records come back when it moves up.
import { createPrismaClient, createPrismaStores } from "@peni/db";
import { planLine, setCafePlan } from "../src/server/plans";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL to the database to change (staging or production)");
  const { identity } = createPrismaStores(createPrismaClient(url));
  const now = new Date();
  const [slug, plan] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const trial = process.argv.includes("--trial") ? "start" : process.argv.includes("--end-trial") ? "end" : undefined;

  if (slug && (plan || trial)) {
    const cafe = await setCafePlan(identity, slug, { plan, trial }, now);
    console.log(`Saved. ${planLine(cafe, now)}`);
    return;
  }
  for (const cafe of await identity.listCafes()) if (!slug || cafe.slug === slug) console.log(planLine(cafe, now));
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
