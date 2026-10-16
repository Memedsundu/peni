/**
 * The cart, inside the `sepet` sheet (design-system.md §9.3 "Cart content", §10.2), in order:
 *
 * 1. Lines: "1 × Latte", `₺120`, and a 44pt stepper per line.
 * 2. The ikram line, if one was taken: "İkram · Çay" and "−₺30", styled exactly like the peni
 *    line, with no colour (§17). A quiet "İkramı çıkar" takes it out without touching the paid
 *    units of the same product (the stepper can't tell them apart).
 * 3. The peni toggle (only with `usablePeni > 0`): an RN `Switch` row, copper when on, showing
 *    the capped amount (D13), with the cap hint when it is below the balance.
 * 4. "Not (isteğe bağlı)", 2 rows, max 200.
 * 5. The earn preview, a flat `peniSoft` panel: "Kasada ödeyince **+2 peni** kazanırsın"
 *    (D12, recalculated live). Hidden at 0.
 * 6–8 live in `CartFooter`: the total, the inline error, "Siparişi gönder · ₺55" — or, while
 *    ordering is blocked, the menu's banner in its place.
 */
import type { CafeDetailDTO } from "@peni/api";
import { cartCopy, orderCopy } from "@peni/brand/copy";
import { formatTL, MINUS } from "@peni/brand/format";
import { X } from "lucide-react-native";
import { View } from "react-native";
import { Coin } from "@/components/brand";
import { Button, Field, IconButton, NumberRoll, Stepper, SwitchRow, T } from "@/components/ui";
import { MAX_NOTE, MAX_QTY, type Cart, type CartSummary } from "@/lib/cart";
import { fonts, radius, useTokens } from "@/lib/theme";
import type { OrderingBlocked } from "./aski-model";
import { BlockedBanner } from "./menu-section";
import { InlineError } from "./sheet";

const LINE_MIN = 56;

export function CartBody({ cafe, cart, sum }: { cafe: CafeDetailDTO; cart: Cart; sum: CartSummary }) {
  const t = useTokens();
  const ikram = sum.items.find((i) => i.ikram) ?? null;
  const balance = cafe.membership?.balancePeni ?? 0;
  const capped = sum.usablePeni > 0 && sum.usablePeni < balance;

  return (
    <View>
      <View accessibilityLabel={cartCopy.title}>
        {sum.items.map((line) => (
          <View key={line.productId} style={{ minHeight: LINE_MIN, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
            <T variant="body" style={{ flex: 1, minWidth: 0 }}>
              {cartCopy.line(line.quantity, line.item.name)}
            </T>
            <NumberRoll kind="tl" value={line.lineKurus} variant="strong" />
            <Stepper
              itemName={line.item.name}
              value={line.quantity}
              max={MAX_QTY}
              collapsible={false}
              onChange={(q) => cart.setQuantity(line.productId, q)}
            />
          </View>
        ))}
      </View>

      {ikram ? (
        <View style={{ minHeight: LINE_MIN, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
          <T variant="body" color="ink2" style={{ flex: 1, minWidth: 0 }}>
            {`${orderCopy.askiLine} · `}
            <T color="ink">{ikram.item.name}</T>
          </T>
          <T variant="strong" color="ink2" tabular>
            {`${MINUS}${formatTL(sum.askidaKurus)}`}
          </T>
          <View style={{ width: 116, alignItems: "flex-end" }}>
            <IconButton variant="secondary" icon={X} label="İkramı çıkar" onPress={() => cart.setIkram(null)} />
          </View>
        </View>
      ) : null}

      {sum.usablePeni > 0 ? (
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 4 }}>
          <SwitchRow
            tone="peni"
            checked={cart.usePeni}
            onCheckedChange={cart.setUsePeni}
            label={cartCopy.usePeni(sum.usablePeni)}
            value={`${MINUS}${formatTL(sum.usablePeni * 100)}`}
            hint={capped ? cartCopy.usePeniCap(sum.usablePeni) : undefined}
          />
        </View>
      ) : null}

      <Field
        label={cartCopy.noteLabel}
        value={cart.note}
        onChangeText={cart.setNote}
        placeholder={cartCopy.notePlaceholder}
        rows={2}
        maxLength={MAX_NOTE}
        counter={cart.note.length >= 150}
        containerStyle={
          sum.usablePeni > 0 ? { marginTop: 12 } : { marginTop: 16, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 16 }
        }
      />

      {sum.earnPeni > 0 ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            marginTop: 16,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            borderRadius: radius.control,
            backgroundColor: t.peniSoft,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <View style={{ paddingTop: 3 }}>
            <Coin size={16} cafe={cafe} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline" }}>
              <T variant="body">{cartCopy.earnPreview(sum.earnPeni).before}</T>
              <NumberRoll kind="peni" signed value={sum.earnPeni} variant="strong" color="peniInk" />
              <T variant="strong" color="peniInk">
                {" peni"}
              </T>
              <T variant="body">{cartCopy.earnPreview(sum.earnPeni).after}</T>
            </View>
            {cart.usePeni && sum.peniApplied > 0 ? (
              <T variant="meta" color="ink2">
                {cartCopy.earnPreviewNote}
              </T>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Cart content 6–8: the total, the inline error, and the button — or the blocked banner. */
export function CartFooter({
  sum,
  blocked,
  busy,
  error,
  onSubmit,
}: {
  sum: CartSummary;
  blocked: OrderingBlocked;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const t = useTokens();
  const due = sum.dueKurus;
  return (
    <View style={{ gap: 16, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <T variant="body">{due > 0 ? cartCopy.dueLabel : cartCopy.noPayment}</T>
        {due > 0 ? <NumberRoll kind="tl" value={due} variant="item" textStyle={TOTAL} /> : null}
      </View>
      {blocked ? (
        <BlockedBanner reason={blocked} />
      ) : (
        <>
          <InlineError message={error} />
          <Button
            size="lg"
            fullWidth
            title={cartCopy.submit(due)}
            loading={busy}
            loadingLabel={cartCopy.sending}
            disabled={sum.count === 0}
            onPress={onSubmit}
          />
        </>
      )}
    </View>
  );
}

/** h3 size, but Archivo, never Brygada (§9.3 item 6). */
const TOTAL = { fontFamily: fonts.sansSemiBold, fontSize: 22, lineHeight: 26, letterSpacing: -0.2 } as const;
