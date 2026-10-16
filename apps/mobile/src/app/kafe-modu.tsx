// `kafe-modu` sheet (§10.7): the staff key and a café picker (never a free-text slug). Primary
// "Kafe moduna geç" validates with staff.dashboard(slug), stores the key and the slug, sets the
// mode and lands on /tezgah. First cut on the legacy kit; restyled in §16 step 6.
import { createPeniClient } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, ErrorText, Input, Label, SheetBody, useLegacyTheme } from "@/components/legacy-ui";
import { haptic } from "@/lib/haptics";
import { useMode } from "@/lib/mode";
import { API_URL, useSession } from "@/lib/session";
import { radius, space, typeStyle } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function KafeModuSheet() {
  const { api, staffKey, staffSlug, staffCafes, setStaff } = useSession();
  const { mode, setMode } = useMode();
  const t = useLegacyTheme();
  const { data } = useLoad(useCallback(() => api.cafes.list(), [api]));
  const [slug, setSlug] = useState<string | null>(staffSlug ?? staffCafes[0]?.slug ?? null);
  const [key, setKey] = useState(staffKey ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cafes = data?.cafes ?? [];

  async function enter() {
    if (!slug || !key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Validate with exactly this key before storing it.
      const probe = createPeniClient({ baseUrl: API_URL, getStaffKey: () => key.trim() });
      await probe.staff.dashboard(slug);
      await setStaff({ key: key.trim(), slug });
      haptic("success");
      // Already in Kafe modu (switching café from Ayarlar): just close the sheet.
      if (mode === "staff") router.back();
      else await setMode("staff");
    } catch {
      haptic("error");
      setError(errorCopy.staffKey);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetBody title="Kafe modu">
      <View style={{ gap: 8 }}>
        <Label>Personel anahtarı</Label>
        <Input
          value={key}
          onChangeText={setKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          accessibilityLabel="Personel anahtarı"
          textContentType="password"
        />
      </View>
      <View style={{ gap: 8 }}>
        <Label>Kafe</Label>
        <View style={{ borderRadius: radius.control, borderWidth: 1.5, borderColor: t.lineStrong, overflow: "hidden" }}>
          {cafes.map((c, i) => {
            const selected = c.slug === slug;
            return (
              <Pressable
                key={c.slug}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  haptic("selection");
                  setSlug(c.slug);
                }}
                style={({ pressed }) => ({
                  minHeight: space.row,
                  paddingHorizontal: space.rowH,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: t.line,
                  backgroundColor: pressed ? t.surface2 : t.surface,
                })}
              >
                <Text
                  maxFontSizeMultiplier={1.6}
                  style={[typeStyle(selected ? "strong" : "body"), { color: t.ink, flex: 1 }]}
                >
                  {c.name}
                </Text>
                {selected ? <Check size={20} strokeWidth={1.75} color={t.ink} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Kafe moduna geç" onPress={enter} disabled={busy || !slug || !key.trim()} />
    </SheetBody>
  );
}
