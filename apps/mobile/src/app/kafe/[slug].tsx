import { formatKurus, formatPeni, newIdempotencyKey, PeniApiError, type CafeDetailDTO, type PostDTO } from "@peni/api";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Switch, View } from "react-native";
import { Body, Button, Card, Coin, ErrorText, Input, Label, Loading, Row, Screen, Title } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function CafeScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api, signedIn } = useSession();
  const t = useTheme();
  const { data: cafe, error: loadError, loading, refresh } = useLoad(useCallback(() => api.cafes.get(slug), [api, slug]));

  const [cart, setCart] = useState<Record<string, number>>({});
  const [askidaProductId, setAskidaProductId] = useState<string | null>(null);
  const [usePeni, setUsePeni] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orderKey = useRef(newIdempotencyKey());

  const menu = useMemo(() => new Map(cafe?.menu.map((m) => [m.productId, m]) ?? []), [cafe]);
  if (!cafe) return loadError ? <Screen><ErrorText>{loadError}</ErrorText></Screen> : <Loading />;

  const member = !!cafe.membership;
  const balance = cafe.membership?.balancePeni ?? 0;
  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const subtotal = lines.reduce((s, [id, q]) => s + (menu.get(id)?.priceKurus ?? 0) * q, 0);
  const askidaKurus = askidaProductId && cart[askidaProductId] ? (menu.get(askidaProductId)?.priceKurus ?? 0) : 0;
  const maxPeni = Math.max(0, Math.min(balance, Math.floor(((subtotal - askidaKurus) * cafe.maxRedeemSharePercent) / 100 / 100)));
  const applied = Math.min(usePeni, maxPeni);
  const canOrder = member && cafe.acceptingOrders && (cafe.membership?.preorderEnabled ?? false);

  const add = (id: string, d: number) => {
    const q = Math.max(0, (cart[id] ?? 0) + d);
    if (q === 0 && askidaProductId === id) setAskidaProductId(null);
    setCart({ ...cart, [id]: q });
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 401) router.push("/giris");
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const order = () =>
    run(async () => {
      try {
        const o = await api.orders.create({
          cafeSlug: slug,
          lines: lines.map(([productId, quantity]) => ({ productId, quantity })),
          usePeni: applied,
          askidaProductId: askidaKurus > 0 ? askidaProductId : null,
          customerNote: note || undefined,
          idempotencyKey: orderKey.current,
        });
        setCart({});
        setAskidaProductId(null);
        orderKey.current = newIdempotencyKey();
        router.push(`/siparis/${o.id}`);
      } catch (e) {
        orderKey.current = newIdempotencyKey();
        void refresh();
        throw e;
      }
    });

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Stack.Screen options={{ title: cafe.name }} />
      <View style={{ gap: 4 }}>
        <Body muted>
          {[cafe.address, cafe.district].filter(Boolean).join(" · ")} · Her harcamada %{cafe.earnRatePercent} peni
        </Body>
        {member ? (
          <Row>
            <Coin />
            <Body>
              Bu kafede <Body style={{ fontWeight: "700" }}>{formatPeni(balance)}</Body> var
            </Body>
          </Row>
        ) : (
          <Button
            title={signedIn ? "Kafeye katıl" : "Katılmak için giriş yap"}
            onPress={() =>
              signedIn
                ? run(async () => {
                    await api.cafes.join(slug);
                    await refresh();
                  })
                : router.push("/giris")
            }
            disabled={busy}
          />
        )}
      </View>

      <Askida cafe={cafe} slug={slug} balance={balance} member={member} onChange={refresh} />

      <Title size={22}>Menü</Title>
      {!cafe.acceptingOrders && <Body style={{ color: t.berry }}>Şu an uygulamadan sipariş alınmıyor.</Body>}
      <Card style={{ padding: 0, gap: 0 }}>
        {cafe.menu.map((m, i) => (
          <View key={m.productId} style={{ padding: 14, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: "600" }}>{m.name}</Body>
                <Body muted>{formatKurus(m.priceKurus)}</Body>
              </View>
              {canOrder && (
                <Row>
                  {(cart[m.productId] ?? 0) > 0 && (
                    <>
                      <Button small variant="ghost" title="−" onPress={() => add(m.productId, -1)} />
                      <Body style={{ fontWeight: "700" }}>{cart[m.productId]}</Body>
                    </>
                  )}
                  <Button small variant="ghost" title="+" onPress={() => add(m.productId, 1)} />
                </Row>
              )}
            </Row>
            {canOrder && m.askida && cafe.askida.itemsAvailable > 0 && (
              <View style={{ alignSelf: "flex-start" }}>
                <Button
                  small
                  variant={askidaProductId === m.productId ? "leaf" : "ghost"}
                  title={askidaProductId === m.productId ? "Askıdan ✓" : "Askıdan al"}
                  onPress={() => {
                    if (askidaProductId === m.productId) return setAskidaProductId(null);
                    setAskidaProductId(m.productId);
                    if (!cart[m.productId]) add(m.productId, 1);
                  }}
                />
              </View>
            )}
          </View>
        ))}
      </Card>

      {lines.length > 0 && (
        <Card accent>
          <Title size={18}>Siparişin</Title>
          {lines.map(([id, q]) => (
            <Row key={id} style={{ justifyContent: "space-between" }}>
              <Body>
                {q} × {menu.get(id)?.name}
              </Body>
              <Body>{formatKurus((menu.get(id)?.priceKurus ?? 0) * q)}</Body>
            </Row>
          ))}
          {askidaKurus > 0 && <Body style={{ color: t.leaf }}>Askıdan −{formatKurus(askidaKurus)}</Body>}
          {maxPeni > 0 && (
            <Row style={{ justifyContent: "space-between" }}>
              <Body>Peni kullan</Body>
              <Row>
                <Button small variant="ghost" title="−10" onPress={() => setUsePeni(Math.max(0, applied - 10))} />
                <Body style={{ color: t.copper, fontWeight: "700", minWidth: 36, textAlign: "center" }}>{applied}</Body>
                <Button small variant="ghost" title="+10" onPress={() => setUsePeni(Math.min(maxPeni, applied + 10))} />
                <Button small variant="ghost" title="Tümü" onPress={() => setUsePeni(maxPeni)} />
              </Row>
            </Row>
          )}
          <Input placeholder="Not: az şekerli, yulaf sütlü…" value={note} onChangeText={setNote} maxLength={200} />
          <Row style={{ justifyContent: "space-between" }}>
            <Body style={{ fontWeight: "700" }}>Kasada ödenecek</Body>
            <Body style={{ fontWeight: "700" }}>{formatKurus(subtotal - askidaKurus - applied * 100)}</Body>
          </Row>
          <Button title="Siparişi gönder" onPress={order} disabled={busy} />
        </Card>
      )}
      <ErrorText>{error}</ErrorText>

      <Title size={22}>Masa</Title>
      {cafe.posts.map((p) => (
        <Post key={p.id} post={p} slug={slug} canInteract={member} onChange={refresh} />
      ))}
    </Screen>
  );
}

