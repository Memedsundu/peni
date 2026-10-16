/**
 * T — the one text component (design-system.md §4.5, §12.5).
 *
 * - `variant` applies the family, size, line height, tracking, numerals and
 *   `maxFontSizeMultiplier` from the §4.5 table (`typeScale` in `@/lib/theme`).
 * - `legend` and `plate` are caps through `trUpper()` (never a style transform, which breaks the
 *   Turkish i: "Peni masası" → "PENİ MASASI" on an English-locale phone too). Screen readers get
 *   the original casing, so caps are never spelled out letter by letter.
 * - Each weight is its own family, so T NEVER sets a weight style (Android would fake a bold).
 * - `color` is a token name; the default is `ink`. A nested T without a `variant` inherits the
 *   parent's type and only changes what it is given (a bold amount inside a sentence).
 */
import { trUpper } from "@peni/brand/format";
import { Children, createContext, useContext, type ReactNode } from "react";
import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { typeScale, useTokens, type TokenName, type TypeVariant } from "@/lib/theme";

export type { TypeVariant };

type FontVariantList = Exclude<NonNullable<TextStyle["fontVariant"]>, string>;
type FontVariantName = FontVariantList[number];

/** The variant's numerals plus `tabular-nums` when asked for. */
export function numerals(base: TextStyle["fontVariant"], tabular: boolean): FontVariantList | undefined {
  const set = new Set<FontVariantName>(Array.isArray(base) ? (base as FontVariantList) : []);
  if (tabular) set.add("tabular-nums");
  return set.size ? [...set] : undefined;
}

/**
 * Set inside a T, so a nested T inherits instead of resetting to `body` — including the caps
 * of a `legend` or `plate` parent.
 */
interface ParentText {
  caps: boolean;
}
const ParentTextContext = createContext<ParentText | null>(null);
const CAPS: ParentText = { caps: true };
const PLAIN: ParentText = { caps: false };

export interface TProps extends Omit<TextProps, "style" | "children"> {
  /** §4.5 variant. Default `body` (or the parent's type, for a nested T). */
  variant?: TypeVariant;
  /** A token name (`ink2`, `peniInk`, `askiInk`…). Default `ink`; a nested T inherits. */
  color?: TokenName;
  /** `tabular-nums` for counts, prices, timers and peni in rows (§4.1). */
  tabular?: boolean;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}

/** Upper-cases the string children (Turkish rules) and leaves elements alone. */
function capsChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => (typeof child === "string" ? trUpper(child) : child));
}

/** The plain text of string/number children, or null when an element is among them. */
function plainText(children: ReactNode): string | null {
  let out = "";
  let plain = true;
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") out += String(child);
    else if (child != null && typeof child !== "boolean") plain = false;
  });
  return plain ? out : null;
}

export function T({
  variant,
  color,
  tabular = false,
  align,
  style,
  children,
  maxFontSizeMultiplier,
  accessibilityLabel,
  accessibilityRole,
  ...rest
}: TProps) {
  const t = useTokens();
  const parent = useContext(ParentTextContext);
  const nested = parent != null;
  const resolved: TypeVariant | null = variant ?? (nested ? null : "body");
  const spec = resolved ? typeScale[resolved] : null;

  let typeStyle: TextStyle | null = null;
  if (spec) {
    const { caps: _caps, maxFontSizeMultiplier: _max, fontVariant, ...base } = spec;
    const list = numerals(fontVariant, tabular);
    typeStyle = { ...base, ...(list ? { fontVariant: list } : null) };
  } else if (tabular) {
    typeStyle = { fontVariant: ["tabular-nums"] };
  }

  const colorName: TokenName | null = color ?? (nested ? null : "ink");
  const caps = spec ? spec.caps === true : (parent?.caps ?? false);
  const original = caps && !nested && accessibilityLabel == null ? plainText(children) : null;
  const role = accessibilityRole ?? (!nested && (resolved === "h2" || resolved === "h3") ? "header" : undefined);

  const text = (
    <Text
      {...rest}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? original ?? undefined}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? spec?.maxFontSizeMultiplier}
      style={[typeStyle, colorName ? { color: t[colorName] } : null, align ? { textAlign: align } : null, style]}
    >
      {caps ? capsChildren(children) : children}
    </Text>
  );
  if (nested && parent.caps === caps) return text;
  return <ParentTextContext.Provider value={caps ? CAPS : PLAIN}>{text}</ParentTextContext.Provider>;
}
