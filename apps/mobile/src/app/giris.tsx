/**
 * Giriş (design-system.md §10.8, with §9.2 for anatomy and copy), a modal.
 *
 * The generic 96pt coin, "Hoş geldin", then three steps in place:
 * 1. Phone: "+90" fixed outside the field, mask `5xx xxx xx xx`, "Kod gönder".
 *    Error: "Numara 5 ile başlamalı ve 10 haneli olmalı."
 * 2. Code: "+90 532 123 45 67 numarasına bir kod gönderdik.", six boxes ("SMS ile gelen kod",
 *    `oneTimeCode` / `sms-otp`; the sixth digit submits), "Kodu tekrar gönder (0:42)" counting
 *    down 60s, and "Numarayı değiştir". Errors: "Kod tutmadı. Tekrar dener misin?"; after five
 *    tries "Çok fazla hatalı deneme oldu. Yeni bir kod iste."; network "Bağlantı kurulamadı.
 *    Tekrar dene."
 * 3. Name, only for a new customer [G8]: "Adın ne?", "Adın" with "Siparişin hazır olunca bu
 *    adla çağrılırsın.", "Devam" [G18].
 * Then `router.back()`, to wherever the user came from.
 *
 * Demo personas only when `EXPO_PUBLIC_DEMO=1` (see `DemoBox`). Errors stay at their field;
 * nothing typed is wiped except a code that didn't match.
 */
