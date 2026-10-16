// Legacy café screen, now on the shared CartProvider. Rebuilt per §10.2 in §16 step 6.
import { newIdempotencyKey, PeniApiError, type CafeDetailDTO, type PostDTO } from "@peni/api";
import { askiCaption, askiCopy, cartCopy, masaCopy, peniCopy } from "@peni/brand/copy";
import { formatPeni, formatTL, relDay } from "@peni/brand/format";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Check, Heart } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Switch, View } from "react-native";
import {
  Body,
  Button,
  Card,
  Coin,
  ErrorText,
  Input,
  Label,
  Loading,
  Row,
  Screen,
  Title,
  useLegacyTheme,
} from "@/components/legacy-ui";
import { refreshActiveOrder } from "@/lib/active-order";
import { summarizeCart, useCart } from "@/lib/cart";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { switchColors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function CafeScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api, signedIn } = useSession();
  const t = useLegacyTheme();
  const cart = useCart(slug);
  const {
    data: cafe,
    error: loadError,
    loading,
    refresh,
  } = useLoad(useCallback(() => api.cafes.get(slug), [api, slug]));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cafe)
    return loadError ? (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
      </Screen>
    ) : (
      <Loading />
    );

  const member = !!cafe.membership;
  const balance = cafe.membership?.balancePeni ?? 0;
  const sum = summarizeCart(cart, cafe);
  const canOrder = member && cafe.acceptingOrders && (cafe.membership?.preorderEnabled ?? false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 401) router.push("/giris");
      else {
        haptic("error");
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  const order = () =>
    run(async () => {
      try {
        const o = await api.orders.create(cart.orderInput(sum.peniApplied));
        haptic("confirm");
        cart.clear();
        void refreshActiveOrder();
        router.replace(`/siparis/${o.id}`);
      } catch (e) {
        void refresh();
        throw e;
      }
    });

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Stack.Screen options={{ title: cafe.name }} />
      <View style={{ gap: 8 }}>
        <Body muted>{[cafe.address, cafe.district].filter(Boolean).join(" · ")}</Body>
        <Body muted>{peniCopy.earnRule(cafe.earnRatePercent)}</Body>
        {member ? (
          <Row>
            <Coin />
            <Body>
              {peniCopy.balance(balance).before}
              <Body strong style={{ color: t.peniInk }}>
                {peniCopy.balance(balance).amount}
              </Body>
            </Body>
          </Row>
        ) : (
          <Button
            title={signedIn ? "Kafeye katıl" : "Giriş yap ve katıl"}
            onPress={() =>
              signedIn
                ? run(async () => {
                    await api.cafes.join(slug);
                    haptic("success");
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
      {!cafe.acceptingOrders && (
        <Body strong style={{ color: t.warningInk }}>
          Şu an uygulamadan sipariş alınmıyor.
        </Body>
      )}
      <Card style={{ padding: 0, gap: 0 }}>
        {cafe.menu.map((m, i) => {
          const qty = cart.quantityOf(m.productId);
          const isIkram = cart.ikramProductId === m.productId;
          return (
            <View key={m.productId} style={{ padding: 16, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Body strong>{m.name}</Body>
                  <Body muted>{m.available ? formatTL(m.priceKurus) : cartCopy.soldOut}</Body>
                </View>
                {canOrder && m.available && (
                  <Row>
                    {qty > 0 && (
                      <>
                        <Button
                          small
                          variant="ghost"
                          title="−"
                          accessibilityLabel={cartCopy.remove(m.name)}
                          onPress={() => cart.add(m.productId, -1)}
                        />
                        <Body strong>{qty}</Body>
                      </>
                    )}
                    <Button
                      small
                      variant="ghost"
                      title="+"
                      accessibilityLabel={cartCopy.add(m.name)}
                      onPress={() => {
                        haptic("tap");
                        cart.add(m.productId, 1);
                      }}
                    />
                  </Row>
                )}
              </Row>
              {canOrder && m.available && m.askida && cafe.askida.itemsAvailable > 0 && (
                <View style={{ alignSelf: "flex-start" }}>
                  <Button
                    small
                    variant={isIkram ? "primary" : "ghost"}
                    icon={isIkram ? Check : undefined}
                    title={askiCopy.take}
                    onPress={() => {
                      haptic("tap");
                      cart.setIkram(isIkram ? null : m.productId);
                    }}
                  />
                </View>
              )}
            </View>
          );
        })}
      </Card>

      {!cart.isEmpty && (
        <Card accent>
          <Title size={22}>{cartCopy.title}</Title>
          {sum.items.map((l) => (
            <Row key={l.productId} style={{ justifyContent: "space-between" }}>
              <Body>{cartCopy.line(l.quantity, l.item.name)}</Body>
              <Body>{formatTL(l.lineKurus)}</Body>
            </Row>
          ))}
          {sum.askidaKurus > 0 && (
            <Row style={{ justifyContent: "space-between" }}>
              <Body>İkram</Body>
              <Body>−{formatTL(sum.askidaKurus)}</Body>
            </Row>
          )}
          {sum.usablePeni > 0 && (
            <Row style={{ justifyContent: "space-between" }}>
              <Body style={{ flex: 1 }}>{cartCopy.usePeni(sum.usablePeni)}</Body>
              <Switch
                accessibilityLabel={cartCopy.usePeni(sum.usablePeni)}
                value={cart.usePeni}
                onValueChange={(on) => {
                  haptic("selection");
                  cart.setUsePeni(on);
                }}
                {...switchColors(t, "peni")}
              />
            </Row>
          )}
          {sum.peniApplied > 0 && (
            <Row style={{ justifyContent: "space-between" }}>
              <Body>Peni</Body>
              <Body>−{formatTL(sum.peniApplied * 100)}</Body>
            </Row>
          )}
          <Input
            placeholder={cartCopy.notePlaceholder}
            accessibilityLabel={cartCopy.noteLabel}
            value={cart.note}
            onChangeText={cart.setNote}
            maxLength={200}
          />
          <Row style={{ justifyContent: "space-between" }}>
            <Body strong>{sum.dueKurus > 0 ? cartCopy.dueLabel : cartCopy.noPayment}</Body>
            {sum.dueKurus > 0 && <Body strong>{formatTL(sum.dueKurus)}</Body>}
          </Row>
          {sum.earnPeni > 0 && (
            <Body muted>
              {cartCopy.earnPreview(sum.earnPeni).before}
              <Body strong style={{ color: t.peniInk }}>
                {cartCopy.earnPreview(sum.earnPeni).amount}
              </Body>
              {cartCopy.earnPreview(sum.earnPeni).after}
            </Body>
          )}
          <Button title={busy ? cartCopy.sending : cartCopy.submit(sum.dueKurus)} onPress={order} disabled={busy} />
        </Card>
      )}
      <ErrorText>{error}</ErrorText>

      <Title size={22}>{masaCopy.section}</Title>
      {cafe.posts.map((p) => (
        <Post key={p.id} post={p} slug={slug} canInteract={member} onChange={refresh} />
      ))}
    </Screen>
  );
}

function Askida({
  cafe,
  slug,
  balance,
  member,
  onChange,
}: {
  cafe: CafeDetailDTO;
  slug: string;
  balance: number;
  member: boolean;
  onChange: () => void;
}) {
  const { api } = useSession();
  const t = useLegacyTheme();
  const [amount, setAmount] = useState(30);
  const [showName, setShowName] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const a = cafe.askida;
  if (!a.enabled) return null;
  const caption = askiCaption(a);
  // Named donors only, at most three. Takers are never shown anywhere (D7).
  const donors = a.wall.filter((e) => e.type === "donation" && e.donorName).slice(0, 3);

  return (
    <View style={{ backgroundColor: t.askiSoft, borderRadius: 14, padding: 16, gap: 8 }}>
      <Label color={t.askiInk}>{askiCopy.legend}</Label>
      <Body strong>{caption.line1}</Body>
      <Body muted>{caption.line2}</Body>
      {caption.line3 && <Body muted>{caption.line3}</Body>}
      {member && balance >= 30 && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Row style={{ flexWrap: "wrap" }}>
            {[30, 60, 90].map((v) => (
              <Button
                key={v}
                small
                variant={amount === v ? "primary" : "ghost"}
                title={formatPeni(v)}
                onPress={() => setAmount(v)}
                disabled={v > balance}
              />
            ))}
          </Row>
          <Row>
            <Switch
              accessibilityLabel={askiCopy.giveSheet.nameSwitch}
              value={showName}
              onValueChange={setShowName}
              {...switchColors(t)}
            />
            <Body>{askiCopy.giveSheet.nameSwitch}</Body>
          </Row>
          <Button
            title={askiCopy.giveSheet.submitCustom(amount)}
            onPress={async () => {
              try {
                const r = await api.askida.donate({
                  cafeSlug: slug,
                  peni: amount,
                  showName,
                  idempotencyKey: newIdempotencyKey(),
                });
                haptic("success");
                setMsg({
                  ok: true,
                  text: [
                    `${formatPeni(amount)} askıya bırakıldı.`,
                    r.matchedPeni ? askiCopy.matchToast(r.matchedPeni) : null,
                  ]
                    .filter(Boolean)
                    .join(" "),
                });
                onChange();
              } catch (e) {
                haptic("error");
                setMsg({ ok: false, text: (e as Error).message });
              }
            }}
          />
          {msg &&
            (msg.ok ? <Body style={{ color: t.successInk }}>{msg.text}</Body> : <ErrorText>{msg.text}</ErrorText>)}
        </View>
      )}
      {donors.map((e, i) =>
        e.type === "donation" && e.donorName ? (
          <Body key={i} muted>
            {askiCopy.donorLine(e.donorName, formatPeni(e.peni), relDay(e.at))}
          </Body>
        ) : null,
      )}
    </View>
  );
}

function Post({
  post,
  slug,
  canInteract,
  onChange,
}: {
  post: PostDTO;
  slug: string;
  canInteract: boolean;
  onChange: () => void;
}) {
  const { api } = useSession();
  const t = useLegacyTheme();
  const [comment, setComment] = useState("");
  const label =
    post.kind === "event" ? masaCopy.eventLegend : post.kind === "question" ? masaCopy.questionLegend : null;
  return (
    <Card accent={post.kind === "event"}>
      {label && <Label color={t.masaInk}>{label}</Label>}
      <Body>{post.body}</Body>
      {post.eventStartsAt && (
        <Body muted>
          {new Date(post.eventStartsAt).toLocaleString("tr-TR", {
            weekday: "long",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Istanbul",
          })}
          {post.eventCapacity ? ` · ${masaCopy.seats(post.rsvpCount, post.eventCapacity, post.rsvpedByMe)}` : ""}
        </Body>
      )}
      <Row>
        <Button
          small
          variant={post.reactedByMe ? "primary" : "ghost"}
          icon={Heart}
          title={String(post.reactionCount)}
          accessibilityLabel="Kalp"
          disabled={!canInteract}
          onPress={() => {
            haptic("tap");
            void api.cafes.react(slug, post.id).then(onChange);
          }}
        />
        {post.kind === "event" && (
          <Button
            small
            variant={post.rsvpedByMe ? "primary" : "ghost"}
            icon={post.rsvpedByMe ? Check : undefined}
            title={post.rsvpedByMe ? masaCopy.rsvped : masaCopy.rsvp}
            disabled={!canInteract}
            onPress={() => {
              haptic("tap");
              void api.cafes.rsvp(slug, post.id).then(onChange);
            }}
          />
        )}
      </Row>
      {post.comments.map((c) => (
        <Body key={c.id}>
          <Body strong>{c.authorName}</Body> {c.body}
        </Body>
      ))}
      {canInteract && post.kind !== "post" && (
        <Row>
          <View style={{ flex: 1 }}>
            <Input
              placeholder={post.kind === "question" ? masaCopy.answerLabel : masaCopy.commentLabel}
              accessibilityLabel={post.kind === "question" ? masaCopy.answerLabel : masaCopy.commentLabel}
              value={comment}
              onChangeText={setComment}
              maxLength={500}
            />
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
