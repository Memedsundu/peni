/**
 * A small confirm sheet over the current screen (§9.6 "Geri çevir" → "Geri çevirelim mi?").
 * D16: a destructive choice is confirmed in a sheet, never by swapping a button in place, so a
 * double tap can't do it by accident.
 *
 * Built on React Native's `Modal` (transparent): the paper dims (a 40% press-ink wash) and the
 * sheet rises from the bottom edge (`SlideInDown`, 300ms, A5 house curve). Reduce Motion: the
 * sheet only fades. A tap on the wash, the Android back button, or "Vazgeç" closes it — unless
 * the action is in flight.
 */
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T, withAlpha } from "@/components/ui";
import { durations, EASE_OUT_STRONG, useMotionReduced } from "@/lib/motion";
import { elevation, radius, space, useTokens } from "@/lib/theme";

export interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Ignore closing while the action runs. */
  busy?: boolean;
  /** The buttons (a `ButtonRow`). */
  actions: ReactNode;
  children?: ReactNode;
}

export function ConfirmSheet({ open, onClose, title, description, busy = false, actions, children }: ConfirmSheetProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  const close = () => {
    if (!busy) onClose();
  };

  const enter = reduced
    ? FadeIn.duration(durations.reduced)
    : SlideInDown.duration(durations.state).easing(EASE_OUT_STRONG).reduceMotion(ReduceMotion.System);

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={styles.fill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessible={false}
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(t.press, 0.4) }]}
        />
        <Animated.View
          entering={enter}
          exiting={FadeOut.duration(durations.reduced)}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: t.surface,
              paddingBottom: insets.bottom + 16,
            },
            elevation("floating", t),
          ]}
        >
          <View style={styles.inner}>
            <View style={{ gap: 6 }}>
              <T variant="h3" accessibilityRole="header">
                {title}
              </T>
              {description ? (
                <T variant="body" color="ink2">
                  {description}
                </T>
              ) : null}
            </View>
            {children}
            {actions}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 24,
    paddingHorizontal: space.gutter,
  },
  inner: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 20 },
});
