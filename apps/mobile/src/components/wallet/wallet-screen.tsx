/**
 * The Cüzdan tab's frame (design-system.md §8.4 Headers, §10, §10.5): the same frame as every
 * customer tab (`TabScreen` in components/home) plus the "Peni kodum" action beside the title.
 *
 * - iOS: the native large title (Brygada 34) collapses into the bar, and "Peni kodum" is the
 *   native `Stack.Toolbar` button the tab's Stack puts on the right (SF Symbol `qrcode`).
 * - Android and the browser preview have no native large title (nor SF Symbols): the header is
 *   hidden, the same 34pt Brygada title opens the content, and "Peni kodum" is a 44pt
 *   `QrCode` icon button at its right, on the title's line.
 *
 * A `ScrollView` is the first child, with pull to refresh (`selection` haptic), a 16pt gutter
 * and room under the content for the floating active-order pill.
 */
import { Stack } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/components/ui";
import { useActiveOrderInset } from "@/lib/active-order";
import { haptic } from "@/lib/haptics";
import { headerType, space, useTokens } from "@/lib/theme";

const NATIVE_LARGE_TITLE = Platform.OS === "ios";
const MAX_WIDTH = 640;

export interface WalletScreenProps {
  title: string;
  /** Shown at the right of the in-content title (Android, browser). iOS uses the toolbar. */
  titleAction?: ReactNode;
  onRefresh?: () => Promise<unknown>;
  busy?: boolean;
  /** Centres the content under the title (signed out, empty). */
  centered?: boolean;
  children: ReactNode;
}

export function WalletScreen({ title, titleAction, onRefresh, busy = false, centered = false, children }: WalletScreenProps) {
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
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: space.gutter,
          paddingTop: NATIVE_LARGE_TITLE ? 4 : insets.top + 20,
          paddingBottom: 40 + pillInset,
        }}
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
        <View accessibilityState={busy ? { busy: true } : undefined} aria-busy={busy || undefined} style={styles.column}>
          {NATIVE_LARGE_TITLE ? null : (
            <View style={styles.titleRow}>
              <T variant="h2" accessibilityRole="header" style={styles.largeTitle}>
                {title}
              </T>
              {titleAction ? <View style={styles.titleAction}>{titleAction}</View> : null}
            </View>
          )}
          {centered ? <View style={styles.centered}>{children}</View> : children}
        </View>
      </ScrollView>
      {/* Edge-to-edge Android: paper under the status bar once the title has scrolled away. */}
      {NATIVE_LARGE_TITLE || insets.top === 0 ? null : (
        <View pointerEvents="none" style={[styles.statusScrim, { height: insets.top, backgroundColor: t.bg }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", flexGrow: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
  largeTitle: { flexShrink: 1, fontSize: headerType.largeTitle.fontSize, lineHeight: 40, letterSpacing: -0.6 },
  /** The 44pt button's glyph lines up with the gutter, like a header button. */
  titleAction: { marginRight: -10 },
  centered: { flexGrow: 1, justifyContent: "center", paddingBottom: 48 },
  statusScrim: { position: "absolute", top: 0, left: 0, right: 0 },
});
