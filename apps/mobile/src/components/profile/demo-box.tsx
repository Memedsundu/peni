/**
 * Demo sign-in (§9.2, §10.8), ONLY when `EXPO_PUBLIC_DEMO=1`: a dashed 1.5pt `lineStrong` box
 * with a "DENEME" stamp, one sentence and the three seeded neighbours as secondary buttons.
 * Everything that says "this is a test environment" lives inside this fence, never in the
 * product copy around it. A persona signs in the honest way: it asks for a code, then verifies
 * with the code the demo server hands back.
 */
import { initials } from "@peni/brand/format";
import { ArrowRight } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Icon, PressableScale, Spinner, T } from "@/components/ui";
import { fonts, radius, useTokens } from "@/lib/theme";

export const DEMO = process.env.EXPO_PUBLIC_DEMO === "1";

/** The seeded neighbours (apps/web/src/server/seed.ts). */
export const DEMO_PERSONAS = [
  { id: "cus_ayse", name: "Ayşe Yılmaz", phone: "+905320000001", note: "İki kafenin müdavimi." },
  { id: "cus_mehmet", name: "Mehmet Kaya", phone: "+905320000002", note: "Ayşe'nin komşusu, Moda'da üye." },
  { id: "cus_deniz", name: "Deniz Arslan", phone: "+905320000003", note: "Yeni katıldı, henüz peni yok." },
] as const;

export type DemoPersona = (typeof DEMO_PERSONAS)[number];

export function DemoBox({
  busyId,
  disabled,
  devCode,
  error,
  onPick,
}: {
  busyId: string | null;
  disabled: boolean;
  /** The code the demo server "sent", shown while the code step is open. */
  devCode: string | null;
  error: string | null;
  onPick: (persona: DemoPersona) => void;
}) {
  const t = useTokens();
  return (
    <View style={[styles.box, { borderColor: t.lineStrong }]}>
      <Stamp />
      <T variant="body" accessibilityRole="header">
        Deneme hesaplarıyla tek dokunuşla gir.
      </T>
      {devCode ? (
        <T variant="meta" color="ink2" style={styles.devCode}>
          Bu ortamda SMS gitmez; kod{" "}
          <T color="ink" tabular style={styles.strong}>
            {devCode}
          </T>
          .
        </T>
      ) : null}
      <View style={styles.list}>
        {DEMO_PERSONAS.map((p) => {
          const busy = busyId === p.id;
          const off = disabled && !busy;
          return (
            <PressableScale
              key={p.id}
              disabled={disabled}
              onPress={() => onPick(p)}
              accessibilityLabel={p.name.split(" ")[0]}
              accessibilityHint={busy ? "Giriş yapılıyor…" : p.note}
              accessibilityState={{ disabled: off, busy }}
              pressedColor={t.surface2}
              style={[
                styles.persona,
                off
                  ? { borderColor: "transparent", backgroundColor: t.surface2 }
                  : { borderColor: t.lineStrong, backgroundColor: t.surface },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: t.surface2 }]}>
                <T variant="meta" color={off ? "ink2" : "ink"} style={styles.strong}>
                  {initials(p.name)}
                </T>
              </View>
              <View style={styles.text}>
                <T variant="button" color={off ? "ink2" : "ink"}>
                  {p.name.split(" ")[0]}
                </T>
                <T variant="meta" color="ink2">
                  {busy ? "Giriş yapılıyor…" : p.note}
                </T>
              </View>
              {busy ? <Spinner size={20} color={t.ink} /> : <Icon icon={ArrowRight} size={20} color={t.ink2} />}
            </PressableScale>
          );
        })}
      </View>
      {error ? (
        <T variant="meta" color="danger" accessibilityRole="alert">
          {error}
        </T>
      ) : null}
    </View>
  );
}

/** "DENEME" set like a rubber stamp: a double rule, tilted 4°, on the page colour over the dashed edge. */
function Stamp() {
  const t = useTokens();
  return (
    <View aria-hidden style={[styles.stamp, { backgroundColor: t.bg, borderColor: t.ink2 }]}>
      <View style={[styles.stampInner, { borderColor: t.ink2 }]}>
        <T variant="plate" color="ink2" style={styles.stampText}>
          Deneme
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "relative",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 4,
  },
  devCode: { marginTop: 2 },
  strong: { fontFamily: fonts.sansSemiBold },
  list: { marginTop: 12, gap: 8 },
  persona: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  avatar: { width: 36, height: 36, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0 },
  stamp: {
    position: "absolute",
    top: -15,
    right: 16,
    borderWidth: 1.5,
    borderRadius: 6,
    padding: 1.5,
    transform: [{ rotate: "-4deg" }],
  },
  stampInner: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  stampText: { fontSize: 15, lineHeight: 16 },
});
