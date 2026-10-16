import { Stack } from "expo-router";
import { useMemo } from "react";
import { tabStackOptions } from "@/lib/screen-options";
import { useTokens } from "@/lib/theme";

/** The Profil tab's own stack (§8.4 Headers). */
export default function ProfilStack() {
  const t = useTokens();
  const options = useMemo(() => tabStackOptions(t), [t]);
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="profil" options={{ title: "Profil" }} />
    </Stack>
  );
}
