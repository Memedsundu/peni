// Legacy sign-in (modal). Rebuilt per §9.2 / §10.8 in §16 step 6.
import { errorCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Body, Button, Card, ErrorText, Input, Label, Screen, Title, useLegacyTheme } from "@/components/legacy-ui";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";

const DEMO = process.env.EXPO_PUBLIC_DEMO === "1";
const PERSONAS = [
  { name: "Ayşe", phone: "+905320000001" },
  { name: "Mehmet", phone: "+905320000002" },
  { name: "Deniz", phone: "+905320000003" },
];

export default function SignIn() {
  const { api, signIn } = useSession();
  const t = useLegacyTheme();
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
        setHint(r.devCode ? `Deneme kodu: ${r.devCode}` : "Kodu SMS ile gönderdik.");
      } else {
        const s = await api.auth.verifyCode({ phone: p, code, displayName: name || undefined });
        await signIn(s.token, s.customer, s.staffCafes);
        haptic("success");
        router.back();
      }
    } catch (e) {
      haptic("error");
      setError((e as Error).message || errorCopy.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Hoş geldin</Title>
      <Body muted>Telefon numaranla giriş yap. Şifre yok; SMS ile 6 haneli bir kod gelir.</Body>
      <Card>
        <Body>Telefon numaran</Body>
        <Input
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          accessibilityLabel="Telefon numaran"
          editable={step === "phone"}
        />
        {step === "code" && (
          <>
            <Body>SMS ile gelen kod</Body>
            <Input
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              accessibilityLabel="SMS ile gelen kod"
              maxLength={6}
            />
            <Body>Adın (ilk girişte)</Body>
            <Input value={name} onChangeText={setName} accessibilityLabel="Adın" />
          </>
        )}
        {hint && <Body style={{ color: t.successInk }}>{hint}</Body>}
        <ErrorText>{error}</ErrorText>
        <Button title={step === "phone" ? "Kod gönder" : "Giriş yap"} onPress={submit} disabled={busy} />
      </Card>
      {DEMO && step === "phone" && (
        <View
          style={{
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: t.lineStrong,
            borderRadius: 10,
            padding: 12,
            gap: 8,
          }}
        >
          <Label>DENEME</Label>
          <Body muted>Deneme hesaplarıyla tek dokunuşla gir.</Body>
          {PERSONAS.map((p) => (
            <Button key={p.phone} small variant="ghost" title={p.name} onPress={() => setPhone(p.phone)} />
          ))}
        </View>
      )}
    </Screen>
  );
}
