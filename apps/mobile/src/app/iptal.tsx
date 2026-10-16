// `iptal` sheet (D16, §10.3): the cancel confirm. Opened with ?id=<orderId>, only while `submitted`.
import { orderCopy } from "@peni/brand/copy";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Body, Button, ErrorText, SheetBody } from "@/components/legacy-ui";
import { refreshActiveOrder } from "@/lib/active-order";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";

export default function IptalSheet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = orderCopy.cancelSheet;

  return (
    <SheetBody title={c.title}>
      <Body muted>{c.body}</Body>
      <ErrorText>{error}</ErrorText>
      <Button
        title={c.confirm}
        disabled={!id || busy}
        onPress={async () => {
          if (!id) return;
          setBusy(true);
          setError(null);
          try {
            await api.orders.cancel(id);
            haptic("confirm");
            void refreshActiveOrder();
            router.back();
          } catch (e) {
            haptic("error");
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button title={c.keep} variant="ghost" onPress={() => router.back()} />
    </SheetBody>
  );
}
