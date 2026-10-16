/**
 * The frame every customer tab screen shares (design-system.md §8.4 Headers, §10): a
 * `ScrollView` as the first child, pull to refresh with the `selection` haptic, a 16pt gutter,
 * and room under the content for the floating active-order pill.
 *
 * The large title. On iOS it is the native one (`headerLargeTitleEnabled` in the tab's Stack,
 * Brygada 34), and the scroll view's `contentInsetAdjustmentBehavior="automatic"` lets it
 * collapse into the bar. Android's native stack has no large title, and neither has the browser
 * preview, so there the header is hidden and the same 34pt Brygada title opens the content, with
 * a paper scrim under the status bar so scrolled text never runs beneath the clock.
 */
import { Stack } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/components/ui";
import { useActiveOrderInset } from "@/lib/active-order";
import { haptic } from "@/lib/haptics";
import { headerType, space, useTokens } from "@/lib/theme";

const NATIVE_LARGE_TITLE = Platform.OS === "ios";

/** Content column: the reading width (§5), so the browser preview never stretches a card. */
const MAX_WIDTH = 640;

export interface TabScreenProps {
  /** "Kafeler", "Siparişler", "Profil": the large title. */
  title: string;
  /** Pull to refresh. Resolves when the data is in. */
  onRefresh?: () => Promise<unknown>;
  /** Gap between the blocks of the page. Default 24. */
  gap?: number;
  /** Marks the content busy for screen readers while skeletons stand in. */
  busy?: boolean;
  /** Centres the content vertically (empty and signed-out states). */
  centered?: boolean;
  /** Stays at the top, under the title, when the rest is centred (the signed-out strip, a banner). */
  top?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function TabScreen({
  title,
  onRefresh,
  gap = 24,
  busy = false,
  centered = false,
  top,
  contentStyle,
  children,
}: TabScreenProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const pillInset = useActiveOrderInset();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!onRefresh) return;
    haptic("selection");
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      {NATIVE_LARGE_TITLE ? null : <Stack.Screen options={{ headerShown: false }} />}
      <ScrollView
        style={styles.fill}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          {
            flexGrow: 1,
            paddingHorizontal: space.gutter,
            paddingTop: NATIVE_LARGE_TITLE ? 8 : insets.top + 20,
            paddingBottom: 40 + pillInset,
          },
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={t.ink}
              colors={[t.ink]}
              progressBackgroundColor={t.surface}
            />
          ) : undefined
        }
      >
        <View
          accessibilityState={busy ? { busy: true } : undefined}
          aria-busy={busy || undefined}
          style={[styles.column, { gap }, contentStyle]}
        >
          {NATIVE_LARGE_TITLE ? null : <LargeTitle>{title}</LargeTitle>}
          {top}
          {centered ? <View style={[styles.centered, { gap }]}>{children}</View> : children}
        </View>
      </ScrollView>
      {/* Edge-to-edge Android: paper under the status bar once the title has scrolled away. */}
      {NATIVE_LARGE_TITLE || insets.top === 0 ? null : (
        <View pointerEvents="none" style={[styles.statusScrim, { height: insets.top, backgroundColor: t.bg }]} />
      )}
    </View>
  );
}

/** The in-content large title (Brygada 34, the same face and size as iOS's). */
export function LargeTitle({ children }: { children: string }) {
  return (
    <T variant="h2" accessibilityRole="header" style={styles.largeTitle}>
      {children}
    </T>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", flexGrow: 1 },
  /** Empty and signed-out states sit in the optical middle of what is left under the title. */
  centered: { flexGrow: 1, justifyContent: "center", paddingBottom: 48 },
  largeTitle: { fontSize: headerType.largeTitle.fontSize, lineHeight: 40, letterSpacing: -0.6, marginBottom: -4 },
  statusScrim: { position: "absolute", top: 0, left: 0, right: 0 },
});
