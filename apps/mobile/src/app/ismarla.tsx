// `ismarla` sheet (§9.6 GiftSheet, §10.5): placeholder until §16 step 6. Opened with ?kafe=<slug>.
import { actionCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { Body, Button, SheetBody } from "@/components/legacy-ui";

export default function IsmarlaSheet() {
  return (
    <SheetBody title="Hangi kafede?">
      <Body muted>Kabul edilmezse peni 24 saat içinde sana döner.</Body>
      <Button title={actionCopy.cancel} variant="ghost" onPress={() => router.back()} />
    </SheetBody>
  );
}
