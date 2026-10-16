/**
 * `sepet` sheet (design-system.md §9.3 "Cart", §10.2): formSheet, detents [0.6, 1]. Opened from
 * the café's cart bar with `?kafe=<slug>`. The cart is `useCart(slug)` (shared with the café
 * screen); the café comes from `components/cafe/cafe-store`.
 *
 * "Siparişi gönder · ₺55" → `orders.create`; on success the `confirm` haptic and
 * `router.replace("/siparis/{id}")`, with NO toast (D15): the fiş says "Kafeye iletildi".
 * On error the message shows inline above the button; the cart and the note are kept, and a
 * new idempotency key is drawn (§9.3). An askı refusal (G3) takes the ikram line out with its
 * unit (`removeIkram`) and keeps everything else, so a quick retry never orders a paid çay.
 */
import { PeniApiError } from "@peni/api";
import { cartCopy, errorCopy } from "@peni/brand/copy";
import { router, useLocalSearchParams } from "expo-router";
import { Coffee } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { orderingBlocked } from "@/components/cafe/aski-model";
import { loadCafe, messageOf, useCafeEntry } from "@/components/cafe/cafe-store";
import { CartBody, CartFooter, removeIkram } from "@/components/cafe/cart-content";
import { InlineError, SheetFrame, StateNote } from "@/components/cafe/sheet";
import { Skeleton } from "@/components/ui";
import { refreshActiveOrder } from "@/lib/active-order";
import { summarizeCart, useCart, type CartState } from "@/lib/cart";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";

/** Order errors whose fix is to drop the ikram line and keep everything else (§9.3, G3). */
const ASKI_ERRORS = new Set(["ASKIDA_EMPTY", "ASKIDA_LIMIT", "ASKIDA_TOO_NEW", "ASKIDA_DISABLED", "PRODUCT_NOT_ELIGIBLE"]);
/** Errors with no message worth showing: say the cart is safe instead. */
const GENERIC_ERRORS = new Set(["NETWORK", "INTERNAL", "VALIDATION"]);

/** What an order error was raised for: the lines, the ikram and the peni choice (not the note). */
const cartSig = (c: Pick<CartState, "lines" | "ikramProductId" | "usePeni">) => JSON.stringify([c.lines, c.ikramProductId, c.usePeni]);

export default function SepetSheet() {
  const { kafe } = useLocalSearchParams<{ kafe?: string }>();
  const slug = kafe ?? "";
  const { api } = useSession();
  const entry = useCafeEntry(slug);
  const cafe = entry.cafe;
  const cart = useCart(slug);
  const sum = useMemo(() => (cafe ? summarizeCart(cart, cafe) : null), [cafe, cart]);

  // Opened without the café in memory (a deep link): read it.
  // A fresh read on open (the pool, eligibility, pause); what's in memory shows meanwhile.
  useEffect(() => {
    if (slug) void loadCafe(api, slug);
  }, [api, slug]);

  const [busy, setBusy] = useState(false);
  // The error belongs to the cart it was raised for: once the cart changes, it no longer shows.
  // A refusal that changes the cart itself (the ikram goes) leaves `cart: null`, and the first
  // render after it pins the cart as it now is.
  const [failure, setFailure] = useState<{ message: string; cart: string | null } | null>(null);
  const sig = cartSig(cart);
  if (failure && failure.cart === null) setFailure({ ...failure, cart: sig });
  const error = failure && (failure.cart === null || failure.cart === sig) ? failure.message : null;

  // Sent: the cart empties once this sheet has gone, so it never flashes empty on its way out.
  const sent = useRef(false);
  const clear = useRef(cart.clear);
  clear.current = cart.clear;
  useEffect(
    () => () => {
      if (sent.current) clear.current();
    },
    [],
  );

  if (!cafe || !sum) {
    return (
      <SheetFrame title={cartCopy.title} mode="scroll">
        {entry.status === "error" || entry.status === "not_found" ? (
          <InlineError message={entry.error ?? errorCopy.generic} />
        ) : (
          <View accessibilityState={{ busy: true }} style={{ gap: 12 }}>
            <Skeleton width="70%" line="body" />
            <Skeleton width="55%" line="body" />
            <Skeleton height={48} radius={10} style={{ marginTop: 12 }} />
          </View>
        )}
      </SheetFrame>
    );
  }

  const blocked = orderingBlocked(cafe);

  const submit = async () => {
    if (busy || sum.count === 0) return;
    setBusy(true);
    setFailure(null);
    try {
      const order = await api.orders.create(cart.orderInput(sum.peniApplied));
      haptic("confirm");
      void refreshActiveOrder();
      // D15: no toast. The fiş says "Kafeye iletildi".
      sent.current = true;
      router.replace(`/siparis/${order.id}`);
      void loadCafe(api, slug);
    } catch (e) {
      setBusy(false);
      if (e instanceof PeniApiError && e.status === 401) {
        router.push("/giris");
        return;
      }
      haptic("error");
      const code = e instanceof PeniApiError ? e.code : "INTERNAL";
      const message = GENERIC_ERRORS.has(code) || code.startsWith("HTTP_") ? errorCopy.orderSend : messageOf(e);
      if (ASKI_ERRORS.has(code) && cart.ikramProductId) {
        // The ikram line goes with its unit (which draws a new key); the message stays with the
        // cart that is left.
        removeIkram(cart);
        setFailure({ message, cart: null });
      } else {
        // Same cart, new key (§9.3).
        cart.renewKey();
        setFailure({ message, cart: sig });
      }
      void loadCafe(api, slug);
    }
  };

  if (sum.count === 0) {
    // Empty — possibly because a refused ikram was the only item: then its reason leads.
    return (
      <SheetFrame title={cartCopy.title} mode="scroll">
        <InlineError message={error} style={{ marginBottom: 20 }} />
        <StateNote icon={Coffee} text={cartCopy.empty} />
      </SheetFrame>
    );
  }

  return (
    <SheetFrame
      title={cartCopy.title}
      mode="scroll"
      footer={<CartFooter sum={sum} blocked={blocked} busy={busy} error={error} onSubmit={() => void submit()} />}
    >
      <CartBody cafe={cafe} cart={cart} sum={sum} />
    </SheetFrame>
  );
}
