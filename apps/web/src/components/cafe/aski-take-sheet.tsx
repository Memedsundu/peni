"use client";

import { askiCaption, askiCopy, actionCopy, cartCopy } from "@peni/brand/copy";
import { CalendarClock, Check, CirclePause, Info, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AskiRail, HookGlyph, askiRailProps } from "@/components/brand";
import { Button, Chip, Sheet, type IconProp } from "@/components/ui";
import { useCafe } from "./cafe-context";
import { AskiChoiceGroup, AskiIkramNote, AskiStateNote } from "./aski-bits";
import { askiChipIcons } from "./aski-glyphs";
import { signInUrlFor } from "./aski-intent";
import { askiItems, itemPeni, poolView, referenceItem, takeState, takeStateText, type TakeState } from "./aski-model";

/*
 * "Askıdan al" (design-system.md §9.3, A9, D7, §17).
 *
 * - Eligible: title "Askıdan bir ikram", the mini rail (md, 6 slots), "Hangisi?" chips for the
 *   café's askı items (the ones the pool can't cover are disabled: "Askıda yeterli peni yok"),
 *   the reassurance line and "Siparişime ekle". On confirm the rightmost item lifts off its hook
 *   (A9, only here, only for the taker), the sheet closes and the item joins the cart as the
 *   ikram line. The real claim happens when the order is sent.
 * - Every other state [G3] replaces the chips and the primary with one sentence.
 * - An ikram already in the cart is said first ("Siparişine 1 çay eklendi."), with its chip
 *   selected, so picking another reads as a swap.
 *
 * Dignity: the sheet asks no question, shows no counter and asks for no thanks. Nothing about
 * the taker is shown to anyone; nothing here is sent anywhere until the order is.
 */

export interface AskiTakeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATE_ICON: Record<Exclude<TakeState["kind"], "ok">, IconProp> = {
  non_member: Users,
  blocked: Info,
  claimed_today: Check,
  too_new: CalendarClock,
  empty: HookGlyph,
  ordering_blocked: CirclePause,
};

