/**
 * The SMS code (§9.2, §10.8): six 48×56 boxes over one real text field.
 *
 * The field is a single `TextInput` laid over the boxes, with clear text and a hidden caret, so
 * a tap on any box focuses it, the number pad opens, and iOS (`textContentType="oneTimeCode"`)
 * and Android (`autoComplete="sms-otp"`) offer the code from the SMS. Pasting or autofilling
 * fills every box. The boxes are only its picture: the box that takes the next digit has the
 * 2pt ink border, an error turns every border `danger`.
 *
 * At 360pt the six boxes share 328pt with 8pt gaps, so they settle at 48pt and never shrink
 * under the 44pt target.
 */
import { useRef, useState, type ComponentRef, type Ref } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";
import { T } from "@/components/ui";
import { fonts, isDark, radius, useTokens } from "@/lib/theme";

export const CODE_LENGTH = 6;
export const CODE_LABEL = "SMS ile gelen kod";

export interface CodeInputProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Once all six boxes are filled (typing, autofill or paste): submit from here. */
  onComplete?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Spoken with the field: the error, or what to do. */
  accessibilityHint?: string;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

export function CodeInput({
  value,
  onValueChange,
  onComplete,
  invalid = false,
  disabled = false,
  autoFocus,
  accessibilityHint,
  ref,
}: CodeInputProps) {
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  const lastComplete = useRef<string | null>(null);
  const next = Math.min(value.length, CODE_LENGTH - 1);

  const change = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
    onValueChange(digits);
    if (digits.length === CODE_LENGTH) {
      if (lastComplete.current !== digits) {
        lastComplete.current = digits;
        onComplete?.(digits);
      }
    } else lastComplete.current = null;
  };

  return (
    <View style={styles.wrap}>
      <View aria-hidden style={styles.row}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const digit = value[i] ?? "";
          const active = focused && !disabled && i === next;
          const border = disabled ? "transparent" : invalid ? t.danger : active ? t.ink : t.lineStrong;
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  borderColor: border,
                  borderWidth: active || invalid ? 2 : 1.5,
                  backgroundColor: disabled ? t.surface2 : t.surface,
                },
              ]}
            >
              <T variant="h3" tabular color={disabled ? "ink2" : "ink"} style={styles.digit}>
                {digit}
              </T>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={change}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "web" ? "one-time-code" : "sms-otp"}
        maxLength={CODE_LENGTH}
        caretHidden
        contextMenuHidden={false}
        selectionColor="transparent"
        keyboardAppearance={isDark(t) ? "dark" : "light"}
        accessibilityLabel={CODE_LABEL}
        accessibilityHint={accessibilityHint}
        aria-invalid={invalid || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.field, Platform.OS === "web" ? styles.fieldWeb : null]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", alignSelf: "stretch" },
  row: { flexDirection: "row", justifyContent: "center", gap: 8 },
  box: {
    flex: 1,
    maxWidth: 52,
    minWidth: 44,
    height: 56,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  digit: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, fontVariant: ["lining-nums", "tabular-nums"] },
  // The real field covers the boxes, its text clear: taps land on it, the boxes show the digits.
  field: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: "transparent",
    fontSize: 1,
    textAlign: "center",
    backgroundColor: "transparent",
  },
  fieldWeb: { outlineWidth: 0, opacity: 0.01 } as object,
});
