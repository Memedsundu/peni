// Kafe modu Askı (§10.10): the rail plus till steppers arrive in §16 step 6. For now, the caption.
import { askiCaption, askiCopy } from "@peni/brand/copy";
import { formatPeni } from "@peni/brand/format";
import { useCallback } from "react";
import { View } from "react-native";
import { Body, ErrorText, Label, Screen, useLegacyTheme } from "@/components/legacy-ui";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";

export default function KafeAski() {
  const { api, staffKey, staffSlug } = useSession();
  const t = useLegacyTheme();
  const { data, error, loading, refresh } = useLoad(
    useCallback(
      () => (staffKey && staffSlug ? api.staff.dashboard(staffSlug) : Promise.resolve(null)),
      [api, staffKey, staffSlug],
    ),
  );
  const a = data?.askida;
  const caption = a ? askiCaption(a) : null;

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <ErrorText>{error}</ErrorText>
      {a && caption && (
        <View style={{ backgroundColor: t.askiSoft, borderRadius: 14, padding: 16, gap: 8 }}>
          <Label color={t.askiInk}>{askiCopy.legend}</Label>
          <Body strong>{caption.line1}</Body>
          <Body muted>{`Askıda ${formatPeni(a.balancePeni)} var.`}</Body>
          {caption.line3 && <Body muted>{caption.line3}</Body>}
        </View>
      )}
    </Screen>
  );
}
