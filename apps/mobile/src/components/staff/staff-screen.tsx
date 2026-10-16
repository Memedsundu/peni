/**
 * The frame every Kafe modu tab shares (design-system.md §10.10, §8.3, D3).
 *
 * The press header is dark in both themes. Under it, an optional press-coloured subtitle row
 * (Tezgâh: the clock and the pause pill; Askı and Rapor: the café's nameplate), then the 2pt
 * band in the café's colourway [G9], then the `bg` body.
 *
 * - iOS: the native large title (Brygada 34 on press) collapses into the bar; the subtitle row
 *   and the band are the first things in the scroll view, so they read as the header's foot. A
 *   press backdrop above them fills any overscroll, so pulling to refresh never opens a paper
 *   gap inside the dark header.
 * - Android and the browser preview have no native large title: the header is hidden and the
 *   same press masthead (the 34pt Brygada title, the subtitle row, the band) opens the content.
 *   A press strip sits under the status bar so scrolled tickets never run beneath it.
 *
 * A `ScrollView` is the first child (§10), with pull to refresh (`selection` haptic). `sticky`
 * (the Tezgâh segmented control) stays pinned at the top while the tickets scroll (Android and
 * the browser; on iOS it scrolls with the content, see below).
 */
import { Stack } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CafeHueBand } from "@/components/brand";
import { T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { headerType, space, useTokens } from "@/lib/theme";
import { useCafeHue } from "./cafe-detail";

const NATIVE_LARGE_TITLE = Platform.OS === "ios";
/** Phones only (§8.4: no tablets); the column still caps for the browser preview. */
const MAX_WIDTH = 640;
/** Tall enough to cover any pull-to-refresh overscroll above the press strip. */
const BACKDROP = 1200;

export interface StaffScreenProps {
  /** The large title: the café name on Tezgâh, the tab name elsewhere. */
  title: string;
  /** The café, for the colourway band. */
  slug?: string | null;
  /** A press-coloured row under the title (Tezgâh: clock + pause pill; `PressNameplate`). */
  strip?: ReactNode;
  /** Above `sticky`, under the band: banners. */
  top?: ReactNode;
  /** Pinned under the header while the body scrolls. */
  sticky?: ReactNode;
  onRefresh?: () => Promise<unknown>;
  busy?: boolean;
  /** Freezes taps on the body (a ticket is moving, A12). */
  bodyPointerEvents?: "auto" | "none" | "box-none";
  bodyStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function StaffScreen({
  title,
  slug,
  strip,
  top,
  sticky,
  onRefresh,
  busy = false,
  bodyPointerEvents = "auto",
  bodyStyle,
  children,
}: StaffScreenProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const hue = useCafeHue(slug);
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

  const head = (
    <View>
      <View aria-hidden pointerEvents="none" style={[styles.backdrop, { backgroundColor: t.press }]} />
      {NATIVE_LARGE_TITLE ? (
        strip != null ? <View style={[styles.strip, { backgroundColor: t.press }]}>{strip}</View> : null
      ) : (
        <View style={[styles.masthead, { backgroundColor: t.press, paddingBottom: strip != null ? 14 : 20 }]}>
          <T variant="h2" accessibilityRole="header" numberOfLines={2} style={[styles.largeTitle, { color: t.onPress }]}>
            {title}
          </T>
          {strip}
        </View>
      )}
      {slug ? <CafeHueBand slug={slug} hue={hue} size={2} /> : <View style={{ height: 2, backgroundColor: t.press }} />}
    </View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      {NATIVE_LARGE_TITLE ? <Stack.Screen options={{ title }} /> : <Stack.Screen options={{ headerShown: false, title }} />}
      {/* Edge-to-edge Android: press under the status bar, so the header reads as one dark block. */}
      {NATIVE_LARGE_TITLE || insets.top === 0 ? null : <View style={{ height: insets.top, backgroundColor: t.press }} />}
      <ScrollView
        style={styles.fill}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        // iOS: the scroll view runs under the large-title bar (automatic insets), and RN pins
        // sticky headers to the frame's top — behind the bar. There it simply scrolls along.
        stickyHeaderIndices={sticky != null && !NATIVE_LARGE_TITLE ? [2] : undefined}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              // iOS draws the spinner on the press header; Android on its own `surface` disc.
              tintColor={NATIVE_LARGE_TITLE ? t.onPress : t.ink}
              colors={[t.ink]}
              progressBackgroundColor={t.surface}
            />
          ) : undefined
        }
      >
        {head}
        <View style={styles.column}>{top != null ? <View style={styles.top}>{top}</View> : null}</View>
        {sticky != null ? (
          <View style={{ backgroundColor: t.bg }}>
            <View style={styles.column}>{sticky}</View>
          </View>
        ) : (
          <View />
        )}
        <View
          pointerEvents={bodyPointerEvents}
          accessibilityState={busy ? { busy: true } : undefined}
          aria-busy={busy || undefined}
          style={[styles.column, styles.body, bodyStyle]}
        >
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { position: "absolute", left: 0, right: 0, bottom: "100%", height: BACKDROP },
  masthead: { paddingHorizontal: space.gutter, paddingTop: 20, gap: 8 },
  largeTitle: { fontFamily: headerType.largeTitle.fontFamily, fontSize: headerType.largeTitle.fontSize, lineHeight: 40, letterSpacing: -0.6 },
  strip: { paddingHorizontal: space.gutter, paddingTop: 2, paddingBottom: 14 },
  column: { width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", paddingHorizontal: space.gutter },
  top: { paddingTop: 16, gap: 12 },
  body: { flexGrow: 1, paddingTop: 16 },
});
