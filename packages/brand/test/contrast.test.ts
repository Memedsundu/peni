/**
 * §3.3 / §3.4: recompute every verified-contrast row from tokens.ts and fail the build if any
 * pair drops below its minimum (text ≥ 4.5:1, non-text ≥ 3:1). Any token change must keep
 * this test green. Each row also carries the ratio published in design-system.md, so a token
 * that silently drifts from the spec (or a spec table that is not updated) is caught too.
 */
import { describe, expect, it } from "vitest";
import { cafeHues, coinColors, dark, light, plateText, plateText2 } from "../src/tokens";
import type { TokenName, Tokens } from "../src/tokens";

/* WCAG 2.x relative luminance, exactly as §3.4 writes it. */
function channel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* OKLab (Björn Ottosson), for the hue-separation table. */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(channel) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function deltaE(a: string, b: string): number {
  const x = oklab(a);
  const y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
function hueAngle(hex: string): number {
  const [, a, b] = oklab(hex);
  const d = (Math.atan2(b, a) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}
function deltaHue(a: string, b: string): number {
  const d = Math.abs(hueAngle(a) - hueAngle(b));
  return d > 180 ? 360 - d : d;
}

type Row = [fg: TokenName, bg: TokenName, lightRatio: number, darkRatio: number];

/** §3.3 "Text (≥ 4.5:1)", token rows. */
const TEXT: Row[] = [
  ["ink", "bg", 15.24, 15.75],
  ["ink", "surface", 17.07, 14.59],
  ["ink", "surface2", 13.57, 13.12],
  ["ink", "peniSoft", 13.73, 11.96],
  ["ink", "askiSoft", 14.02, 11.67],
  ["ink", "masaSoft", 13.84, 12.83],
  ["ink", "successSoft", 14.15, 11.6],
  ["ink", "warningSoft", 13.98, 11.37],
  ["ink", "dangerSoft", 13.6, 12.59],
  ["ink2", "bg", 6.77, 8.77],
  ["ink2", "surface", 7.58, 8.12],
  ["ink2", "surface2", 6.02, 7.31],
  ["ink2", "peniSoft", 6.1, 6.66],
  ["ink2", "askiSoft", 6.23, 6.5],
  ["ink2", "masaSoft", 6.14, 7.14],
  ["ink2", "warningSoft", 6.21, 6.33],
  ["onPrimary", "primary", 17.07, 15.75],
  ["onPrimary", "primaryPressed", 12.19, 12.32],
  ["onPeni", "peni", 5.45, 7.81],
  ["peniInk", "bg", 5.8, 9.0],
  ["peniInk", "surface", 6.5, 8.34],
  ["peniInk", "surface2", 5.17, 7.5],
  ["peniInk", "peniSoft", 5.23, 6.83],
  ["onAski", "aski", 6.47, 9.1],
  ["onAski", "askiPressed", 7.77, 7.16],
  ["askiInk", "bg", 6.85, 10.14],
  ["askiInk", "surface", 7.67, 9.39],
  ["askiInk", "askiSoft", 6.3, 7.52],
  ["onMasa", "masa", 9.12, 9.22],
  ["masaInk", "bg", 8.14, 10.07],
  ["masaInk", "surface", 9.12, 9.33],
  ["masaInk", "masaSoft", 7.39, 8.2],
  ["onSuccess", "success", 6.48, 8.82],
  ["onSuccess2", "success", 5.35, 6.4],
  ["successInk", "bg", 6.18, 10.65],
  ["successInk", "surface", 6.92, 9.87],
  ["successInk", "successSoft", 5.73, 7.84],
  ["danger", "bg", 6.15, 8.27],
  ["danger", "surface", 6.89, 7.66],
  ["danger", "dangerSoft", 5.48, 6.61],
  ["warningInk", "bg", 5.99, 10.6],
  ["warningInk", "surface", 6.71, 9.82],
  ["warningInk", "warningSoft", 5.49, 7.65],
  ["onPress", "press", 14.74, 14.74],
  ["onPress2", "press", 8.21, 8.21],
];

/** §3.3 "Non-text (≥ 3:1)", token rows (focus rows included). */
const NON_TEXT: Row[] = [
  ["lineStrong", "bg", 3.56, 3.72],
  ["lineStrong", "surface", 3.98, 3.44],
  ["lineStrong", "surface2", 3.17, 3.1],
  ["hook", "bg", 5.13, 5.94],
  ["hook", "surface", 5.74, 5.51],
  ["hook", "surface2", 4.56, 4.95],
  ["hook", "askiSoft", 4.72, 4.41],
  ["aski", "surface", 6.47, 8.43],
  ["aski", "askiSoft", 5.31, 6.74],
  ["masa", "surface", 9.12, 8.54],
  ["masa", "masaSoft", 7.39, 7.51],
  ["peni", "surface", 5.28, 7.23],
  ["warning", "surface", 4.59, 9.82],
  ["success", "surface", 6.28, 8.98],
  ["focus", "bg", 15.24, 15.75],
  ["focus", "surface", 17.07, 14.59],
  ["focus", "surface2", 13.57, 13.12],
  ["focus", "peniSoft", 13.73, 11.96],
  ["focus", "askiSoft", 14.02, 11.67],
  ["focus", "masaSoft", 13.84, 12.83],
  ["focus", "warningSoft", 13.98, 11.37],
  // D2: coloured containers redefine --focus to their own on-colour.
  ["onSuccess", "success", 6.48, 8.82],
  ["onPress", "press", 14.74, 14.74],
];

const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;
/** Published ratios are rounded to two decimals. */
const PUBLISHED_TOLERANCE = 0.0051;

const themes: [name: "light" | "dark", t: Tokens, index: 2 | 3][] = [
  ["light", light, 2],
  ["dark", dark, 3],
];

function checkRows(rows: Row[], min: number) {
  for (const [name, t, index] of themes) {
    describe(name, () => {
      for (const row of rows) {
        const [fg, bg] = row;
        const published = row[index];
        it(`${fg} / ${bg}: ${t[fg]} on ${t[bg]} ≥ ${min} (published ${published.toFixed(2)})`, () => {
          const ratio = contrast(t[fg], t[bg]);
          expect(ratio).toBeGreaterThanOrEqual(min);
          expect(Math.abs(ratio - published)).toBeLessThan(PUBLISHED_TOLERANCE);
        });
      }
    });
  }
}

describe("§3.3 text pairs (≥ 4.5:1)", () => {
  checkRows(TEXT, TEXT_MIN);

  describe("café colourways (same in both themes)", () => {
    const cream: Record<keyof typeof cafeHues, number> = { zeytin: 8.72, lacivert: 12.42, murekkep: 14.36, patlican: 12.16 };
    const cream2: Record<keyof typeof cafeHues, number> = { zeytin: 6.66, lacivert: 9.49, murekkep: 10.97, patlican: 9.29 };
    for (const hue of Object.keys(cafeHues) as (keyof typeof cafeHues)[]) {
      it(`plateText ${plateText} on ${hue} ${cafeHues[hue]}`, () => {
        const ratio = contrast(plateText, cafeHues[hue]);
        expect(ratio).toBeGreaterThanOrEqual(TEXT_MIN);
        expect(Math.abs(ratio - cream[hue])).toBeLessThan(PUBLISHED_TOLERANCE);
      });
      it(`plateText2 ${plateText2} on ${hue} ${cafeHues[hue]}`, () => {
        const ratio = contrast(plateText2, cafeHues[hue]);
        expect(ratio).toBeGreaterThanOrEqual(TEXT_MIN);
        expect(Math.abs(ratio - cream2[hue])).toBeLessThan(PUBLISHED_TOLERANCE);
      });
    }
  });
});

describe("§3.3 non-text pairs (≥ 3:1)", () => {
  checkRows(NON_TEXT, NON_TEXT_MIN);
});

describe("§3.3 coin (decorative)", () => {
  it("rim legend on the flat band is 4.86:1 (text minimum, although aria-hidden)", () => {
    const ratio = contrast(coinColors.legend, coinColors.band);
    expect(ratio).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(Math.abs(ratio - 4.86)).toBeLessThan(PUBLISHED_TOLERANCE);
  });
  it('embossed "p" on the mid face is 4.16:1', () => {
    const ratio = contrast(coinColors.emboss, coinColors.face[1]);
    expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    expect(Math.abs(ratio - 4.16)).toBeLessThan(PUBLISHED_TOLERANCE);
  });
  it("coin edge holds against both pages (4.71 light, 3.45 dark)", () => {
    const edge = coinColors.face[2];
    expect(contrast(edge, light.bg)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    expect(contrast(edge, dark.bg)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    expect(Math.abs(contrast(edge, light.bg) - 4.71)).toBeLessThan(PUBLISHED_TOLERANCE);
    expect(Math.abs(contrast(edge, dark.bg) - 3.45)).toBeLessThan(PUBLISHED_TOLERANCE);
  });
  it("the coin edge is the peni fill (one copper)", () => {
    expect(coinColors.face[2]).toBe(light.peni);
  });
});

describe("§3.3 hue separation (OKLCH ΔE; ≥ 0.08 reads as different at a glance)", () => {
  type HueRow = [a: TokenName, b: TokenName, light: [number, number], dark: [number, number], mustSeparate: boolean];
  const rows: HueRow[] = [
    ["masa", "danger", [0.13, 40], [0.113, 50], true],
    ["masa", "peni", [0.179, 61], [0.149, 77], true],
    ["aski", "success", [0.082, 56], [0.085, 50], true],
    // Below 0.08 by design, mitigated: danger always has an icon and is never a fill;
    // warning always has Timer / CirclePause and appears mostly on staff screens.
    ["danger", "peni", [0.087, 21], [0.071, 28], false],
    ["peni", "warning", [0.065, 28], [0.098, 26], false],
  ];
  for (const [a, b, l, d, mustSeparate] of rows) {
    for (const [name, t, [de, dh]] of [
      ["light", light, l],
      ["dark", dark, d],
    ] as const) {
      it(`${name}: ${a} vs ${b} ΔE ${de} / Δhue ${dh}°`, () => {
        const e = deltaE(t[a], t[b]);
        expect(Math.abs(e - de)).toBeLessThan(0.0006);
        expect(Math.abs(deltaHue(t[a], t[b]) - dh)).toBeLessThan(0.51);
        if (mustSeparate) expect(e).toBeGreaterThanOrEqual(0.08);
      });
    }
  }

  it("colourway pairs are 0.084–0.160 apart", () => {
    const hexes = Object.values(cafeHues);
    const des: number[] = [];
    for (let i = 0; i < hexes.length; i++) for (let j = i + 1; j < hexes.length; j++) des.push(deltaE(hexes[i]!, hexes[j]!));
    expect(Math.min(...des)).toBeGreaterThanOrEqual(0.0835);
    expect(Math.max(...des)).toBeLessThan(0.1605);
  });

  it("patlıcan vs masa is 0.121 (vişne is not a colourway, D6)", () => {
    const e = deltaE(cafeHues.patlican, light.masa);
    expect(Math.abs(e - 0.121)).toBeLessThan(0.0006);
    expect(e).toBeGreaterThanOrEqual(0.08);
  });
});

describe("token sets", () => {
  it("light and dark define exactly the same tokens", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
  it("every value is a #RRGGBB hex", () => {
    for (const t of [light, dark]) for (const v of Object.values(t)) expect(v).toMatch(/^#[0-9A-F]{6}$/);
  });
  it("primary is ink and focus is ink (D2) in both themes", () => {
    for (const t of [light, dark]) {
      expect(t.primary).toBe(t.ink);
      expect(t.focus).toBe(t.ink);
    }
  });
  it("the press tokens are identical in both themes (D3)", () => {
    expect([dark.press, dark.onPress, dark.onPress2]).toEqual([light.press, light.onPress, light.onPress2]);
  });
});
