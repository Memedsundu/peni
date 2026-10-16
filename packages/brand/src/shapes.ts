/**
 * Signature shapes (design-system.md §6): every path, every number, drawn once and rendered
 * by both platforms. Web renders with React DOM SVG; mobile with react-native-svg.
 *
 * Paint is never a literal colour here (except the fixed coin colours): elements carry a
 * token name (`"aski"`, `"ink"`, …) which each platform resolves — web with `cssVar(name)`
 * from `./tokens` (→ `var(--aski)`), mobile with `tokens[name]`. Attribute names are the
 * camelCase props both React DOM and react-native-svg accept, so an element can be spread:
 *
 *   web:    <path {...paintProps(el, cssVar)} />
 *   mobile: <Path {...paintProps(el, (n) => t[n])} />
 *
 * Every motif is decorative (`aria-hidden`) and always has real text beside it. Gradient and
 * path IDs MUST be unique per instance (`useId()`).
 */
import { coinColors, plateText } from "./tokens";
import type { TokenName } from "./tokens";

/* ========================================================================================== */
/* Primitive element data                                                                     */
/* ========================================================================================== */

export type Paint = TokenName | "none";

interface PaintAttrs {
  fill: Paint;
  fillOpacity?: number;
  fillRule?: "evenodd" | "nonzero";
  stroke?: TokenName;
  strokeOpacity?: number;
  strokeWidth?: number;
  strokeLinecap?: "round" | "butt" | "square";
  strokeLinejoin?: "round" | "miter" | "bevel";
}

export interface PathEl extends PaintAttrs {
  kind: "path";
  d: string;
}

export interface CircleEl extends PaintAttrs {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
}

export type ShapeEl = PathEl | CircleEl;

/** Props for a `<path>` / `<circle>` (DOM) or `<Path>` / `<Circle>` (react-native-svg). */
export type ElementProps = {
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  fill: string;
  fillOpacity?: number;
  fillRule?: "evenodd" | "nonzero";
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  strokeLinecap?: "round" | "butt" | "square";
  strokeLinejoin?: "round" | "miter" | "bevel";
};

/** Resolve an element's token paints into spreadable props. `kind` is dropped. */
export function paintProps(el: ShapeEl, resolve: (token: TokenName) => string): ElementProps {
  const { kind: _kind, fill, stroke, ...rest } = el;
  const props: ElementProps = { ...rest, fill: fill === "none" ? "none" : resolve(fill) };
  if (stroke) props.stroke = resolve(stroke);
  return props;
}

/* ========================================================================================== */
/* §6.7 Glyphs on the 24-grid                                                                 */
/* ========================================================================================== */

/** Shared stroke style for every 24-grid glyph. `stroke` is `currentColor`. */
export const GLYPH = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * Café devices. Used as the coin device (56/96), the cover pattern, and `DeviceGlyph`.
 * Picked by `cafeDevice(slug)` until the café chooses one.
 */
export const DEVICE = {
  cezve: "M8 9h7l1.6 9.8a1.8 1.8 0 0 1-1.8 2.2H8.2a1.8 1.8 0 0 1-1.8-2.2Z M8 9 6.5 7.5 M15.3 11 22 7.5",
  glass:
    "M7.5 2.5h9c0 4.4-2.8 6.2-2.8 9 0 2.5 2.8 3.9 2.8 7v1h-9v-1c0-3.1 2.8-4.5 2.8-7 0-2.8-2.8-4.6-2.8-9Z M4.5 21.5h15",
  fincan: "M4 8.5h12.5v4a5.5 5.5 0 0 1-5.5 5.5h-1.5A5.5 5.5 0 0 1 4 12.5Z M16.5 10h1.3a2.3 2.3 0 0 1 0 4.6h-1.6 M2.5 21h17",
} as const;

export type DeviceKind = keyof typeof DEVICE;

/** Hash order used by `cafeDevice(slug)` (§4.6). NEVER reorder. */
export const deviceOrder: readonly DeviceKind[] = ["cezve", "glass", "fincan"];

