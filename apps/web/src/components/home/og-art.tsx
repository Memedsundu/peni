import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { beads, COIN, P_GLYPH } from "@peni/brand/shapes";
import { light } from "@peni/brand/tokens";

/*
 * Shared art for the `next/og` images (design-system.md §15): the brand fonts as Satori
 * needs them, and the coin as an SVG data URI. Satori draws text with the fonts given here
 * only; an SVG it embeds as an image has no fonts at all, so the coin is drawn without its
 * rim legend — the app-icon art (face, 36 beads, hairline, the embossed "p" ×1.15).
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Colours from tokens.ts (light), so the image follows the palette. */
export const OG = { bg: light.bg, ink: light.ink, ink2: light.ink2, line: light.line } as const;

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" };

/** node_modules/<pkg>/files/<file>, looked up from the server's cwd upwards (pnpm hoists to the repo root). */
async function fontFile(pkg: string, file: string): Promise<ArrayBuffer> {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      const buf = await readFile(join(dir, "node_modules", pkg, "files", file));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    } catch {
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  throw new Error(`OG font not found: ${pkg}/files/${file}`);
}

let fontsPromise: Promise<Font[]> | null = null;

/**
 * The families to put in `fontFamily`. Satori keeps ONE font per name + weight + style, so two
 * subset files under one name don't merge: the second is ignored and a glyph missing from
 * the first ("İ", "ş", "ğ" live only in latin-ext) is taken from whatever other font has it
 * — a 400 "İ" inside 600 caps. Each subset gets its own name, and every style lists both.
 */
export const OG_FONT = {
  display: "Brygada, Brygada Ext",
  body: "Archivo, Archivo Ext",
  semibold: "Archivo SemiBold, Archivo SemiBold Ext",
} as const;

const FILES = [
  ["@fontsource/brygada-1918", "brygada-1918-latin-600-normal.woff", "Brygada", 600],
  ["@fontsource/brygada-1918", "brygada-1918-latin-ext-600-normal.woff", "Brygada Ext", 600],
  ["@fontsource/archivo", "archivo-latin-400-normal.woff", "Archivo", 400],
  ["@fontsource/archivo", "archivo-latin-ext-400-normal.woff", "Archivo Ext", 400],
  ["@fontsource/archivo", "archivo-latin-600-normal.woff", "Archivo SemiBold", 600],
  ["@fontsource/archivo", "archivo-latin-ext-600-normal.woff", "Archivo SemiBold Ext", 600],
] as const;

/**
 * Brygada 1918 600 and Archivo 400/600, latin + latin-ext woff from Fontsource (Satori reads
 * woff, not woff2). Read once per server process.
 */
export function ogFonts(): Promise<Font[]> {
  fontsPromise ??= Promise.all(
    FILES.map(([pkg, file, name, weight]) => fontFile(pkg, file).then((data): Font => ({ name, data, weight, style: "normal" }))),
  ).catch((error) => {
    fontsPromise = null; // try again on the next request
    throw error;
  });
  return fontsPromise;
}

const n = (v: number) => String(Math.round(v * 1000) / 1000);

/** The coin (app-icon art, §15) as an SVG document on the 64-unit grid. */
export function coinSvg(): string {
  const g = COIN.gradient;
  const stops = g.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join("");
  const beadEls = beads()
    .map((b) => `<circle cx="${n(b.cx)}" cy="${n(b.cy)}" r="${COIN.beads.r}"/>`)
    .join("");
  const h = COIN.hairline;
  const p = COIN.icon.p;
  const hl = COIN.p.highlight;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
    `<defs><radialGradient id="f" cx="${g.cx}" cy="${g.cy}" r="${g.r}">${stops}</radialGradient></defs>` +
    `<circle cx="32" cy="32" r="${COIN.face.r}" fill="url(#f)"/>` +
    `<g fill="${COIN.beads.fill}">${beadEls}</g>` +
    `<circle cx="32" cy="32" r="${h.r}" fill="none" stroke="${h.stroke}" stroke-width="${h.strokeWidth}"/>` +
    `<g fill-rule="evenodd" transform="${p.transform}">` +
    `<path d="${P_GLYPH}" transform="translate(${hl.dx} ${hl.dy})" fill="${hl.fill}" fill-opacity="${hl.fillOpacity}"/>` +
    `<path d="${P_GLYPH}" fill="${COIN.p.fill}"/>` +
    `</g></svg>`
  );
}

export function coinDataUri(): string {
  return `data:image/svg+xml;base64,${Buffer.from(coinSvg()).toString("base64")}`;
}
