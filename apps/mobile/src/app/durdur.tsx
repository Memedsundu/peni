// `durdur` sheet (§9.10 PauseSheet, staff): placeholder until §16 step 6.
import { actionCopy, staffCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { Body, Button, SheetBody } from "@/components/legacy-ui";

export default function DurdurSheet() {
  return (
    <SheetBody title={staffCopy.pauseSheet.title}>
      <Body muted>{staffCopy.pauseSheet.question}</Body>
      <Button title={actionCopy.cancel} variant="ghost" onPress={() => router.back()} />
    </SheetBody>
  );
}