/** Askı legend icon: a rail with one hook. */
export const HOOK = "M3 3h18 M14 3v7a4 4 0 0 1-8 0v-1.5";

/** Peni masası icon: a long table with three chairs a side. */
export const TABLE =
  "M3 10.5h18v3H3Z M6 6.5a1.5 1.5 0 1 0 0 .01 M12 6.5a1.5 1.5 0 1 0 0 .01 M18 6.5a1.5 1.5 0 1 0 0 .01 M6 17.5a1.5 1.5 0 1 0 0 .01 M12 17.5a1.5 1.5 0 1 0 0 .01 M18 17.5a1.5 1.5 0 1 0 0 .01";

/** The printer's fist. At most once per screen, only on the "Neden peni?" link. */
export const MANICULE =
  "M2.5 9.5h3v6h-3z M5.5 10h3.2l1.6-1.8h10.2a1.4 1.4 0 0 1 0 2.8h-7.3 M13.2 11h1.6a1.3 1.3 0 0 1 0 2.6h-1.6 M12.8 13.6h1.4a1.3 1.3 0 0 1 0 2.6H9.5c-2.2 0-4-1-4-1";

/**
 * Simit on the 24-grid. §5 lists simit among the custom glyphs but §6.7 gives no path, so it
 * is drawn here in the same hand: ring r 8.5, hole r 3.25, five sesame strokes between them.
 */
export const SIMIT_GLYPH =
  "M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17Z M12 8.75a3.25 3.25 0 1 0 0 6.5a3.25 3.25 0 1 0 0-6.5Z M10.59 6.28l.79-.14 M17 8.89l.38.71 M16.5 15.79l-.56.58 M9.78 17.46l-.72-.35 M6.13 11.58l.11-.79";

/** Cüzdan tab icon: two rings and a stroked "p". */
export const COIN_GLYPH = {
  circles: [
    { cx: 12, cy: 12, r: 9, strokeWidth: 1.75 },
    { cx: 12, cy: 12, r: 6.5, strokeWidth: 1.25 },
  ],
  d: "M10.5 16.5V8.5 M10.5 9.2c.8-.6 1.7-.9 2.6-.9a2.6 2.6 0 0 1 0 5.2c-.9 0-1.8-.3-2.6-.9",
} as const;

/**
 * Inline "≈" (web only: the web font subsets lack U+2248, D23). Render as
 * `<svg viewBox width=".6em" height=".72em" aria-hidden className="inline-block align-[-.05em]">`
 * followed by `<span className="sr-only">yaklaşık </span>`.
 */
export const APPROX = {
  viewBox: "0 0 10 12",
  width: ".6em",
  height: ".72em",
  d: "M1 4.6c1.2-1 2.4-1 3.6 0s2.4 1 3.6 0M1 8.2c1.2-1 2.4-1 3.6 0s2.4 1 3.6 0",
  strokeWidth: 1.1,
  strokeLinecap: "round",
  srText: "yaklaşık ",
} as const;

/* ========================================================================================== */
/* §6.1 Peni jetonu (the coin)                                                                */
/* ========================================================================================== */

/** Brygada 1918 SemiBold "p", 30 units tall, centred at (32, 33) in the 64-unit coin. */
export const P_GLYPH =
  "M34.5 18Q37.1 18 39 19.2Q41 20.4 42.1 22.7Q43.3 24.9 43.3 28Q43.3 31 42.1 33.3Q41 35.6 39 36.9Q37.1 38.1 34.5 38.1Q32.1 38.1 30.5 37Q29 35.9 28.2 34.3V46.3L28.5 46.6H32.5V48H20.7V46.6H23.3L23.6 46.3V20.2L23.3 19.9H20.7V18.4Q21.8 18.4 23 18.4Q24.1 18.4 25.3 18.3Q26.5 18.2 27.6 18.1L27.8 18.4V21.8H28.2Q29 20.3 30.6 19.2Q32.2 18 34.5 18ZM33.6 36.1Q35.6 36.1 36.9 34.3Q38.3 32.5 38.3 28.5Q38.3 24.4 36.9 22.2Q35.6 20 33.6 20Q32.2 20 30.7 21.1Q29.3 22.2 28.2 24.8V31.3Q29.3 34 30.7 35Q32.2 36.1 33.6 36.1Z";

