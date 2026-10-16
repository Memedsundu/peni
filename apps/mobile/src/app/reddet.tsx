// `reddet` sheet (§9.10 RejectSheet, staff): placeholder until §16 step 6. Opened with ?id=<orderId>.
import { actionCopy, staffCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { Body, Button, SheetBody } from "@/components/legacy-ui";

export default function ReddetSheet() {
  return (
    <SheetBody title={staffCopy.rejectSheet.title}>
      {staffCopy.rejectSheet.reasons.map((r) => (
        <Body key={r} muted>
          {r}
        </Body>
      ))}
      <Button title={actionCopy.cancel} variant="ghost" onPress={() => router.back()} />
    </SheetBody>
  );
}
