import { router } from "expo-router";
import { useState } from "react";
import { Body, Button, Card, ErrorText, Input, Screen, Title } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function SignIn() {
  const { api, signIn } = useSession();
  const t = useTheme();
  const [phone, setPhone] = useState("+90");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const p = phone.replace(/\s/g, "");
      if (step === "phone") {
        const r = await api.auth.requestCode({ phone: p });
        setStep("code");
        setHint(r.devCode ? `Demo modu: kod ${r.devCode}` : "Kodu SMS ile gönderdik.");
      } else {
        const s = await api.auth.verifyCode({ phone: p, code, displayName: name || undefined });
        await signIn(s.token, s.customer);
        router.back();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Telefonunla gir</Title>
      <Card>
        <Body>Telefon numaran</Body>
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" editable={step === "phone"} />
        {step === "code" && (
          <>
            <Body>SMS kodu</Body>
            <Input value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} />
            <Body>Adın (ilk girişte)</Body>
            <Input value={name} onChangeText={setName} />
          </>
        )}
        {hint && <Body style={{ color: t.leaf }}>{hint}</Body>}
        <ErrorText>{error}</ErrorText>
        <Button title={step === "phone" ? "Kod gönder" : "Giriş yap"} onPress={submit} disabled={busy} />
      </Card>
      <Body muted>Demo: Ayşe +905320000001 · Mehmet +905320000002 · Deniz +905320000003</Body>
    </Screen>
  );
}