export type CoinSize = 16 | 28 | 56 | 96;

/** A uniform scale about an origin, as SVG transform numbers: `translate(tx ty) scale(s)`. */
export interface ScaleAbout {
  scale: number;
  tx: number;
  ty: number;
  /** The same transform as an SVG attribute string. */
  transform: string;
}

/** `scale(s)` about `(ox, oy)` → `translate(ox(1−s) oy(1−s)) scale(s)`. */
export function scaleAbout(s: number, ox: number, oy: number): ScaleAbout {
  const tx = round(ox * (1 - s));
  const ty = round(oy * (1 - s));
  return { scale: s, tx, ty, transform: `translate(${tx} ${ty}) scale(${s})` };
}

/**
 * Every number the coin needs, on the 64-unit viewBox, at every size. Colours are the fixed
 * coin colours (§3.1); the coin looks the same in both themes except `darkRing`.
 */
export const COIN = {
  viewBox: "0 0 64 64",
  colors: coinColors,
  /** `<radialGradient id="{id}-face" cx="38%" cy="32%" r="75%">` with three stops. */
  gradient: {
    cx: "38%",
    cy: "32%",
    r: "75%",
    stops: [
      { offset: 0, color: coinColors.face[0] },
      { offset: 0.45, color: coinColors.face[1] },
      { offset: 1, color: coinColors.face[2] },
    ],
  },
  face: { cx: 32, cy: 32, r: 31 },
  /** Dark theme only: `<circle r="31.5" fill="none" stroke="#F2EADC" stroke-opacity=".12"/>`. */
  darkRing: { cx: 32, cy: 32, r: 31.5, stroke: coinColors.darkRing, strokeOpacity: 0.12, strokeWidth: 1 },
  /** ≥28: 36 beads (`beads()`), r 1.15, on a ring of r 28.5. */
  beads: { count: 36, ringR: 28.5, r: 1.15, fill: coinColors.bead },
  /** 28 and 56: the hairline inside the beads. At 96 the band replaces it. */
  hairline: { cx: 32, cy: 32, r: 26.25, stroke: coinColors.bead, strokeWidth: 0.75 },
  /** Embossed "p" (16, 28, generic): highlight path offset up-left, then the shadow-colour path. */
  p: {
    d: P_GLYPH,
    highlight: { fill: coinColors.highlight, fillOpacity: 0.6, dx: -0.5, dy: -0.5 },
    fill: coinColors.emboss,
    fillRule: "evenodd",
    /** Glyph box centre. */
    center: { x: 32, y: 33 },
  },
  /** 56 / 96: the café device as an emboss stroke. */
  device: {
    strokeWidth: 2.2,
    stroke: coinColors.emboss,
    highlight: { stroke: coinColors.highlight, strokeOpacity: 0.6, dx: -0.6, dy: -0.6 },
    at56: { tx: 23, ty: 12, scale: 0.75, transform: "translate(23 12) scale(.75)" },
    at96: { tx: 25, ty: 15, scale: 0.58, transform: "translate(25 15) scale(.58)" },
  },
  /** 56 / 96: the initials triad, "M" over "K · İ". */
  initials: {
    fill: coinColors.emboss,
    top: { fontFamily: "display", fontWeight: 600 },
    bottom: { fontFamily: "sans", fontWeight: 600, letterSpacing: 0.6 },
    at56: { topY: 42.5, topSize: 9, bottomY: 50, bottomSize: 5.5 },
    at96: { topY: 37.5, topSize: 7, bottomY: 43.5, bottomSize: 4.5 },
  },
  /** 96 only: the flat legend band (r 19–25.5) and its two hairlines. */
  band: {
    ring: { cx: 32, cy: 32, r: 22.25, stroke: coinColors.band, strokeWidth: 6.5 },
    outer: { cx: 32, cy: 32, r: 25.6, stroke: coinColors.bead, strokeWidth: 0.6 },
    inner: { cx: 32, cy: 32, r: 18.9, stroke: coinColors.bead, strokeWidth: 0.6 },
  },
  /** 96 only: the rim legend on a circle of r 21.2, centred at the top (startOffset 25%). */
  rim: {
    d: "M10.8 32a21.2 21.2 0 1 1 42.4 0a21.2 21.2 0 1 1-42.4 0",
    startOffset: "25%",
    fontSize: 5,
    letterSpacing: 0.45,
    fontStretch: "75%",
    fontWeight: 600,
    fill: coinColors.legend,
    /** Longer legends drop the district, then truncate with "…" (see `coinLegend`). */
    maxChars: 30,
  },
  /** Back face (only seen during the flip): value over "PENİ". */
  back: {
    value: { x: 32, y: 36, fontSize: 20, fontFamily: "display", fontWeight: 600, fallback: "1" },
    label: { x: 32, y: 46, fontSize: 6, fontFamily: "sans", fontStretch: "75%", fontWeight: 600, letterSpacing: 1.2, text: "PENİ" },
    fill: coinColors.emboss,
  },
  /** Generic coin (sign-in, app icon, cafés without data): 96 layout, this legend, no device. */
  generic: {
    legend: "PENİ · MAHALLENİN MASASI",
    /** The "p" in the centre at scale(.8) about (32, 30). */
    p: scaleAbout(0.8, 32, 30),
  },
  /** App icon art (§15): the generic coin without the band/legend, "p" ×1.15 about its centre. */
  icon: {
    p: scaleAbout(1.15, 32, 33),
  },
} as const;

