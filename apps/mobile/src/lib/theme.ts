/**
 * İlan tokens on mobile (design-system.md §3.1, §4.3, §4.5, §5, §8.4).
 *
 * Colours come from `@peni/brand/tokens` only. Our hook is `useTokens()`, because expo-router
 * already exports a `useTheme` (the navigation theme).
 *
 * Fonts: each weight is its own family name (§4.3). NEVER set a weight style next to one of
 * these families, or Android fakes a bold. (`navTheme` alone carries the "normal" weight its
 * type requires, as §8.4 specifies.) Caps go through `trUpper()` from `@peni/brand`.
 */
import { dark, light, nativeShadow, type TokenName, type Tokens } from "@peni/brand/tokens";
import type { Theme } from "expo-router";
import { Platform, useColorScheme, type SwitchProps, type TextStyle, type ViewStyle } from "react-native";

export { dark, light };
export type { TokenName, Tokens };

export type ColorSchemeName = "light" | "dark";

/** The system appearance, narrowed to the two themes we ship. */
export function useSchemeName(): ColorSchemeName {
  return useColorScheme() === "dark" ? "dark" : "light";
}

/** The current token set (`light` or `dark` from `@peni/brand`). */
export function useTokens(): Tokens {
  return useSchemeName() === "dark" ? dark : light;
}

export function isDark(t: Tokens): boolean {
  return t === dark || t.bg === dark.bg;
}

/* ========================================================================================== */
/* Typography (§4.3, §4.5)                                                                    */
/* ========================================================================================== */

/** The five families loaded in `src/app/_layout.tsx`. These names are the `useFonts` keys. */
export const fonts = {
  /** Brygada 1918 600: headings ≥20, balances, the order code, large titles. */
  display: "Brygada1918_600SemiBold",
  /** Brygada 1918 500 italic: Günün sorusu. */
  displayItalic: "Brygada1918_500Medium_Italic",
  /** Archivo 400: body, meta. */
  sans: "Archivo_400Regular",
  /** Archivo 600: strong, buttons, items, prices, legends, header titles. */
  sansSemiBold: "Archivo_600SemiBold",
  /** Archivo Narrow 600: `plate` (datelines, stamps, date blocks) and the staff ticket code. */
  narrow: "ArchivoNarrow_600SemiBold",
} as const;

export type FontFamily = (typeof fonts)[keyof typeof fonts];

export type TypeVariant =
  | "legend"
  | "plate"
  | "meta"
  | "body"
  | "strong"
  | "button"
  | "item"
  | "price"
  | "h3"
  | "h2"
  | "question"
  | "balance"
  | "code"
  | "ticket";

export interface TypeSpec {
  fontFamily: FontFamily;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  maxFontSizeMultiplier: number;
  fontVariant?: NonNullable<TextStyle["fontVariant"]>;
  /** Set in caps through `trUpper()` (never a style transform, which breaks the Turkish i). */
  caps?: true;
}

/** §4.5, verbatim. The `T` component applies these; no weight style is ever set. */
export const typeScale: Record<TypeVariant, TypeSpec> = {
  legend: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1.0,
    maxFontSizeMultiplier: 1.6,
    caps: true,
  },
  plate: {
    fontFamily: fonts.narrow,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.8,
    maxFontSizeMultiplier: 1.4,
    caps: true,
  },
  meta: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, letterSpacing: 0, maxFontSizeMultiplier: 1.6 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22, letterSpacing: 0, maxFontSizeMultiplier: 1.6 },
  strong: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
    maxFontSizeMultiplier: 1.6,
  },
  button: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
    maxFontSizeMultiplier: 1.4,
  },
  item: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.1,
    maxFontSizeMultiplier: 1.6,
  },
  price: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0,
    maxFontSizeMultiplier: 1.6,
    fontVariant: ["tabular-nums"],
  },
  h3: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.2, maxFontSizeMultiplier: 1.3 },
  h2: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.4, maxFontSizeMultiplier: 1.3 },
  question: {
    fontFamily: fonts.displayItalic,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 0,
    maxFontSizeMultiplier: 1.3,
  },
  balance: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.4,
    maxFontSizeMultiplier: 1.3,
    fontVariant: ["lining-nums", "tabular-nums"],
  },
  code: {
    fontFamily: fonts.display,
    fontSize: 64,
    lineHeight: 64,
    letterSpacing: -1,
    maxFontSizeMultiplier: 1.2,
    fontVariant: ["lining-nums", "tabular-nums"],
  },
  ticket: {
    fontFamily: fonts.narrow,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: 0,
    maxFontSizeMultiplier: 1.2,
    fontVariant: ["tabular-nums"],
  },
};

/** A text style for a variant, without the `caps` flag (callers apply `trUpper`). */
export function typeStyle(variant: TypeVariant): TextStyle {
  const { caps: _caps, maxFontSizeMultiplier: _max, ...style } = typeScale[variant];
  return style;
}

/** Large titles (`headerLargeTitleStyle`) and header titles (`headerTitleStyle`), §4.5. */
export const headerType = {
  largeTitle: { fontFamily: fonts.display, fontSize: 34 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 17 },
  backTitle: { fontFamily: fonts.sans, fontSize: 17 },
} as const;

