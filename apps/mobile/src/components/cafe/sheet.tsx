/**
 * The frame every café sheet shares (design-system.md §8.4 Sheets): a native formSheet with
 * the title inside the content (Android has no native header in a sheet), a 44pt "Kapat" at
 * the top right (the grabber alone is not enough for switch control or TalkBack), the body, and
 * an optional footer.
 *
 * - `fit` (the `"fitToContents"` sheets: katil, askidan-al): a plain column with natural heights,
 *   never `flex: 1`, so the sheet can measure it.
 * - `scroll` (the detent sheets: sepet, askiya-birak): one ScrollView that takes the sheet's
 *   height; the footer scrolls with the content, so nothing is pinned below a detent the user
 *   can't see. The keyboard insets adjust on iOS.
 */
import { actionCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { CircleAlert, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconButton, T } from "@/components/ui";
import { space, useTokens } from "@/lib/theme";

export interface SheetFrameProps {
  title: string;
  /** A line under the title ("Sende 90 peni"). */
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  mode?: "fit" | "scroll";
  /** Close: `router.back()` unless given. */
  onClose?: () => void;
  /** Ignore "Kapat" while something must finish (the cup lifting off its hook). */
  closeDisabled?: boolean;
  bodyStyle?: StyleProp<ViewStyle>;
}

const TOP = 20;
const GAP_AFTER_HEAD = 20;

export function SheetFrame({ title, description, children, footer, mode = "fit", onClose, closeDisabled, bodyStyle }: SheetFrameProps) {
  const insets = useSafeAreaInsets();
  const close = () => {
    if (closeDisabled) return;
    if (onClose) onClose();
    else if (router.canGoBack()) router.back();
  };

  const head = (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, paddingTop: 8, gap: 6 }}>
        <T variant="h3" accessibilityRole="header">
          {title}
        </T>
        {description != null ? (typeof description === "string" ? <T variant="body" color="ink2">{description}</T> : description) : null}
      </View>
      <IconButton label={actionCopy.close} icon={X} onPress={close} style={{ marginRight: -10, marginTop: -2 }} />
    </View>
  );

  const content = (
    <>
      {head}
      <View style={[{ marginTop: GAP_AFTER_HEAD }, bodyStyle]}>{children}</View>
      {footer != null ? <View style={{ marginTop: 24 }}>{footer}</View> : null}
    </>
  );

  const pad = { paddingHorizontal: space.gutter, paddingTop: TOP, paddingBottom: insets.bottom + 16 };

  if (mode === "scroll") {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={pad}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    );
  }
  return <View style={pad}>{content}</View>;
}

/** An error at its trigger (§10): `danger` text with `CircleAlert`, read out when it appears. */
export function InlineError({ message, style }: { message: string | null | undefined; style?: StyleProp<ViewStyle> }) {
  const t = useTokens();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[{ flexDirection: "row", alignItems: "flex-start", gap: 8 }, style]}
    >
      <View style={{ paddingTop: 1 }}>
        <Icon icon={CircleAlert} size={20} color={t.danger} />
      </View>
      <T variant="body" color="danger" style={{ flex: 1 }}>
        {message}
      </T>
    </View>
  );
}

/**
 * One calm sentence with its icon, in place of a sheet's choices (the askı take states, an
 * empty cart). The icon sits in a 40pt `surface2` disc.
 */
export function StateNote({ icon, text, style }: { icon: Parameters<typeof Icon>[0]["icon"]; text: string; style?: StyleProp<ViewStyle> }) {
  const t = useTokens();
  return (
    <View accessibilityRole="text" style={[{ flexDirection: "row", alignItems: "flex-start", gap: 12 }, style]}>
      <View
        aria-hidden
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}
      >
        <Icon icon={icon} size={20} color={t.ink2} />
      </View>
      <T variant="body" style={{ flex: 1, minWidth: 0, paddingTop: 9 }}>
        {text}
      </T>
    </View>
  );
}