/** Which coin layers to draw at each size (§6.1 table). */
export interface CoinLayers {
  beads: boolean;
  hairline: boolean;
  p: boolean;
  device: boolean;
  initials: boolean;
  band: boolean;
  legend: boolean;
  /** Transform for the "p" layer, or null for none. */
  pTransform: ScaleAbout | null;
  /** Device transform (56/96), or null. */
  deviceTransform: { tx: number; ty: number; scale: number; transform: string } | null;
  /** Initials geometry (56/96), or null. */
  initialsAt: { topY: number; topSize: number; bottomY: number; bottomSize: number } | null;
}

/**
 * Layers for `<Coin size>`. `generic` is the café-less 96 coin (sign-in, Peni kodum without a
 * café): band + generic legend + centred "p", no device or initials.
 */
export function coinLayers(size: CoinSize, opts: { generic?: boolean; face?: "front" | "back" } = {}): CoinLayers {
  const back = opts.face === "back";
  const generic = Boolean(opts.generic) && !back;
  const big = size >= 96;
  const mid = size >= 56;
  const identity = scaleAbout(1, 32, 33);
  if (back) {
    return {
      beads: size >= 28,
      hairline: size >= 28,
      p: false,
      device: false,
      initials: false,
      band: false,
      legend: false,
      pTransform: null,
      deviceTransform: null,
      initialsAt: null,
    };
  }
  if (generic) {
    return {
      beads: size >= 28,
      hairline: size >= 28 && !big,
      p: true,
      device: false,
      initials: false,
      band: big,
      legend: big,
      pTransform: big ? COIN.generic.p : identity,
      deviceTransform: null,
      initialsAt: null,
    };
  }
  return {
    beads: size >= 28,
    hairline: size >= 28 && !big,
    p: !mid,
    device: mid,
    initials: mid,
    band: big,
    legend: big,
    pTransform: mid ? null : identity,
    deviceTransform: big ? COIN.device.at96 : mid ? COIN.device.at56 : null,
    initialsAt: big ? COIN.initials.at96 : mid ? COIN.initials.at56 : null,
  };
}

