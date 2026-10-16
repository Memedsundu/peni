#!/usr/bin/env node
// Copies the six self-hosted font files (design-system.md §4.2) from the Fontsource
// packages into apps/web/public/fonts/, where fonts.css and the <link rel="preload">
// tags in layout.tsx expect them. Runs in `predev` and `prebuild`; the folder is gitignored.
//
// Resolution goes through Node's resolver, so it works with the hoisted pnpm layout
// (node_modules at the repo root) and with an isolated one alike.
import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "fonts");

/** [package, file] — exactly the six files of §4.2. NEVER drop latin-ext (İ ğ ş ₺ live there). */
const FILES = [
  ["@fontsource-variable/archivo", "archivo-latin-wdth-normal.woff2"],
  ["@fontsource-variable/archivo", "archivo-latin-ext-wdth-normal.woff2"],
  ["@fontsource-variable/brygada-1918", "brygada-1918-latin-wght-normal.woff2"],
  ["@fontsource-variable/brygada-1918", "brygada-1918-latin-ext-wght-normal.woff2"],
  ["@fontsource-variable/brygada-1918", "brygada-1918-latin-wght-italic.woff2"],
  ["@fontsource-variable/brygada-1918", "brygada-1918-latin-ext-wght-italic.woff2"],
];

await mkdir(outDir, { recursive: true });

let copied = 0;
for (const [pkg, file] of FILES) {
  let src;
  try {
    src = join(dirname(require.resolve(`${pkg}/package.json`)), "files", file);
    await stat(src);
  } catch {
    console.error(`copy-fonts: ${pkg}/files/${file} not found. Is ${pkg} installed?`);
    process.exit(1);
  }
  const dest = join(outDir, file);
  const [a, b] = await Promise.all([stat(src), stat(dest).catch(() => null)]);
  if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) continue;
  await copyFile(src, dest);
  copied++;
}

console.log(`copy-fonts: ${copied} copied, ${FILES.length - copied} up to date → public/fonts/`);
