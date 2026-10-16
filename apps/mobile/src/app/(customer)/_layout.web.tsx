/** Customer tabs in the browser preview: JS tabs with lucide icons (see `_layout.tsx` for native). */
import { Tabs } from "expo-router/js-tabs";
import { Coffee, ReceiptText, UserRound } from "lucide-react-native";
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
    <Tabs screenOptions={webTabsOptions(t)} tabBar={(props) => <WebTabBar {...props} />}>
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
