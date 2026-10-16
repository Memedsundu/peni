/**
 * Chip (design-system.md §12.2, §12.5).
 *
 * - `status` (default): 24pt, radius 4, 13pt Archivo 600, icon + word ("Teslim edildi", "3 dk",
 *   "ikram"). Status is never colour alone (§3.2): a coloured status chip with no icon gets one,
 *   and danger is always `CircleAlert` (D1).
 * - `tag`: `legend` caps on a tone, radius 4 ("TÜKENDİ", "GEÇTİ", "DENEME").
 * - `choice`: a 44pt toggle, radius 10, `surface` with a 1.5pt `lineStrong` border; selected is a
 *   2pt ink border with no layout shift. Disabled shows its reason under the label
 *   ("Bakiyen 25", "Askıda yeterli peni yok") and is never faded. Fires `selection` (§7.3).
 *
 * Each tone is its soft fill with its own `-ink` text — never a mid tone on its own soft.
 */
import { Check, CircleAlert } from "lucide-react-native";
import type { ReactNode } from "react";
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { haptic } from "@/lib/haptics";
import { fonts, radius, useTokens, type TokenName, type Tokens } from "@/lib/theme";
import { Icon, type IconProp } from "./icon";
import { PressableScale } from "./pressable-scale";
import { T } from "./t";

export type ChipTone = "neutral" | "peni" | "aski" | "masa" | "success" | "warning" | "danger";
export type ChipKind = "choice" | "status" | "tag";

const TONE: Record<ChipTone, { bg: keyof Tokens; fg: TokenName }> = {
  neutral: { bg: "surface2", fg: "ink2" },
  peni: { bg: "peniSoft", fg: "peniInk" },
  aski: { bg: "askiSoft", fg: "askiInk" },
  masa: { bg: "masaSoft", fg: "masaInk" },
  success: { bg: "successSoft", fg: "successInk" },
  warning: { bg: "warningSoft", fg: "warningInk" },
  danger: { bg: "dangerSoft", fg: "danger" },
};

const DEFAULT_ICON: Partial<Record<ChipTone, IconProp>> = { success: Check, warning: CircleAlert, danger: CircleAlert };

interface ChipCommon {
  tone?: ChipTone;
  icon?: IconProp;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export interface StatusChipProps extends ChipCommon {
  kind?: "status";
}

export interface TagChipProps extends ChipCommon {
  kind: "tag";
}

export interface ChoiceChipProps extends Omit<ChipCommon, "tone"> {
  kind: "choice";
  selected?: boolean;
  onPress?: (e: GestureResponderEvent) => void;
  /** Disables the chip and renders the reason under its label. */
  disabledReason?: string;
  /** A second line that is not a disabled reason ("30 peni"). */
  detail?: string;
  testID?: string;
}

export type ChipProps = StatusChipProps | TagChipProps | ChoiceChipProps;

/** 13pt Archivo 600 at the meta line height: the status chip's words. */
const statusText = { fontFamily: fonts.sansSemiBold, lineHeight: 16 } as const;

export function Chip(props: ChipProps) {
  const t = useTokens();
  if (props.kind === "choice") return <ChoiceChip {...props} />;

  const { kind = "status", tone = "neutral", icon, children, style, accessibilityLabel } = props;
  const c = TONE[tone];
  const glyph = icon ?? (kind === "status" ? DEFAULT_ICON[tone] : undefined);
  const danger = tone === "danger";

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: 4,
          borderRadius: radius.tag,
          backgroundColor: t[c.bg],
          paddingHorizontal: 8,
        },
        kind === "tag" ? { paddingVertical: 4 } : { minHeight: 24, paddingVertical: 4 },
        style,
      ]}
    >
      {glyph ? <Icon icon={danger ? CircleAlert : glyph} size={16} color={t[c.fg]} /> : null}
      {kind === "tag" ? (
        <T variant="legend" color={c.fg} numberOfLines={1}>
          {children}
        </T>
      ) : (
        <T variant="meta" color={c.fg} numberOfLines={1} style={statusText}>
          {children}
        </T>
      )}
    </View>
  );
}

function ChoiceChip({ icon, selected = false, onPress, disabledReason, detail, children, style, accessibilityLabel, testID }: ChoiceChipProps) {
  const t = useTokens();
  const disabled = !!disabledReason;
  // 1.5pt border + 0.5pt of padding = the 2pt selected border, with nothing moving.
  const border = selected && !disabled ? 2 : 1.5;
  const inset = 2 - border;

  return (
    <PressableScale
      testID={testID}
      disabled={disabled}
      onPress={(e) => {
        haptic("selection");
        onPress?.(e);
      }}
      pressedColor={t.surface2}
      accessibilityLabel={accessibilityLabel ?? (typeof children === "string" ? children : undefined)}
      accessibilityHint={disabledReason ?? detail}
      accessibilityState={{ selected: !disabled && selected, disabled }}
      style={[
        {
          minHeight: 44,
          justifyContent: "center",
          gap: 2,
          borderRadius: radius.control,
          borderWidth: border,
          borderColor: disabled ? "transparent" : selected ? t.ink : t.lineStrong,
          backgroundColor: disabled ? t.surface2 : t.surface,
          paddingHorizontal: 12.5 + inset,
          paddingVertical: 6.5 + inset,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon ? <Icon icon={icon} size={20} color={disabled ? t.ink2 : t.ink} /> : null}
        <T variant="button" color={disabled ? "ink2" : "ink"}>
          {children}
        </T>
      </View>
      {disabledReason || detail ? (
        <T variant="meta" color="ink2">
          {disabledReason ?? detail}
        </T>
      ) : null}
    </PressableScale>
  );
}

/** A named set of choice chips ("Hangisi?", "Ne bırakıyorsun?"). Wraps, 8pt gaps. */
export function ChipGroup({ label, children, style }: { label: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View role="group" aria-label={label} style={[{ flexDirection: "row", flexWrap: "wrap", gap: 8 }, style]}>
      {children}
    </View>
  );
}

/** The 8pt status dot for "Sipariş alıyor" (decorative; the word beside it carries the meaning). */
export function StatusDot({ tone = "success", style }: { tone?: "success" | "warning" | "masa"; style?: StyleProp<ViewStyle> }) {
  const t = useTokens();
  return (
    <View
      aria-hidden
      style={[{ width: 8, height: 8, borderRadius: radius.full, backgroundColor: t[tone] }, style]}
    />
  );
}
