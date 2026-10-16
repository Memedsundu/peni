// Ayarlar (§10.10), first cut on the legacy kit; rebuilt on the new primitives in §16 step 6.
import { staffCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Body, Button, Card, Label, Screen, useLegacyTheme } from "@/components/legacy-ui";
import { haptic } from "@/lib/haptics";
import { useMode } from "@/lib/mode";
import { useSession } from "@/lib/session";
import { useStaffSound } from "@/lib/staff-prefs";
import { space, switchColors, typeStyle } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function Ayarlar() {
  const { api, staffKey, staffSlug, setStaff } = useSession();
  const { setMode } = useMode();
  const t = useLegacyTheme();
  const [soundOn, setSoundOn] = useStaffSound();
  const { data: cafes } = useLoad(useCallback(() => api.cafes.list(), [api]));
  const cafeName = cafes?.cafes.find((c) => c.slug === staffSlug)?.name ?? staffSlug;

  const row = {
    minHeight: space.row,
    paddingVertical: space.rowV,
    paddingHorizontal: space.rowH,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  } as const;

  return (
    <Screen>
      <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Kafeyi değiştir"
          onPress={() => router.push("/kafe-modu")}
          style={({ pressed }) => [row, { backgroundColor: pressed ? t.surface2 : "transparent" }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Label>Kafe</Label>
            <Text maxFontSizeMultiplier={1.6} style={[typeStyle("body"), { color: t.ink }]}>
              {cafeName ?? "Seçilmedi"}
            </Text>
          </View>
          <ChevronRight size={20} strokeWidth={1.75} color={t.ink2} />
        </Pressable>
        <View style={[row, { borderTopWidth: 1, borderTopColor: t.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text maxFontSizeMultiplier={1.6} style={[typeStyle("body"), { color: t.ink }]}>
              Ses
            </Text>
            <Text maxFontSizeMultiplier={1.6} style={[typeStyle("meta"), { color: t.ink2 }]}>
              {soundOn ? staffCopy.soundOn : staffCopy.soundOff}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Ses"
            value={soundOn}
            onValueChange={(on) => {
              haptic("selection");
              setSoundOn(on);
            }}
            {...switchColors(t)}
          />
        </View>
        {staffKey ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void setStaff(null)}
            style={({ pressed }) => [
              row,
              { borderTopWidth: 1, borderTopColor: t.line, backgroundColor: pressed ? t.surface2 : "transparent" },
            ]}
          >
            <Text maxFontSizeMultiplier={1.6} style={[typeStyle("body"), { color: t.danger, flex: 1 }]}>
              Personel anahtarını unut
            </Text>
          </Pressable>
        ) : null}
      </Card>
      {!staffKey && <Body muted>Personel anahtarı kayıtlı değil.</Body>}
      <Button title="Müşteri moduna dön" variant="ghost" onPress={() => void setMode("customer")} />
    </Screen>
  );
}
