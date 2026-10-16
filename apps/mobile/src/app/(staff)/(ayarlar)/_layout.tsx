import { Stack } from "expo-router";
import { useMemo } from "react";
import { staffStackOptions } from "@/lib/screen-options";
import { useTokens } from "@/lib/theme";

/** The Ayarlar tab's own stack, under the press header (§10.10). */
export default function AyarlarStack() {
  const t = useTokens();
  const options = useMemo(() => staffStackOptions(t), [t]);
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="ayarlar" options={{ title: "Ayarlar" }} />
    </Stack>
  );
}
