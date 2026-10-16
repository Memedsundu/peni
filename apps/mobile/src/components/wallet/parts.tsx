/**
 * Small pieces the wallet screens share: the inline error, the initials avatar, the envelope
 * (§9.6 "an envelope preview: a surface card with a dashed line-strong border"), the history
 * sentence with its peni amounts, and the quiet note with an icon.
 */
import { formatPeni } from "@peni/brand/format";
import { CircleAlert } from "lucide-react-native";
import { Fragment, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Coin, type CoinCafe } from "@/components/brand";
import { Icon, T, type IconProp } from "@/components/ui";
import { radius, useTokens } from "@/lib/theme";
import type { Piece } from "./wallet-model";

/** An error at its trigger (§10): `danger` text with `CircleAlert`, read out when it appears. */
export function InlineError({ message, style }: { message: string | null | undefined; style?: StyleProp<ViewStyle> }) {
  const t = useTokens();
  if (!message) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.error, style]}>
      <View style={styles.errorIcon}>
        <Icon icon={CircleAlert} size={20} color={t.danger} />
      </View>
      <T variant="body" color="danger" style={styles.flex}>
        {message}
      </T>
    </View>
  );
}

/** A 40pt initials disc ("MK"): recents and the found member. Decorative; the name is beside it. */
export function Avatar({ initials, tone = "neutral" }: { initials: string; tone?: "neutral" | "success" }) {
  const t = useTokens();
  return (
    <View aria-hidden style={[styles.avatar, { backgroundColor: tone === "success" ? t.surface : t.surface2 }]}>
      <T variant="button" color={tone === "success" ? "successInk" : "ink"}>
        {initials}
      </T>
    </View>
  );
}

/**
 * The envelope: "KİME / Mehmet K." on the left, the café's 28pt coin as its stamp (tilted 8°),
 * then the contents.
 */
export function Envelope({
  cafe,
  to,
  children,
  style,
}: {
  cafe: CoinCafe;
  to: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTokens();
  return (
    <View style={[styles.envelope, { borderColor: t.lineStrong, backgroundColor: t.surface }, style]}>
      <View style={styles.envelopeHead}>
        <View style={styles.flex}>
          <T variant="legend" color="ink2">
            Kime
          </T>
          <T variant="item" style={{ marginTop: 4 }}>
            {to}
          </T>
        </View>
        <Coin size={28} cafe={cafe} style={styles.stamp} />
      </View>
      {children}
    </View>
  );
}

/** A HAREKETLER sentence, every peni amount in `peniInk` 600 and never broken inside "30 peni". */
export function Sentence({ pieces, color = "ink" }: { pieces: readonly Piece[]; color?: "ink" | "ink2" }) {
  return (
    <T variant="body" color={color}>
      {pieces.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <T key={i} variant="strong" color="peniInk" tabular>
            {formatPeni(p.peni, { signed: p.signed }).replace(" ", " ")}
          </T>
        ),
      )}
    </T>
  );
}

/** One calm sentence with its icon in a 40pt `surface2` disc (empty and blocked states in sheets). */
export function StateNote({ icon, text, style }: { icon: IconProp; text: string; style?: StyleProp<ViewStyle> }) {
  const t = useTokens();
  return (
    <View style={[styles.note, style]}>
      <View aria-hidden style={[styles.noteDisc, { backgroundColor: t.surface2 }]}>
        <Icon icon={icon} size={20} color={t.ink2} />
      </View>
      <T variant="body" style={[styles.flex, { paddingTop: 9 }]}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  error: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  errorIcon: { paddingTop: 1 },
  avatar: { width: 40, height: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  envelope: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.card, padding: 16 },
  envelopeHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  stamp: { transform: [{ rotate: "-8deg" }] },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  noteDisc: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
