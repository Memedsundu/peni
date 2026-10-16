/**
 * Coin artwork as SVG strings, built from src/shapes.ts (§6.1, §15). Used by make-assets.ts
 * for the app icons, splash and favicons. Pure string building: no DOM, no React.
 */
import { beads, COIN, P_GLYPH } from "../src/shapes.ts";
import type { ScaleAbout } from "../src/shapes.ts";

/** How the coin is painted. */
export type CoinPaint =
  /** Full copper, as in the UI. */
  | "color"
  /** iOS tinted mode: one luminance layer. Face white, beads / hairline / "p" black at 60%. */
  | "tinted"
  /** Android themed icon: outline, beads and "p" in black on transparent. */
  | "monochrome";

export interface CoinArtOptions {
  paint?: CoinPaint;
  /**
   * The dark-theme cream ring at r 31.5: `true` always draws it; `"media"` draws it only under
   * `prefers-color-scheme: dark` (for SVG favicons; needs the `.ring` style in the document).
   */
  darkRing?: boolean | "media";
  /** Transform for the embossed "p" (16/28 layout: identity; app icon: ×1.15). */
  p?: ScaleAbout | null;
  /** Unique id prefix for the gradient. */
  id?: string;
}

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString().replace(/^(-?)0\./, "$1.");
};

function gradient(id: string): string {
  const g = COIN.gradient;
  const stops = g.stops.map((s) => `<stop offset="${n(s.offset)}" stop-color="${s.color}"/>`).join("");
  return `<radialGradient id="${id}" cx="${g.cx}" cy="${g.cy}" r="${g.r}">${stops}</radialGradient>`;
}

function beadCircles(fill: string): string {
  const r = n(COIN.beads.r);
  return `<g fill="${fill}">${beads()
    .map((b) => `<circle cx="${n(b.cx)}" cy="${n(b.cy)}" r="${r}"/>`)
    .join("")}</g>`;
}

function hairline(stroke: string): string {
  const h = COIN.hairline;
  return `<circle cx="32" cy="32" r="${n(h.r)}" fill="none" stroke="${stroke}" stroke-width="${n(h.strokeWidth)}"/>`;
}

function pGroup(inner: string, p: ScaleAbout | null | undefined): string {
  const t = p && (p.scale !== 1 || p.tx !== 0 || p.ty !== 0) ? ` transform="${p.transform}"` : "";
  return `<g fill-rule="evenodd"${t}>${inner}</g>`;
}

/**
 * The 28 layout (face + 36 beads + hairline + embossed "p"), on the 64-unit grid. This is the
 * art of the favicon and, with `p: COIN.icon.p`, of every app icon (the generic 96 coin without
 * its legend band, §15).
 */
export function coinArt(opts: CoinArtOptions = {}): string {
  const paint = opts.paint ?? "color";
  const id = opts.id ?? "face";
  const { cx, cy, r } = COIN.face;
  const parts: string[] = [];

  if (paint === "color") {
    parts.push(`<defs>${gradient(id)}</defs>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`);
    if (opts.darkRing) {
      const d = COIN.darkRing;
      const media = opts.darkRing === "media";
      parts.push(
        `<circle${media ? ' class="ring"' : ""} cx="32" cy="32" r="${n(d.r)}" fill="none" stroke="${d.stroke}" stroke-opacity="${media ? 0 : n(d.strokeOpacity)}"/>`,
      );
    }
    parts.push(beadCircles(COIN.beads.fill));
    parts.push(hairline(COIN.hairline.stroke));
    const hl = COIN.p.highlight;
    parts.push(
      pGroup(
        `<path d="${P_GLYPH}" transform="translate(${n(hl.dx)} ${n(hl.dy)})" fill="${hl.fill}" fill-opacity="${n(hl.fillOpacity)}"/>` +
          `<path d="${P_GLYPH}" fill="${COIN.p.fill}"/>`,
        opts.p,
      ),
    );
  } else if (paint === "tinted") {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF"/>`);
    parts.push(
      `<g opacity=".6">${beadCircles("#000000")}${hairline("#000000")}${pGroup(`<path d="${P_GLYPH}" fill="#000000"/>`, opts.p)}</g>`,
    );
  } else {
    // Monochrome: the outline sits inside the face edge so the silhouette keeps r 31.
    parts.push(`<circle cx="${cx}" cy="${cy}" r="30.5" fill="none" stroke="#000000" stroke-width="1"/>`);
    parts.push(beadCircles("#000000"));
    parts.push(pGroup(`<path d="${P_GLYPH}" fill="#000000"/>`, opts.p));
  }
  return parts.join("");
}

/**
 * A square SVG document of `size` px with the coin centred at `coinDiameter` px (the face,
 * r 31 → 62 units, is what is measured), on an optional opaque background.
 */
export function coinDocument(opts: { size: number; coinDiameter: number; background?: string | null; art: string }): string {
  const { size, coinDiameter, background, art } = opts;
  const s = coinDiameter / (COIN.face.r * 2);
  const half = size / 2;
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    bg +
    `<g transform="translate(${n(half)} ${n(half)}) scale(${n(s)}) translate(-32 -32)">${art}</g>` +
    `</svg>`
  );
}

/**
 * apps/web/src/app/icon.svg: the 28-layout coin with the Brygada "p" (P_GLYPH), and the
 * dark-theme ring shown only when the browser chrome is dark.
 */
export function faviconSvg(): string {
  const art = coinArt({ id: "f", darkRing: "media" });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<style>@media (prefers-color-scheme:dark){.ring{stroke-opacity:${n(COIN.darkRing.strokeOpacity)}}}</style>` +
    art +
    `</svg>\n`
  );
}
