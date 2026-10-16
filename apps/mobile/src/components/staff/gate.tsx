/**
 * Kafe modu with no usable staff key (forgotten in Ayarlar, or turned down by the server):
 * every tab says so in one calm sentence and offers the `kafe-modu` sheet, which validates a
 * key against a café picked from the list (§10.7). "Müşteri moduna dön" stays one tap away.
 */
import { errorCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Icon, T } from "@/components/ui";
import { useMode } from "@/lib/mode";
import { radius, useTokens } from "@/lib/theme";

export const GATE_TEXT = "Kafe modunu açmak için personel anahtarını gir.";
export const GATE_ACTION = "Anahtarı gir";
export const BACK_TO_CUSTOMER = "Müşteri moduna dön";

export function StaffGate({ rejected = false }: { rejected?: boolean }) {
  const t = useTokens();
  const { setMode } = useMode();
  return (
    <View style={styles.wrap}>
      {rejected ? <Banner tone="danger" title={errorCopy.staffKey} /> : null}
      <View style={styles.center}>
        <View aria-hidden style={[styles.disc, { backgroundColor: t.surface2 }]}>
          <Icon icon={KeyRound} size={32} color={t.ink2} />
        </View>
        <T variant="body" align="center" style={styles.text}>
          {GATE_TEXT}
        </T>
      </View>
      <View style={styles.actions}>
        <Button title={GATE_ACTION} size="lg" fullWidth onPress={() => router.push("/kafe-modu")} />
        <Button title={BACK_TO_CUSTOMER} variant="quiet" fullWidth onPress={() => void setMode("customer")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 24, paddingTop: 8 },
  center: { alignItems: "center", gap: 16, paddingTop: 24 },
  disc: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  text: { maxWidth: 300 },
  actions: { gap: 8 },
});
