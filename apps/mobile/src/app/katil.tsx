// `katil` sheet (D11, §9.3 join sheet): placeholder until §16 step 6. Opened with ?kafe=<slug>&ekle=<productId>.
import { actionCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { Body, Button, SheetBody } from "@/components/legacy-ui";

export default function KatilSheet() {
  return (
    <SheetBody title="Kafeye katıl">
      <Body muted>Üye olunca sipariş verir, her harcamada peni biriktirirsin. Üyelik ücretsiz.</Body>
      <Button title={actionCopy.cancel} variant="ghost" onPress={() => router.back()} />
    </SheetBody>
  );
}
