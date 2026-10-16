/**
 * Masa kuralları (design-system.md §10.9, the content of §9.9 set with `T`), a root-stack push.
 *
 * A reading page, max 640pt: the legend "MASA KURALLARI", the title "Masa kuralları", the Oxford
 * rule, then the seven rules — Brygada numerals at 22pt beside Archivo 16/24, a hairline between
 * them, like a notice pinned by the till. Then "Neden peni?" and "Askı neden böyle?" (the sebil
 * sentence from §9.3).
 *
 * The header starts empty (the page has its own title) and takes "Masa kuralları" once the title
 * has scrolled under it.
 */
import { askiCopy } from "@peni/brand/copy";
import { Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OxfordRule } from "@/components/brand";
import { T } from "@/components/ui";
import { headerType, space, useTokens } from "@/lib/theme";

const TITLE = "Masa kuralları";

const RULES = [
  "Kapıdan giren herkes masaya oturabilir; kimse kimseden üstün değildir.",
  "Askıdaki çay herkesin. İsteyen alır, kimse sormaz.",
  "Bırakan söylemez, alan teşekkür borçlu değildir.",
  "Fikrine karşı çıkılabilir, sana değil.",
  "Masada konuşulan masada kalır; mesaj kutusu yok.",
  "Siparişin ancak barista dokununca ilerler; emeği görünür.",
  "Bir fincan kahvenin kırk yıl hatırı vardır.",
] as const;

const WHY =
  "1554'te İstanbul'da, Tahtakale'de açılan ilk kahvehanelere 'mekteb-i irfan', yani irfan mektebi denirdi. Yaklaşık yüz yıl sonra, 1652'de İzmirli Pasqua Rosée Londra'nın ilk kahvehanesini açtı. Orada bir peni veren herkes aynı masaya otururdu; tüccar da öğrenci de konuşurdu. Adı 'peni üniversitesi' olarak kaldı. Peni o masayı mahallene geri getiriyor.";

/** Where the title has gone under the header: legend + title, roughly. */
const TITLE_GONE_AT = 64;

export default function MasaKurallari() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [titled, setTitled] = useState(false);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const gone = e.nativeEvent.contentOffset.y > TITLE_GONE_AT;
    if (gone !== titled) setTitled(gone);
  };

  return (
    <>
      <Stack.Screen options={{ title: titled ? TITLE : "" }} />
      <ScrollView
        style={{ backgroundColor: t.bg }}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
      >
        <View style={styles.column}>
          <View style={styles.notice}>
            <View style={styles.head}>
              <T variant="legend" color="ink2">
                {TITLE}
              </T>
              <T variant="h2" accessibilityRole="header" style={styles.title}>
                {TITLE}
              </T>
              <OxfordRule color={t.ink} style={styles.rule} />
            </View>

            <View accessibilityRole="list">
              {RULES.map((rule, i) => (
                <View
                  key={i}
                  accessibilityRole="text"
                  accessibilityLabel={`${i + 1}. ${rule}`}
                  style={[styles.item, i > 0 ? { borderTopWidth: 1, borderTopColor: t.line } : null]}
                >
                  <T variant="h3" tabular aria-hidden style={styles.number}>
                    {String(i + 1)}
                  </T>
                  <T variant="body" style={styles.ruleText}>
                    {rule}
                  </T>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <T variant="h2" accessibilityRole="header">
              Neden peni?
            </T>
            <T variant="body" style={styles.reading}>
              {WHY}
            </T>
          </View>

          <View style={styles.section}>
            <T variant="h3" accessibilityRole="header">
              Askı neden böyle?
            </T>
            <T variant="body" style={styles.reading}>
              {askiCopy.explainer}
            </T>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.gutter, paddingTop: 8 },
  column: { width: "100%", maxWidth: 640, alignSelf: "center", gap: 40 },
  /** The head and the numbered rules read as one notice. */
  notice: { gap: 10 },
  head: { gap: 0 },
  title: {
    fontSize: headerType.largeTitle.fontSize,
    lineHeight: 40,
    letterSpacing: -0.6,
    marginTop: 6,
  },
  rule: { marginTop: 16 },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingVertical: 14,
  },
  // Brygada numerals, 22pt, in a fixed column so the sentences line up.
  number: {
    width: 22,
    fontVariant: ["lining-nums", "tabular-nums"],
    marginTop: -2,
  },
  // §9.9: Archivo 16/24 for reading.
  ruleText: { flex: 1, minWidth: 0, lineHeight: 24 },
  section: { gap: 10 },
  reading: { lineHeight: 24 },
});
