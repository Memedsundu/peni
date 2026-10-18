import { StyleSheet, Text, View, useColorScheme } from "react-native";

/** Placeholder until the new screens are built (plan pieces 4 and 16, docs/plan.md). */
export default function Home() {
  const dark = useColorScheme() === "dark";
  const ink = dark ? "#F5F5F5" : "#111111";
  return (
    <View style={[styles.screen, { backgroundColor: dark ? "#111111" : "#FFFFFF" }]}>
      <Text style={[styles.brand, { color: ink }]}>Peni</Text>
      <Text style={[styles.headline, { color: ink }]}>Sokağının kahvesi, şimdi cebinde.</Text>
      <Text style={styles.note}>Yeni Peni yapılıyor.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  brand: { fontSize: 14, letterSpacing: 0.5 },
  headline: { fontSize: 34, lineHeight: 40, fontFamily: "Georgia" },
  note: { fontSize: 16, color: "#6B6B6B" },
});
