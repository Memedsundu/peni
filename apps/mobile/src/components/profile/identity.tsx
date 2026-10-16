/**
 * The head of Profil (§10.7): the initials disc, the name and the phone number.
 *
 * The disc shows exactly what the Peni masası shows of you when "Profilim görünsün" is on (your
 * initials on a chair), so it is drawn like a seat: a round `surface2` plate with the initials in
 * Archivo 600. With the profile hidden the chairs stay blank, and so does nothing here: this is
 * your own screen.
 */
import { formatPhone, initials } from "@peni/brand/format";
import { StyleSheet, View } from "react-native";
import { Skeleton, T } from "@/components/ui";
import { fonts, radius, useTokens } from "@/lib/theme";

const DISC = 56;

export function Identity({ name, phone }: { name: string; phone: string }) {
  const t = useTokens();
  const letters = initials(name);
  return (
    <View style={styles.row}>
      <View aria-hidden style={[styles.disc, { backgroundColor: t.surface2, borderColor: t.line }]}>
        <T variant="item" style={styles.initials}>
          {letters || "·"}
        </T>
      </View>
      <View style={styles.text}>
        <T variant="h3" numberOfLines={2}>
          {name}
        </T>
        <T variant="meta" color="ink2" tabular>
          {formatPhone(phone)}
        </T>
      </View>
    </View>
  );
}

export function IdentitySkeleton() {
  const t = useTokens();
  return (
    <View aria-hidden style={styles.row}>
      <View style={[styles.disc, { backgroundColor: t.surface2, borderColor: "transparent" }]} />
      <View style={styles.text}>
        <Skeleton width="55%" line="h3" />
        <Skeleton width={128} line="meta" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontFamily: fonts.sansSemiBold, fontSize: 20, lineHeight: 24, letterSpacing: 0.4 },
  text: { flex: 1, minWidth: 0, gap: 2 },
});
