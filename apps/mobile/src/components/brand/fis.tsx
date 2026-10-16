/**
 * Fiş, the printed slip (design-system.md §6.3, §10.3): order status, gift, staff ticket.
 *
 * order / gift: a `surface` slip with 14pt top corners and a scalloped bottom edge. Head: the
 * Oxford rule in ink, 8pt, then the legend in `plate`.
 *
 * The scallop. §6.3 draws it as `bg`-coloured circles over the slip's bottom 6pt. Here the
 * strip is the slip's own colour with the bites cut out of the path instead (the same
 * circles: r 6 at cy 6, pitch 16, centred like the web mask), so it is correct on any
 * backdrop (a sheet, a tinted panel), and the iOS shadow and the hairline follow the bites.
 *
 * Depth: like a raised card (§5), a 1pt `line` hairline around the slip, plus the raised iOS
 * shadow in light mode (it follows the scallops, because the wrapper has no fill).
 *
 * tone="ready" (A11): the slip turns `success` over 300ms (instant under reduced motion), and
 * inside it `ink`, `ink2`, `lineStrong` and `focus` become their on-success values. Children
 * read them with `useFisTokens()` / `FisText`. On the change into ready (never on mount) the
 * fiş plays the `success` haptic and announces `announce` ("Hazır. Kasada P-003 kodunu söyle.").
 * Screens don't repeat either.
 *
 * ticket (staff): no Oxford rule and no scallop. A raised card with a 4pt colourway band.
 */
import { SCALLOP, scallopCircles } from "@peni/brand/shapes";
import type { CafeHue } from "@peni/brand/tokens";
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Line, Path } from "react-native-svg";
import { T, type TProps } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { EASE_OUT_STRONG, durations, useMotionReduced } from "@/lib/motion";
import { elevation, fonts, isDark, radius, useTokens, type TokenName, type Tokens } from "@/lib/theme";
import { hidden, r3 } from "./_internal";
import { CafeHueBand } from "./cafe-hue-band";
import { OxfordRule } from "./rules";

/* ========================================================================================== */
/* Tone context                                                                               */
/* ========================================================================================== */

interface FisContextValue {
  /** The tokens inside the slip (on-success values when ready). */
  tokens: Tokens;
  /** The slip's own colour now: `surface`, or `success` when ready. */
  paper: string;
  ready: boolean;
  /** 0 = default, 1 = ready, animating between: for children that sit opaque on the paper. */
  progress: SharedValue<number>;
  from: string;
  to: string;
}

const FisContext = createContext<FisContextValue | null>(null);

/** Inside a ready fiş the text, rules and focus take their on-success values (§6.3). */
function readyTokens(t: Tokens): Tokens {
  return { ...t, ink: t.onSuccess, ink2: t.onSuccess2, lineStrong: t.onSuccess2, focus: t.onSuccess };
}

/** The tokens to paint with here: the fiş's own inside a fiş, the page's elsewhere. */
export function useFisTokens(): Tokens {
  const t = useTokens();
  return useContext(FisContext)?.tokens ?? t;
}

/** The slip colour behind this point (`surface` outside a fiş). */
export function useFisPaper(): string {
  const t = useTokens();
  return useContext(FisContext)?.paper ?? t.surface;
}

/**
 * An animated `backgroundColor` that follows the slip through the A11 colour change, for marks
 * that must sit opaque on the paper (status-track stops). `surface` outside a fiş.
 */
export function useFisPaperStyle() {
  const t = useTokens();
  const ctx = useContext(FisContext);
  const still = useSharedValue(0);
  const progress = ctx?.progress ?? still;
  const from = ctx?.from ?? t.surface;
  const to = ctx?.to ?? t.surface;
  return useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [from, to]) }));
}

/** `T` in the fiş's colours: `color` is a token name, resolved inside the slip. */
export function FisText({ color = "ink", style, ...props }: TProps) {
  const ft = useFisTokens();
  return <T {...props} color={color} style={[{ color: ft[color] }, style]} />;
}

/* ========================================================================================== */
/* Fis                                                                                        */
/* ========================================================================================== */

