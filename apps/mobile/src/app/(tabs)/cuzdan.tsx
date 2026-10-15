import { formatPeni, newIdempotencyKey, type WalletDTO } from "@peni/api";
import { Link } from "expo-router";
import { useCallback, useState } from "react";
import { Body, Button, Card, Coin, ErrorText, Input, Row, Screen, Title } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const EMPTY: WalletDTO = { totalPeni: 0, cafes: [], gifts: [] };

export default function Wallet() {
  const { api, signedIn, signOut } = useSession();
  const t = useTheme();
  const { data, error, loading, refresh } = useLoad(
    useCallback(() => (signedIn ? api.wallet.get() : Promise.resolve(EMPTY)), [api, signedIn]),
  );
  const [cafeSlug, setCafeSlug] = useState<string | null>(null);
  const [toPhone, setToPhone] = useState("+90");
  const [amount, setAmount] = useState(30);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!signedIn)
    return (
      <Screen>
        <Body>Cüzdanını görmek için giriş yap.</Body>
        <Link href="/giris" asChild>
          <Button title="Giriş yap" onPress={() => {}} />
        </Link>
      </Screen>
    );

  const w = data ?? EMPTY;
  const selected = cafeSlug ?? w.cafes[0]?.cafeSlug ?? null;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <ErrorText>{error}</ErrorText>
      <Body muted>Peni her kafede ayrı tutulur; o kafede 1 peni = 1 TL.</Body>
      {w.cafes.map((c) => (
        <Card key={c.membershipId}>
          <Body>{c.cafeName}</Body>
          <Row>
            <Coin size={22} />
            <Title size={30}>{c.balancePeni}</Title>
          </Row>
        </Card>
      ))}

      {w.gifts
        .filter((g) => g.direction === "in" && g.status === "pending")
        .map((g) => (
          <Card key={g.id} accent>
            <Body>
              <Body style={{ fontWeight: "700" }}>{g.fromName}</Body> sana {formatPeni(g.peni)} ısmarladı · {g.cafeName}
            </Body>
            {g.message && <Body muted>“{g.message}”</Body>}
            <Row>
              <Button title="Kabul et" onPress={() => act(() => api.gifts.accept(g.id), "Cüzdanına eklendi.")} />
              <Button title="Geri çevir" variant="ghost" onPress={() => act(() => api.gifts.decline(g.id), "Geri gönderildi.")} />
            </Row>
          </Card>
        ))}

      {w.cafes.length > 0 && (
        <Card>
          <Title size={20}>Birine ısmarla</Title>
          <Body muted>Arkadaşın aynı kafenin üyesi olmalı. 24 saatte kabul etmezse peni sana döner.</Body>
          <Row style={{ flexWrap: "wrap" }}>
            {w.cafes.map((c) => (
              <Button key={c.cafeSlug} small variant={selected === c.cafeSlug ? "primary" : "ghost"} title={c.cafeName} onPress={() => setCafeSlug(c.cafeSlug)} />
            ))}
          </Row>
          <Input value={toPhone} onChangeText={setToPhone} keyboardType="phone-pad" />
          <Row>
            {[30, 60, 90].map((v) => (
              <Button key={v} small variant={amount === v ? "primary" : "ghost"} title={String(v)} onPress={() => setAmount(v)} />
            ))}
          </Row>
          <Button
            title={`${formatPeni(amount)} ısmarla`}
            disabled={!selected}
            onPress={() =>
              act(
                () => api.gifts.send({ cafeSlug: selected!, toPhone: toPhone.replace(/\s/g, ""), peni: amount, idempotencyKey: newIdempotencyKey() }),
                "Ismarladın! Kabul edince cüzdanına geçecek.",
              )
            }
          />
        </Card>
      )}
      {msg && <Body style={{ color: msg.ok ? t.leaf : t.berry }}>{msg.text}</Body>}
      <Button title="Çıkış yap" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
