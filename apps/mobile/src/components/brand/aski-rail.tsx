/**
 * Askı rafı, the hook rail (design-system.md §6.2): one hanging glass is one ikram waiting to
 * be taken. The drawing is decorative; `AskiCaption` under it is the accessible text (never
 * repeated as a label).
 *
 * Structure (§6.2, mobile): one background `Svg` for the rail and the hooks, plus one
 * absolutely positioned `Animated.View` per item (`left = i·p`, `top = 17`, `width = p`,
 * origin at the hook pivot), each with its own small `Svg`. A simit hangs through its hole, so
 * its hooks are drawn in a static foreground `Svg` above the items, never inside them.
 *
 * Motion is for one's own action only (D7):
 * - A8 cup-hang plays ONLY on the donor's own screen after their own donation, and on the
 *   staff till: bump `hangSignal`. The new item drops in from −18 with a 10° tilt and settles
 *   on `springs.hang` (opacity over 120ms); a café-match whole item hangs 120ms later. The
 *   `success` haptic plays with it. Reduced motion: a 150ms fade.
 * - A9 cup-take plays ONLY inside the taker's own take sheet: bump `takeSignal`. The rightmost
 *   item lifts 8 and fades over 200ms; `onTakeComplete` fires when it has gone (close the sheet
 *   there). Reduced motion: a 150ms fade.
 * - Every other change (a refetch with a new count) re-renders with no animation.
 * - The hook never sways: hooks are static paths outside every animated view.
 */
