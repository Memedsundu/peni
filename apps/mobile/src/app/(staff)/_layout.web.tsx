/** Kafe modu tabs in the browser preview: JS tabs with lucide icons (see `_layout.tsx` for native). */
import { Tabs } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import { ChartColumn, Coffee, Inbox, Settings } from "lucide-react-native";
import { StaffBoardPoller } from "@/components/staff/poller";
import { useNewOrderCount } from "@/lib/staff-badge";
import { useTokens } from "@/lib/theme";
import { tabIcon, WebTabBar, webTabsOptions } from "@/lib/web-tabs";

const TEZGAH = tabIcon(Inbox);
const ASKI = tabIcon(Coffee);
const RAPOR = tabIcon(ChartColumn);
const AYARLAR = tabIcon(Settings);

export default function StaffTabsWeb() {
  const t = useTokens();
  const newOrders = useNewOrderCount();
  return (
    <>
      <StatusBar style="light" />
      {/* One poll for every tab: new orders ring, badge and buzz wherever the staff are. */}
      <StaffBoardPoller />
      <Tabs screenOptions={webTabsOptions(t)} tabBar={(props) => <WebTabBar {...props} />}>
        <Tabs.Screen
          name="(tezgah)"
          options={{ title: "Tezgâh", tabBarIcon: TEZGAH, tabBarBadge: newOrders > 0 ? newOrders : undefined }}
        />
        <Tabs.Screen name="(aski)" options={{ title: "Askı", tabBarIcon: ASKI }} />
        <Tabs.Screen name="(rapor)" options={{ title: "Rapor", tabBarIcon: RAPOR }} />
        <Tabs.Screen name="(ayarlar)" options={{ title: "Ayarlar", tabBarIcon: AYARLAR }} />
      </Tabs>
    </>
  );
}
