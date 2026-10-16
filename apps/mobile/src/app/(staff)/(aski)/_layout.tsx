import { Stack } from "expo-router";
import { useMemo } from "react";
import { Platform } from "react-native";
import { staffStackOptions } from "@/lib/screen-options";
import { useTokens } from "@/lib/theme";

/** The Askı tab's own stack, under the press header (§10.10). */
export default function AskiStack() {
  const t = useTokens();
  const options = useMemo(() => staffStackOptions(t), [t]);
  return (
    <Stack screenOptions={options}>
      {/* iOS: the native large title on press. Elsewhere the screen draws the same press masthead itself. */}
      <Stack.Screen name="kafe-aski" options={{ title: "Askı", headerShown: Platform.OS === "ios" }} />
    </Stack>
  );
}
