// `askidan-al` sheet (§9.3 AskiTakeSheet): placeholder until §16 step 6.
import { askiCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { Body, Button, SheetBody } from "@/components/legacy-ui";

export default function AskidanAlSheet() {
  return (
    <SheetBody title={askiCopy.takeSheet.title}>
      <Body muted>{askiCopy.takeSheet.body}</Body>
      <Button title={askiCopy.takeSheet.cancel} variant="ghost" onPress={() => router.back()} />
    </SheetBody>
  );
}