/* ========================================================================================== */
/* Navigation theme (§8.4)                                                                    */
/* ========================================================================================== */

/** The React Navigation theme for `<ThemeProvider value={navTheme(t)}>`. */
export function navTheme(t: Tokens): Theme {
  return {
    dark: isDark(t),
    colors: { primary: t.ink, background: t.bg, card: t.bg, text: t.ink, border: t.line, notification: t.masa },
    fonts: {
      regular: { fontFamily: fonts.sans, fontWeight: "normal" },
      medium: { fontFamily: fonts.sansSemiBold, fontWeight: "normal" },
      bold: { fontFamily: fonts.sansSemiBold, fontWeight: "normal" },
      heavy: { fontFamily: fonts.display, fontWeight: "normal" },
    },
  };
}

/* ========================================================================================== */
/* Space and shape (§5)                                                                       */
/* ========================================================================================== */

export const space = {
  /** Page gutter on phones. */
  gutter: 16,
  /** Card padding. */
  card: 16,
  rowV: 12,
  rowH: 16,
  /** Row min-height. */
  row: 56,
  /** Gap between sections. */
  section: 32,
  /** Stack gaps. */
  gap: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
} as const;

export const radius = {
  /** Tags, stamps, date blocks. */
  tag: 4,
  /** Buttons, inputs, banners, the segmented track. */
  control: 10,
  /** Cards, fiş top corners, covers, the cart bar. */
  card: 14,
  /** Sheet top corners (`sheetCornerRadius`). */
  sheet: 22,
  /** Only the coin, avatars, 44pt icon buttons, stepper buttons, seats and the switch. */
  full: 9999,
} as const;

/** Minimum touch target (pt), through size or `hitSlop`. Staff primary actions use `hitStaff`. */
export const hit = 44;
export const hitStaff = 56;

/* ========================================================================================== */
/* Elevation (§5): three levels, no other shadows exist                                       */
/* ========================================================================================== */

export type Elevation = "flat" | "raised" | "floating";

/** The warm brown the §5 table gives for every iOS shadow (from `@peni/brand`). */
const SHADOW = nativeShadow.light;
/** Dark-theme floating shadow: black, as the web `--elev-2` dark value (`oklch(0% 0 0 / .55)`). */
const SHADOW_DARK = nativeShadow.dark;

/** 0–1 alpha as a two-digit hex suffix, for `#RRGGBBAA` (react-native-web `boxShadow`). */
function alphaHex(a: number): string {
  return Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

const HAIRLINE = 1;

/**
 * Elevation styles (§5):
 * - `flat`: nothing; rows separate with a 1px `line`.
 * - `raised` (cards): iOS shadow `nativeShadow.light` .12 / 8 / 0,4; Android elevation 2; 1px `line` border.
 *   Dark: no shadow, the 1px `line` border only.
 * - `floating` (sheets, toasts, cart bar): iOS .22 / 18 / 0,10; Android elevation 8.
 *   Dark: a 1px `line` ring plus a black shadow, mirroring the web dark `--elev-2`
 *   (a brown shadow is invisible on the dark page).
 * Tinted panels (`*Soft`) are always flat: no shadow, no border.
 */
export function elevation(level: Elevation, t: Tokens): ViewStyle {
  if (level === "flat") return {};
  const darkMode = isDark(t);
  if (level === "raised") {
    const border: ViewStyle = { borderWidth: HAIRLINE, borderColor: t.line };
    if (darkMode) return border;
    return {
      ...border,
      ...Platform.select<ViewStyle>({
        ios: { shadowColor: SHADOW, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
        android: { elevation: 2 },
        default: { boxShadow: `0px 4px 16px ${SHADOW}${alphaHex(0.12)}` },
      }),
    };
  }
  const color = darkMode ? SHADOW_DARK : SHADOW;
  const opacity = darkMode ? 0.55 : 0.22;
  return {
    ...(darkMode ? { borderWidth: HAIRLINE, borderColor: t.line } : null),
    ...Platform.select<ViewStyle>({
      ios: { shadowColor: color, shadowOpacity: opacity, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 8 },
      default: { boxShadow: `0px 10px 36px ${color}${alphaHex(opacity)}` },
    }),
  };
}

/* ========================================================================================== */
/* Controls                                                                                   */
/* ========================================================================================== */

/**
 * Colours for a React Native `Switch`. The peni toggle (§10.2) is the only copper switch
 * (`tone: "peni"`); every other switch is ink. Off is `lineStrong`, the thumb is `surface`.
 */
export function switchColors(
  t: Tokens,
  tone: "ink" | "peni" = "ink",
): Pick<SwitchProps, "trackColor" | "thumbColor" | "ios_backgroundColor"> {
  return {
    trackColor: { false: t.lineStrong, true: tone === "peni" ? t.peni : t.ink },
    thumbColor: t.surface,
    ios_backgroundColor: t.lineStrong,
    // react-native-web gives the "on" thumb its own prop, which defaults to teal.
    ...(Platform.OS === "web" ? ({ activeThumbColor: t.surface } as object) : null),
  };
}

/** A token by name, for components that take `color?: keyof Tokens`. */
export function tokenColor(t: Tokens, name: TokenName): string {
  return t[name];
}
