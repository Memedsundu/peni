"use client";

import { PeniApiError, type GiftDTO, type RefItemDTO } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { dativeName, formatNumber, formatPeni } from "@peni/brand/format";
import { Check, Heart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Coin, Fis, type CoinCafe } from "@/components/brand";
import { Banner, Button, Sheet } from "@/components/ui";
import { peni } from "@/lib/client";
import { firstName, giftDeadline, giftInviteTitle, giftLegend } from "./wallet-model";

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
 * / "Peni Ayşe'ye döner." Errors stay inline on the fiş; nothing is lost.
 */

export interface GiftInviteProps {
  gift: GiftDTO;
  cafe: CoinCafe;
  refItems: readonly RefItemDTO[];
  /** Already accepted on this screen (the page keeps the fiş until it is left). */
  accepted?: boolean;
  onAccepted: (gift: GiftDTO) => void;
  onDeclined: (gift: GiftDTO) => void;
}

export function GiftInvite({ gift, cafe, refItems, accepted: acceptedProp = false, onAccepted, onDeclined }: GiftInviteProps) {
  const [accepted, setAccepted] = useState(acceptedProp);
  const [flips, setFlips] = useState(0);
  const [thanked, setThanked] = useState(gift.thankedAt != null);
  const [busy, setBusy] = useState<"accept" | "thank" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const thankRef = useRef<HTMLButtonElement>(null);
  const from = firstName(gift.fromName);

  // "Kabul et" leaves the DOM on success: hand focus to what replaced it.
  useEffect(() => {
    if (flips > 0) thankRef.current?.focus({ preventScroll: true });
  }, [flips]);

  const accept = async () => {
    if (busy) return;
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
      setDeclineOpen(false);
      onDeclined(done);
    } catch (e) {
      setDeclineError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Fis variant="gift" as="article" legend={giftLegend(gift.cafeName)}>
        <div className="mt-4 flex items-start gap-4">
          <Coin
            key={flips}
            size={56}
            cafe={cafe}
            backLabel={`+${formatNumber(gift.peni)}`}
            animate={flips > 0 ? "flip" : null}
          />
          <div aria-live="polite" className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            {accepted ? (
              <>
                <h3 className="font-display text-h3 text-ink">Afiyet olsun!</h3>
                <p className="text-body-lg text-ink">
                  <span className="font-semibold text-peni-ink tabular-nums">{formatPeni(gift.peni)}</span> cüzdanında.
                </p>
              </>
            ) : (
              <>
                <h3 className="font-display text-h3 text-ink">{giftInviteTitle(gift, refItems)}</h3>
                {gift.message && (
                  <p className="font-display text-[17px] leading-6 font-medium text-ink italic">
                    {"\u201C"}
                    {gift.message}
                    {"\u201D"}
                  </p>
                )}
                <p className="text-meta text-ink-2">{giftDeadline(gift.expiresAt)}</p>
              </>
            )}
          </div>
        </div>

        {error && <Banner tone="danger" title={error} className="mt-4" />}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!accepted ? (
            <>
              <Button variant="primary" loading={busy === "accept"} loadingLabel="Kabul ediliyor…" onClick={() => void accept()}>
                Kabul et
              </Button>
              <Button variant="quiet" disabled={busy === "accept"} onClick={() => setDeclineOpen(true)}>
                Geri çevir
              </Button>
            </>
          ) : thanked ? (
            <p className="flex min-h-12 items-center gap-2 text-body text-success-ink" role="status">
              <Check aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0" />
              {`Teşekkürün ${dativeName(from)} iletildi.`}
            </p>
          ) : (
            <Button ref={thankRef} variant="secondary" iconStart={Heart} loading={busy === "thank"} onClick={() => void thank()}>
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
        {declineError && <Banner tone="danger" title={declineError} />}
      </Sheet>
    </>
  );
}

function messageOf(e: unknown): string {
  return e instanceof PeniApiError || e instanceof Error ? e.message || errorCopy.generic : errorCopy.generic;
}
