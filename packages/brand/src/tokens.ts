/**
 * İlan colour tokens (design-system.md §3.1).
 *
 * One colour, one meaning: ink is action and text, copper (`peni*`) is peni and nothing else,
 * turquoise (`aski*`) is askı and nothing else, vişne (`masa*`) is masa, café colourways mean
 * "which café", and status colours always come with an icon and a word.
 *
 * Web reads these as CSS custom properties generated into `apps/web/src/app/tokens.css`
 * (`pnpm brand:css`); mobile reads the `light` / `dark` objects directly.
 *
 * This module has no imports on purpose: `scripts/build-css.ts` loads it with plain
 * `node --experimental-strip-types`, which does not resolve extensionless specifiers.
 */

/** Every §3.1 token, camelCased (`peni-soft` → `peniSoft`, `surface-2` → `surface2`). */
export interface Tokens {
  /** Page paper. Carries the grain texture on web. */
  bg: string;
  /** Cards, sheets, fiş, inputs. */
  surface: string;
  /** Sunk wells, skeletons, disabled fills, table top, the 0-state of the stepper. */
  surface2: string;
  /** Text, rules, icons, primary buttons. */
  ink: string;
  /** The only secondary text tone: meta lines, hints, disabled labels. */
  ink2: string;
  /** Decorative hairlines and row dividers. Never the only boundary of a control. */
  line: string;
  /** Input borders, empty seats, the status track, secondary button borders. */
  lineStrong: string;
  /** Every primary button fill (= ink). */
  primary: string;
  /** Text on primary. */
  onPrimary: string;
  /** Pressed or hover fill for primary. */
  primaryPressed: string;
  /** Copper fill: the peni toggle when on, coin-related fills. Peni only. */
  peni: string;
  /** Text on a `peni` fill. */
  onPeni: string;
  /** Peni amounts as text ("90 peni", "+2 peni"). */
  peniInk: string;
  /** Earn-preview panel, member peni chip. */
  peniSoft: string;
  /** Askı fill: cups on the rail, the "Askıdan al" button. Askı only. */
  aski: string;
  /** Text on an `aski` fill. */
  onAski: string;
  /** Pressed fill for `aski` buttons. */
  askiPressed: string;
  /** Askı text and legends. */
  askiInk: string;
  /** The askı module panel. */
  askiSoft: string;
  /** Rail, hooks, empty hooks. ≥4.4:1 on every surface, including `askiSoft`. */
  hook: string;
  /** Vişne fill: date blocks, filled seats, masa rule. Masa only. */
  masa: string;
  /** Text on a `masa` fill. */
  onMasa: string;
  /** Masa legends ("PENİ MASASI", "GÜNÜN SORUSU") and dates. Never body sentences. */
  masaInk: string;
  /** Question card, the "Bugün masada" strip. */
  masaSoft: string;
  /** The Hazır fiş fill, the "Açık" dot. */
  success: string;
  /** Text and focus ring on `success`. */
  onSuccess: string;
  /** Secondary text on `success`. */
  onSuccess2: string;
  /** "kabul edildi" tags, confirmations. */
  successInk: string;
  /** Success chip background. */
  successSoft: string;
  /** Error text and icons. Always with `CircleAlert`. */
  danger: string;
  /** Error banner background, the ≥10-minute elapsed chip. */
  dangerSoft: string;
  /** Non-text only: the 4px new-ticket bar. */
  warning: string;
  /** Timer and pause text; "bekliyor" tags. */
  warningInk: string;
  /** Pause banner, order notes on tickets, the 5–9-minute chip. */
  warningSoft: string;
  /** 2px outline with 2px offset. Overridden per container (D2). */
  focus: string;
  /** Staff header background, the same in both themes. */
  press: string;
  /** Text, icons and focus on `press`. */
  onPress: string;
  /** Secondary text on `press`. */
  onPress2: string;
}

export type TokenName = keyof Tokens;

