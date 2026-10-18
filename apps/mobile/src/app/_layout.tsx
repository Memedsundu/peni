import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { InstrumentSerif_400Regular } from "@expo-google-fonts/instrument-serif/400Regular";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../lib/session";
import { useColors } from "../lib/theme";
import { NameStep } from "../ui/sign-in";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, InstrumentSerif_400Regular });
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <Screens fonts={fontsLoaded || !!fontError} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** Keeps the splash up until the fonts and the stored session are read. */
function Screens({ fonts }: { fonts: boolean }) {
  const { ready, needsName } = useSession();
  const c = useColors();
  const shown = fonts && ready;
  useEffect(() => {
    if (shown) void SplashScreen.hideAsync();
  }, [shown]);
  if (!shown) return null;
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }} />
      {needsName && <NameStep />}
    </>
  );
}
