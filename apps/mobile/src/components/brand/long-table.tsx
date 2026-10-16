/**
 * Uzun masa, the long table of a Peni masası (design-system.md §6.5). Chairs on both sides,
 * filled T0, B0, T1, B1, … from the left in arrival order. Everyone is equal at the table: a
 * taken chair shows initials only when that member's profile is visible; "me" gets an ink ring.
 * Declines are never drawn. The drawing is decorative; the seats line under it is the text:
 * "6/14 yer dolu · sen de geliyorsun" / "Masa doldu".
 *
 * A14 seat-take: when `rsvpedByMe` turns true, my chair grows from .6 on `springs.seat` and its
 * initials fade in over 150ms, with the `tap` haptic (the component plays it; the "Geliyorum"
 * button doesn't). Reduced motion: a 150ms fade. My chair is drawn on its own `Animated.View`
 * over the table, so nothing animates an SVG prop.
 *
 * The table scales down to fit narrow cards (capacity 14 draws 240 wide, inside the 296pt
 * card interior at 360pt).
 */
import { masaCopy } from "@peni/brand/copy";
import { longTableLayout, type LongTableChair, type LongTableLayout, type LongTableSeat } from "@peni/brand/shapes";
import { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, G, Rect, Text as SvgText } from "react-native-svg";
import { T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { durations, springs, useMotionReduced } from "@/lib/motion";
import { fonts, useTokens, type Tokens } from "@/lib/theme";
import { hidden, REDUCED_FADE } from "./_internal";

export interface LongTableProps {
  capacity: number;
  /** `PostDTO.attendees` [G4]. Without them, `count` plain chairs are drawn (plus mine). */
  seats?: readonly LongTableSeat[] | null;
  /** `rsvpCount`. */
  count: number;
  rsvpedByMe?: boolean;
  /** Render the seats line under the table. Default true. */
  caption?: boolean;
  /** Play A14's `tap` haptic when I take my seat. Default true. */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** My chair's box, around the ring (r 14.5 + half its 2-unit stroke). */
const ME_BOX = 16;
const SEAT_FROM = 0.6;

export const LongTable = memo(function LongTable({
  capacity,
  seats,
  count,
  rsvpedByMe = false,
  caption = true,
  haptics = true,
  style,
}: LongTableProps) {
  const t = useTokens();
  const table = longTableLayout(capacity, seatsFor(seats, count, rsvpedByMe));
  const me = table.chairs.find((c) => c.state === "me") ?? null;

  // A14 plays when I take my seat while looking at the table, never on first render.
  const [seen, setSeen] = useState(rsvpedByMe);
  const [took, setTook] = useState(0);
  if (rsvpedByMe !== seen) {
    setSeen(rsvpedByMe);
    if (rsvpedByMe) setTook((n) => n + 1);
  }
  useEffect(() => {
    if (took > 0 && haptics) haptic("tap");
  }, [took]);

  return (
    <View style={[styles.wrap, style]}>
      <View {...hidden} pointerEvents="none" style={{ width: "100%", maxWidth: table.width, aspectRatio: table.width / table.height }}>
        <Svg width="100%" height="100%" viewBox={table.viewBox}>
          <Rect
            x={table.table.x}
            y={table.table.y}
            width={table.table.width}
            height={table.table.height}
            rx={table.table.rx}
            fill={t[table.table.fill]}
            stroke={t[table.table.stroke]}
            strokeWidth={table.table.strokeWidth}
          />
          {table.chairs.map((c) => (c.state === "me" ? null : <Chair key={c.order} chair={c} table={table} t={t} />))}
        </Svg>
        {me ? <MyChair key={`me-${me.order}`} chair={me} table={table} t={t} took={took} /> : null}
      </View>
      {caption ? (
        <T variant="meta" tabular>
          {masaCopy.seats(count, capacity, rsvpedByMe)}
        </T>
      ) : null}
    </View>
  );
});

function initialsText(chair: LongTableChair, table: LongTableLayout, fill: string) {
  return (
    <SvgText
      x={chair.cx}
      y={chair.cy + table.text.dy}
      textAnchor="middle"
      fontFamily={fonts.sansSemiBold}
      fontSize={table.text.fontSize}
      fill={fill}
    >
      {chair.state === "more" ? chair.label : chair.initials}
    </SvgText>
  );
}

function Chair({ chair, table, t }: { chair: LongTableChair; table: LongTableLayout; t: Tokens }) {
  if (chair.state === "more") return initialsText(chair, table, t[table.text.moreFill]);
  if (chair.state === "empty") {
    return (
      <Circle
        cx={chair.cx}
        cy={chair.cy}
        r={table.chairR}
        fill={t.surface}
        stroke={t[table.emptyStroke.stroke]}
        strokeWidth={table.emptyStroke.strokeWidth}
      />
    );
  }
  return (
    <G>
      <Circle cx={chair.cx} cy={chair.cy} r={table.chairR} fill={t.masa} />
      {chair.initials ? initialsText(chair, table, t[table.text.fill]) : null}
    </G>
  );
}

/** My chair on its own layer: positioned in table units as percentages, so it scales with the table. */
function MyChair({ chair, table, t, took }: { chair: LongTableChair; table: LongTableLayout; t: Tokens; took: number }) {
  const reduced = useMotionReduced();
  const animateNow = useRef(took > 0);
  const scale = useSharedValue(animateNow.current && !reduced ? SEAT_FROM : 1);
  const opacity = useSharedValue(animateNow.current && reduced ? 0 : 1);
  const initials = useSharedValue(animateNow.current ? 0 : 1);

  useEffect(() => {
    if (took === 0) return;
    if (reduced) {
      opacity.value = 0;
      initials.value = 1;
      opacity.value = withTiming(1, REDUCED_FADE);
      return;
    }
    scale.value = SEAT_FROM;
    initials.value = 0;
    scale.value = withSpring(1, springs.seat);
    initials.value = withTiming(1, { duration: durations.reduced });
  }, [took]);

  const seat = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const text = useAnimatedStyle(() => ({ opacity: initials.value }));

  const box = {
    position: "absolute" as const,
    left: `${((chair.cx - ME_BOX) / table.width) * 100}%` as const,
    top: `${((chair.cy - ME_BOX) / table.height) * 100}%` as const,
    width: `${((2 * ME_BOX) / table.width) * 100}%` as const,
    height: `${((2 * ME_BOX) / table.height) * 100}%` as const,
  };
  const viewBox = `${chair.cx - ME_BOX} ${chair.cy - ME_BOX} ${2 * ME_BOX} ${2 * ME_BOX}`;

  return (
    <Animated.View style={[box, seat]}>
      <Svg width="100%" height="100%" viewBox={viewBox}>
        <Circle
          cx={chair.cx}
          cy={chair.cy}
          r={table.meRing.r}
          fill="none"
          stroke={t[table.meRing.stroke]}
          strokeWidth={table.meRing.strokeWidth}
        />
        <Circle cx={chair.cx} cy={chair.cy} r={table.chairR} fill={t.masa} />
      </Svg>
      {chair.initials ? (
        <Animated.View style={[StyleSheet.absoluteFill, text]}>
          <Svg width="100%" height="100%" viewBox={viewBox}>
            {initialsText(chair, table, t[table.text.fill])}
          </Svg>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Seats to draw. With attendees [G4] they are used as given (arrival order), with my chair
 * following `rsvpedByMe` so an optimistic "Geliyorum" shows at once. Until attendees exist:
 * `count` chairs with no initials, one of them mine when `rsvpedByMe` (§6.5 fallback).
 */
function seatsFor(seats: readonly LongTableSeat[] | null | undefined, count: number, rsvpedByMe: boolean): LongTableSeat[] {
  if (seats && seats.length > 0) {
    const hasMe = seats.some((s) => s.me);
    if (rsvpedByMe && !hasMe) return [...seats, { initials: null, me: true }];
    if (!rsvpedByMe && hasMe) return seats.filter((s) => !s.me);
    return [...seats];
  }
  const n = Math.max(0, Math.floor(count));
  const out: LongTableSeat[] = Array.from({ length: n }, () => ({ initials: null }));
  if (rsvpedByMe && n > 0) out[n - 1] = { initials: null, me: true };
  return out;
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
});
