import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/lib/session";
import { serif, useTheme } from "@/lib/theme";

export default function RootLayout() {
  const t = useTheme();
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.ink,
          headerTitleStyle: { ...serif },
          contentStyle: { backgroundColor: t.bg },
          headerBackTitle: "Geri",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="giris" options={{ title: "Giriş", presentation: "modal" }} />
        <Stack.Screen name="kafe/[slug]" options={{ title: "" }} />
        <Stack.Screen name="siparis/[id]" options={{ title: "Sipariş" }} />
      </Stack>
    </SessionProvider>
  );
}