/** Bead centres: `(c + r·cos(i·360°/n), c + r·sin(i·360°/n))` for i = 0…n−1. Default: 36 on r 28.5. */
export function beads(n: number = COIN.beads.count, r: number = COIN.beads.ringR, c = 32): { cx: number; cy: number }[] {
  const out: { cx: number; cy: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    out.push({ cx: round(c + r * Math.cos(a)), cy: round(c + r * Math.sin(a)) });
  }
  return out;
}

/* ========================================================================================== */
/* §6.2 Askı rafı (the hook rail)                                                             */
/* ========================================================================================== */

export type ItemKind = "glass" | "fincan" | "simit";

export interface ItemShape {
  /** Translate applied to the whole item, in pivot coordinates (simit hangs by its hole). */
  offsetY: number;
  /** Draw the hook AFTER the item so it reads as passing through it (simit). */
  hookOnTop: boolean;
  /** Vertical extent incl. stroke, in pivot coordinates after `offsetY` (for mobile item Svgs). */
  bounds: { top: number; bottom: number; left: number; right: number };
  els: readonly ShapeEl[];
}

/**
 * The askı items, anchored with their top-centre at the hook pivot (`translate(cx 17)`).
 * The glyph must match the caption: "7 çay" is drawn as tea glasses (`askiItemFor`).
 */
export const ITEM: Record<ItemKind, ItemShape> = {
  /** İnce belli çay bardağı on its saucer. */
  glass: {
    offsetY: 0,
    hookOnTop: false,
    bounds: { top: -0.7, bottom: 20.2, left: -7.2, right: 7.2 },
    els: [
      {
        kind: "path",
        d: "M-4.5 0h9c0 4.4-2.8 6.2-2.8 9 0 2.5 2.8 3.9 2.8 7v1h-9v-1c0-3.1 2.8-4.5 2.8-7 0-2.8-2.8-4.6-2.8-9Z",
        fill: "aski",
        stroke: "ink",
        strokeWidth: 1.25,
        strokeLinejoin: "round",
      },
      { kind: "path", d: "M-6.5 19.5h13", fill: "none", stroke: "ink", strokeWidth: 1.25, strokeLinecap: "round" },
      {
        kind: "path",
        d: "M-2.6 2.2v4",
        fill: "none",
        stroke: "onAski",
        strokeOpacity: 0.5,
        strokeWidth: 1,
        strokeLinecap: "round",
      },
    ],
  },
  /** Kahve fincanı with its handle and saucer. */
  fincan: {
    offsetY: 0,
    hookOnTop: false,
    bounds: { top: -0.7, bottom: 12.7, left: -9.7, right: 9.8 },
    els: [
      {
        kind: "path",
        d: "M-7 0h12.5v4a5.5 5.5 0 0 1-5.5 5.5h-1.5A5.5 5.5 0 0 1-7 4Z",
        fill: "aski",
        stroke: "ink",
        strokeWidth: 1.25,
        strokeLinejoin: "round",
      },
      {
        kind: "path",
        d: "M5.5 1.2h1.3a2.3 2.3 0 0 1 0 4.6H5.3M-9 12h16.5",
        fill: "none",
        stroke: "ink",
        strokeWidth: 1.25,
        strokeLinecap: "round",
      },
    ],
  },
  /** Simit, hung through its hole: translated (0, −4.5) so the hole's top sits on the pivot. */
  simit: {
    offsetY: -4.5,
    hookOnTop: true,
    bounds: { top: -5.2, bottom: 12.2, left: -8.7, right: 8.7 },
    els: [
      {
        kind: "path",
        d: "M0 0a8 8 0 1 1 0 16A8 8 0 0 1 0 0Zm0 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
        fill: "aski",
        fillRule: "evenodd",
        stroke: "ink",
        strokeWidth: 1.25,
      },
      { kind: "circle", cx: 4.98, cy: 5.13, r: 0.7, fill: "onAski", fillOpacity: 0.7 },
      { kind: "circle", cx: -4.98, cy: 5.13, r: 0.7, fill: "onAski", fillOpacity: 0.7 },
      { kind: "circle", cx: 4.98, cy: 10.88, r: 0.7, fill: "onAski", fillOpacity: 0.7 },
      { kind: "circle", cx: -4.98, cy: 10.88, r: 0.7, fill: "onAski", fillOpacity: 0.7 },
      { kind: "circle", cx: 0, cy: 2.25, r: 0.7, fill: "onAski", fillOpacity: 0.7 },
      { kind: "circle", cx: 0, cy: 13.75, r: 0.7, fill: "onAski", fillOpacity: 0.7 },
    ],
  },
};

