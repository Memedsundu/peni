// Moves a café from Shelby into Peni (plan piece 33). See docs/shelby-move.md.
//
//   SHELBY_DATABASE_URL=… pnpm --filter @peni/web shelby-move            dry run: map, check in memory
//   SHELBY_DATABASE_URL=… DATABASE_URL=… pnpm --filter @peni/web shelby-move --write
//
// Options: --cafe <Shelby café id> (when Shelby has several), --slug <Peni slug> (shelby),
// --all (also the previous owner's records), --report <file.md>, --now <ISO time>.
// Shelby is only read. Exits 1 when a total doesn't match.
import { writeFileSync } from "node:fs";
import { createPrismaClient, createPrismaStores } from "@peni/db";
import { inMemoryStores } from "../src/server/app";
import { checkMove } from "../src/server/shelby/check";
import { defaultFrom, mapShelby } from "../src/server/shelby/map";
import { reportMarkdown } from "../src/server/shelby/report";
import { listShelbyCafes, readShelby } from "../src/server/shelby/source";
import { writeShelby } from "../src/server/shelby/write";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<number> {
  const shelbyUrl = process.env.SHELBY_DATABASE_URL;
  if (!shelbyUrl) throw new Error("Set SHELBY_DATABASE_URL to Shelby's database (a copy or a Neon branch for a rehearsal)");
  const write = flag("write");
  const peniUrl = process.env.DATABASE_URL;
  if (write && !peniUrl) throw new Error("--write needs DATABASE_URL, Peni's database");

  const cafes = await listShelbyCafes(shelbyUrl);
  const shelbyCafe = arg("cafe") ?? (cafes.length === 1 ? cafes[0]!.id : undefined);
  if (!shelbyCafe) throw new Error(`Shelby has ${cafes.length} cafés; pick one with --cafe: ${cafes.map((c) => `${c.id} (${c.name})`).join(", ")}`);
  const slug = arg("slug") ?? "shelby";
  const now = arg("now") ? new Date(arg("now")!) : new Date();

  console.log(`Reading Shelby (${cafes.find((c) => c.id === shelbyCafe)?.name ?? shelbyCafe})…`);
  const snap = await readShelby(shelbyUrl, shelbyCafe);
  const from = flag("all") ? null : defaultFrom(snap);
  const { records, report } = mapShelby(snap, { cafeId: `cafe_${slug}`, slug, now, from });

  const stores = write ? createPrismaStores(createPrismaClient(peniUrl!)) : inMemoryStores();
  console.log(write ? "Writing into Peni…" : "Dry run: writing into memory…");
  await writeShelby(stores, records, (step) => console.log(`  ${step}`));
  const rows = await checkMove(snap, stores, records.cafe.id, from);

  const md = reportMarkdown(report, rows, { when: now, mode: write ? "Moved into Peni" : "Dry run" });
  const file = arg("report");
  if (file) writeFileSync(file, md);
  console.log(`\n${md}`);
  const bad = rows.filter((r) => !r.ok).length;
  console.log(bad ? `${bad} total(s) don't match.` : "Every total matches.");
  return bad ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