import { askiCaption, type AskiCaptionInput } from "@peni/brand/copy";
import {
  askiItemFor,
  HOOK_STROKE,
  ITEM,
  itemViewBox,
  paintProps,
  RAIL_TAG,
  railLayout,
  type ItemKind,
  type RailSize,
} from "@peni/brand/shapes";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";
import { T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { EASE_OUT_STRONG, springs, useMotionReduced } from "@/lib/motion";
import { fonts, useTokens, type Tokens } from "@/lib/theme";
import { hidden, PLAY_ALWAYS, range, REDUCED_FADE } from "./_internal";

/**
 * Bump `n` in the same render that raises `count`. `count` is how many of the new items are
 * the donor's own (default 1); `match: true` adds the café-match whole item, which hangs 120ms
 * later (D9: only whole items are ever drawn). A plain number means `{ n }`.
 */
export type HangSignal = number | { n: number; count?: number; match?: boolean };

export interface AskiRailProps {
  /** `itemsAvailable`. */
  count: number;
  /** From `referenceItemName` via `askiItemFor()`: the glyph must match the caption ("7 çay" → glasses). */
  item: ItemKind;
  /** md: 28pt slots, as many as fit the width (max 12). sm: 6 slots at .75 (café cards). */
  size: RailSize;
  /** Caps the slots (the take sheet's mini rail is md with 6). */
  maxSlots?: number;
  /** md only: the width to lay out for, when known. Otherwise the rail measures its box. */
  width?: number;
  /** A8 cup-hang. */
  hangSignal?: HangSignal;
  /** A9 cup-take: bump to lift the rightmost item off its hook. */
  takeSignal?: number;
  /** A9: the item has gone (200ms; 150ms reduced). */
  onTakeComplete?: () => void;
  /** Play A8's `success` haptic. Default true. */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

/* Motion constants, in user units (scaled with the rail). */
const HANG_DROP = -18;
const HANG_TILT = 10;
const HANG_FADE = 120;
const MATCH_DELAY = 120;
const TAKE_LIFT = -8;
const TAKE_MS = 200;

interface HangState {
  /** The `hangSignal.n` that started it. */
  n: number;
  /** `count` when the signal fired: a later change of count ends the hang (D7). */
  count: number;
  slots: number[];
  matchSlot: number | null;
  tag: boolean;
}

interface TakeState {
  id: number;
  slot: number;
  count: number;
}

export const AskiRail = memo(function AskiRail({
  count,
  item,
  size,
  maxSlots,
  width: widthProp,
  hangSignal,
  takeSignal,
  onTakeComplete,
  haptics = true,
  style,
}: AskiRailProps) {
  const t = useTokens();
  const md = size === "md";
  const [measured, setMeasured] = useState(0);
  const width = md ? (widthProp ?? measured) : 0;
  const ready = !md || width > 0;
  const rail = railLayout(width, size, { maxSlots, count });
  const shape = ITEM[item];

  /* ---------- A8: which slots hang, fixed at the moment the signal fires ---------- */
  const signal = normaliseHang(hangSignal);
  const [hang, setHang] = useState<HangState | null>(null);
  const [seenHang, setSeenHang] = useState(signal.n);
  if (signal.n !== seenHang) {
    setSeenHang(signal.n);
    const total = Math.max(0, signal.count) + (signal.match ? 1 : 0);
    if (total === 0) setHang(null);
    else if (rail.tag) setHang({ n: signal.n, count, slots: [], matchSlot: null, tag: true });
    else {
      const slots = range(Math.max(0, rail.items - total), rail.items);
      setHang({ n: signal.n, count, slots, matchSlot: signal.match ? (slots[slots.length - 1] ?? null) : null, tag: false });
    }
  } else if (hang && hang.count !== count) {
    setHang(null);
  }
  const hangId = hang?.n ?? null;
  useEffect(() => {
    if (hangId !== null && haptics) haptic("success");
  }, [hangId]);

  /* ---------- A9: the rightmost item lifts off, until the count changes ---------- */
  const [take, setTake] = useState<TakeState | null>(null);
  const [seenTake, setSeenTake] = useState(takeSignal);
  if (takeSignal !== seenTake) {
    setSeenTake(takeSignal);
    // slot −1: nothing on the rail to lift (only a "+N" tag, or empty): it finishes at once.
    setTake({ id: takeSignal ?? 0, slot: rail.items - 1, count });
  } else if (take && take.count !== count) {
    setTake(null);
  }
  const finished = useRef<number | null>(null);
  const onTake = useRef(onTakeComplete);
  onTake.current = onTakeComplete;
  // Stable, so the memoised items don't re-render for it.
  const finishTake = useCallback((id: number) => {
    if (finished.current === id) return;
    finished.current = id;
    onTake.current?.();
  }, []);
  useEffect(() => {
    if (take && take.slot < 0) finishTake(take.id);
  }, [take]);

  const onLayout = md && widthProp === undefined ? (e: LayoutChangeEvent) => setMeasured(Math.floor(e.nativeEvent.layout.width)) : undefined;
  const s = rail.scale;
  const hooks = <Hooks paths={rail.hooks} color={t.hook} />;

  return (
    <View
      {...hidden}
      pointerEvents="none"
      onLayout={onLayout}
      style={[md ? styles.mdBox : null, { height: rail.pxHeight }, style]}
    >
      {ready ? (
        <View style={{ width: rail.pxWidth, height: rail.pxHeight }}>
          <Svg width={rail.pxWidth} height={rail.pxHeight} viewBox={rail.viewBox} style={StyleSheet.absoluteFill}>
            <G fill={t.hook}>
              <Rect x={rail.rail.x} y={rail.rail.y} width={rail.rail.width} height={rail.rail.height} rx={rail.rail.rx} />
              {rail.finials.map((f, i) => (
                <Circle key={i} cx={f.cx} cy={f.cy} r={f.r} />
              ))}
            </G>
            {shape.hookOnTop ? null : hooks}
          </Svg>

          {range(0, rail.items).map((i) => {
            const hanging = hang && hang.slots.includes(i) ? hang : null;
            return (
              <RailItem
                key={i}
                kind={item}
                slot={i}
                pitch={rail.pxPitch}
                pivotY={rail.pivotY}
                scale={s}
                t={t}
                hangId={hanging ? hanging.n : null}
                hangDelay={hanging && hanging.matchSlot === i ? MATCH_DELAY : 0}
                takeId={take && take.slot === i ? take.id : null}
                onTaken={finishTake}
              />
            );
          })}
          {rail.tag ? (
            <RailItem
              key="tag"
              kind="tag"
              label={rail.tag.label}
              slot={rail.tag.slot}
              pitch={rail.pxPitch}
              pivotY={rail.pivotY}
              scale={s}
              t={t}
              hangId={hang?.tag ? hang.n : null}
              hangDelay={0}
              takeId={null}
              onTaken={finishTake}
            />
          ) : null}

          {shape.hookOnTop ? (
            <Svg width={rail.pxWidth} height={rail.pxHeight} viewBox={rail.viewBox} style={StyleSheet.absoluteFill}>
              {hooks}
            </Svg>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const Hooks = memo(function Hooks({ paths, color }: { paths: string[]; color: string }) {
  return (
    <G fill={HOOK_STROKE.fill} stroke={color} strokeWidth={HOOK_STROKE.strokeWidth} strokeLinecap={HOOK_STROKE.strokeLinecap}>
      {paths.map((d, i) => (
        <Path key={i} d={d} />
      ))}
    </G>
  );
});

/* ------------------------------------------------------------------------------------------ */
/* One item on its hook                                                                       */
/* ------------------------------------------------------------------------------------------ */

interface RailItemProps {
  kind: ItemKind | "tag";
  label?: string;
  slot: number;
  /** Rendered slot pitch (md 28, sm 21). */
  pitch: number;
  pivotY: number;
  scale: number;
  t: Tokens;
  /** The hang to play (A8), or null. */
  hangId: number | null;
  hangDelay: number;
  /** The take to play (A9), or null. */
  takeId: number | null;
  onTaken: (id: number) => void;
}

/** The tag's own box (the +N plate is about 21 units tall after its tilt). */
const TAG_BOX = { viewBox: "-14 0 28 24", top: 0, height: 24 };

const RailItem = memo(function RailItem({ kind, label, slot, pitch, pivotY, scale, t, hangId, hangDelay, takeId, onTaken }: RailItemProps) {
  const reduced = useMotionReduced();
  const box = kind === "tag" ? TAG_BOX : itemViewBox(kind);
  // A hang that is already set at mount starts hidden, so the first frame never shows it resting.
  const mountHang = useRef(hangId);
  const startHidden = mountHang.current !== null;
  const y = useSharedValue(startHidden && !reduced ? HANG_DROP * scale : 0);
  const rotate = useSharedValue(startHidden && !reduced ? HANG_TILT : 0);
  const opacity = useSharedValue(startHidden ? 0 : 1);

  useEffect(() => {
    if (hangId === null) return;
    if (reduced) {
      y.value = 0;
      rotate.value = 0;
      opacity.value = 0;
      opacity.value = withDelay(hangDelay, withTiming(1, REDUCED_FADE), PLAY_ALWAYS);
      return;
    }
    y.value = HANG_DROP * scale;
    rotate.value = HANG_TILT;
    opacity.value = 0;
    y.value = withDelay(hangDelay, withSpring(0, springs.hang));
    rotate.value = withDelay(hangDelay, withSpring(0, springs.hang));
    opacity.value = withDelay(hangDelay, withTiming(1, { duration: HANG_FADE }));
  }, [hangId]);

  const wasTaken = useRef(false);
  useEffect(() => {
    if (takeId === null) {
      // The take ended without the item leaving (the count changed): put it back, no motion.
      if (wasTaken.current) {
        y.value = 0;
        opacity.value = 1;
      }
      wasTaken.current = false;
      return;
    }
    wasTaken.current = true;
    const id = takeId;
    const done = (finishedOk?: boolean) => {
      "worklet";
      if (finishedOk) scheduleOnRN(onTaken, id);
    };
    if (reduced) {
      opacity.value = withTiming(0, REDUCED_FADE, done);
      return;
    }
    y.value = withTiming(TAKE_LIFT * scale, { duration: TAKE_MS, easing: EASE_OUT_STRONG });
    opacity.value = withTiming(0, { duration: TAKE_MS, easing: EASE_OUT_STRONG }, done);
  }, [takeId]);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }, { rotate: `${rotate.value}deg` }],
  }));

  const top = (pivotY + box.top) * scale;
  const height = box.height * scale;
  return (
    <Animated.View
      style={[
        styles.item,
        {
          left: slot * pitch,
          top,
          width: pitch,
          height,
          // The pivot: the lowest point of the hook's curl, at the item's top centre.
          transformOrigin: [pitch / 2, -box.top * scale, 0],
        },
        animated,
      ]}
    >
      <Svg width={pitch} height={height} viewBox={box.viewBox}>
        {kind === "tag" ? <Tag label={label ?? ""} t={t} /> : <ItemShape kind={kind} t={t} />}
      </Svg>
    </Animated.View>
  );
});

const ItemShape = memo(function ItemShape({ kind, t }: { kind: ItemKind; t: Tokens }) {
  const shape = ITEM[kind];
  const resolve = (n: keyof Tokens) => t[n];
  return (
    <G transform={shape.offsetY ? `translate(0 ${shape.offsetY})` : undefined}>
      {shape.els.map((el, k) =>
        el.kind === "path" ? <Path key={k} {...paintProps(el, resolve)} /> : <Circle key={k} {...paintProps(el, resolve)} />,
      )}
    </G>
  );
});

function Tag({ label, t }: { label: string; t: Tokens }) {
  const { rect, text } = RAIL_TAG;
  return (
    <G transform={RAIL_TAG.transform}>
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={rect.rx}
        fill={t[rect.fill]}
        stroke={t[rect.stroke]}
        strokeWidth={rect.strokeWidth}
      />
      <SvgText x={text.x} y={text.y} textAnchor={text.textAnchor} fontFamily={fonts.sansSemiBold} fontSize={text.fontSize} fill={t[text.fill]}>
        {label}
      </SvgText>
    </G>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Caption                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/**
 * The rail caption (§6.2), the accessible text for the rail: "Askıda 7 çay bekliyor" (`item`),
 * "İsteyen alır, günde bir tane." and the weekly line (`meta`, `ink2`), which hides ikram
 * counts below 3 (D8).
 */
export const AskiCaption = memo(function AskiCaption({ askida, style }: { askida: AskiCaptionInput; style?: StyleProp<ViewStyle> }) {
  const c = askiCaption(askida);
  return (
    <View style={[styles.caption, style]}>
      <T variant="item">{c.line1}</T>
      <T variant="meta" color="ink2">
        {c.line2}
      </T>
      {c.line3 ? (
        <T variant="meta" color="ink2" tabular>
          {c.line3}
        </T>
      ) : null}
    </View>
  );
});

/** `{ count, item }` for an `AskidaDTO` (or anything with its two fields). */
export function askiRailProps(askida: { itemsAvailable: number; referenceItemName: string | null | undefined }): {
  count: number;
  item: ItemKind;
} {
  return { count: askida.itemsAvailable, item: askiItemFor(askida.referenceItemName) };
}

function normaliseHang(s: HangSignal | undefined): { n: number; count: number; match: boolean } {
  if (s === undefined) return { n: 0, count: 1, match: false };
  if (typeof s === "number") return { n: s, count: 1, match: false };
  return { n: s.n, count: s.count ?? 1, match: Boolean(s.match) };
}

const styles = StyleSheet.create({
  mdBox: { alignSelf: "stretch" },
  item: { position: "absolute" },
  caption: { gap: 2 },
});