export interface FisProps {
  variant?: "order" | "gift" | "ticket";
  tone?: "default" | "ready";
  /** "MODA KAHVESİ · SİPARİŞ", "ISMARLAMA · MODA KAHVESİ" (set in `plate` caps). */
  legend?: string | null;
  /** Ticket band: the café, for its colourway. */
  slug?: string;
  hue?: CafeHue | null;
  /** Said by the screen reader when the slip turns ready (§10.3). */
  announce?: string | null;
  /** Play the A11 `success` haptic when the slip turns ready. Default true. */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
  /** The slip's inner box (padding, gaps). */
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

const HAIRLINE = 1;
/** The strip is 6pt of slip plus room for the lower half of the 1pt hairline. */
const STRIP_HEIGHT = SCALLOP.height + HAIRLINE;

export const Fis = memo(function Fis({
  variant = "order",
  tone = "default",
  legend,
  slug,
  hue,
  announce,
  haptics = true,
  style,
  contentStyle,
  children,
}: FisProps) {
  if (variant === "ticket") {
    return (
      <Ticket legend={legend} slug={slug} hue={hue} style={style} contentStyle={contentStyle}>
        {children}
      </Ticket>
    );
  }
  return (
    <Slip tone={tone} legend={legend} announce={announce} haptics={haptics} style={style} contentStyle={contentStyle}>
      {children}
    </Slip>
  );
});

function Slip({
  tone,
  legend,
  announce,
  haptics,
  style,
  contentStyle,
  children,
}: Required<Pick<FisProps, "tone" | "haptics">> & Omit<FisProps, "variant" | "slug" | "hue" | "tone" | "haptics">) {
  const t = useTokens();
  const reduced = useMotionReduced();
  const ready = tone === "ready";
  const progress = useSharedValue(ready ? 1 : 0);
  const [width, setWidth] = useState(0);

  // A11: the colour change, and the moment itself (haptic + announcement) on the way in only.
  const was = useRef(ready);
  useEffect(() => {
    if (was.current === ready) return;
    was.current = ready;
    progress.value = reduced ? (ready ? 1 : 0) : withTiming(ready ? 1 : 0, { duration: durations.state, easing: EASE_OUT_STRONG });
    if (!ready) return;
    if (haptics) haptic("success");
    if (announce) AccessibilityInfo.announceForAccessibility(announce);
  }, [ready]);

  // The ink inside the slip changes sides when the paper is half way there (about 40ms into
  // the 300ms ease), read from the running animation itself: white text never sits on cream,
  // nor ink on green.
  const [inkReady, setInkReady] = useState(ready);
  useAnimatedReaction(
    () => progress.value >= 0.5,
    (now, before) => {
      if (now !== before) scheduleOnRN(setInkReady, now);
    },
  );

  const ctx = useMemo<FisContextValue>(
    () => ({
      tokens: inkReady ? readyTokens(t) : t,
      paper: inkReady ? t.success : t.surface,
      ready,
      progress,
      from: t.surface,
      to: t.success,
    }),
    [inkReady, ready, t, progress],
  );

  const body = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [t.surface, t.success]),
    borderColor: interpolateColor(progress.value, [0, 1], [t.line, t.success]),
  }));
  const readyStrip = useAnimatedStyle(() => ({ opacity: progress.value }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const ink = ctx.tokens.ink;

  return (
    <FisContext.Provider value={ctx}>
      <View style={[slipShadow(t), style]} onLayout={onLayout}>
        <Animated.View style={[styles.body, body, contentStyle]}>
          <OxfordRule color={ink} />
          {legend ? (
            <FisText variant="plate" color="ink2" style={styles.legend}>
              {legend}
            </FisText>
          ) : null}
          {children}
        </Animated.View>
        <View {...hidden} pointerEvents="none" style={styles.strip}>
          {width > 0 ? (
            <>
              <Scallop width={width} fill={t.surface} stroke={t.line} />
              <Animated.View style={[StyleSheet.absoluteFill, readyStrip]}>
                <Scallop width={width} fill={t.success} stroke={t.success} />
              </Animated.View>
            </>
          ) : null}
        </View>
      </View>
    </FisContext.Provider>
  );
}

/** The raised iOS shadow (light mode only), without the card border: the slip draws its own. */
function slipShadow(t: Tokens): ViewStyle | null {
  if (Platform.OS !== "ios" || isDark(t)) return null;
  const e = elevation("raised", t);
  return { shadowColor: e.shadowColor, shadowOpacity: e.shadowOpacity, shadowRadius: e.shadowRadius, shadowOffset: e.shadowOffset };
}

/* ------------------------------------------------------------------------------------------ */
/* The scalloped edge                                                                         */
/* ------------------------------------------------------------------------------------------ */

type Bite = { cx: number; cy: number; r: number };

/** y of the bite's arc at x (the upper half of the circle). */
function arcY(b: Bite, x: number): number {
  const dx = x - b.cx;
  return b.cy - Math.sqrt(Math.max(0, b.r * b.r - dx * dx));
}

/**
 * The bottom edge from `xl` to `xr`, left to right: straight at y = 6 between bites, over the
 * top of each bite (sweep 1 = clockwise on screen, so the arc bulges up into the slip).
 * Returns where it starts on the left edge and the path commands that follow.
 */
function bottomEdge(bites: readonly Bite[], xl: number, xr: number): { startY: number; d: string } {
  const base: number = SCALLOP.height;
  let startY = base;
  let d = "";
  for (const b of bites) {
    const a = b.cx - b.r;
    const z = b.cx + b.r;
    if (z <= xl || a >= xr) continue;
    if (a <= xl) startY = arcY(b, xl);
    else d += ` L${r3(a)} ${base}`;
    if (z >= xr) return { startY, d: `${d} A${b.r} ${b.r} 0 0 1 ${r3(xr)} ${r3(arcY(b, xr))}` };
    d += ` A${b.r} ${b.r} 0 0 1 ${r3(z)} ${base}`;
  }
  return { startY, d: `${d} L${r3(xr)} ${base}` };
}

/** The strip's fill (closed) and its hairline (open: down the sides and along the bites). */
function scallopPaths(width: number): { fill: string; outline: string } {
  const { circles } = scallopCircles(width);
  const bites = [...circles].sort((p, q) => p.cx - q.cx);
  const f = bottomEdge(bites, 0, width);
  const h = HAIRLINE / 2;
  const o = bottomEdge(bites, h, width - h);
  return {
    fill: `M0 0 L0 ${r3(f.startY)}${f.d} L${width} 0 Z`,
    outline: `M${h} 0 L${h} ${r3(o.startY)}${o.d} L${r3(width - h)} 0`,
  };
}

const Scallop = memo(function Scallop({ width, fill, stroke }: { width: number; fill: string; stroke: string }) {
  const paths = useMemo(() => scallopPaths(width), [width]);
  return (
    <Svg width={width} height={STRIP_HEIGHT} viewBox={`0 0 ${width} ${STRIP_HEIGHT}`}>
      <Path d={paths.fill} fill={fill} />
      <Path d={paths.outline} fill="none" stroke={stroke} strokeWidth={HAIRLINE} strokeLinejoin="round" />
    </Svg>
  );
});

/* ------------------------------------------------------------------------------------------ */
/* Ticket (staff)                                                                             */
/* ------------------------------------------------------------------------------------------ */

function Ticket({ legend, slug, hue, style, contentStyle, children }: Omit<FisProps, "variant" | "tone" | "announce" | "haptics">) {
  const t = useTokens();
  return (
    // The raised shadow sits on a box that does not clip; the inner box clips the band.
    <View style={[{ backgroundColor: t.surface, borderRadius: radius.card }, elevation("raised", t), style]}>
      <View style={styles.ticketClip}>
        {slug ? <CafeHueBand slug={slug} hue={hue} size={4} /> : null}
        <View style={[styles.ticketBody, contentStyle]}>
          {legend ? (
            <T variant="plate" color="ink2">
              {legend}
            </T>
          ) : null}
          {children}
        </View>
      </View>
    </View>
  );
}

/* ========================================================================================== */
/* Lines                                                                                      */
/* ========================================================================================== */

/** The dashed rule between lines and totals: 1.5pt dashed `lineStrong` (an SVG line, because a one-sided dashed border does not render on every platform). */
export const FisDivider = memo(function FisDivider({ style }: { style?: StyleProp<ViewStyle> }) {
  const ft = useFisTokens();
  return (
    <View {...hidden} pointerEvents="none" style={[styles.divider, style]}>
      <Svg width="100%" height={1.5}>
        <Line x1="0" y1="0.75" x2="100%" y2="0.75" stroke={ft.lineStrong} strokeWidth={1.5} strokeDasharray="4 3" />
      </Svg>
    </View>
  );
});

export interface FisRowProps {
  label: ReactNode;
  value?: ReactNode;
  /** Deductions ("Peni −₺90", "İkram −₺30"): `ink2`, the same for peni and askı, never coloured. */
  muted?: boolean;
  /** The total row: `button` weight. */
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** One printed line: the label left, the amount right in Archivo 600 tabular. */
export const FisRow = memo(function FisRow({ label, value, muted = false, strong = false, style }: FisRowProps) {
  const color: TokenName = muted ? "ink2" : "ink";
  return (
    <View style={[styles.row, style]}>
      <View style={styles.rowLabel}>
        {typeof label === "string" ? (
          <FisText variant={strong ? "strong" : "body"} color={color}>
            {label}
          </FisText>
        ) : (
          label
        )}
      </View>
      {value !== undefined ? (
        typeof value === "string" ? (
          <FisText variant={strong ? "strong" : "body"} color={color} tabular style={styles.rowValue}>
            {value}
          </FisText>
        ) : (
          value
        )
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  body: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: HAIRLINE,
    borderBottomWidth: 0,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  legend: { marginTop: 8 },
  strip: { height: STRIP_HEIGHT },
  // Inside the raised card's 1pt border.
  ticketClip: { borderRadius: radius.card - 1, overflow: "hidden" },
  ticketBody: { padding: 16 },
  divider: { marginVertical: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  rowLabel: { flexShrink: 1, minWidth: 0 },
  rowValue: { fontFamily: fonts.sansSemiBold, flexShrink: 0 },
});
