/**
 * Customer tabs (design-system.md §8.4): system NativeTabs on iOS and Android. The browser
 * preview uses `_layout.web.tsx` (JS tabs), because native tabs render as a top tab list on web.
 *
 * Active order (§8.4): the Siparişler badge "1"; on iOS 26 the `BottomAccessory`; on Android
 * and iOS < 26 the floating pill 8pt above the tab bar, on tab screens only (root-stack
 * screens cover the tabs, so the café keeps one floating layer: its cart bar).
 */
import { dark, light } from "@peni/brand/tokens";
import { NativeTabs } from "expo-router/native-tabs";
import { DynamicColorIOS, Platform, StyleSheet, View } from "react-native";
import { ActiveOrderAccessory, ActiveOrderReadyCue, FloatingActiveOrderPill } from "@/components/order";
import { useActiveOrder, useActiveOrderPolling, usesBottomAccessory } from "@/lib/active-order";
import { useSession } from "@/lib/session";
import { fonts, useTokens } from "@/lib/theme";

const ACCESSORY = usesBottomAccessory();

export default function CustomerTabs() {
  const t = useTokens();
  const { api, signedIn } = useSession();
  useActiveOrderPolling(api, signedIn);
  const active = useActiveOrder();

  const ios = Platform.OS === "ios";
  return (
    <View style={styles.fill}>
      <NativeTabs
        // Ink, never copper: copper is for peni only.
        tintColor={ios ? DynamicColorIOS({ light: light.ink, dark: dark.ink }) : t.ink}
        minimizeBehavior="onScrollDown"
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
        <NativeTabs.Trigger name="(kafeler)">
          <NativeTabs.Trigger.Label>Kafeler</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "cup.and.saucer", selected: "cup.and.saucer.fill" }} md="local_cafe" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(siparisler)">
          <NativeTabs.Trigger.Label>Siparişler</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="list.bullet.rectangle" md="receipt_long" />
          <NativeTabs.Trigger.Badge hidden={!active}>1</NativeTabs.Trigger.Badge>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(cuzdan)">
          <NativeTabs.Trigger.Label>Cüzdan</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "circle.circle", selected: "circle.circle.fill" }} md="toll" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(profil)">
          <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
            md="account_circle"
          />
        </NativeTabs.Trigger>

        {/* iOS 26: the active order rides above the tab bar. Its state lives outside the accessory. */}
        {ACCESSORY && active ? (
          <NativeTabs.BottomAccessory>
            <ActiveOrderAccessory order={active} />
          </NativeTabs.BottomAccessory>
        ) : null}
      </NativeTabs>

      {/* Android and iOS < 26: the floating pill over the tabs. iOS 26: only the Hazır cue. */}
      {ACCESSORY ? <ActiveOrderReadyCue /> : <FloatingActiveOrderPill />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
