/**
 * Row and RowGroup (design-system.md §5, §12.2, §12.5).
 *
 * A row is min 56pt with 12 × 16 padding: an optional leading visual, the title (`body`) with a
 * `meta` line under it, and trailing content. A navigation row (`href`) ends in `ArrowRight`.
 *
 * Rows press by stepping their fill to `surface2` and never scale: a row is full-bleed inside its
 * card, and a shrinking row would pull away from the dividers above and below it.
 *
 * `RowGroup` is one raised card of flat rows with `line` dividers (a raised card holds flat rows;
 * cards never nest), or — with `flat` — just rows between rules, for lists that already sit on a
 * surface (a sheet, a fiş).
 */
import { router, type Href } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { haptic, type HapticIntent } from "@/lib/haptics";
import { space, useTokens } from "@/lib/theme";
import { Card, type CardTone } from "./card";
import { Icon } from "./icon";
import { PressableScale } from "./pressable-scale";
import { T } from "./t";

export interface RowProps {
  /** The row's words, `body`. */
  title?: ReactNode;
  /** Under the title, `meta ink2`. */
  meta?: ReactNode;
  /** Leading visual: a 28pt coin, an avatar, a 24pt icon. */
  start?: ReactNode;
  /** Trailing content: an amount, a chip, a value. A string is set in `body`. */
  end?: ReactNode;
  /** Free content after the title and meta. */
  children?: ReactNode;
  /** An action row. */
  onPress?: (e: GestureResponderEvent) => void;
  /** A navigation row: `router.push(href)`, read as a link, with an `ArrowRight` unless `end`. */
  href?: Href;
  arrow?: boolean;
  /** Action rows only. Say why in `meta`. */
  disabled?: boolean;
  /** `danger` for "Çıkış yap" (with its `LogOut` icon as `start`). */
  tone?: "default" | "danger";
  haptic?: HapticIntent;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Row({
  title,
  meta,
  start,
  end,
  children,
  onPress,
  href,
  arrow,
  disabled = false,
  tone = "default",
  haptic: intent,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: RowProps) {
  const t = useTokens();
  const interactive = onPress != null || href != null;
  const showArrow = arrow ?? (href != null && end == null);
  const titleColor = disabled ? "ink2" : tone === "danger" ? "danger" : "ink";

  const body = (
    <>
      {start != null ? <View style={{ flexShrink: 0 }}>{start}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title != null ? (
          typeof title === "string" ? (
            <T variant="body" color={titleColor}>
              {title}
            </T>
          ) : (
            title
          )
        ) : null}
        {meta != null ? (
          typeof meta === "string" ? (
            <T variant="meta" color="ink2">
              {meta}
            </T>
          ) : (
            meta
          )
        ) : null}
        {children}
      </View>
      {end != null ? (
        <View style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
          {typeof end === "string" || typeof end === "number" ? <T variant="body">{end}</T> : end}
        </View>
      ) : null}
      {showArrow ? <Icon icon={ArrowRight} size={20} color={t.ink2} /> : null}
    </>
  );

  const frame: ViewStyle = {
    minHeight: space.row,
    paddingVertical: space.rowV,
    paddingHorizontal: space.rowH,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  };

  if (!interactive) {
    return (
      <View testID={testID} accessible={accessibilityLabel != null} accessibilityLabel={accessibilityLabel} style={[frame, style]}>
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      testID={testID}
      targetScale={1}
      pressedColor={t.surface2}
      disabled={disabled}
      onPress={(e) => {
        if (intent) haptic(intent);
        onPress?.(e);
        if (href != null) router.push(href);
      }}
      accessibilityRole={href != null ? "link" : "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[frame, style]}
    >
      {body}
    </PressableScale>
  );
}

export interface RowGroupProps {
  /** A `legend` heading over the card ("YİYECEK"). */
  title?: string;
  /** `raised` (default) or a flat tint. Never put a RowGroup inside another card. */
  tone?: CardTone;
  /** No card: rows between `line` rules (top and bottom too), for lists already on a surface. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** Real rows only: drops null/false and opens fragments, so dividers fall between rows. */
function rows(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) out.push(...rows(child.props.children));
    else out.push(child);
  });
  return out;
}

export function RowGroup({ title, tone = "raised", flat = false, style, children }: RowGroupProps) {
  const t = useTokens();
  const items = rows(children);
  const divider = (key: string) => (
    <View key={key} style={{ height: 1, marginLeft: space.rowH, backgroundColor: t.line }} />
  );
  const list = items.flatMap((item, i) => {
    const row = <Fragment key={`row-${i}`}>{item}</Fragment>;
    return i === 0 ? [row] : [divider(`divider-${i}`), row];
  });

  const body = flat ? (
    <View role="list" style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.line }}>
      {list}
    </View>
  ) : (
    <Card tone={tone} padding="none" role="list">
      {list}
    </Card>
  );

  if (title == null) return <View style={style}>{body}</View>;
  return (
    <View style={[{ gap: 8 }, style]}>
      <T variant="legend" color="ink2" accessibilityRole="header">
        {title}
      </T>
      {body}
    </View>
  );
}
