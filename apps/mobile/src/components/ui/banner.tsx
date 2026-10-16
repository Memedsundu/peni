/**
 * Banner (design-system.md §12.2, §12.5): radius 10, padding 12, a flat soft fill, icon + words —
 * status is never colour alone.
 *
 * - `warning`: `warningSoft` ("Kafe şu an uygulamadan sipariş almıyor…" with `CirclePause`).
 * - `danger`: `dangerSoft`, always `CircleAlert` (D1), read as an alert and announced.
 * - `info`: `surface2` with `Info`. `aski`: `askiSoft` with `askiInk`.
 *
 * The action sits at the right while it fits beside the sentence, and drops under it when the
 * line runs out of room (a long sentence keeps its full width).
 */
import { CircleAlert, Info } from "lucide-react-native";
import { useEffect, type ReactNode } from "react";
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, useTokens, type Tokens } from "@/lib/theme";
import { Icon, type IconProp } from "./icon";
import { T } from "./t";

export type BannerTone = "warning" | "danger" | "info" | "aski";

const TONE: Record<BannerTone, { bg: keyof Tokens; icon: keyof Tokens; fallback: IconProp }> = {
  warning: { bg: "warningSoft", icon: "warningInk", fallback: CircleAlert },
  danger: { bg: "dangerSoft", icon: "danger", fallback: CircleAlert },
  info: { bg: "surface2", icon: "ink2", fallback: Info },
  aski: { bg: "askiSoft", icon: "askiInk", fallback: Info },
};

export interface BannerProps {
  tone: BannerTone;
  /** The case's icon (`CirclePause`, `VolumeX`). Ignored for `danger`, which is `CircleAlert`. */
  icon?: IconProp;
  /** The one sentence ("Kafeler yüklenemedi."). */
  title: string;
  /** Optional second line, `meta ink2`. */
  children?: ReactNode;
  /** One small button ("Tekrar dene", "Şimdi aç", "Sesi aç"): `<Button size="sm" …>`. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Banner({ tone, icon, title, children, action, style }: BannerProps) {
  const t = useTokens();
  const c = TONE[tone];
  const glyph = tone === "danger" ? CircleAlert : (icon ?? c.fallback);
  const danger = tone === "danger";

  // An error that appears after a failed load is spoken once. Android's live region does this
  // on its own; VoiceOver would miss it.
  useEffect(() => {
    if (danger && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(title);
  }, [danger, title]);

  return (
    <View
      accessibilityRole={danger ? "alert" : undefined}
      accessibilityLiveRegion={danger ? "assertive" : "polite"}
      style={[
        {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 12,
          rowGap: 8,
          padding: 12,
          borderRadius: radius.control,
          backgroundColor: t[c.bg],
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
        <View style={{ paddingTop: 1 }}>
          <Icon icon={glyph} size={20} color={t[c.icon]} />
        </View>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <T variant={children != null ? "strong" : "body"}>{title}</T>
          {children != null ? (
            typeof children === "string" ? (
              <T variant="meta" color="ink2">
                {children}
              </T>
            ) : (
              children
            )
          ) : null}
        </View>
      </View>
      {action != null ? <View style={{ marginLeft: "auto", flexDirection: "row", gap: 8 }}>{action}</View> : null}
    </View>
  );
}
