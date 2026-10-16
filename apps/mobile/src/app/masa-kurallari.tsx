// Masa kuralları (push, §9.9 / §10.9): the same content as the web page, set in the §4.5 scale.
import { askiCopy } from "@peni/brand/copy";
import { trUpper } from "@peni/brand/format";
import { ScrollView, Text, View } from "react-native";
import { space, typeStyle, useTokens } from "@/lib/theme";

const RULES = [
  "Kapıdan giren herkes masaya oturabilir; kimse kimseden üstün değildir.",
  "Askıdaki çay herkesin. İsteyen alır, kimse sormaz.",
  "Bırakan söylemez, alan teşekkür borçlu değildir.",
  "Fikrine karşı çıkılabilir, sana değil.",
  "Masada konuşulan masada kalır; mesaj kutusu yok.",
  "Siparişin ancak barista dokununca ilerler; emeği görünür.",
  "Bir fincan kahvenin kırk yıl hatırı vardır.",
];

const WHY =
  "1554'te İstanbul'da, Tahtakale'de açılan ilk kahvehanelere 'mekteb-i irfan', yani irfan mektebi denirdi. Yaklaşık yüz yıl sonra, 1652'de İzmirli Pasqua Rosée Londra'nın ilk kahvehanesini açtı. Orada bir peni veren herkes aynı masaya otururdu; tüccar da öğrenci de konuşurdu. Adı 'peni üniversitesi' olarak kaldı. Peni o masayı mahallene geri getiriyor.";

/** Long reading text: body at 16/24 (§9.9). */
const reading = { ...typeStyle("body"), lineHeight: 24 };

export default function MasaKurallari() {
  const t = useTokens();
  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: space.gutter,
        paddingTop: 16,
        paddingBottom: 48,
        gap: space.section,
        maxWidth: 640,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <View style={{ gap: 12 }}>
        <Text maxFontSizeMultiplier={1.6} style={[typeStyle("legend"), { color: t.ink2 }]}>
          {trUpper("Masa kuralları")}
        </Text>
        <View style={{ height: 1, backgroundColor: t.ink }} />
        <View accessibilityRole="list" style={{ gap: 16 }}>
          {RULES.map((rule, i) => (
            <View key={i} accessibilityRole="text" style={{ flexDirection: "row", gap: 14, alignItems: "baseline" }}>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no"
                maxFontSizeMultiplier={1.3}
                style={[typeStyle("h3"), { color: t.ink, width: 22, fontVariant: ["lining-nums", "tabular-nums"] }]}
              >
                {i + 1}
              </Text>
              <Text maxFontSizeMultiplier={1.6} style={[reading, { color: t.ink, flex: 1 }]}>
                {rule}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[typeStyle("h2"), { color: t.ink }]}>
          Neden peni?
        </Text>
        <Text maxFontSizeMultiplier={1.6} style={[reading, { color: t.ink }]}>
          {WHY}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[typeStyle("h3"), { color: t.ink }]}>
          Askı neden böyle?
        </Text>
        <Text maxFontSizeMultiplier={1.6} style={[reading, { color: t.ink }]}>
          {askiCopy.explainer}
        </Text>
      </View>
    </ScrollView>
  );
}
