/**
 * Field and Input (design-system.md §12.2, §12.5).
 *
 * - The label is real text above the input (`strong`; or a `legend` — "TELEFON NUMARASI" — with
 *   the sentence-case label as the accessibility label), then the hint, then the error.
 * - The input is 48pt, radius 10, 16pt Archivo, 1.5pt `lineStrong` border on `surface`. Focus
 *   turns the border ink; an error turns it `danger`. Disabled: `surface2`, no border, `ink2`.
 * - `prefix` is a fixed affix outside the editable text ("+90") on a `surface2` cell.
 * - The error line is `danger` text with `CircleAlert`, and it is announced when it appears.
 * - `maxLength` with `counter` shows "0/140" under the input.
 *
 * `FieldFrame` is the same label / hint / error frame around any other control (a code input,
 * a picker).
 */
import { formatNumber } from "@peni/brand/format";
import { CircleAlert } from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import {
  AccessibilityInfo,
  Platform,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { fonts, isDark, radius, typeScale, useTokens } from "@/lib/theme";
import { Icon, withAlpha } from "./icon";
import { T } from "./t";

/* ========================================================================================== */
/* FieldFrame                                                                                 */
/* ========================================================================================== */

export interface FieldFrameProps {
  label: string;
  /** `strong` (default) or `legend` caps ("TELEFON NUMARASI", §10.5). */
  labelVariant?: "strong" | "legend";
  hint?: string;
  /** The error sentence ("Numara 5 ile başlamalı ve 10 haneli olmalı."). */
  error?: string | null | false;
  /** "12/140" under the control, right-aligned. Pair with the input's `maxLength`. */
  counter?: { length: number; max: number };
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function FieldFrame({ label, labelVariant = "strong", hint, error, counter, style, children }: FieldFrameProps) {
  const hasError = !!error;
  const lastError = useRef<string | null>(null);

  useEffect(() => {
    const message = error || null;
    if (message && message !== lastError.current && Platform.OS !== "web") {
      AccessibilityInfo.announceForAccessibility(message);
    }
    lastError.current = message;
  }, [error]);

  return (
    <View style={style}>
      <T
        variant={labelVariant}
        color={labelVariant === "legend" ? "ink2" : "ink"}
        style={{ marginBottom: 8 }}
        aria-hidden
      >
        {label}
      </T>
      {children}
      {hint || counter ? (
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1 }}>
            {hint ? (
              <T variant="meta" color="ink2" aria-hidden>
                {hint}
              </T>
            ) : null}
          </View>
          {counter ? (
            <T
              variant="meta"
              tabular
              color={counter.length >= counter.max ? "ink" : "ink2"}
              aria-hidden
            >
              {`${formatNumber(counter.length)}/${formatNumber(counter.max)}`}
            </T>
          ) : null}
        </View>
      ) : null}
      {hasError ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ marginTop: 6, flexDirection: "row", alignItems: "flex-start", gap: 6 }}
        >
          <View style={{ paddingTop: 1 }}>
            <ErrorIcon />
          </View>
          <T variant="meta" color="danger" style={{ flex: 1 }}>
            {error}
          </T>
        </View>
      ) : null}
    </View>
  );
}

function ErrorIcon() {
  const t = useTokens();
  return <Icon icon={CircleAlert} size={16} color={t.danger} />;
}

/* ========================================================================================== */
/* Input                                                                                      */
/* ========================================================================================== */

export interface InputProps extends Omit<TextInputProps, "style" | "editable"> {
  /** A fixed affix outside the editable text ("+90"). */
  prefix?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Multi-line rows (a note). Turns `multiline` on. */
  rows?: number;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

const INPUT_HEIGHT = 48;
const body = typeScale.body;

export function Input({
  prefix,
  invalid = false,
  disabled = false,
  rows,
  style,
  inputStyle,
  onFocus,
  onBlur,
  multiline,
  ref,
  ...rest
}: InputProps) {
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  const isMulti = multiline || (rows != null && rows > 1);
  const borderColor = disabled ? "transparent" : invalid ? t.danger : focused ? t.ink : t.lineStrong;

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: isMulti ? "stretch" : "center",
          minHeight: isMulti ? (rows ?? 2) * body.lineHeight + 24 : INPUT_HEIGHT,
          borderRadius: radius.control,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: disabled ? t.surface2 : t.surface,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {prefix ? (
        <View
          aria-hidden
          style={{
            alignSelf: "stretch",
            justifyContent: "center",
            paddingHorizontal: 12,
            backgroundColor: t.surface2,
            borderRightWidth: 1.5,
            borderRightColor: t.line,
          }}
        >
          <T variant="body" color="ink2" tabular>
            {prefix}
          </T>
        </View>
      ) : null}
      <TextInput
        ref={ref}
        {...rest}
        editable={!disabled}
        multiline={isMulti}
        numberOfLines={isMulti ? rows : undefined}
        aria-disabled={disabled || undefined}
        maxFontSizeMultiplier={body.maxFontSizeMultiplier}
        placeholderTextColor={t.ink2}
        selectionColor={Platform.OS === "android" ? withAlpha(t.ink, 0.25) : t.ink}
        cursorColor={t.ink}
        selectionHandleColor={t.ink}
        keyboardAppearance={isDark(t) ? "dark" : "light"}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            flex: 1,
            minWidth: 0,
            fontFamily: fonts.sans,
            fontSize: body.fontSize,
            color: disabled ? t.ink2 : t.ink,
            paddingHorizontal: 14,
          },
          isMulti
            ? { lineHeight: body.lineHeight, paddingVertical: 12, textAlignVertical: "top" }
            : { height: INPUT_HEIGHT - 3, paddingVertical: 0 },
          // react-native-web draws its own focus outline on the input; the border carries focus.
          Platform.OS === "web" ? { outlineWidth: 0 } : null,
          inputStyle,
        ]}
      />
    </View>
  );
}

/* ========================================================================================== */
/* Field = FieldFrame + Input                                                                 */
/* ========================================================================================== */

export interface FieldProps extends Omit<InputProps, "invalid"> {
  label: string;
  labelVariant?: "strong" | "legend";
  hint?: string;
  error?: string | null | false;
  /** Show "n/max" under the input (needs `maxLength`). */
  counter?: boolean;
  /** The frame's style (margins). `style` styles the input box. */
  containerStyle?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  labelVariant,
  hint,
  error,
  counter = false,
  containerStyle,
  accessibilityLabel,
  accessibilityHint,
  maxLength,
  value,
  defaultValue,
  ...input
}: FieldProps) {
  const length = (value ?? defaultValue ?? "").length;
  const spokenHint = [error || null, accessibilityHint ?? hint ?? null].filter(Boolean).join(". ");
  return (
    <FieldFrame
      label={label}
      labelVariant={labelVariant}
      hint={hint}
      error={error}
      counter={counter && maxLength != null ? { length, max: maxLength } : undefined}
      style={containerStyle}
    >
      <Input
        {...input}
        value={value}
        defaultValue={defaultValue}
        maxLength={maxLength}
        invalid={!!error}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={spokenHint || undefined}
      />
    </FieldFrame>
  );
}
