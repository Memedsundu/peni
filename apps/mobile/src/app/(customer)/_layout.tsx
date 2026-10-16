/**
 * Customer tabs (design-system.md §8.4): system NativeTabs on iOS and Android. The browser
 * preview uses `_layout.web.tsx` (JS tabs), because native tabs render as a top tab list on web.
 */
import type { OrderDTO } from "@peni/api";
import { orderCopy, statusTrackIndex } from "@peni/brand/copy";
import { dark, light } from "@peni/brand/tokens";
import { router } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { DynamicColorIOS, Platform, Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useActiveOrder, useActiveOrderPolling } from "@/lib/active-order";
import { useSession } from "@/lib/session";
import { fonts, hit, useTokens } from "@/lib/theme";

export default function CustomerTabs() {
  const t = useTokens();
  const { api, signedIn } = useSession();
  useActiveOrderPolling(api, signedIn);
  const active = useActiveOrder();

  const ios = Platform.OS === "ios";
  return (
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

      {/*
        iOS 26: the active order rides above the tab bar (Android and iOS < 26 get the floating
        ActiveOrderPill on tab screens instead). The state lives outside the accessory.
      */}
      {ios && active ? (
        <NativeTabs.BottomAccessory>
          <ActiveOrderAccessory order={active} />
        </NativeTabs.BottomAccessory>
      ) : null}
    </NativeTabs>
  );
}

const RING = 20;
const RING_STROKE = 2;

/** "P-003 · Hazırlanıyor" with a 20pt progress ring. Rendered twice (regular and inline). */
function ActiveOrderAccessory({ order }: { order: OrderDTO }) {
  const t = useTokens();
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const code = order.orderNumber ?? "";
  const label = orderCopy.chip(code, order.status);
  const ready = order.status === "ready";
  const r = (RING - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const progress = (statusTrackIndex(order.status) + 1) / 4;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => router.push(`/siparis/${order.id}`)}
      style={{
        flex: 1,
        minHeight: hit,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: placement === "inline" ? 12 : 16,
      }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
          <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={t.lineStrong} strokeWidth={RING_STROKE} fill="none" />
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={ready ? t.success : t.ink}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c * progress} ${c}`}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={{
          flexShrink: 1,
          fontFamily: fonts.sansSemiBold,
          fontSize: 15,
          color: t.ink,
          fontVariant: ["tabular-nums"],
        }}
      >
        {placement === "inline" ? code || label : label}
      </Text>
    </Pressable>
  );
}
