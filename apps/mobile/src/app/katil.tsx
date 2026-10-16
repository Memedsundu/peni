/**
 * `katil` sheet (design-system.md D11, §9.3 "Non-member +", §10.2): formSheet, fitToContents.
 * Opened with `?kafe=<slug>`, plus `&ekle=<productId>` from a non-member "+" ("Katıl ve ekle"),
 * or `&sonra=birak|al` from the askı buttons (join, then go on to that sheet).
 *
 * - Title "Kafeye katıl"; "Moda Kahvesi üyesi olunca sipariş verir, her harcamada peni
 *   biriktirirsin. Üyelik ücretsiz."; primary "Katıl ve ekle" (or "Kafeye katıl" / "Katıl ve
 *   devam et"); quiet "Vazgeç".
 * - Signed out, the primary is "Giriş yap ve katıl": it opens the sign-in modal over this
 *   sheet, and the sheet is still here when sign-in returns, now offering the join.
 * - Errors stay inline, above the button.
 */
import { actionCopy } from "@peni/brand/copy";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { orderingBlocked } from "@/components/cafe/aski-model";
import { loadCafe, messageOf, putCafe, useCafeEntry } from "@/components/cafe/cafe-store";
import { InlineError, SheetFrame } from "@/components/cafe/sheet";
import { Button, Skeleton, T } from "@/components/ui";
import { useCart } from "@/lib/cart";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";

const q = encodeURIComponent;

export default function KatilSheet() {
  const params = useLocalSearchParams<{ kafe?: string; ekle?: string; sonra?: string }>();
  const slug = params.kafe ?? "";
  const then = params.sonra === "birak" || params.sonra === "al" ? params.sonra : null;
  const { api, signedIn } = useSession();
  const { cafe } = useCafeEntry(slug);
  const cart = useCart(slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh read on open (the pool, eligibility, pause); what's in memory shows meanwhile.
  useEffect(() => {
    if (slug) void loadCafe(api, slug);
  }, [api, slug]);

  const item = params.ekle ? cafe?.menu.find((m) => m.productId === params.ekle) : undefined;
  const primary = !signedIn ? actionCopy.signInAndJoin : item ? actionCopy.joinAndAdd : then ? "Katıl ve devam et" : actionCopy.join;

  // Joined (here, or already a member when the sheet opened): go on, or close.
  const memberId = cafe?.membership?.id ?? null;
  useEffect(() => {
    if (memberId) finish();
  }, [memberId]);

  const done = useRef(false);
  function finish() {
    if (done.current) return;
    done.current = true;
    // "Katıl ve ekle": the item the "+" was for joins the cart.
    if (item?.available && cafe && !orderingBlocked(cafe)) {
      haptic("tap");
      cart.add(item.productId);
    }
    if (then) {
      router.replace(`/${then === "birak" ? "askiya-birak" : "askidan-al"}?kafe=${q(slug)}`);
      return;
    }
    if (router.canGoBack()) router.back();
  }

  const join = async () => {
    if (!signedIn) {
      router.push("/giris");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      putCafe(slug, await api.cafes.join(slug));
    } catch (e) {
      haptic("error");
      setError(messageOf(e));
      setBusy(false);
    }
  };

  return (
    <SheetFrame title="Kafeye katıl">
      {cafe ? (
        <T variant="body">{`${cafe.name} üyesi olunca sipariş verir, her harcamada peni biriktirirsin. Üyelik ücretsiz.`}</T>
      ) : (
        <View style={{ gap: 6 }}>
          <Skeleton width="92%" line="body" />
          <Skeleton width="70%" line="body" />
        </View>
      )}
      <View style={{ marginTop: 24, gap: 12 }}>
        <InlineError message={error} />
        {cafe ? (
          <Button size="lg" fullWidth title={primary} loading={busy} loadingLabel={actionCopy.join} onPress={() => void join()} />
        ) : (
          <Skeleton height={56} radius={10} />
        )}
        <Button variant="quiet" fullWidth title={actionCopy.cancel} onPress={() => router.back()} />
      </View>
    </SheetFrame>
  );
}
