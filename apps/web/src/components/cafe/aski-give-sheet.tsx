"use client";

import { newIdempotencyKey } from "@peni/api";
import { askiCopy, errorCopy, peniCopy } from "@peni/brand/copy";
import { CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Coin } from "@/components/brand";
import { Button, Chip, ChipGroup, Sheet, Stepper, Switch } from "@/components/ui";
import { peni } from "@/lib/client";
import { useCafe } from "./cafe-context";
import { askiItemIcon } from "./aski-glyphs";
import { askiItems, itemPeni, referenceItem, type Donation } from "./aski-model";

/*
 * "Askıya bırak" (design-system.md §9.3, A8, G12).
 *
 * "Ne bırakıyorsun?": one chip per askı item ("1 çay · 30 peni"), disabled with "Bakiyen 25" when
 * the balance can't cover it, and "Başka", which reveals a peni stepper (step 5, min 1, max the
 * balance). "Adım askıda görünsün" is off by default. With a café match [G12] a meta line says
 * so. The primary is ink: "1 çay bırak · 30 peni" / "45 peni bırak".
 *
 * On success the sheet closes and, once it has gone, `onDonated` runs: the panel hangs the new
 * cup on this screen only (A8) and shows the toast. Errors stay inline, above the button; the
 * choice is kept, and a retry of the same choice re-uses its idempotency key.
 */

export interface AskiGiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a successful donation, once the sheet has closed. */
  onDonated: (donation: Donation) => void;
}

const OTHER = "other";
const STEP = 5;

export function AskiGiveSheet({ open, onOpenChange, onDonated }: AskiGiveSheetProps) {
  const { cafe } = useCafe();
  const balance = Math.max(0, Math.floor(cafe.membership?.balancePeni ?? 0));
  const items = askiItems(cafe);
  const reference = referenceItem(cafe);
  const affordable = (item: (typeof items)[number]) => itemPeni(item) <= balance;

  /* ---------- the choice; reset each time the sheet opens ---------- */
  const pickDefault = (): string | null => {
    if (reference && affordable(reference)) return reference.productId;
    return items.find(affordable)?.productId ?? (balance >= 1 ? OTHER : null);
  };
  const [choice, setChoice] = useState<string | null>(pickDefault);
  const [custom, setCustom] = useState(() => defaultCustom(balance));
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChoice(pickDefault());
      setCustom(defaultCustom(balance));
      setShowName(false);
      setError(null);
    }
  }

  const item = choice && choice !== OTHER ? (items.find((i) => i.productId === choice && affordable(i)) ?? null) : null;
  const isOther = choice === OTHER && balance >= 1;
  const customPeni = Math.min(balance, Math.max(1, custom));
  const amount = item ? itemPeni(item) : isOther ? customPeni : 0;

  /* ---------- custom amount: steps of 5 from 1 (1 → 5 → 10 …), never past the balance ---------- */
  const stepCustom = (next: number) => {
    const up = next > customPeni;
    setCustom(up ? Math.min(balance, Math.floor(customPeni / STEP) * STEP + STEP) : Math.max(1, Math.ceil(customPeni / STEP) * STEP - STEP));
    setError(null);
  };

  /* ---------- send: one idempotency key per (amount, name) attempt ---------- */
  const key = useRef<{ sig: string; key: string } | null>(null);
  const pending = useRef<Donation | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const flush = () => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    const d = pending.current;
    pending.current = null;
    if (d) onDonated(d);
  };
  useEffect(() => () => void (fallback.current && clearTimeout(fallback.current)), []);

  const submit = async () => {
    if (busy || amount < 1) return;
    const sig = `${amount}:${showName}`;
    if (!key.current || key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    setError(null);
    try {
      const r = await peni.askida.donate({ cafeSlug: cafe.slug, peni: amount, showName, idempotencyKey: key.current.key });
      key.current = null;
      pending.current = { peni: amount, matchedPeni: Math.max(0, r.matchedPeni), item };
      if (openRef.current) {
        onOpenChange(false);
        // A8 waits for the sheet to leave (onOpenChangeComplete); never longer than this.
        fallback.current = setTimeout(flush, 700);
      } else {
        flush();
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : errorCopy.generic);
    } finally {
      setBusy(false);
    }
  };

  const label = item
    ? askiCopy.giveSheet.submitItem(item.name, itemPeni(item))
    : isOther
      ? askiCopy.giveSheet.submitCustom(customPeni)
      : askiCopy.give;
  const bal = peniCopy.balance(balance);

  const footer = (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="flex items-start gap-2 text-body text-danger">
          <CircleAlert aria-hidden size={20} strokeWidth={1.75} className="mt-px size-5 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
        </p>
      )}
      <Button
        variant="primary"
        fullWidth
        loading={busy}
        disabled={amount < 1}
        disabledReason={amount < 1 ? noBalanceReason : undefined}
        onClick={submit}
      >
        {label}
      </Button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen && pending.current) flush();
      }}
      title={askiCopy.giveSheet.title}
      description={
        <span className="inline-flex items-center gap-1.5">
          <Coin size={16} cafe={cafe} />
          <span>
            {bal.before}
            <span className="font-semibold text-peni-ink tabular-nums">{bal.amount}</span>
          </span>
        </span>
      }
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <p className="text-button text-ink" aria-hidden>
            {askiCopy.giveSheet.what}
          </p>
          <ChipGroup label={askiCopy.giveSheet.what}>
            {items.map((it) => (
              <Chip
                key={it.productId}
                kind="choice"
                icon={askiItemIcon(it)}
                className="grow"
                selected={choice === it.productId}
                disabledReason={affordable(it) ? undefined : askiCopy.giveSheet.balance(balance)}
                onClick={() => {
                  setChoice(it.productId);
                  setError(null);
                }}
              >
                <span className="tabular-nums">{askiCopy.giveSheet.chip(it.name, itemPeni(it))}</span>
              </Chip>
            ))}
            <Chip
              kind="choice"
              className="grow"
              selected={isOther}
              disabledReason={balance >= 1 ? undefined : askiCopy.giveSheet.balance(balance)}
              onClick={() => {
                setChoice(OTHER);
                setError(null);
              }}
            >
              {askiCopy.giveSheet.other}
            </Chip>
          </ChipGroup>
        </div>

        {isOther && (
          <div className="flex min-h-14 items-center justify-between gap-4 rounded-[10px] bg-surface-2 py-1.5 pr-1.5 pl-4">
            <span className="text-body text-ink" aria-hidden>
              {askiCopy.giveSheet.stepperLabel}
            </span>
            <Stepper
              value={customPeni}
              onChange={stepCustom}
              min={1}
              max={balance}
              step={STEP}
              itemName={askiCopy.giveSheet.stepperLabel}
              maxReason={askiCopy.giveSheet.balance(balance)}
            />
          </div>
        )}

        {cafe.askida.matchPercent != null && cafe.askida.matchPercent > 0 && (
          <p className="text-meta text-ink-2">{askiCopy.giveSheet.match(cafe.askida.matchPercent)}</p>
        )}

        <div className="border-t border-line">
          <Switch
            checked={showName}
            onCheckedChange={(v) => {
              setShowName(v);
              setError(null);
            }}
            label={askiCopy.giveSheet.nameSwitch}
            hint={askiCopy.giveSheet.nameHint}
          />
        </div>
      </div>
    </Sheet>
  );
}

/** With nothing to leave: why the button rests. */
const noBalanceReason = "Penin biriktikçe sen de askıya bırakabilirsin.";

function defaultCustom(balance: number): number {
  return Math.max(1, Math.min(balance, 2 * STEP));
}