export const light: Tokens = {
  bg: "#F4EEE2",
  surface: "#FFFBF4",
  surface2: "#EAE1D0",
  ink: "#1D1813",
  ink2: "#5C5044",
  line: "#DCD1BD",
  lineStrong: "#8A7B67",
  primary: "#1D1813",
  onPrimary: "#FFFBF4",
  primaryPressed: "#3A322A",
  peni: "#A5531E",
  onPeni: "#FFFFFF",
  peniInk: "#93461A",
  peniSoft: "#F4E0CB",
  aski: "#0A6670",
  onAski: "#FFFBF4",
  askiPressed: "#0D5961",
  askiInk: "#085A63",
  askiSoft: "#D2EAEC",
  hook: "#6F6252",
  masa: "#7B2457",
  onMasa: "#FFFBF4",
  masaInk: "#7B2457",
  masaSoft: "#F5DEE8",
  success: "#2C6A3F",
  onSuccess: "#FFFFFF",
  onSuccess2: "#DCEEDF",
  successInk: "#2A6339",
  successSoft: "#DAEBD9",
  danger: "#A9241C",
  dangerSoft: "#F8DCD7",
  warning: "#9A6A00",
  warningInk: "#7A5200",
  warningSoft: "#F5E4B8",
  focus: "#1D1813",
  press: "#1D1813",
  onPress: "#F2EADC",
  onPress2: "#BEAF9A",
};

export const dark: Tokens = {
  bg: "#14110E",
  surface: "#1E1915",
  surface2: "#29221C",
  ink: "#F2EADC",
  ink2: "#BEAF9A",
  line: "#383029",
  lineStrong: "#7C6C5A",
  primary: "#F2EADC",
  onPrimary: "#14110E",
  primaryPressed: "#D9D0C2",
  peni: "#E3955A",
  onPeni: "#1A0F07",
  peniInk: "#EDA36A",
  peniSoft: "#3A2618",
  aski: "#55C4CC",
  onAski: "#14110E",
  askiPressed: "#47AEB6",
  askiInk: "#6CCDD4",
  askiSoft: "#10303A",
  hook: "#A08E78",
  masa: "#E6A0CF",
  onMasa: "#14110E",
  masaInk: "#EBAAD5",
  masaSoft: "#3A1A30",
  success: "#86C998",
  onSuccess: "#0F1F14",
  onSuccess2: "#1E3A27",
  successInk: "#93D1A3",
  successSoft: "#173222",
  danger: "#FF8B7B",
  dangerSoft: "#401C17",
  warning: "#E9BC62",
  warningInk: "#E9BC62",
  warningSoft: "#3A2C0E",
  focus: "#F2EADC",
  // The press tokens are fixed: the staff header stays dark in both themes (D3).
  press: "#1D1813",
  onPress: "#F2EADC",
  onPress2: "#BEAF9A",
};

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;

/** Token names in the order they are emitted to tokens.css (and listed in §3.1). */
export const tokenNames = Object.keys(light) as TokenName[];

/** `peniSoft` → `peni-soft`, `surface2` → `surface-2`, `onSuccess2` → `on-success-2`. */
export function cssVarName(name: TokenName): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/(\d+)/g, "-$1");
}

/** `var(--peni-soft)` for a token, for inline web styles and SVG paint. */
export function cssVar(name: TokenName): string {
  return `var(--${cssVarName(name)})`;
}

/* ------------------------------------------------------------------------------------------ */
/* Café colourways (D6): fixed, the same in both themes.                                      */
/* ------------------------------------------------------------------------------------------ */

export const cafeHues = {
  zeytin: "#3D4A22",
  lacivert: "#1B2C57",
  murekkep: "#2B211B",
  patlican: "#45243F",
} as const;

export type CafeHue = keyof typeof cafeHues;

/**
 * Hash order used by `cafeHue(slug)` (§4.6): `[zeytin, lacivert, murekkep, patlican][h % 4]`.
 * NEVER reorder, or every café changes colour.
 */
export const cafeHueOrder: readonly CafeHue[] = ["zeytin", "lacivert", "murekkep", "patlican"];