/**
 * Item for a reference name: a name containing "çay" → glass, "simit" → simit, anything else
 * (and no name) → fincan.
 */
export function askiItemFor(referenceItemName: string | null | undefined): ItemKind {
  const n = (referenceItemName ?? "").replace(/I/g, "ı").replace(/İ/g, "i").toLocaleLowerCase("tr");
  if (n.includes("çay")) return "glass";
  if (n.includes("simit")) return "simit";
  return "fincan";
}

/** The "+N" tag that replaces the last slot when the pool holds more than the rail shows. */
export const RAIL_TAG = {
  /** Applied inside the slot's `translate(cx 17)`. */
  transform: "translate(0 2) rotate(-4)",
  translateY: 2,
  rotate: -4,
  rect: { x: -10, y: 0, width: 20, height: 14, rx: 3, fill: "surface", stroke: "ink", strokeWidth: 1.25 },
  text: { x: 0, y: 10.2, fontSize: 9, fontWeight: 600, fill: "ink", textAnchor: "middle", tabularNums: true },
} as const;

/** One hook's path for the slot centred at `cx`. Its pivot (lowest point of the curl) is `(cx, 17)`. */
export function hookPath(cx: number): string {
  return `M${round(cx + 4)} 6v7a4 4 0 0 1-8 0v-1.5`;
}

export const HOOK_STROKE = { stroke: "hook", strokeWidth: 1.5, strokeLinecap: "round", fill: "none" } as const;

export type RailSize = "sm" | "md";

export interface RailLayout {
  size: RailSize;
  /** Slot count. */
  slots: number;
  /** Slot pitch in user units (always the md geometry: 28). */
  pitch: number;
  /** Slot pitch as rendered (md 28, sm 21). Mobile: `left = i·pxPitch`. */
  pxPitch: number;
  /** Rail width W = slots × pitch, user units. */
  width: number;
  /** Height H in user units (40). */
  height: number;
  /** Render scale (md 1, sm .75). */
  scale: number;
  /** Rendered size in px / pt. */
  pxWidth: number;
  pxHeight: number;
  viewBox: string;
  /** Hook pivot y (items hang from here), user units. */
  pivotY: number;
  /** Slot centres, user units. */
  cx: number[];
  rail: { x: number; y: number; width: number; height: number; rx: number };
  finials: { cx: number; cy: number; r: number }[];
  /** One hook path per slot. */
  hooks: string[];
  /** Items drawn from the left (`count` given), and the "+N" tag in the last slot, if any. */
  items: number;
  tag: { slot: number; n: number; label: string } | null;
}

const RAIL_PITCH = 28;
const RAIL_HEIGHT = 40;
const RAIL_PIVOT = 17;

/**
 * Rail geometry. md: `min(12, floor(width/28))` slots; sm: 6 slots at .75 scale. `maxSlots`
 * caps either (the take sheet's mini rail is md with 6). With `count`, `items`/`tag` follow
 * the fill rule: `drawn = min(count, slots)`; above `slots` the last slot is "+N" with
 * N = count − slots + 1. Empty hooks stay drawn ("waiting", not "broken").
 */
