import { Stack } from "expo-router";
import { useMemo } from "react";
import { tabStackOptions } from "@/lib/screen-options";
import { useTokens } from "@/lib/theme";

/** The Siparişler tab's own stack (§8.4 Headers). */
export default function SiparislerStack() {
  const t = useTokens();
  const options = useMemo(() => tabStackOptions(t), [t]);
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="siparisler" options={{ title: "Siparişler" }} />
    </Stack>
  );
}
