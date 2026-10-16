// `sepet` sheet (§8.4, §10.2): placeholder until CartPanel lands in §16 step 6. Opened with ?kafe=<slug>.
import { actionCopy, cartCopy } from "@peni/brand/copy";
import { router, useLocalSearchParams } from "expo-router";
import { Body, Button, SheetBody } from "@/components/legacy-ui";
import { useCart } from "@/lib/cart";

export default function SepetSheet() {
  const { kafe } = useLocalSearchParams<{ kafe?: string }>();
  const cart = useCart(kafe ?? "");
  return (
    <SheetBody title={cartCopy.title}>
      <Body muted>{cart.isEmpty ? cartCopy.empty : cartCopy.itemCount(cart.count)}</Body>
      <Button title={actionCopy.close} variant="ghost" onPress={() => router.back()} />
    </SheetBody>
  );
}
