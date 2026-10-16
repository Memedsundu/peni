/**
 * Root layout (design-system.md §4.3, §8.4).
 *
 * The splash stays up until the five font files are loaded AND the persisted mode (and the
 * stored session) are read; only then does the navigator mount, so the right group renders
 * first and nothing flashes in a fallback face.
 */
import { Archivo_400Regular } from "@expo-google-fonts/archivo/400Regular";
import { Archivo_600SemiBold } from "@expo-google-fonts/archivo/600SemiBold";
import { ArchivoNarrow_600SemiBold } from "@expo-google-fonts/archivo-narrow/600SemiBold";
import { Brygada1918_500Medium_Italic } from "@expo-google-fonts/brygada-1918/500Medium_Italic";
import { Brygada1918_600SemiBold } from "@expo-google-fonts/brygada-1918/600SemiBold";
import { useFonts } from "expo-font";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useMemo } from "react";
import { ToastHost } from "@/components/ui/toast";
import { CartProvider } from "@/lib/cart";
import { ModeProvider, useMode } from "@/lib/mode";
import { rootStackOptions, SHEET_DETENTS, sheetOptions, type SheetName } from "@/lib/screen-options";
import { SessionProvider, useSession } from "@/lib/session";
import { fonts, navTheme, useTokens } from "@/lib/theme";

export { ErrorBoundary } from "expo-router";

/** A deep link straight to a root-stack screen (an order, a café) still has the tabs beneath it. */
export const unstable_settings = { anchor: "(customer)" };

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

/**
 * Exactly the five static TTFs (D22, about 606KB). Imported from each weight's own entry, so
 * Metro bundles only these files and not every weight of each family.
 */
const FONT_FILES = {
  [fonts.display]: Brygada1918_600SemiBold,
  [fonts.displayItalic]: Brygada1918_500Medium_Italic,
  [fonts.sans]: Archivo_400Regular,
  [fonts.sansSemiBold]: Archivo_600SemiBold,
  [fonts.narrow]: ArchivoNarrow_600SemiBold,
};

/** Sheets in the root stack (§8.4), with their detents. */
const SHEETS = Object.keys(SHEET_DETENTS) as SheetName[];

export default function RootLayout() {
  return (
    <SessionProvider>
      <ModeProvider>
        <Shell />
      </ModeProvider>
    </SessionProvider>
  );
}

function Shell() {
  const t = useTokens();
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const { mode, ready: modeReady } = useMode();
  const { ready: sessionReady } = useSession();
  // A font that fails to load must not trap the app behind the splash: fall back and go on.
  const ready = (fontsLoaded || !!fontError) && modeReady && sessionReady;

  // The root view behind every screen follows the theme (keyboard, sheet and push edges).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  const theme = useMemo(() => navTheme(t), [t]);
  const options = useMemo(() => rootStackOptions(t), [t]);

  if (!ready) return null;

  return (
    <ThemeProvider value={theme}>
      <CartProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={options}>
          <Stack.Protected guard={mode === "customer"} redirectTo="/tezgah">
            <Stack.Screen name="(customer)" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={mode === "staff"} redirectTo="/">
            <Stack.Screen name="(staff)" options={{ headerShown: false }} />
          </Stack.Protected>

          {/* Root-stack pushes: no tab bar here, so the café keeps one floating layer (the cart bar). */}
          <Stack.Screen name="kafe/[slug]" options={{ title: "" }} />
          <Stack.Screen name="siparis/[id]" options={{ title: "Sipariş" }} />
          <Stack.Screen name="masa-kurallari" options={{ title: "Masa kuralları" }} />

          {/* Modals */}
          <Stack.Screen name="giris" options={{ title: "Giriş", presentation: "modal" }} />
          <Stack.Screen name="peni-kodum" options={{ presentation: "fullScreenModal", headerShown: false }} />

          {/* Sheets: the title lives in the content (Android has no native header in a sheet). */}
          {SHEETS.map((name) => (
            <Stack.Screen key={name} name={name} options={sheetOptions(t, SHEET_DETENTS[name])} />
          ))}
        </Stack>
        <ToastHost />
      </CartProvider>
    </ThemeProvider>
  );
}
