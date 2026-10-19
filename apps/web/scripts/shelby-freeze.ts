// Switch day (plan piece 35): stops Shelby taking money for the café, or lets it again.
// See docs/switch-day.md.
//
//   SHELBY_DATABASE_URL=… pnpm --filter @peni/web shelby-freeze --on     before the final move
//   SHELBY_DATABASE_URL=… pnpm --filter @peni/web shelby-freeze --off    only if the switch is called off
//
// --cafe <Shelby café id> when Shelby has several. This is the one command that writes to Shelby.
import { listShelbyCafes, pauseShelby } from "../src/server/shelby/source";

async function main(): Promise<void> {
  const url = process.env.SHELBY_DATABASE_URL;
  if (!url) throw new Error("Set SHELBY_DATABASE_URL to Shelby's database");
  const on = process.argv.includes("--on");
  const off = process.argv.includes("--off");
  if (on === off) throw new Error("Say --on (freeze Shelby) or --off (let it take money again)");
  const i = process.argv.indexOf("--cafe");
  const cafes = await listShelbyCafes(url);
  const cafeId = i > 0 ? process.argv[i + 1] : cafes.length === 1 ? cafes[0]!.id : undefined;
  if (!cafeId) throw new Error(`Shelby has ${cafes.length} cafés; pick one with --cafe: ${cafes.map((c) => `${c.id} (${c.name})`).join(", ")}`);
  const r = await pauseShelby(url, cafeId, on);
  console.log(r.paused ? `${r.name}: Shelby is frozen. No sale, payment or count goes in until --off.` : `${r.name}: Shelby takes money again.`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
