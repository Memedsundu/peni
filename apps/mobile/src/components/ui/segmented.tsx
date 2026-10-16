/**
 * Segmented control (design-system.md §12.2, §12.5): 48pt tall, a tab list.
 *
 * - `underline` (default): equal-weight labels over a `line` hairline, with a 2pt ink bar under
 *   the active one — the café sections ("Menü · Askı · Masa") and the staff board
 *   ("Yeni (2) · Hazırlanıyor (1) · Hazır (0)").
 * - `track`: a radius-10 `surface2` track whose active key is `surface` with a 2pt ink border
 *   (the choice-chip selection) — compact settings ("Sistem · Açık · Koyu").
 *
 * A15 `segment`: the indicator glides with `withTiming(x, {duration: 200})` on the house curve;
 * instant under reduced motion. Labels never shift: both states are `button` type, only the
 * colour changes. A change fires the `selection` haptic (§7.3). When the items don't fit, the
 * row scrolls sideways and keeps the active one in view.
 */
import { formatNumber } from "@peni/brand/format";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { timings } from "@/lib/motion";
import { radius, useTokens } from "@/lib/theme";
import { PressableScale } from "./pressable-scale";
import { T } from "./t";

export interface SegmentedItem {
  id: string;
  label: string;
  /** Rendered as "Yeni (2)". */
  count?: number;
}

export interface SegmentedProps {
  /** Scopes test ids ("{id}-{item}"); parity with the web prop. */
  id?: string;
  items: readonly SegmentedItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the tab list ("Kafe bölümleri", "Görünüm"). */
  label?: string;
  variant?: "underline" | "track";
  style?: StyleProp<ViewStyle>;
}

const HEIGHT = 48;

interface Box {
  x: number;
  width: number;
}

export function Segmented({ id, items, value, onChange, label, variant = "underline", style }: SegmentedProps) {
  const t = useTokens();
  const reduced = useReducedMotion();
  const track = variant === "track";
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const viewport = useRef({ width: 0, offset: 0 });
  const placed = useRef(false);

  const x = useSharedValue(0);
  const w = useSharedValue(0);

  const active = boxes[value];
  useEffect(() => {
    if (!active) return;
    if (!placed.current || reduced) {
      x.set(active.x);
      w.set(active.width);
      placed.current = true;
    } else {
      x.set(withTiming(active.x, timings.ui));
      w.set(withTiming(active.width, timings.ui));
    }
    // Keep the active segment in view when the row scrolls.
    const { width, offset } = viewport.current;
    if (width > 0) {
      const pad = 24;
      if (active.x < offset) scroll.current?.scrollTo({ x: Math.max(0, active.x - pad), animated: !reduced });
      else if (active.x + active.width > offset + width)
        scroll.current?.scrollTo({ x: active.x + active.width - width + pad, animated: !reduced });
    }
  }, [active, reduced, w, x]);

  const indicator = useAnimatedStyle(() =>
    track
      ? { transform: [{ translateX: x.get() + 4 }], width: Math.max(0, w.get() - 8) }
      : { transform: [{ translateX: x.get() + 8 }], width: Math.max(0, w.get() - 16) },
  );

  const measure = (itemId: string) => (e: LayoutChangeEvent) => {
    const { x: bx, width } = e.nativeEvent.layout;
    setBoxes((prev) => {
      const old = prev[itemId];
      return old && old.x === bx && old.width === width ? prev : { ...prev, [itemId]: { x: bx, width } };
    });
  };

  return (
    <View
      style={[
        { height: HEIGHT },
        track ? { backgroundColor: t.surface2, borderRadius: radius.control, overflow: "hidden" } : null,
        style,
      ]}
    >
      {track ? null : (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: t.line }} />
      )}
      <ScrollView
        ref={scroll}
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onLayout={(e) => (viewport.current.width = e.nativeEvent.layout.width)}
        onScroll={(e) => (viewport.current.offset = e.nativeEvent.contentOffset.x)}
        contentContainerStyle={{ flexGrow: 1 }}
        accessibilityRole="tablist"
        accessibilityLabel={label}
      >
        {active ? (
          <Animated.View
            pointerEvents="none"
            style={[
              track
                ? {
                    position: "absolute",
                    top: 4,
                    bottom: 4,
                    left: 0,
                    borderRadius: 7,
                    borderWidth: 2,
                    borderColor: t.ink,
                    backgroundColor: t.surface,
                  }
                : { position: "absolute", bottom: 0, left: 0, height: 2, backgroundColor: t.ink },
              indicator,
            ]}
          />
        ) : null}
        {items.map((item) => {
          const selected = item.id === value;
          const text = item.count != null ? `${item.label} (${formatNumber(item.count)})` : item.label;
          return (
            <PressableScale
              key={item.id}
              testID={id ? `${id}-${item.id}` : undefined}
              onLayout={measure(item.id)}
              onPress={() => {
                if (selected) return;
                haptic("selection");
                onChange(item.id);
              }}
              targetScale={1}
              accessibilityRole="tab"
              accessibilityLabel={text}
              accessibilityState={{ selected }}
              style={{
                flexGrow: 1,
                height: HEIGHT,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T variant="button" color={selected ? "ink" : "ink2"} numberOfLines={1} tabular={item.count != null}>
                {text}
              </T>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}
