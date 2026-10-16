/**
 * The signed-out strip on Kafeler (design-system.md §9.1, §10.1): a slim, flat `surface2`
 * panel, radius 10, padding 12 — "Kafeye katıl, peni biriktir." and a quiet "Giriş yap" that
 * opens the `giris` modal. A 28pt generic coin leads it: the sentence is about peni, and copper
 * means peni.
 */
import { actionCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Coin } from "@/components/brand";
import { Button, T } from "@/components/ui";
import { radius, useTokens } from "@/lib/theme";

export const SIGNED_OUT_LINE = "Kafeye katıl, peni biriktir.";

export function SignedOutStrip() {
  const t = useTokens();
  return (
    <View style={[styles.strip, { backgroundColor: t.surface2 }]}>
      <Coin size={28} />
      <T variant="body" style={styles.text}>
        {SIGNED_OUT_LINE}
      </T>
      <Button
        variant="quiet"
        size="sm"
        title={actionCopy.signIn}
        accessibilityHint="Telefon numaranla giriş ekranını açar"
        onPress={() => router.push("/giris")}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.control,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 4,
    minHeight: 56,
  },
  text: { flex: 1, minWidth: 0 },
  button: { flexShrink: 0 },
});
