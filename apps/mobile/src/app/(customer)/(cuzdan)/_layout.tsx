import { router, Stack } from "expo-router";
import { QrCode } from "lucide-react-native";
import { useMemo } from "react";
import { Platform, Pressable } from "react-native";
import { tabStackOptions } from "@/lib/screen-options";
import { hit, useTokens } from "@/lib/theme";

const openPeniKodu = () => router.push("/peni-kodum");

/**
 * The Cüzdan tab's own stack (§8.4 Headers, §10.5). "Peni kodum" sits in the header: a native
 * `Stack.Toolbar` button (SF Symbol `qrcode`) on iOS; Android and the browser preview have no
 * SF Symbols, so they get a 44pt lucide `QrCode` button instead.
 */
export default function CuzdanStack() {
  const t = useTokens();
  const ios = Platform.OS === "ios";
  const options = useMemo(() => tabStackOptions(t), [t]);
  return (
    <Stack screenOptions={options}>
      <Stack.Screen
        name="cuzdan"
        options={{
          title: "Cüzdan",
          headerRight: ios
            ? undefined
            : () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Peni kodum"
                  onPress={openPeniKodu}
                  hitSlop={4}
                  style={({ pressed }) => ({
                    width: hit,
                    height: hit,
                    borderRadius: hit / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? t.surface2 : "transparent",
                  })}
                >
                  <QrCode size={24} strokeWidth={1.75} color={t.ink} />
                </Pressable>
              ),
        }}
      >
        {ios ? (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button icon="qrcode" accessibilityLabel="Peni kodum" onPress={openPeniKodu} />
          </Stack.Toolbar>
        ) : null}
      </Stack.Screen>
    </Stack>
  );
}
