import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useSession } from "../../lib/session";
import { FONTS, useColors } from "../../lib/theme";

type Icon = (props: { color: ColorValue }) => React.ReactElement;

const stroke = { strokeWidth: 1.7, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONS: Record<"cafes" | "earn" | "treats" | "me", Icon> = {
  cafes: ({ color }) => (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" stroke={color} {...stroke} />
    </Svg>
  ),
  earn: ({ color }) => (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Rect x={4} y={4} width={6} height={6} rx={1} stroke={color} {...stroke} />
      <Rect x={14} y={4} width={6} height={6} rx={1} stroke={color} {...stroke} />
      <Rect x={4} y={14} width={6} height={6} rx={1} stroke={color} {...stroke} />
      <Path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 20h1M20 14v1" stroke={color} {...stroke} />
    </Svg>
  ),
  treats: ({ color }) => (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Rect x={4} y={9} width={16} height={11} rx={1.5} stroke={color} {...stroke} />
      <Path d="M3 9h18M12 9v11M12 9c-1.5-3-5-4-5-1.5S12 9 12 9zm0 0c1.5-3 5-4 5-1.5S12 9 12 9z" stroke={color} {...stroke} />
    </Svg>
  ),
  me: ({ color }) => (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Circle cx={12} cy={8.5} r={3.5} stroke={color} {...stroke} />
      <Path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5" stroke={color} {...stroke} />
    </Svg>
  ),
};

/** The four tabs of a signed-in customer; signed out goes to the welcome screen. */
export default function TabsLayout() {
  const { me, t } = useSession();
  const c = useColors();
  const insets = useSafeAreaInsets();
  if (!me) return <Redirect href="/hosgeldin" />;
  const tab = (title: string, icon: keyof typeof ICONS) => ({
    title,
    tabBarIcon: ({ color }: { color: ColorValue }) => ICONS[icon]({ color }),
  });
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.paper, borderTopColor: c.line, height: 62 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6 },
        tabBarLabelStyle: { fontFamily: FONTS.medium, fontSize: 12, lineHeight: 16 },
        sceneStyle: { backgroundColor: c.paper },
      }}
    >
      <Tabs.Screen name="index" options={tab(t("tabCafes"), "cafes")} />
      <Tabs.Screen name="p" options={tab(t("tabEarn"), "earn")} />
      <Tabs.Screen name="hediyeler" options={tab(t("tabTreats"), "treats")} />
      <Tabs.Screen name="profil" options={tab(t("tabMe"), "me")} />
    </Tabs>
  );
}
