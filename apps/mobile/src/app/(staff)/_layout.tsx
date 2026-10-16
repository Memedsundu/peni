/**
 * Kafe modu tabs (design-system.md §8.4, D25): Tezgâh · Askı · Rapor · Ayarlar. The browser
 * preview uses `_layout.web.tsx`.
 */
import { dark, light } from "@peni/brand/tokens";
import { NativeTabs } from "expo-router/native-tabs";
import { StatusBar } from "expo-status-bar";
import { DynamicColorIOS, Platform } from "react-native";
import { StaffBoardPoller } from "@/components/staff/poller";
import { useNewOrderCount } from "@/lib/staff-badge";
import { fonts, useTokens } from "@/lib/theme";

export default function StaffTabs() {
  const t = useTokens();
  const newOrders = useNewOrderCount();
  const ios = Platform.OS === "ios";
  return (
    <>
      {/* Every staff header is press-dark in both themes (§10.10). */}
      <StatusBar style="light" />
      {/* One poll for every tab: new orders ring, badge and buzz wherever the staff are. */}
      <StaffBoardPoller />
      <NativeTabs
        tintColor={ios ? DynamicColorIOS({ light: light.ink, dark: dark.ink }) : t.ink}
        minimizeBehavior="never"
        labelStyle={
          ios
            ? { fontFamily: fonts.sansSemiBold }
            : {
                default: { fontFamily: fonts.sans, color: t.ink2 },
                selected: { fontFamily: fonts.sansSemiBold, color: t.ink },
              }
        }
        iconColor={ios ? undefined : { default: t.ink2, selected: t.ink }}
        backgroundColor={ios ? undefined : t.surface}
        indicatorColor={t.surface2}
        rippleColor={t.surface2}
        badgeBackgroundColor={t.masa}
        badgeTextColor={t.onMasa}
      >
        <NativeTabs.Trigger name="(tezgah)">
          <NativeTabs.Trigger.Label>Tezgâh</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="tray.full" md="inbox" />
          <NativeTabs.Trigger.Badge hidden={newOrders === 0}>{String(newOrders)}</NativeTabs.Trigger.Badge>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(aski)">
          <NativeTabs.Trigger.Label>Askı</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="cup.and.saucer" md="coffee" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(rapor)">
          <NativeTabs.Trigger.Label>Rapor</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="chart.bar" md="bar_chart" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(ayarlar)">
          <NativeTabs.Trigger.Label>Ayarlar</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