function Askida({ cafe, slug, balance, member, onChange }: { cafe: CafeDetailDTO; slug: string; balance: number; member: boolean; onChange: () => void }) {
  const { api } = useSession();
  const t = useTheme();
  const [amount, setAmount] = useState(30);
  const [showName, setShowName] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const a = cafe.askida;
  if (!a.enabled) return null;

  const covers = cafe.menu
    .filter((m) => m.askida)
    .map((m) => ({ name: m.name.toLocaleLowerCase("tr"), n: Math.floor(a.balancePeni / Math.ceil(m.priceKurus / 100)) }))
    .filter((c) => c.n > 0)
    .map((c) => `${c.n} ${c.name}`);

  return (
    <Card style={{ backgroundColor: t.copperSoft, borderColor: t.copperSoft }}>
      <Label>Askıda kahve</Label>
      <Title size={26}>{a.itemsAvailable > 0 ? `Askıda ${formatPeni(a.balancePeni)}` : "Askı şu an boş"}</Title>
      {covers.length > 0 && <Body>{covers.join(", ")} için yeter.</Body>}
      <Body muted>
        Son 7 günde {a.claimedLast7Days} kişi askıdan aldı. İhtiyacın varsa menüde “Askıdan al”ı seç; günde {a.claimsPerDay} kez, adın
        görünmeden.
      </Body>
      {member && balance >= 30 && (
        <View style={{ gap: 8, marginTop: 6 }}>
          <Row style={{ flexWrap: "wrap" }}>
            {[30, 60, 90].map((v) => (
              <Button key={v} small variant={amount === v ? "primary" : "ghost"} title={String(v)} onPress={() => setAmount(v)} disabled={v > balance} />
            ))}
          </Row>
          <Row>
            <Switch value={showName} onValueChange={setShowName} trackColor={{ true: t.copper }} />
            <Body>Adım askı duvarında görünsün</Body>
          </Row>
          <Button
            title={`${formatPeni(amount)} askıya bırak`}
            onPress={async () => {
              try {
                const r = await api.askida.donate({ cafeSlug: slug, peni: amount, showName, idempotencyKey: newIdempotencyKey() });
                setMsg({ ok: true, text: r.matchedPeni ? `Teşekkürler! Kafe de ${formatPeni(r.matchedPeni)} ekledi.` : "Teşekkürler!" });
                onChange();
              } catch (e) {
                setMsg({ ok: false, text: (e as Error).message });
              }
            }}
          />
          {msg && <Body style={{ color: msg.ok ? t.leaf : t.berry }}>{msg.text}</Body>}
        </View>
      )}
      {a.wall.slice(0, 5).map((e, i) => (
        <Body key={i} muted style={{ fontSize: 13 }}>
          {e.type === "donation" && `${e.donorName ?? "Bir komşu"} askıya ${formatPeni(e.peni)} bıraktı`}
          {e.type === "till_donation" && `Kasada bir misafir askıya ${formatPeni(e.peni)} bıraktı`}
          {e.type === "cafe_match" && `Kafe ${formatPeni(e.peni)} ekledi`}
          {e.type === "claim" && `Biri askıdan bir ${e.itemName.toLocaleLowerCase("tr")} aldı`}
        </Body>
      ))}
    </Card>
  );
}

