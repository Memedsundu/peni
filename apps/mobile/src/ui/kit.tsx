import type { CafeHue } from "@peni/api";
import { useRouter } from "expo-router";
import { initials } from "@peni/brand/format";
import qrcode from "qrcode-generator";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Switch,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { imageUri } from "../lib/api";
import { useSession } from "../lib/session";
import { FONTS, useColors, type Colors } from "../lib/theme";

/** The café colour of the screen being shown, for every piece inside it. */
const HueContext = createContext<CafeHue | null>(null);

/** Paints one café's colour on a part of a screen, such as its card in a list. */
export function Hue({ hue, children }: { hue: CafeHue | null; children: ReactNode }) {
  return <HueContext.Provider value={hue}>{children}</HueContext.Provider>;
}

export function useScreenColors(): Colors {
  return useColors(useContext(HueContext));
}

/** Words in the app's two faces: Geist for reading, Instrument Serif for the big lines. */
export function Txt({
  children,
  size = 17,
  serif = false,
  weight = "regular",
  muted = false,
  color,
  center = false,
  style,
  ...rest
}: {
  children: ReactNode;
  size?: number;
  serif?: boolean;
  weight?: "regular" | "medium" | "semibold";
  muted?: boolean;
  color?: string;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityRole?: "header" | "text";
}) {
  const c = useScreenColors();
  const fontFamily = serif ? FONTS.serif : weight === "semibold" ? FONTS.semibold : weight === "medium" ? FONTS.medium : FONTS.sans;
  return (
    <Text
      {...rest}
      style={[
        { fontFamily, fontSize: size, lineHeight: Math.round(size * (serif ? 1.08 : 1.45)), color: color ?? (muted ? c.muted : c.ink), textAlign: center ? "center" : "left", fontVariant: ["tabular-nums"] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Txt serif size={40} accessibilityRole="header">
      {children}
    </Txt>
  );
}

/**
 * One screen: safe area, a back arrow (home when the screen was opened from a link), and a scroll.
 * `hue` paints the café's colour on everything inside.
 */
export function Screen({
  children,
  hue = null,
  back = true,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  hue?: CafeHue | null;
  back?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const c = useColors(hue);
  const router = useRouter();
  const { t } = useSession();
  return (
    <HueContext.Provider value={hue}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.muted} /> : undefined}
          >
            {back && (
              <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityRole="button" accessibilityLabel={t("back")} hitSlop={12} style={styles.back}>
                <Svg width={24} height={24} viewBox="0 0 24 24">
                  <Path d="M15 5l-7 7 7 7" stroke={c.ink} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable>
            )}
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </HueContext.Provider>
  );
}

type Kind = "primary" | "cafe" | "secondary" | "quiet" | "bare" | "danger";

/** Touch first: every target is at least 44pt tall. */
export function Btn({
  children,
  onPress,
  kind = "quiet",
  size = "md",
  disabled = false,
  busy = false,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  kind?: Kind;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useScreenColors();
  const fill: Record<Kind, [string, string, string]> = {
    primary: [c.ink, c.ink, c.paper],
    cafe: [c.cafe, c.cafe, c.paper],
    secondary: [c.paper, c.ink, c.ink],
    quiet: [c.paper, c.line, c.ink],
    bare: ["transparent", "transparent", c.muted],
    danger: [c.red, c.red, c.paper],
  };
  const [bg, border, fg] = fill[kind];
  const height = { sm: 44, md: 50, lg: 60 }[size];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy }}
      style={({ pressed }) => [
        styles.btn,
        { minHeight: height, backgroundColor: bg, borderColor: border, borderRadius: size === "lg" ? 18 : 999, paddingHorizontal: size === "sm" ? 16 : 22 },
        (disabled || busy) && { opacity: 0.4 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : typeof children === "string" ? (
        <Txt weight="semibold" size={size === "lg" ? 18 : size === "sm" ? 15 : 16} color={fg} center>
          {children}
        </Txt>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function Field({ label, hint, style, ...input }: TextInputProps & { label: string; hint?: string }) {
  const c = useScreenColors();
  return (
    <View style={{ gap: 8 }}>
      <Txt size={15} weight="medium">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        {...input}
        style={[styles.field, { borderColor: c.line, color: c.ink, backgroundColor: c.paper, fontFamily: FONTS.sans }, input.multiline && { minHeight: 96, paddingTop: 14, textAlignVertical: "top" }, style]}
      />
      {hint ? (
        <Txt size={14} muted>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "red" | "green" }) {
  const c = useScreenColors();
  const [bg, fg] = tone === "red" ? [c.redSoft, c.red] : tone === "green" ? [c.greenSoft, c.green] : [c.panel, c.muted];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole={tone === "red" ? "alert" : undefined} accessibilityLiveRegion="polite">
      <Txt size={15} color={fg}>
        {children}
      </Txt>
    </View>
  );
}

export function Loading() {
  const c = useScreenColors();
  return <ActivityIndicator color={c.muted} style={{ paddingVertical: 32 }} />;
}

/** A panel rising from the bottom, for a form or a question. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const c = useScreenColors();
  const { t } = useSession();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} visible>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t("close")} />
        <SafeAreaView edges={["bottom"]} style={[styles.sheet, { backgroundColor: c.paper }]}>
          <ScrollView contentContainerStyle={{ gap: 18, padding: 24 }} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHead}>
              <View style={{ flex: 1 }}>
                <Txt serif size={32} accessibilityRole="header">
                  {title}
                </Txt>
              </View>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("close")} hitSlop={12} style={styles.closeBtn}>
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path d="M6 6l12 12M18 6L6 18" stroke={c.muted} strokeWidth={1.8} strokeLinecap="round" />
                </Svg>
              </Pressable>
            </View>
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** "● Moda Kahvesi": which café this is about, in its colour. */
export function CafeLine({ name }: { name: string }) {
  const c = useScreenColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.cafe }} />
      <Txt size={15} muted>
        {name}
      </Txt>
    </View>
  );
}

/** The big peni number in the café's colour, with what it means underneath. */
export function Amount({ peni, goods, caption }: { peni: number; goods: string | null; caption: string }) {
  const c = useScreenColors();
  return (
    <View style={{ gap: 6 }}>
      <Txt serif size={72} color={c.cafe}>
        {peni} <Txt serif size={36} color={c.cafe}>peni</Txt>
      </Txt>
      <Txt size={18}>
        {caption}
        {goods ? <Txt size={18} muted>{` · ${goods}`}</Txt> : null}
      </Txt>
    </View>
  );
}

/** A label on the left, a value on the right, on a soft panel. */
export function Stat({ label, value }: { label: string; value: string }) {
  const c = useScreenColors();
  return (
    <View style={[styles.stat, { backgroundColor: c.panel }]}>
      <Txt muted>{label}</Txt>
      <Txt size={22} weight="semibold">
        {value}
      </Txt>
    </View>
  );
}

/** A tappable row, as in a list of cafés. */
export function Row({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress: () => void; accessibilityLabel?: string }) {
  const c = useScreenColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.row, { borderColor: c.line, backgroundColor: c.paper }, pressed && { backgroundColor: c.panel }]}
    >
      {children}
    </Pressable>
  );
}

/** One choice of a few, as round pills. */
export function Pills<K extends string>({ options, value, onChange, nowrap = false }: { options: [K, string][]; value: K | null; onChange: (k: K) => void; nowrap?: boolean }) {
  const c = useScreenColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: nowrap ? "nowrap" : "wrap", gap: 8 }} accessibilityRole="radiogroup">
      {options.map(([k, label]) => {
        const on = value === k;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.pill, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.ink : c.paper }]}
          >
            <Txt size={15} weight={on ? "semibold" : "regular"} color={on ? c.paper : c.ink}>
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A QR code as crisp squares, always black on white so any till can read it. */
export function Qr({ value, size, label }: { value: string; size: number; label: string }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) d += `M${col} ${r}h1v1h-1z`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ borderRadius: 14, overflow: "hidden" }}>
      <Svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`}>
        <Rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#ffffff" />
        <Path d={d} fill="#111111" />
      </Svg>
    </View>
  );
}

/** A photo from the server, or a quiet tile with the café's initials while there's none. */
export function Photo({ url, label, aspect = 4 / 3, radius = 24, style }: { url: string | null; label: string; aspect?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const c = useScreenColors();
  return (
    <View
      style={[{ aspectRatio: aspect, borderRadius: radius, overflow: "hidden", backgroundColor: c.tile, alignItems: "center", justifyContent: "center" }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      {url ? (
        <Image source={{ uri: imageUri(url) }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <Txt serif size={56} color={c.cafe} style={{ opacity: 0.35 }}>
          {initials(label)}
        </Txt>
      )}
    </View>
  );
}

/** A small grey heading over a group. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <Txt size={14} weight="medium" muted accessibilityRole="header">
      {children}
    </Txt>
  );
}

/** "Hangi kafe?": one row per café, with something on the right such as the balance. */
export function CafePicker({ title, cafes, onPick }: { title: string; cafes: { slug: string; name: string; right: string }[]; onPick: (slug: string) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Title>{title}</Title>
      {cafes.map((cafe) => (
        <Row key={cafe.slug} onPress={() => onPick(cafe.slug)}>
          <Txt size={18}>{cafe.name}</Txt>
          <Txt muted>{cafe.right}</Txt>
        </Row>
      ))}
    </View>
  );
}

/** A setting that is on or off, with its explanation underneath. */
export function Toggle({ label, help, value, onChange, disabled }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useScreenColors();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          <Txt>{label}</Txt>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={label}
          trackColor={{ true: c.cafe, false: c.line }}
          thumbColor={c.paper}
          {...({ activeThumbColor: c.paper } as object)}
        />
      </View>
      {help ? (
        <Txt size={14} muted>
          {help}
        </Txt>
      ) : null}
    </View>
  );
}

/** "10 · 20 · 50 · Diğer": a few amounts to tap or one to type, capped at what there is. */
export function AmountPicker({ amounts, value, max, onChange, otherLabel, label }: { amounts: number[]; value: number; max: number; onChange: (n: number) => void; otherLabel: string; label: string }) {
  const c = useScreenColors();
  const [other, setOther] = useState(() => value > 0 && !amounts.includes(value));
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {amounts.map((n) => (
          <Btn key={n} kind={!other && value === n ? "primary" : "quiet"} size="md" disabled={n > max} onPress={() => (setOther(false), onChange(n))} style={{ flex: 1, paddingHorizontal: 0 }}>
            {String(n)}
          </Btn>
        ))}
        <Btn kind={other ? "primary" : "quiet"} size="md" onPress={() => setOther(true)} style={{ flex: 1.3, paddingHorizontal: 0 }}>
          {otherLabel}
        </Btn>
      </View>
      {other && (
        <TextInput
          value={value ? String(value) : ""}
          onChangeText={(v) => onChange(Math.max(0, Math.floor(Number(v.replace(/\D/g, "")) || 0)))}
          keyboardType="number-pad"
          accessibilityLabel={label}
          autoFocus
          style={[styles.field, { borderColor: c.line, color: c.ink, fontFamily: FONTS.sans, fontSize: 24 }]}
        />
      )}
    </View>
  );
}


export const styles = StyleSheet.create({
  scroll: { padding: 24, paddingBottom: 48, gap: 28, maxWidth: 560, width: "100%", alignSelf: "center" },
  back: { width: 44, height: 44, marginLeft: -10, marginBottom: -16, alignItems: "center", justifyContent: "center" },
  btn: { borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  field: { minHeight: 54, borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, fontSize: 17 },
  notice: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: { maxHeight: "92%", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  stat: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", borderRadius: 18, paddingHorizontal: 20, paddingVertical: 16 },
  row: { minHeight: 64, borderWidth: 1, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  pill: { minHeight: 40, borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
});
