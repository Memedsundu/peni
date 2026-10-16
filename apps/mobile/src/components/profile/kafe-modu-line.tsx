/**
 * The way into Kafe modu for everyone who is not listed as staff [G19] (§10.7): at the very
 * bottom of Profil, in `meta ink2`, "Kafede mi çalışıyorsun?" and a quiet "Kafe modu" that opens
 * the `kafe-modu` sheet. Deliberately small: customers should barely notice it, and staff know
 * where it is. It is never part of the customer chrome (§17).
 */
import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Icon, PressableScale, T } from "@/components/ui";
import { fonts, radius, useTokens } from "@/lib/theme";

export const KAFE_MODU_QUESTION = "Kafede mi çalışıyorsun?";
export const KAFE_MODU = "Kafe modu";

export function KafeModuLine({ onPress }: { onPress?: () => void }) {
  const t = useTokens();
  return (
    <View style={styles.line}>
      <T variant="meta" color="ink2">
        {KAFE_MODU_QUESTION}
      </T>
      <PressableScale
        accessibilityLabel={KAFE_MODU}
        accessibilityHint="Personel anahtarıyla kafe moduna geçmeni sağlar"
        pressedColor={t.surface2}
        onPress={onPress ?? (() => router.push("/kafe-modu"))}
        style={styles.button}
      >
        <T variant="meta" style={styles.label}>
          {KAFE_MODU}
        </T>
        <Icon icon={ArrowRight} size={16} color={t.ink} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 4 },
  button: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: radius.control,
  },
  label: { fontFamily: fonts.sansSemiBold },
});
