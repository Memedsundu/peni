/**
 * `reddet` sheet (design-system.md §9.10 reject sheet, §10.10; formSheet, "fitToContents"),
 * opened from a ticket's "Yetişemiyoruz" with `?id=<orderId>`. It replaces `window.prompt`.
 *
 * - "Müşteriye ne diyelim?", the ticket ("P-004 · Zeynep") and its lines, three choice chips
 *   ("Malzeme bitti", "Şu an çok yoğunuz", "Kapanmak üzereyiz") and the primary "Siparişi geri
 *   çevir", disabled until an answer is chosen (with its reason). The customer reads the chosen
 *   sentence under "Kafe şu an yetişemiyor." — never "Reddedildi".
 * - The sheet is the confirmation: the request goes out at once (a bump still waiting on this
 *   ticket is dropped first). A failure stays in the sheet with the answer kept.
 * - If the ticket left the board meanwhile (closed elsewhere), the sheet says so and offers
 *   only "Tamam".
 */
import { actionCopy, cartCopy, errorCopy, staffCopy } from "@peni/brand/copy";
import { SEP } from "@peni/brand/format";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { InlineError, SheetFrame } from "@/components/cafe/sheet";
import { findOrder, firstName, messageOf, rejectOrder, ticketCode, useBoard } from "@/components/staff";
import { Banner, Button, Chip, ChipGroup, T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";

const PICK_FIRST = "Önce bir cevap seç.";
const REJECTING = "Geri çevriliyor…";
const GONE = "Bu sipariş artık tezgâhta değil.";

export default function ReddetSheet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { api } = useSession();
  const { slug } = useBoard(); // re-renders with the board, so `order` stays current
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Frozen while the request is out and the sheet closes: the turned-down order must not flip
  // the sheet into its "gone" state on the way out.
  const kept = useRef(findOrder(id));
  if (!busy) kept.current = findOrder(id);
  const order = kept.current;
  const [error, setError] = useState<string | null>(null);
  const c = staffCopy.rejectSheet;

  const open = order != null && (order.status === "submitted" || order.status === "accepted");

  const confirm = async () => {
    if (!order || !slug || !reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await rejectOrder(api, slug, order, reason);
      haptic("confirm");
      router.back();
    } catch (e) {
      haptic("error");
      setError(errorCopy.save(messageOf(e)));
      setBusy(false);
    }
  };

  const who = order ? `${ticketCode(order)}${SEP}${firstName(order.customerName)}` : null;
  const lines = order ? order.lines.map((l) => cartCopy.line(l.quantity, l.name)).join(", ") : null;

  return (
    <>
      {/* No swipe-to-dismiss while the request is in flight. */}
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <SheetFrame
        title={c.title}
        closeDisabled={busy}
        description={
          who ? (
            <View style={styles.who}>
              <T variant="strong" tabular>
                {who}
              </T>
              <T variant="body" color="ink2">
                {lines}
              </T>
            </View>
          ) : undefined
        }
        footer={
          open ? (
            <View style={styles.footer}>
              <InlineError message={error} />
              <Button
                title={c.confirm}
                size="lg"
                fullWidth
                loading={busy}
                loadingLabel={REJECTING}
                disabled={!reason}
                disabledReason={!reason ? PICK_FIRST : undefined}
                onPress={() => void confirm()}
              />
            </View>
          ) : (
            <Button title={actionCopy.ok} size="lg" fullWidth onPress={() => router.back()} />
          )
        }
      >
        {open ? (
          <ChipGroup label={c.title}>
            {c.reasons.map((r) => (
              <Chip
                key={r}
                kind="choice"
                selected={reason === r}
                onPress={() => {
                  if (busy) return;
                  setReason(r);
                  setError(null);
                }}
              >
                {r}
              </Chip>
            ))}
          </ChipGroup>
        ) : (
          <Banner tone="info" title={GONE} />
        )}
      </SheetFrame>
    </>
  );
}

const styles = StyleSheet.create({
  who: { gap: 2 },
  footer: { gap: 12 },
});