export function AskiTakeSheet({ open, onOpenChange }: AskiTakeSheetProps) {
  const { cafe, signedIn, member, orderingBlocked, ikramProductId, addIkram, requireJoin } = useCafe();
  const router = useRouter();
  const askida = cafe.askida;
  const items = askiItems(cafe);
  const reference = referenceItem(cafe);
  const covers = (item: (typeof items)[number]) => item.available && itemPeni(item) <= askida.balancePeni;
  const coverable = items.filter(covers);
  // The ones the pool can cover lead; the disabled ones sit last and quietest.
  const ordered = [...coverable, ...items.filter((i) => !covers(i))];
  const iconFor = askiChipIcons(items);
  const inCart = ikramProductId ? (items.find((i) => i.productId === ikramProductId) ?? null) : null;
  const state = takeState({ askida, member, orderingBlocked, coverable: coverable.length });

  /* ---------- the chosen item: what's already in the cart, else the reference, else the first that fits ---------- */
  const pickDefault = () =>
    coverable.find((i) => i.productId === ikramProductId)?.productId ??
    (reference && covers(reference) ? reference.productId : null) ??
    coverable[0]?.productId ??
    null;
  const [selected, setSelected] = useState<string | null>(pickDefault);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelected(pickDefault());
  }
  const chosen = coverable.find((i) => i.productId === selected) ?? null;

  /* ---------- A9: lift, then close, then hand the item to the cart ---------- */
  const [takeSignal, setTakeSignal] = useState(0);
  const [taking, setTaking] = useState(false);
  const pending = useRef<string | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deliver = () => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    const id = pending.current;
    pending.current = null;
    setTaking(false);
    if (id) addIkram(id);
  };
  useEffect(() => () => void (fallback.current && clearTimeout(fallback.current)), []);

  const confirm = () => {
    if (!chosen || taking) return;
    pending.current = chosen.productId;
    setTaking(true);
    setTakeSignal((n) => n + 1);
  };
  const onTakeComplete = () => {
    if (!pending.current) return;
    onOpenChange(false);
    // The cart takes the item once the sheet has gone (onOpenChangeComplete); never later than this.
    fallback.current = setTimeout(deliver, 700);
  };

  const pool = { ...askida, ...poolView(cafe) };
  const caption = askiCaption(pool);
  const rail = askiRailProps(pool);

  // Join after this sheet has gone, so the join sheet (or the sign-in page) never opens over it.
  const joinAfterClose = useRef(false);
  const join = () => {
    joinAfterClose.current = true;
    onOpenChange(false);
  };

  const footer =
    state.kind === "ok" ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* While the cup lifts (200ms) both stay as they are; the handlers ignore a second tap. */}
        <Button variant="quiet" onClick={() => !taking && onOpenChange(false)} className="sm:mr-auto">
          {askiCopy.takeSheet.cancel}
        </Button>
        <Button variant="aski" onClick={confirm} disabled={!chosen} className="w-full sm:w-auto sm:min-w-[200px]">
          {askiCopy.takeSheet.confirm}
        </Button>
      </div>
    ) : state.kind === "non_member" ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="quiet" onClick={() => onOpenChange(false)} className="sm:mr-auto">
          {actionCopy.cancel}
        </Button>
        <Button variant="primary" onClick={join} className="w-full sm:w-auto sm:min-w-[200px]">
          {signedIn ? askiCopy.takeStates.nonMemberAction : actionCopy.signInAndJoin}
        </Button>
      </div>
    ) : (
      <Button variant="secondary" fullWidth onClick={() => onOpenChange(false)}>
        {actionCopy.ok}
      </Button>
    );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (taking && next) return;
        onOpenChange(next);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        if (pending.current) deliver();
        if (joinAfterClose.current) {
          joinAfterClose.current = false;
          // Signed out: sign in and come back to this sheet (`?aski=al`); otherwise join, then back here.
          if (!signedIn) router.push(signInUrlFor("al"));
          else requireJoin(() => onOpenChange(true));
        }
      }}
      title={askiCopy.takeSheet.title}
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        {/* The mini rail: what's waiting, drawn as whole items (D9). Its caption is the text for it. */}
        <div className="flex flex-col items-center gap-2 rounded-[14px] bg-aski-soft px-4 pt-4 pb-3">
          <AskiRail
            count={rail.count}
            item={rail.item}
            size="md"
            maxSlots={6}
            takeSignal={takeSignal}
            onTakeComplete={onTakeComplete}
            className="flex justify-center"
          />
          <p className="text-center text-meta text-aski-ink">{caption.line1}</p>
        </div>

        {state.kind === "ok" ? (
          <>
            {inCart && <AskiIkramNote name={inCart.name} short className="-mb-1" />}
            <div className="flex flex-col gap-2.5">
              <p className="text-button text-ink" aria-hidden>
                {askiCopy.takeSheet.which}
              </p>
              <AskiChoiceGroup label={askiCopy.takeSheet.which}>
                {ordered.map((item) => (
                  <Chip
                    key={item.productId}
                    kind="choice"
                    icon={iconFor(item)}
                    className="w-full"
                    selected={item.productId === selected}
                    disabledReason={!item.available ? cartCopy.soldOut : covers(item) ? undefined : askiCopy.takeSheet.notEnough}
                    onClick={() => !taking && setSelected(item.productId)}
                  >
                    {item.name}
                  </Chip>
                ))}
              </AskiChoiceGroup>
            </div>
            <p className="text-body text-ink-2">{askiCopy.takeSheet.body}</p>
          </>
        ) : (
          <AskiStateNote icon={STATE_ICON[state.kind]} text={takeStateText(state, caption.line1)} />
        )}
      </div>
    </Sheet>
  );
}