import { createPeniClient, PeniApiError, type SessionDTO } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { formatPhone } from "@peni/brand/format";
import { router, Stack } from "expo-router";
import { CircleAlert, X } from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Coin } from "@/components/brand";
import { CODE_LABEL, CodeInput } from "@/components/profile/code-input";
import { DEMO, DemoBox, type DemoPersona } from "@/components/profile/demo-box";
import { NAME_EMPTY, NAME_HINT } from "@/components/profile/name-form";
import { isPhoneComplete, phoneE164, PhoneField } from "@/components/profile/phone-field";
import { Button, Field, Icon, IconButton, T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { API_URL, useSession } from "@/lib/session";
import { useTokens } from "@/lib/theme";

type Step = "phone" | "code" | "name";

/** "Kodu tekrar gönder" waits this long after each code (§9.2). */
const RESEND_SECONDS = 60;

// A no-break space keeps "6 haneli" on one line.
const INTRO = "Telefon numaranla giriş yap. Şifre yok; SMS ile 6\u00A0haneli bir kod gelir.";

export default function Giris() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const { api, signIn } = useSession();

  const [step, setStep] = useState<Step>("phone");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [session, setSession] = useState<SessionDTO | null>(null);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const verifying = useRef(false);
  const codeRef = useRef<ComponentRef<typeof TextInput>>(null);
  const remaining = useCountdown(resendAt);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  /** Signed in: back to where the user came from. */
  const finish = () => {
    haptic("success");
    close();
  };

  /* ---------------- 1. phone ---------------- */

  const sendCode = async (opts: { resend?: boolean } = {}) => {
    if (!isPhoneComplete(digits)) {
      haptic("error");
      setError(errorCopy.phone);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.requestCode({ phone: phoneE164(digits) });
      setDevCode(res.devCode ?? null);
      setCode("");
      setResent(Boolean(opts.resend));
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setStep("code");
    } catch (e) {
      haptic("error");
      setError(messageFor(e, "phone"));
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- 2. code ---------------- */

  const verify = async (value: string) => {
    if (verifying.current) return;
    if (!/^\d{6}$/.test(value)) {
      haptic("error");
      setError("Kodun altı hanesini gir.");
      return;
    }
    verifying.current = true;
    setBusy(true);
    setError(null);
    try {
      const s = await api.auth.verifyCode({ phone: phoneE164(digits), code: value });
      await signIn(s.token, s.customer, s.staffCafes);
      if (s.isNew) {
        setSession(s);
        // A new customer has the server's placeholder name until they tell us theirs.
        setName("");
        setStep("name");
        setBusy(false);
      } else {
        finish();
      }
    } catch (e) {
      haptic("error");
      const locked = e instanceof PeniApiError && e.code === "RATE_LIMITED";
      setError(messageFor(e, "code"));
      setCode("");
      // Too many tries: the server dropped the code, so a new one can be asked for at once.
      if (locked) setResendAt(0);
      setBusy(false);
      // Back to the first box, ready for the next try.
      requestAnimationFrame(() => codeRef.current?.focus());
    } finally {
      verifying.current = false;
    }
  };

  const changeNumber = () => {
    setStep("phone");
    setCode("");
    setError(null);
    setDevCode(null);
  };

  /* ---------------- 3. name [G8] ---------------- */

  const saveName = async () => {
    const value = name.trim();
    if (!value) {
      haptic("error");
      setError(NAME_EMPTY);
      return;
    }
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      // The session's own client still holds the old token until the next render.
      const client = createPeniClient({ baseUrl: API_URL, getToken: () => session.token });
      const me = await client.me.updateProfile({ displayName: value });
      await signIn(session.token, me.customer, me.staffCafes);
      finish();
    } catch (e) {
      haptic("error");
      setError(messageFor(e, "name"));
      setBusy(false);
    }
  };

  /* ---------------- demo personas ---------------- */

  const demoSignIn = async (p: DemoPersona) => {
    setDemoBusy(p.id);
    setDemoError(null);
    try {
      const sent = await api.auth.requestCode({ phone: p.phone });
      if (!sent.devCode) throw new PeniApiError("SMS_NOT_CONFIGURED", 503, "");
      const s = await api.auth.verifyCode({ phone: p.phone, code: sent.devCode });
      await signIn(s.token, s.customer, s.staffCafes);
      finish();
    } catch (e) {
      setDemoError(e instanceof PeniApiError && e.code === "NETWORK" ? errorCopy.network : errorCopy.generic);
      setDemoBusy(null);
    }
  };

  const phoneShown = formatPhone(phoneE164(digits));

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.fill}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom + 32 }]}
        >
          <View style={styles.bar}>
            <IconButton label={actionCopy.close} icon={X} onPress={close} />
          </View>

          <View style={styles.column}>
            <View style={styles.head}>
              <Coin size={96} />
              <T variant="h2" align="center" accessibilityRole="header" style={styles.title}>
                Hoş geldin
              </T>
              <View accessibilityLiveRegion="polite" aria-live="polite">
                {step === "phone" ? (
                  <T variant="body" color="ink2" align="center">
                    {INTRO}
                  </T>
                ) : null}
                {step === "code" ? (
                  <T variant="body" color="ink2" align="center">
                    <T color="ink" tabular>
                      {phoneShown.replace(/ /g, " ")}
                    </T>{" "}
                    {resent ? "numarasına yeni bir kod gönderdik." : "numarasına bir kod gönderdik."}
                  </T>
                ) : null}
              </View>
            </View>

            {step === "phone" ? (
              <View style={styles.form}>
                <PhoneField
                  value={digits}
                  onValueChange={(d) => {
                    setDigits(d);
                    if (error) setError(null);
                  }}
                  onSubmit={() => void sendCode()}
                  error={error}
                  autoFocus={!DEMO}
                />
                <Button title="Kod gönder" fullWidth size="lg" loading={busy} onPress={() => void sendCode()} />
              </View>
            ) : null}

            {step === "code" ? (
              <View style={styles.form}>
                <View style={styles.codeFrame}>
                  <T variant="strong" aria-hidden>
                    {CODE_LABEL}
                  </T>
                  <CodeInput
                    ref={codeRef}
                    value={code}
                    onValueChange={(v) => {
                      setCode(v);
                      if (error) setError(null);
                    }}
                    onComplete={(v) => void verify(v)}
                    invalid={!!error}
                    disabled={busy}
                    autoFocus
                    accessibilityHint={error ?? undefined}
                  />
                  {error ? <ErrorLine message={error} /> : null}
                </View>
                <Button
                  title={actionCopy.signIn}
                  fullWidth
                  size="lg"
                  loading={busy}
                  loadingLabel="Kontrol ediliyor…"
                  onPress={() => void verify(code)}
                />
                <View style={styles.quiet}>
                  {remaining > 0 ? (
                    // Waiting is not a fault: the countdown is the reason, set as quiet text, with
                    // no grey slab. It turns into the quiet button at 0:00.
                    <View
                      accessible
                      accessibilityRole="button"
                      accessibilityState={{ disabled: true }}
                      aria-disabled
                      accessibilityLabel={`Kodu tekrar gönder, ${remaining} saniye sonra`}
                      style={styles.wait}
                    >
                      <T variant="button" color="ink2">
                        Kodu tekrar gönder{" "}
                        <T tabular color="ink2">
                          ({clock(remaining)})
                        </T>
                      </T>
                    </View>
                  ) : (
                    <Button
                      variant="quiet"
                      size="sm"
                      title="Kodu tekrar gönder"
                      disabled={busy}
                      onPress={() => void sendCode({ resend: true })}
                    />
                  )}
                  <Button
                    variant="quiet"
                    size="sm"
                    title="Numarayı değiştir"
                    onPress={() => (busy ? undefined : changeNumber())}
                  />
                </View>
              </View>
            ) : null}

            {step === "name" ? (
              <View style={styles.form}>
                <T variant="h3" accessibilityRole="header">
                  Adın ne?
                </T>
                <Field
                  label="Adın"
                  hint={NAME_HINT}
                  error={error}
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={() => void saveName()}
                  returnKeyType="done"
                  autoFocus
                  maxLength={40}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  textContentType="givenName"
                />
                <Button title={actionCopy.continue} fullWidth size="lg" loading={busy} onPress={() => void saveName()} />
              </View>
            ) : null}

            {DEMO && step !== "name" ? (
              <DemoBox
                busyId={demoBusy}
                disabled={demoBusy !== null || busy}
                devCode={step === "code" ? devCode : null}
                error={demoError}
                onPick={(p) => void demoSignIn(p)}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ErrorLine({ message }: { message: string }) {
  const t = useTokens();
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
      <View style={styles.errorIcon}>
        <Icon icon={CircleAlert} size={16} color={t.danger} />
      </View>
      <T variant="meta" color="danger" style={styles.errorText}>
        {message}
      </T>
    </View>
  );
}

/** Seconds left until `until` (ms), ticking once a second; 0 when past. */
function useCountdown(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (until <= Date.now()) return;
    const timer = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** 42 → "0:42". */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The §9.2 sentence for each failure; the API's own Turkish message otherwise. */
function messageFor(error: unknown, step: Step): string {
  if (!(error instanceof PeniApiError)) return errorCopy.generic;
  switch (error.code) {
    case "NETWORK":
      return errorCopy.network;
    case "CODE_INVALID":
      return errorCopy.code;
    case "RATE_LIMITED":
      return errorCopy.codeLocked;
    case "VALIDATION":
      return step === "phone" ? errorCopy.phone : step === "code" ? errorCopy.code : error.message;
    default:
      return error.message;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 16 },
  bar: { flexDirection: "row", justifyContent: "flex-end", marginRight: -6 },
  column: { width: "100%", maxWidth: 400, alignSelf: "center", gap: 32 },
  head: { alignItems: "center", gap: 8, paddingHorizontal: 8 },
  title: { marginTop: 12 },
  form: { gap: 20 },
  codeFrame: { gap: 8 },
  quiet: { alignItems: "center", gap: 0, marginTop: -8 },
  wait: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  error: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  errorIcon: { paddingTop: 1 },
  errorText: { flex: 1 },
});
