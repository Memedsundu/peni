/**
 * JS tab bar for the browser preview (react-native-web), standing in for NativeTabs, which
 * render as a top tab list on web. It is drawn like the web BottomNav (§8.2): 64pt + safe
 * area on `surface` with the floating elevation, four equal items, a 24px icon over a 13px
 * label; the active item is `ink` 600 with a 2px × 32px `ink` bar at the top edge, inactive
 * items are `ink-2`. A badge is a small `masa` count (the navigation `notification` colour).
 */
import type { BottomTabBarProps, TabsScreenOptions } from "expo-router/js-tabs";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View, type ColorValue } from "react-native";
import { CoinGlyph } from "@/components/brand/glyphs";
import { elevation, fonts, hit, useTokens, type Tokens } from "./theme";

export const TAB_BAR_HEIGHT = 64;

export function webTabsOptions(t: Tokens): TabsScreenOptions {
  return { headerShown: false, sceneStyle: { backgroundColor: t.bg } };
}

type GlyphComponent = LucideIcon | typeof CoinGlyph;

/** `tabBarIcon` for a lucide icon (or `CoinGlyph`) at 24 / 1.75. */
export function tabIcon(Icon: GlyphComponent) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon size={24} strokeWidth={1.75} color={color as string} />;
  };
}

/** The bar itself: pass as `<Tabs tabBar={(p) => <WebTabBar {...p} />}>`. */
export function WebTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const t = useTokens();
  return (
    <View
      role="tablist"
      style={[
        elevation("floating", t),
        {
          flexDirection: "row",
          backgroundColor: t.surface,
          // One hairline on top only (the dark floating ring would also draw the sides).
          borderWidth: 0,
          borderTopWidth: 1,
          borderTopColor: t.line,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = index === state.index;
        const { options } = descriptors[route.key]!;
        const label = options.title ?? route.name;
        const color = focused ? t.ink : t.ink2;
        const badge = options.tabBarBadge;
        const onPress = () => {
          const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            role="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={badge != null ? `${label}, ${badge}` : label}
            onPress={onPress}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: hit,
              alignItems: "center",
              paddingTop: 10,
              backgroundColor: pressed ? t.surface2 : "transparent",
            })}
          >
            <View
              style={{
                position: "absolute",
                top: -1,
                width: 32,
                height: 2,
                borderRadius: 1,
                backgroundColor: focused ? t.ink : "transparent",
              }}
            />
            <View>
              {options.tabBarIcon?.({ focused, color, size: 24 })}
              {badge != null ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -10,
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 4,
                    borderRadius: 9,
                    borderWidth: 2,
                    borderColor: t.surface,
                    backgroundColor: t.masa,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, lineHeight: 13, color: t.onMasa }}>
                    {String(badge)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={{
                marginTop: 4,
                fontFamily: focused ? fonts.sansSemiBold : fonts.sans,
                fontSize: 13,
                lineHeight: 16,
                color,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The Cüzdan tab glyph (§5): the brand `CoinGlyph` (re-exported so the tab layouts keep one
 * import). It is hidden from readers on every platform; the tab label names the tab.
 */
export { CoinGlyph };
