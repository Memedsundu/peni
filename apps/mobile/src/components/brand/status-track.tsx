/**
 * StatusTrack (design-system.md §6.3, A10 stage-advance). Four stops, evenly spaced:
 * İletildi · Hazırlanıyor · Hazır · Teslim. A stop moves only when a barista taps it
 * (principle 3), so a stop shows the time it was tapped, or no time at all.
 *
 * - Track 2pt `lineStrong`; done segments 3pt `ink`, drawn left to right (scaleX 0 → 1).
 * - Done: a 14pt `ink` disc with a 10pt Check cut in the slip's colour.
 * - Current: a 22pt ring (2pt `ink`) with an 8pt `ink` centre. One ring travels from stop to
 *   stop (`withTiming`, 300ms, EASE_OUT_STRONG). Reduced motion: everything is instant.
 * - Future: a 12pt ring, 1.5pt `lineStrong`.
 * - `stopped` (a rejected, cancelled or uncollected order): the track is at rest. The tapped
 *   stops stay ink; the stops it never reached, and the rail under them, take the quiet `line`,
 *   so the slip never reads as still waiting for the barista.
 * Inside a Hazır fiş every one of these reads its on-success value (`useFisTokens`).
 *
 * Read as a list; the current stop is "selected".
 */
import { statusTrackStops, type OrderStatus } from "@peni/brand/copy";
import { formatTime } from "@peni/brand/format";
import { Check } from "lucide-react-native";
import { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { timings, useMotionReduced } from "@/lib/motion";
import { fonts } from "@/lib/theme";
import { hidden } from "./_internal";
import { FisText, useFisPaper, useFisPaperStyle, useFisTokens } from "./fis";

export interface StatusTrackOrder {
  status: OrderStatus;
  submittedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  closedAt: string | null;
}

export interface StatusTrackProps {
  /** An `OrderDTO`, or anything with its status and four timestamps. */
  order: StatusTrackOrder;
  /** The order stopped short (rejected, cancelled, not collected): the track is at rest. */
  stopped?: boolean;
  style?: StyleProp<ViewStyle>;
}

type StopState = "done" | "current" | "future";

/**
 * Where each stop stands. Active orders have one current stop; a collected order is done all
 * the way; a rejected, cancelled or uncollected order stops where it was (the tapped stops are
 * done and nothing is current).
 */
function stopStates(o: StatusTrackOrder): StopState[] {
  switch (o.status) {
    case "submitted":
      return ["current", "future", "future", "future"];
    case "accepted":
      return ["done", "current", "future", "future"];
    case "ready":
      return ["done", "done", "current", "future"];
    case "collected":
      return ["done", "done", "done", "done"];
    default:
      return ["done", o.acceptedAt ? "done" : "future", o.readyAt ? "done" : "future", "future"];
  }
}

const STOP = 22;
const COLUMNS = statusTrackStops.length;
/** Labels may run past their column a little (as on the web): "Hazırlanıyor" is the widest. */
const LABEL_OVERHANG = 14;

export const StatusTrack = memo(function StatusTrack({ order, stopped = false, style }: StatusTrackProps) {
  const ft = useFisTokens();
  const rest = stopped ? ft.line : ft.lineStrong;
  const reduced = useMotionReduced();
  const [width, setWidth] = useState(0);
  const states = stopStates(order);
  const times = [order.submittedAt, order.acceptedAt, order.readyAt, order.status === "collected" ? order.closedAt : null];
  const current = states.indexOf("current");
  const column = width / COLUMNS;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View role="list" style={style} onLayout={onLayout}>
      <View {...hidden} pointerEvents="none" style={[styles.track, { backgroundColor: rest }]} />
      {[0, 1, 2].map((i) => (
        <Segment key={i} index={i} filled={states[i + 1] !== "future"} color={ft.ink} reduced={reduced} />
      ))}

      <View style={styles.row}>
        {statusTrackStops.map((label, i) => {
          const state = states[i]!;
          const at = state !== "future" ? times[i] : null;
          const time = at ? formatTime(at) : null;
          return (
            <View
              key={label}
              role="listitem"
              accessible
              accessibilityLabel={time ? `${label}, ${time}` : label}
              accessibilityState={{ selected: state === "current" }}
              style={styles.column}
            >
              <View {...hidden} style={styles.stopBox}>
                {state === "done" ? <DoneStop /> : state === "future" ? <FutureStop color={rest} /> : null}
              </View>
              <View style={[styles.label, column > 0 ? { width: column + 2 * LABEL_OVERHANG } : null]}>
                <FisText
                  variant="meta"
                  color={state === "future" ? "ink2" : "ink"}
                  align="center"
                  style={styles.labelText}
                >
                  {label}
                </FisText>
                {time ? (
                  <FisText variant="meta" color="ink2" tabular align="center">
                    {time}
                  </FisText>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <CurrentRing index={current} column={column} reduced={reduced} />
    </View>
  );
});

/** A done segment between two stops: 3pt ink, growing from the left. */
function Segment({ index, filled, color, reduced }: { index: number; filled: boolean; color: string; reduced: boolean }) {
  const scale = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    scale.value = reduced ? (filled ? 1 : 0) : withTiming(filled ? 1 : 0, timings.state);
  }, [filled, reduced]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));
  return (
    <Animated.View
      {...hidden}
      pointerEvents="none"
      style={[styles.segment, { left: `${12.5 + index * 25}%`, backgroundColor: color }, animated]}
    />
  );
}

function DoneStop() {
  const ft = useFisTokens();
  const paper = useFisPaper();
  return (
    <View style={[styles.done, { backgroundColor: ft.ink }]}>
      <Check size={10} color={paper} strokeWidth={2} absoluteStrokeWidth />
    </View>
  );
}

function FutureStop({ color }: { color: string }) {
  const paper = useFisPaperStyle();
  return <Animated.View style={[styles.future, { borderColor: color }, paper]} />;
}

/** The one current ring. It travels to its stop when the order moves on (A10). */
function CurrentRing({ index, column, reduced }: { index: number; column: number; reduced: boolean }) {
  const ft = useFisTokens();
  const paper = useFisPaperStyle();
  const visible = index >= 0 && column > 0;
  const target = visible ? column * (index + 0.5) - STOP / 2 : 0;
  const x = useSharedValue(target);
  const placed = useRef(false);

  useEffect(() => {
    if (!visible) return;
    // The first placement (and every move under reduced motion) is instant.
    x.value = !placed.current || reduced ? target : withTiming(target, timings.state);
    placed.current = true;
  }, [target, visible, reduced]);

  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (!visible) return null;
  return (
    <Animated.View {...hidden} pointerEvents="none" style={[styles.ring, { borderColor: ft.ink }, paper, animated]}>
      <View style={[styles.ringDot, { backgroundColor: ft.ink }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The track runs from the first stop's centre to the last one's, behind the stops.
  track: { position: "absolute", left: "12.5%", right: "12.5%", top: STOP / 2 - 1, height: 2 },
  segment: { position: "absolute", top: STOP / 2 - 1.5, height: 3, width: "25%", transformOrigin: "left center" },
  row: { flexDirection: "row" },
  column: { flex: 1, alignItems: "center", minWidth: 0 },
  stopBox: { width: STOP, height: STOP, alignItems: "center", justifyContent: "center" },
  label: { marginTop: 6, alignItems: "center" },
  labelText: { fontFamily: fonts.sansSemiBold },
  done: { width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  future: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  ring: {
    position: "absolute",
    top: 0,
    left: 0,
    width: STOP,
    height: STOP,
    borderRadius: STOP / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ringDot: { width: 8, height: 8, borderRadius: 4 },
});
