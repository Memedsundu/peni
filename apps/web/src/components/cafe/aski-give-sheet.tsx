"use client";

import { newIdempotencyKey } from "@peni/api";
import { actionCopy, askiCopy, peniCopy } from "@peni/brand/copy";
import { CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Coin, CoinGlyph } from "@/components/brand";
import { Button, Chip, Sheet, Stepper, Switch } from "@/components/ui";
import { peni } from "@/lib/client";
import { useCafe } from "./cafe-context";
import { AskiChoiceGroup, AskiStateNote } from "./aski-bits";
import { askiChipIcons } from "./aski-glyphs";
import { askiItems, donateErrorText, itemPeni, referenceItem, type Donation } from "./aski-model";

/*
 * "Askıya bırak" (design-system.md §9.3, A8, G12).
 *
 * "Ne bırakıyorsun?": one chip per askı item ("1 çay · 30 peni") and "Başka", which reveals a
 * peni stepper (step 5, min 1, max the balance). The items the balance covers lead, then
 * "Başka", then the ones it doesn't, disabled with "Bakiyen 25". "Adım askıda görünsün" is off
 * by default. With a café match [G12] a meta line says so. The primary is ink:
 * "1 çay bırak · 30 peni" / "45 peni bırak".
 *
 * With 0 peni there is nothing to choose: one calm sentence replaces the chips, the match line
 * and the switch, and the footer is a plain "Tamam".
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
  const empty = balance < 1;
  // All the chips carry a glyph or none do; "Başka" (an amount of peni) then takes the coin.
  const iconFor = askiChipIcons(items);
  const withIcons = items.length > 0 && items.every((it) => iconFor(it) != null);

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
      setError(donateErrorText(e));
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

  const footer = empty ? (
    <Button variant="secondary" fullWidth onClick={() => onOpenChange(false)}>
      {actionCopy.ok}
    </Button>
  ) : (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="flex items-start gap-2 text-body text-danger">
          <CircleAlert aria-hidden size={20} strokeWidth={1.75} className="mt-px size-5 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
        </p>
      )}
      <Button variant="primary" fullWidth loading={busy} disabled={amount < 1} onClick={submit}>
        {label}
      </Button>
    </div>
  );

  const chip = (it: (typeof items)[number]) => (
    <Chip
      key={it.productId}
      kind="choice"
      icon={iconFor(it)}
      className="w-full"
      selected={choice === it.productId}
      disabledReason={affordable(it) ? undefined : askiCopy.giveSheet.balance(balance)}
      onClick={() => {
        setChoice(it.productId);
        setError(null);
      }}
    >
      <span className="tabular-nums">{askiCopy.giveSheet.chip(it.name, itemPeni(it))}</span>
    </Chip>
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
      {empty ? (
        <AskiStateNote icon={CoinGlyph} text={noBalanceText} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <p className="text-button text-ink" aria-hidden>
              {askiCopy.giveSheet.what}
            </p>
            <AskiChoiceGroup label={askiCopy.giveSheet.what} wide>
              {items.filter(affordable).map(chip)}
              <Chip
                kind="choice"
                icon={withIcons ? CoinGlyph : undefined}
                className="w-full"
                selected={isOther}
                onClick={() => {
                  setChoice(OTHER);
                  setError(null);
                }}
              >
                {askiCopy.giveSheet.other}
              </Chip>
              {/*
                "Başka" opens its stepper right under itself, before the items the balance can't
                cover, on no fill of its own: it must never read as one more (disabled) tile.
              */}
              {isOther && (
                <div className="col-span-full flex min-h-14 items-center justify-between gap-4 pl-3.5">
                  <span className="text-button text-ink" aria-hidden>
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
              {items.filter((it) => !affordable(it)).map(chip)}
            </AskiChoiceGroup>
          </div>

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
      )}
    </Sheet>
  );
}

/** With nothing to leave: the one sentence the sheet says. */
const noBalanceText = "Penin biriktikçe sen de askıya bırakabilirsin.";

function defaultCustom(balance: number): number {
  return Math.max(1, Math.min(balance, 2 * STEP));
}
