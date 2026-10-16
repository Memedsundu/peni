// `askiya-birak` sheet (§9.3 AskiGiveSheet): placeholder until §16 step 6.
import { actionCopy, askiCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { Body, Button, SheetBody } from "@/components/legacy-ui";

export default function AskiyaBirakSheet() {
  return (
    <SheetBody title={askiCopy.giveSheet.title}>
      <Body muted>{askiCopy.giveSheet.what}</Body>
      <Button title={actionCopy.cancel} variant="ghost" onPress={() => router.back()} />
    </SheetBody>
  );
}
