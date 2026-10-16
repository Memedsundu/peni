"use client";

import { PeniApiError, type GiftDTO, type RefItemDTO } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { dativeName, formatNumber, formatPeni, SEP } from "@peni/brand/format";
import { Check, Heart } from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { Coin, Fis, type CoinCafe } from "@/components/brand";
import { Banner, Button, Sheet } from "@/components/ui";
import { peni } from "@/lib/client";
import { firstName, giftDeadline, giftInviteTitle, giftLegend, giftWhat } from "./wallet-model";

/*
 * GiftInvite (design-system.md §9.6, A7, [G15]): an incoming, pending ısmarlama as a gift fiş.
 *
 *   ISMARLAMA · MODA KAHVESİ
 *   (coin)  Ayşe sana 1 çay ısmarladı
 *           "Afiyet olsun!"
 *           Yarın 14:30'a kadar kabul edebilirsin.
 *   [Kabul et]  Geri çevir
 *
 * "Kabul et" flips the 56px coin (A7, the back reads "+30 / PENİ"); the words become
 * "Afiyet olsun! 30 peni cüzdanında." and the café card's balance rolls (the page reloads the
 * wallet). Then "Teşekkür et" [G15]. "Geri çevir" asks first, in a sheet: "Geri çevirelim mi?"
 * / "Peni Ayşe'ye döner." Once that sheet has closed, the page drops the fiş and moves focus
 * to what took its place. Errors stay inline on the fiş; nothing is lost.
 *
 * The h3 names the fiş (`article`), and both answers carry it in their names, so three fişes
 * waiting never read as three bare "Kabul et" buttons. The h3 is also the focus target the
 * page uses when a fiş above it is declined (`data-gift-title`).
 */

export interface GiftInviteProps {
  gift: GiftDTO;
  cafe: CoinCafe;
  refItems: readonly RefItemDTO[];
  /** Already accepted on this screen (the page keeps the fiş until it is left). */
  accepted?: boolean;
  onAccepted: (gift: GiftDTO) => void;
  /** Declined, and the confirm sheet has finished closing: drop the fiş and place focus. */
  onDeclined: (gift: GiftDTO) => void;
}

/** A focus target that is not a control: a ring only for keyboard users, clear of the top bar. */
export const focusTargetClass = "rounded-[4px] scroll-mt-[calc(var(--header-h)+1rem)]";

