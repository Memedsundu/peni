"use client";

import { cartCopy, orderCopy } from "@peni/brand/copy";
import { formatTL } from "@peni/brand/format";
import { CircleAlert, X } from "lucide-react";
import { Coin, type CoinCafe } from "@/components/brand";
import { Button, Chip, cx, Field, NumberRoll, Stepper, Switch, Textarea, focusRing, tappable } from "@/components/ui";
import { MAX_PER_LINE, type CafeCart, type CartTotals } from "./cart";
import { BlockedBanner } from "./menu-section";

/**
 * The cart's body (design-system.md §9.3 "Cart content" 1–5), shared by the phone sheet and
 * the desktop fiş: lines, the ikram line, the peni toggle, the note and the earn preview.
 * `editable` puts a 44px stepper on every line (the sheet); the desktop slip leaves editing to
 * the menu beside it.
 */
export function CartBody({
  cafe,
  cart,
  totals,
  editable,
}: {
  cafe: CoinCafe;
  cart: CafeCart;
  totals: CartTotals;
  editable: boolean;
}) {
  const { state } = cart;
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col" aria-label={cartCopy.title}>
        {totals.lines.map((line) => (
          <li key={line.item.productId} className={cx("flex items-center gap-3", editable ? "min-h-14 py-1.5" : "py-1.5")}>
            <span className="min-w-0 flex-1 text-body text-ink">{cartCopy.line(line.qty, line.item.name)}</span>
            <span className="shrink-0 text-body font-semibold tabular-nums text-ink">
              <NumberRoll value={line.totalKurus} kind="tl" />
            </span>
            {editable && (
              <span className="flex w-[116px] shrink-0 justify-end">
                <Stepper
                  itemName={line.item.name}
                  value={line.qty}
                  max={MAX_PER_LINE}
                  collapsible={false}
                  onChange={(q) => cart.setLineQty(line.item.productId, q)}
                />
              </span>
            )}
          </li>
        ))}
        {totals.soldOut.map((item) => (
          <li key={item.productId} className={cx("flex items-center gap-3", editable ? "min-h-14 py-1.5" : "py-1.5")}>
            <span className="min-w-0 flex-1 text-body text-ink-2">{item.name}</span>
            <Chip kind="tag">{cartCopy.soldOut}</Chip>
            {editable && (
              <span className="flex w-[116px] shrink-0 justify-end">
                <RemoveButton label={cartCopy.remove(item.name)} onClick={() => cart.setQty(item.productId, 0)} />
              </span>
            )}
          </li>
        ))}
      </ul>

      {totals.ikramItem && (
        // Styled exactly like the peni line, with no colour (§17 Askı dignity).
        <div className={cx("flex items-center gap-3 text-ink-2", editable ? "min-h-14 py-1.5" : "py-1.5")}>
          <span className="flex min-w-0 flex-1 items-center gap-1 text-body">
            <span>
              {`${orderCopy.askiLine}\u00A0· `}
              <span className="text-ink">{totals.ikramItem.name}</span>
            </span>
            {!editable && <RemoveButton label="İkramı çıkar" onClick={() => cart.setIkram(null)} compact />}
          </span>
          <span className="shrink-0 text-body font-semibold tabular-nums">{formatTL(-totals.askidaKurus)}</span>
          {editable && (
            <span className="flex w-[116px] shrink-0 justify-end">
              <RemoveButton label="İkramı çıkar" onClick={() => cart.setIkram(null)} />
            </span>
          )}
        </div>
      )}

      {totals.usable > 0 && (
        <div className="mt-2 border-t border-line pt-1">
          <Switch
            tone="peni"
            checked={state.usePeni}
            onCheckedChange={cart.setUsePeni}
            label={cartCopy.usePeni(totals.usable)}
            value={formatTL(-totals.usable * 100)}
            hint={totals.capped ? cartCopy.usePeniCap(totals.usable) : undefined}
          />
        </div>
      )}

      <Field
        label={cartCopy.noteLabel}
        className={cx(totals.usable > 0 ? "mt-3" : "mt-4 border-t border-line pt-4")}
        counter={state.note.length >= 150 ? { length: state.note.length, max: 200 } : undefined}
      >
        <Textarea
          rows={2}
          maxLength={200}
          placeholder={cartCopy.notePlaceholder}
          value={state.note}
          onChange={(e) => cart.setNote(e.target.value)}
        />
      </Field>

      {totals.earn > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-[10px] bg-peni-soft px-3 py-2.5 text-ink" aria-live="polite">
          <Coin size={16} cafe={cafe} className="mt-[3px]" />
          <div className="min-w-0">
            <p className="text-body">
              {cartCopy.earnPreview(totals.earn).before}
              <strong className="font-semibold whitespace-nowrap text-peni-ink">
                <NumberRoll value={totals.earn} kind="peni" signed /> peni
              </strong>
              {cartCopy.earnPreview(totals.earn).after}
            </p>
            {state.usePeni && totals.appliedPeni > 0 && <p className="text-meta text-ink-2">{cartCopy.earnPreviewNote}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Cart content 6–8: the total, the inline error, and the submit button — or, while ordering is
 * blocked, the menu's banner in its place.
 */
export function CartFooter({
  totals,
  blocked,
  busy,
  error,
  onSubmit,
}: {
  totals: CartTotals;
  blocked: null | "closed" | "preorder_off";
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const due = totals.dueKurus;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-body text-ink">{due > 0 ? cartCopy.dueLabel : cartCopy.noPayment}</span>
        {due > 0 && (
          <span className="font-sans text-h3 tabular-nums text-ink">
            <NumberRoll value={due} kind="tl" />
          </span>
        )}
      </div>
      {blocked ? (
        <BlockedBanner reason={blocked} />
      ) : (
        <>
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-meta text-danger">
              <CircleAlert aria-hidden size={16} strokeWidth={1.75} absoluteStrokeWidth className="mt-px size-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <Button fullWidth loading={busy} onClick={onSubmit} disabled={totals.count === 0}>
            {cartCopy.submit(due)}
          </Button>
        </>
      )}
    </div>
  );
}

function RemoveButton({ label, onClick, compact = false }: { label: string; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-2",
        tappable,
        focusRing,
        // Compact: a 20px glyph inside a 44px hit area that hangs into the line's padding.
        compact ? "-my-3 size-11" : "size-11 border-[1.5px] border-line-strong bg-surface text-ink",
      )}
    >
      <X aria-hidden size={compact ? 16 : 20} strokeWidth={1.75} className={compact ? "size-4" : "size-5"} />
    </button>
  );
}
