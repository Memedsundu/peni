/**
 * "Telefon numaran" (§9.2, §10.8): "+90" as a fixed prefix outside the text, the mask
 * `5xx xxx xx xx`, the phone pad, `textContentType="telephoneNumber"` and
 * `autoComplete="tel-national"`. The value is the national digits only ("5321234567"). Pasting
 * a full number — "+90 532 123 45 67", "0532 123 45 67" — keeps the right ten digits.
 */
import type { ComponentRef, Ref } from "react";
import type { TextInput } from "react-native";
import { Field } from "@/components/ui";

export const PHONE_LABEL = "Telefon numaran";
const PLACEHOLDER = "5xx xxx xx xx";

/** "5321234567" → "532 123 45 67" (partial input formats as far as it goes). */
export function formatPhoneDigits(digits: string): string {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(" ");
}

/** What was typed or pasted → national digits: drops "+90", "90" or a leading "0" before the 5. */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("90")) d = d.slice(2);
  if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

export function isPhoneComplete(digits: string): boolean {
  return /^5\d{9}$/.test(digits);
}

/** "5321234567" → "+905321234567", for the API. */
export function phoneE164(digits: string): string {
  return `+90${digits}`;
}

export interface PhoneFieldProps {
  value: string;
  onValueChange: (digits: string) => void;
  error?: string | null;
  onSubmit?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

export function PhoneField({ value, onValueChange, error, onSubmit, autoFocus, disabled, ref }: PhoneFieldProps) {
  return (
    <Field
      ref={ref}
      label={PHONE_LABEL}
      prefix="+90"
      value={formatPhoneDigits(value)}
      onChangeText={(text) => onValueChange(phoneDigits(text))}
      placeholder={PLACEHOLDER}
      keyboardType="phone-pad"
      inputMode="tel"
      textContentType="telephoneNumber"
      autoComplete="tel-national"
      autoCorrect={false}
      returnKeyType="send"
      onSubmitEditing={onSubmit}
      autoFocus={autoFocus}
      disabled={disabled}
      error={error}
      inputStyle={{ fontVariant: ["tabular-nums"] }}
    />
  );
}
