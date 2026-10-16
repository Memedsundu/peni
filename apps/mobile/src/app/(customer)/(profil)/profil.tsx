// Profil (§10.7), first cut on the legacy kit; rebuilt on the new primitives in §16 step 6.
import { actionCopy, peniCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Children, useState, type ReactNode } from "react";
import { Platform, Pressable, Switch, Text, View } from "react-native";
import { Body, Button, Card, ErrorText, Screen, Title, useLegacyTheme } from "@/components/legacy-ui";
import { haptic, useHapticsPreference } from "@/lib/haptics";
import { useMode } from "@/lib/mode";
import { useSession } from "@/lib/session";
import { space, switchColors, typeStyle } from "@/lib/theme";

export default function Profil() {
  const { api, signedIn, customer, staffCafes, staffKey, staffSlug, signOut, refreshMe } = useSession();
  const { setMode } = useMode();
  const t = useLegacyTheme();
  const [hapticsOn, setHapticsOn] = useHapticsPreference();
  const [error, setError] = useState<string | null>(null);

  const enterStaff = () => {
    if (staffKey && staffSlug) void setMode("staff");
    else router.push("/kafe-modu");
  };

  return (
    <Screen>
      {signedIn ? (
        <View style={{ gap: 4 }}>
          <Title size={22}>{customer?.displayName ?? " "}</Title>
          {customer?.phone ? <Body muted>{customer.phone}</Body> : null}
        </View>
      ) : (
        <View style={{ backgroundColor: t.surface2, borderRadius: 10, padding: 12, gap: 8 }}>
          <Body>Kafeye katıl, peni biriktir.</Body>
          <Button title={actionCopy.signIn} small variant="ghost" onPress={() => router.push("/giris")} />
        </View>
      )}

      <RowGroup>
        {signedIn && customer && (
          <SettingRow
            label="Profilim görünsün"
            hint="Açıkken Peni masasında baş harflerin, cevaplarda adın görünür."
            end={
              <Switch
                accessibilityLabel="Profilim görünsün"
                value={customer.profileVisible}
                onValueChange={async (on) => {
                  haptic("selection");
                  setError(null);
                  try {
                    await api.me.updateProfile({ profileVisible: on });
                    await refreshMe();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
                {...switchColors(t)}
              />
            }
          />
        )}
        {signedIn && <SettingRow label={peniCopy.peniCode} onPress={() => router.push("/peni-kodum")} />}
        {Platform.OS !== "web" && (
          <SettingRow
            label="Titreşim"
            end={
              <Switch
                accessibilityLabel="Titreşim"
                value={hapticsOn}
                onValueChange={(on) => {
                  setHapticsOn(on);
                  if (on) haptic("selection");
                }}
                {...switchColors(t)}
              />
            }
          />
        )}
        <SettingRow label="Masa kuralları" onPress={() => router.push("/masa-kurallari")} />
        {staffCafes.length > 0 && <SettingRow label="Kafe moduna geç" onPress={enterStaff} />}
      </RowGroup>
      <ErrorText>{error}</ErrorText>

      {signedIn && <Button title={actionCopy.signOut} variant="berry" onPress={signOut} />}

      {staffCafes.length === 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: space.gap.lg }}>
          <Text style={[typeStyle("meta"), { color: t.ink2 }]}>Kafede mi çalışıyorsun?</Text>
          <Pressable
            accessibilityRole="button"
            onPress={enterStaff}
            hitSlop={12}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[typeStyle("meta"), { color: t.ink, textDecorationLine: "underline" }]}>Kafe modu</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

/** A raised card of flat rows with `line` dividers between them (never around the last). */
function RowGroup({ children }: { children: ReactNode }) {
  const t = useLegacyTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
      {rows.map((row, i) => (
        <View key={i} style={i ? { borderTopWidth: 1, borderTopColor: t.line } : undefined}>
          {row}
        </View>
      ))}
    </Card>
  );
}

function SettingRow({
  label,
  hint,
  end,
  onPress,
}: {
  label: string;
  hint?: string;
  end?: ReactNode;
  onPress?: () => void;
}) {
  const t = useLegacyTheme();
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text maxFontSizeMultiplier={1.6} style={[typeStyle("body"), { color: t.ink }]}>
          {label}
        </Text>
        {hint ? (
          <Text maxFontSizeMultiplier={1.6} style={[typeStyle("meta"), { color: t.ink2 }]}>
            {hint}
          </Text>
        ) : null}
      </View>
      {end ?? (onPress ? <ChevronRight size={20} strokeWidth={1.75} color={t.ink2} /> : null)}
    </>
  );
  const style = {
    minHeight: space.row,
    paddingVertical: space.rowV,
    paddingHorizontal: space.rowH,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  } as const;
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [style, { backgroundColor: pressed ? t.surface2 : "transparent" }]}
    >
      {body}
    </Pressable>
  );
}