/** Display names, for a future café settings picker [gap G9]. */
export const cafeHueNames: Record<CafeHue, string> = {
  zeytin: "Zeytin",
  lacivert: "Lacivert",
  murekkep: "Mürekkep",
  patlican: "Patlıcan",
};

/** Text on a café colourway (covers, the press-header café name). */
export const plateText = "#FBF4E6";
/** Secondary text on a café colourway. */
export const plateText2 = "#E4D6BD";

/**
 * The 1px ring that separates colourway plates from the dark page (they sit at 1.2–2.0:1).
 * `css` is what tokens.css emits; `native` is the same colour for react-native styles,
 * which have no oklch().
 */
export const plateRing = {
  light: { css: "transparent", native: "transparent" },
  dark: { css: "oklch(100% 0 0 / .12)", native: "rgba(255, 255, 255, 0.12)" },
} as const;

/**
 * Shadow colour for React Native elevation (§5). Light: the warm brown the §5 table gives for
 * every iOS shadow (opacity is set per level). Dark: black, mirroring the web dark `--elev-2`
 * (`oklch(0% 0 0 / .55)`); a brown shadow is invisible on the dark page.
 */
export const nativeShadow: Record<"light" | "dark", string> = {
  light: "#3A2A1A",
  dark: "#000000",
};

/* ------------------------------------------------------------------------------------------ */
/* Coin colours (§3.1): fixed and decorative. Used ONLY to draw the Peni jetonu.               */
/* ------------------------------------------------------------------------------------------ */

export const coinColors = {
  /** Face radial gradient: 0% → 45% → 100%. */
  face: ["#E2A46B", "#CF8A50", "#A5531E"],
  faceStops: [0, 0.45, 1],
  /** Flat legend band (96px only). */
  band: "#CF8A50",
  /** Beads and hairlines. */
  bead: "#7A3A12",
  /** Rim legend text. */
  legend: "#4A2209",
  /** Device, initials and emboss shadow. */
  emboss: "#5B2A0D",
  /** Emboss highlight (drawn at 60% opacity, offset up-left). */
  highlight: "#F3C79A",
  /** Dark theme only: a 12% cream ring at r=31.5 so the coin edge holds against the dark page. */
  darkRing: "#F2EADC",
} as const;

/* ------------------------------------------------------------------------------------------ */
/* Web-only effects emitted to tokens.css (§3.5). Not colour tokens; no mobile equivalent.     */
/* ------------------------------------------------------------------------------------------ */

const grain = (matrix: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='${matrix}'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export interface WebEffects {
  plateRing: string;
  elev1: string;
  elev2: string;
  fisShadow: string;
  grain: string;
}

export const webEffects: Record<ThemeName, WebEffects> = {
  light: {
    plateRing: plateRing.light.css,
    elev1:
      "0 0 0 1px oklch(30% .04 60 / .10), 0 1px 2px oklch(30% .05 60 / .06), 0 8px 16px -8px oklch(30% .06 60 / .14), inset 0 1px 0 oklch(100% 0 0 / .7)",
    elev2:
      "0 0 0 1px oklch(30% .04 60 / .10), 0 18px 36px -14px oklch(30% .06 60 / .22), 0 40px 64px -32px oklch(30% .06 60 / .18)",
    fisShadow: "drop-shadow(0 1px 1px oklch(30% .05 60 / .10)) drop-shadow(0 8px 12px oklch(30% .06 60 / .12))",
    grain: grain("0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .06 0"),
  },
  dark: {
    plateRing: plateRing.dark.css,
    elev1: "0 0 0 1px oklch(100% 0 0 / .08), inset 0 1px 0 oklch(100% 0 0 / .05)",
    elev2: "0 0 0 1px oklch(100% 0 0 / .10), 0 18px 36px -14px oklch(0% 0 0 / .55)",
    fisShadow: "drop-shadow(0 0 1px oklch(100% 0 0 / .22))",
    grain: grain("0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .035 0"),
  },
};

