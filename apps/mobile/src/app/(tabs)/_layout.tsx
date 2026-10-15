import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { serif, useTheme } from "@/lib/theme";

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { ...serif, color: t.ink },
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarActiveTintColor: t.copper,
        tabBarInactiveTintColor: t.ink2,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Kafeler", headerTitle: "peni", tabBarIcon: icon("☕") }} />
      <Tabs.Screen name="siparisler" options={{ title: "Siparişler", tabBarIcon: icon("🧾") }} />
      <Tabs.Screen name="cuzdan" options={{ title: "Cüzdan", tabBarIcon: icon("●") }} />
      <Tabs.Screen name="panel" options={{ title: "Kafe modu", tabBarIcon: icon("⚑") }} />
    </Tabs>
  );
}
