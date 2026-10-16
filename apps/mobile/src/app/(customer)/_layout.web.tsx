/**
 * Customer tabs in the browser preview: JS tabs with lucide icons (see `_layout.tsx` for native).
 * The active order shows as the Siparişler badge and the floating pill 8pt above the tab bar
 * (the Android / iOS < 26 behaviour, §8.4).
 */
import { Tabs } from "expo-router/js-tabs";
import { Coffee, ReceiptText, UserRound } from "lucide-react-native";
import { WithActiveOrderPill } from "@/components/order";
import { useActiveOrder, useActiveOrderPolling } from "@/lib/active-order";
import { useSession } from "@/lib/session";
import { useTokens } from "@/lib/theme";
import { CoinGlyph, tabIcon, WebTabBar, webTabsOptions } from "@/lib/web-tabs";

const KAFELER = tabIcon(Coffee);
const SIPARISLER = tabIcon(ReceiptText);
const CUZDAN = tabIcon(CoinGlyph);
const PROFIL = tabIcon(UserRound);

export default function CustomerTabsWeb() {
  const t = useTokens();
  const { api, signedIn } = useSession();
  useActiveOrderPolling(api, signedIn);
  const active = useActiveOrder();

  return (
    <Tabs
      screenOptions={webTabsOptions(t)}
      tabBar={(props) => (
        <WithActiveOrderPill>
          <WebTabBar {...props} />
        </WithActiveOrderPill>
      )}
    >
      <Tabs.Screen name="(kafeler)" options={{ title: "Kafeler", tabBarIcon: KAFELER }} />
      <Tabs.Screen
        name="(siparisler)"
        options={{ title: "Siparişler", tabBarIcon: SIPARISLER, tabBarBadge: active ? "1" : undefined }}
      />
      <Tabs.Screen name="(cuzdan)" options={{ title: "Cüzdan", tabBarIcon: CUZDAN }} />
      <Tabs.Screen name="(profil)" options={{ title: "Profil", tabBarIcon: PROFIL }} />
    </Tabs>
  );
}