export function GiftInvite({ gift, cafe, refItems, accepted: acceptedProp = false, onAccepted, onDeclined }: GiftInviteProps) {
  const titleId = useId();
  const [accepted, setAccepted] = useState(acceptedProp);
  const [flips, setFlips] = useState(0);
  const [thanked, setThanked] = useState(gift.thankedAt != null);
  const [busy, setBusy] = useState<"accept" | "thank" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [declined, setDeclined] = useState<GiftDTO | null>(null);
  const thankRef = useRef<HTMLButtonElement>(null);
  const thankedRef = useRef<HTMLParagraphElement>(null);
  const [thankedHere, setThankedHere] = useState(false);
  const from = firstName(gift.fromName);
  const title = giftInviteTitle(gift, refItems);

  // "Kabul et" leaves the DOM on success: hand focus to what replaced it.
  useEffect(() => {
    if (flips > 0) thankRef.current?.focus({ preventScroll: true });
  }, [flips]);
  useEffect(() => {
    if (thankedHere) thankedRef.current?.focus({ preventScroll: true });
  }, [thankedHere]);

  // Declined: tell the page once the sheet is down (or after a second, should it never say so,
  // or as the fiş leaves, should a reload take it away first). Exactly once.
  const reported = useRef(false);
  const reportDeclined = useCallback(() => {
    if (!declined || reported.current) return;
    reported.current = true;
    onDeclined(declined);
  }, [declined, onDeclined]);
  useEffect(() => {
    if (!declined) return;
    const t = setTimeout(reportDeclined, 1000);
    return () => clearTimeout(t);
  }, [declined, reportDeclined]);
  const reportOnLeave = useRef(reportDeclined);
  useEffect(() => {
    reportOnLeave.current = reportDeclined;
  }, [reportDeclined]);
  useEffect(() => () => reportOnLeave.current(), []);

  const accept = async () => {
    if (busy || declined) return;
    setBusy("accept");
    setError(null);
    try {
      const done = await peni.gifts.accept(gift.id);
      setAccepted(true);
      setFlips((n) => n + 1);
      onAccepted(done);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const thank = async () => {
    if (busy) return;
    setBusy("thank");
    setError(null);
    try {
      await peni.gifts.thank(gift.id);
      setThanked(true);
      setThankedHere(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    if (busy) return;
    setBusy("decline");
    setDeclineError(null);
    try {
      const done = await peni.gifts.decline(gift.id);
      setDeclined(done);
      setDeclineOpen(false);
    } catch (e) {
      setDeclineError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article aria-labelledby={titleId}>
      <Fis variant="gift" legend={giftLegend(gift.cafeName)}>
        <div className="mt-4 flex items-start gap-4">
          <Coin
            key={flips}
            size={56}
            cafe={cafe}
            backLabel={`+${formatNumber(gift.peni)}`}
            animate={flips > 0 ? "flip" : null}
          />
          <div aria-live="polite" className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <h3 id={titleId} tabIndex={-1} data-gift-title="" className={`font-display text-h3 text-ink ${focusTargetClass}`}>
              {accepted ? "Afiyet olsun!" : title}
            </h3>
            {accepted ? (
              <p className="text-body-lg text-ink">
                <span className="font-semibold text-peni-ink tabular-nums">{formatPeni(gift.peni)}</span> cüzdanında.
              </p>
            ) : (
              <>
                {gift.message && (
                  <p className="font-display text-[17px] leading-6 font-medium text-ink italic">
                    {"“"}
                    {gift.message}
                    {"”"}
                  </p>
                )}
                <p className="text-meta text-ink-2">{giftDeadline(gift.expiresAt)}</p>
              </>
            )}
          </div>
        </div>

        {error && <Banner tone="danger" title={error} className="mt-4" />}

        {/* Each branch is keyed: "Teşekkür et" mounts fresh instead of fading in from the ink
            "Kabul et" fill it would otherwise reuse. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!accepted ? (
            <Fragment key="answer">
              <Button
                variant="primary"
                loading={busy === "accept"}
                loadingLabel="Kabul ediliyor…"
                aria-label={`Kabul et: ${title}`}
                onClick={() => void accept()}
              >
                Kabul et
              </Button>
              <Button
                variant="quiet"
                aria-label={`Geri çevir: ${title}`}
                // Ignored while "Kabul et" is in flight or the decline is done (no grey flash).
                onClick={() => {
                  if (!busy && !declined) setDeclineOpen(true);
                }}
              >
                Geri çevir
              </Button>
            </Fragment>
          ) : thanked ? (
            <p
              key="thanked"
              ref={thankedRef}
              tabIndex={-1}
              className="flex min-h-12 items-center gap-2 rounded-[4px] text-body text-success-ink"
              role="status"
            >
              <Check aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0" />
              {`Teşekkürün ${dativeName(from)} iletildi.`}
            </p>
          ) : (
            <Button
              key="thank"
              ref={thankRef}
              variant="secondary"
              iconStart={Heart}
              loading={busy === "thank"}
              aria-label={`${dativeName(from)} teşekkür et`}
              onClick={() => void thank()}
            >
              Teşekkür et
            </Button>
          )}
        </div>
      </Fis>

      <Sheet
        open={declineOpen}
        onOpenChange={(next) => {
          if (busy === "decline" && !next) return;
          setDeclineOpen(next);
          if (!next) setDeclineError(null);
        }}
        onOpenChangeComplete={(isOpen) => {
          if (!isOpen) reportDeclined();
        }}
        // Declined: "Geri çevir" is about to leave with its fiş, so the page places focus.
        finalFocus={declined ? false : undefined}
        title="Geri çevirelim mi?"
        description={`Peni ${dativeName(from)} döner.`}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" fullWidth loading={busy === "decline"} onClick={() => void decline()}>
              Geri çevir
            </Button>
            <Button variant="primary" fullWidth disabled={busy === "decline"} onClick={() => setDeclineOpen(false)}>
              {actionCopy.cancel}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {/* Which gift: with two fişes waiting, the sheet names the one it is about. */}
          <p className="flex items-center gap-3 rounded-[10px] bg-surface-2 px-3 py-2.5 text-body text-ink-2">
            <Coin size={28} cafe={cafe} />
            <span className="min-w-0">
              <span className="font-semibold text-ink">{giftWhat(gift.peni, refItems)}</span>
              {SEP}
              {gift.cafeName}
            </span>
          </p>
          {declineError && <Banner tone="danger" title={declineError} />}
        </div>
      </Sheet>
    </article>
  );
}

function messageOf(e: unknown): string {
  return e instanceof PeniApiError || e instanceof Error ? e.message || errorCopy.generic : errorCopy.generic;
}
