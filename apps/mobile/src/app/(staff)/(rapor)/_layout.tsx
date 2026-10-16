import { Stack } from "expo-router";
import { useMemo } from "react";
import { staffStackOptions } from "@/lib/screen-options";
import { useTokens } from "@/lib/theme";

/** The Rapor tab's own stack, under the press header (§10.10). */
export default function RaporStack() {
  const t = useTokens();
  const options = useMemo(() => staffStackOptions(t), [t]);
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="rapor" options={{ title: "Rapor" }} />
    </Stack>
  );
}
