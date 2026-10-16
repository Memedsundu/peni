import { Stack } from "expo-router";
import { useMemo } from "react";
import { Platform } from "react-native";
import { staffStackOptions } from "@/lib/screen-options";
import { useTokens } from "@/lib/theme";

/** The Ayarlar tab's own stack, under the press header (§10.10). */
export default function AyarlarStack() {
  const t = useTokens();
  const options = useMemo(() => staffStackOptions(t), [t]);
  return (
    <Stack screenOptions={options}>
      {/* iOS: the native large title on press. Elsewhere the screen draws the same press masthead itself. */}
      <Stack.Screen name="ayarlar" options={{ title: "Ayarlar", headerShown: Platform.OS === "ios" }} />
    </Stack>
  );
}
