// `peni-kodum` (fullScreenModal, §10.6): frame and close button; the coin, QR and brightness
// handling arrive in §16 step 6.
import { actionCopy, peniCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hit, typeStyle, useTokens } from "@/lib/theme";

export default function PeniKodum() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionCopy.close}
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: hit,
            height: hit,
            borderRadius: hit / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? t.surface2 : "transparent",
          })}
        >
          <X size={24} strokeWidth={1.75} color={t.ink} />
        </Pressable>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, gap: 12 }}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={1.3}
          style={[typeStyle("h2"), { color: t.ink, textAlign: "center" }]}
        >
          {peniCopy.peniCode}
        </Text>
        <Text maxFontSizeMultiplier={1.6} style={[typeStyle("body"), { color: t.ink2, textAlign: "center" }]}>
          {peniCopy.peniCodeBody}
        </Text>
      </View>
    </View>
  );
}
