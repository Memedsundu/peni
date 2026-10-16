/**
 * Switch row (design-system.md §10.2, §10.7, §12.2, §12.5): an RN `Switch` in a 56pt row. The
 * whole row is the target and toggles the switch, so the hit area is the row, not the 31pt track.
 *
 * - `ink` (default): ink track when on. `peni` is the peni toggle ONLY — `trackColor={{false:
 *   t.lineStrong, true: t.peni}}`, `thumbColor={t.surface}`, `ios_backgroundColor={t.lineStrong}`
 *   and a `peniInk` value ("−₺55"). Nothing else in the product is copper (§3.2).
 * - Disabled is never opacity: the label turns `ink2`, the track `surface2`, and the reason
 *   replaces the hint. (The native `disabled` prop would dim the switch, so it is not used.)
 * - Toggling fires the `selection` haptic (§7.3, "peni toggle").
 */
import type { ReactNode } from "react";
import { Platform, Switch as NativeSwitch, View, type StyleProp, type ViewStyle } from "react-native";
import { haptic } from "@/lib/haptics";
import { space, switchColors, useTokens } from "@/lib/theme";
import { PressableScale } from "./pressable-scale";
import { T } from "./t";

export interface SwitchRowProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The row's words ("Profilim görünsün", "55 penini kullan"). */
  label: string;
  hint?: string;
  /** Right-side text before the switch ("−₺55"), tabular. */
  value?: ReactNode;
  tone?: "ink" | "peni";
  disabled?: boolean;
  /** Shown in place of the hint while disabled. A disabled switch always says why. */
  disabledReason?: string;
  /** Spoken in place of `value` when it is not plain text. */
  valueLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SwitchRow({
  checked,
  onCheckedChange,
  label,
  hint,
  value,
  tone = "ink",
  disabled = false,
  disabledReason,
  valueLabel,
  style,
  testID,
}: SwitchRowProps) {
  const t = useTokens();
  const below = disabled && disabledReason ? disabledReason : hint;
  const spokenValue = valueLabel ?? (typeof value === "string" || typeof value === "number" ? String(value) : undefined);

  const colors = disabled
    ? {
        trackColor: { false: t.surface2, true: t.lineStrong },
        thumbColor: checked ? t.surface : t.lineStrong,
        ios_backgroundColor: t.surface2,
        ...(Platform.OS === "web" ? ({ activeThumbColor: t.surface } as object) : null),
      }
    : switchColors(t, tone);

  return (
    <PressableScale
      testID={testID}
      targetScale={1}
      disabled={disabled}
      onPress={() => {
        haptic("selection");
        onCheckedChange(!checked);
      }}
      accessibilityRole="switch"
      accessibilityLabel={spokenValue ? `${label}, ${spokenValue}` : label}
      accessibilityHint={below}
      accessibilityState={{ checked, disabled }}
      style={[{ minHeight: space.row, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 16 }, style]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T variant="body" color={disabled ? "ink2" : "ink"}>
          {label}
        </T>
        {below ? (
          <T variant="meta" color="ink2">
            {below}
          </T>
        ) : null}
      </View>
      {value != null && value !== false ? (
        typeof value === "string" || typeof value === "number" ? (
          <T variant="strong" tabular color={disabled ? "ink2" : tone === "peni" ? "peniInk" : "ink"}>
            {value}
          </T>
        ) : (
          value
        )
      ) : null}
      {/* The row takes every touch; the switch only draws the state. */}
      <View pointerEvents="none" aria-hidden>
        <NativeSwitch value={checked} {...colors} />
      </View>
    </PressableScale>
  );
}

/** Same component, under the web primitive's name. */
export const Switch = SwitchRow;
export type SwitchProps = SwitchRowProps;