export function railLayout(width: number, size: RailSize, opts: { maxSlots?: number; count?: number } = {}): RailLayout {
  const scale = size === "sm" ? 0.75 : 1;
  let slots = size === "sm" ? 6 : Math.min(12, Math.floor(Math.max(0, width) / RAIL_PITCH));
  if (opts.maxSlots !== undefined) slots = Math.min(slots, Math.floor(opts.maxSlots));
  slots = Math.max(1, slots);
  const W = slots * RAIL_PITCH;
  const cx = Array.from({ length: slots }, (_, i) => RAIL_PITCH / 2 + i * RAIL_PITCH);
  const count = Math.max(0, Math.floor(opts.count ?? 0));
  const over = count > slots;
  return {
    size,
    slots,
    pitch: RAIL_PITCH,
    pxPitch: RAIL_PITCH * scale,
    width: W,
    height: RAIL_HEIGHT,
    scale,
    pxWidth: W * scale,
    pxHeight: RAIL_HEIGHT * scale,
    viewBox: `0 0 ${W} ${RAIL_HEIGHT}`,
    pivotY: RAIL_PIVOT,
    cx,
    rail: { x: 1, y: 3, width: W - 2, height: 3, rx: 1.5 },
    finials: [
      { cx: 2.5, cy: 4.5, r: 2.5 },
      { cx: W - 2.5, cy: 4.5, r: 2.5 },
    ],
    hooks: cx.map(hookPath),
    items: over ? slots - 1 : count,
    tag: over ? { slot: slots - 1, n: count - slots + 1, label: `+${count - slots + 1}` } : null,
  };
}

/**
 * viewBox for one item's own Svg on mobile (one `Animated.View` per item, `top = 17 + top`):
 * `{-p/2} {top} {p} {height}`, covering the item's bounds (glass and fincan: `0 … 24`, as in
 * §6.2; simit starts 6 units above the pivot because it hangs by its hole).
 *
 * For `hookOnTop` items (simit) the hook must stay in front of the item but must NEVER move
 * with it ("the hook never sways"): draw those slots' hooks in a static foreground Svg above
 * the animated item views, never inside them.
 */
export function itemViewBox(kind: ItemKind, pitch = RAIL_PITCH): { viewBox: string; top: number; height: number } {
  const b = ITEM[kind].bounds;
  const top = Math.min(0, Math.floor(b.top));
  const height = Math.max(24, Math.ceil(b.bottom - top));
  return { viewBox: `${-pitch / 2} ${top} ${pitch} ${height}`, top, height };
}

/* ========================================================================================== */
/* §6.3 Fiş scallop                                                                           */
/* ========================================================================================== */

export const SCALLOP = { r: 6, pitch: 16, height: 6 } as const;

/**
 * Scallop circles for the mobile fiş's bottom edge: a 6pt-tall Svg with circles of r 6 at
 * cy 6, filled with the colour BEHIND the fiş (`bg`). Default `align: "center"` puts a circle
 * at the centre, matching the web mask's `50%` position so both platforms bite the same way;
 * `align: "start"` gives the literal `cx = 8 + 16i`.
 */
export function scallopCircles(
  width: number,
  opts: { align?: "center" | "start" } = {},
): { height: number; r: number; cy: number; circles: { cx: number; cy: number; r: number }[] } {
  const { r, pitch, height } = SCALLOP;
  const w = Math.max(0, width);
  const circles: { cx: number; cy: number; r: number }[] = [];
  if (opts.align === "start") {
    for (let cx = pitch / 2; cx - r < w; cx += pitch) circles.push({ cx: round(cx), cy: height, r });
  } else {
    const mid = w / 2;
    const k = Math.ceil((mid + r) / pitch);
    for (let i = -k; i <= k; i++) {
      const cx = mid + i * pitch;
      if (cx + r > 0 && cx - r < w) circles.push({ cx: round(cx), cy: height, r });
    }
  }
  return { height, r, cy: height, circles };
}

/* ========================================================================================== */
/* §6.4 Café cover pattern                                                                    */
/* ========================================================================================== */