function Post({ post, slug, canInteract, onChange }: { post: PostDTO; slug: string; canInteract: boolean; onChange: () => void }) {
  const { api } = useSession();
  const [comment, setComment] = useState("");
  const label = post.kind === "event" ? "Peni masası" : post.kind === "question" ? "Günün sorusu" : null;
  return (
    <Card accent={post.kind === "event"}>
      {label && <Label>{label}</Label>}
      <Body>{post.body}</Body>
      {post.eventStartsAt && (
        <Body muted>
          {new Date(post.eventStartsAt).toLocaleString("tr-TR", { weekday: "long", hour: "2-digit", minute: "2-digit" })} · {post.rsvpCount}
          {post.eventCapacity ? `/${post.eventCapacity}` : ""} kişi geliyor
        </Body>
      )}
      <Row>
        <Button small variant={post.reactedByMe ? "primary" : "ghost"} title={`♥ ${post.reactionCount}`} disabled={!canInteract} onPress={() => api.cafes.react(slug, post.id).then(onChange)} />
        {post.kind === "event" && (
          <Button small variant={post.rsvpedByMe ? "leaf" : "ghost"} title={post.rsvpedByMe ? "Geliyorum ✓" : "Ben de geliyorum"} disabled={!canInteract} onPress={() => api.cafes.rsvp(slug, post.id).then(onChange)} />
        )}
      </Row>
      {post.comments.map((c) => (
        <Body key={c.id} style={{ fontSize: 14 }}>
          <Body style={{ fontWeight: "700", fontSize: 14 }}>{c.authorName}</Body> {c.body}
        </Body>
      ))}
      {canInteract && post.kind !== "post" && (
        <Row>
          <View style={{ flex: 1 }}>
            <Input placeholder={post.kind === "question" ? "Cevabını yaz…" : "Bir not bırak…"} value={comment} onChangeText={setComment} maxLength={500} />
          </View>
          <Button
            small
            variant="ghost"
            title="Gönder"
            disabled={!comment.trim()}
            onPress={() =>
              api.cafes.comment(slug, post.id, comment).then(() => {
                setComment("");
                onChange();
              })
            }
          />
        </Row>
      )}
    </Card>
  );
}