/** The deterministic cover: a 56-unit tile with the café device twice, cream at 16%. */
export const COVER_PATTERN = {
  size: 56,
  offsets: [
    { x: 4, y: 4, transform: "translate(4 4)" },
    { x: 32, y: 32, transform: "translate(32 32)" },
  ],
  stroke: plateText,
  strokeOpacity: 0.16,
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/* ========================================================================================== */
/* §6.5 Uzun masa (long table)                                                                */
/* ========================================================================================== */

export interface LongTableSeat {
  /** Initials, only when the member's profile is visible; null draws a plain taken chair. */
  initials?: string | null;
  me?: boolean;
}

export interface LongTableChair {
  /** Fill order: T0, B0, T1, B1, … */
  order: number;
  row: "top" | "bottom";
  col: number;
  cx: number;
  cy: number;
  /** taken: `masa` fill; me: `masa` + 2px `ink` ring r 14.5; empty: `surface` + 1.5px `lineStrong`; more: "+N" label. */
  state: "taken" | "me" | "empty" | "more";
  initials: string | null;
  /** "+N" for the `more` chair. */
  label: string | null;
}

export interface LongTableLayout {
  drawn: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  viewBox: string;
  table: { x: number; y: number; width: number; height: number; rx: number; fill: "surface2"; stroke: "lineStrong"; strokeWidth: number };
  chairR: number;
  meRing: { r: number; stroke: "ink"; strokeWidth: number };
  emptyStroke: { stroke: "lineStrong"; strokeWidth: number };
  /** Initials and "+N": Archivo 600, 11 units, baseline at cy + 4. */
  text: { fontSize: number; fontWeight: number; dy: number; fill: "onMasa"; moreFill: "ink2" };
  chairs: LongTableChair[];
}

const TABLE_PITCH = 32;
const TABLE_MAX = 16;

/**
 * Long-table geometry: `drawn = min(capacity, 16)`, `top = ceil(drawn/2)`, `bottom = drawn − top`,
 * `W = 16 + top×32`, viewBox `0 0 W 92`. Seats fill T0, B0, T1, B1, … from the left in the
 * order given. Above 16 chairs the last bottom chair becomes "+N" (N = chairs not drawn + 1).
 * "Me" is always kept visible. Declines are never drawn.
 */
export function longTableLayout(capacity: number, seats: readonly LongTableSeat[]): LongTableLayout {
  const cap = Math.max(0, Math.floor(capacity));
  const drawn = Math.min(cap, TABLE_MAX);
  const top = Math.ceil(drawn / 2);
  const bottom = drawn - top;
  const W = 16 + top * TABLE_PITCH;
  const overflow = cap > TABLE_MAX;
  const visible = overflow ? drawn - 1 : drawn;

  const taken = seats.slice(0, Math.min(seats.length, cap));
  const shown = taken.slice(0, visible);
  const meIdx = taken.findIndex((s) => s.me);
  if (meIdx >= visible && visible > 0) shown[visible - 1] = taken[meIdx]!;

  const chairs: LongTableChair[] = [];
  for (let k = 0; k < drawn; k++) {
    const row = k % 2 === 0 ? "top" : "bottom";
    const col = Math.floor(k / 2);
    const cx = 24 + col * TABLE_PITCH;
    const cy = row === "top" ? 14 : 78;
    if (overflow && k === drawn - 1) {
      chairs.push({ order: k, row, col, cx, cy, state: "more", initials: null, label: `+${cap - visible}` });
      continue;
    }
    const seat = shown[k];
    chairs.push({
      order: k,
      row,
      col,
      cx,
      cy,
      state: seat ? (seat.me ? "me" : "taken") : "empty",
      initials: seat?.initials ? seat.initials : null,
      label: null,
    });
  }

  return {
    drawn,
    top,
    bottom,
    width: W,
    height: 92,
    viewBox: `0 0 ${W} 92`,
    table: { x: 8, y: 30, width: W - 16, height: 32, rx: 8, fill: "surface2", stroke: "lineStrong", strokeWidth: 1.5 },
    chairR: 12,
    meRing: { r: 14.5, stroke: "ink", strokeWidth: 2 },
    emptyStroke: { stroke: "lineStrong", strokeWidth: 1.5 },
    text: { fontSize: 11, fontWeight: 600, dy: 4, fill: "onMasa", moreFill: "ink2" },
    chairs,
  };
}

/* ========================================================================================== */

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
