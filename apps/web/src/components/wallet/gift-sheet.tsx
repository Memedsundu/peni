"use client";

import { newIdempotencyKey, PeniApiError, type FullWalletDTO, type GiftDTO, type RecentRecipientDTO } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { dativeName, formatNumber, formatPeni, SEP } from "@peni/brand/format";
import { Check, CircleAlert, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Coin, type CoinCafe } from "@/components/brand";
import {
  Banner,
  Button,
  Chip,
  ChipGroup,
  Field,
  isPhoneComplete,
  PhoneInput,
  phoneE164,
  Row,
  RowGroup,
  Sheet,
  Stepper,
  Textarea,
} from "@/components/ui";
import { peni } from "@/lib/client";
import {
  capReason,
  DAILY_GIFT_LIMIT_PENI,
  GIFT_EXPIRY_HOURS,
  giftCaps,
  giftedTodayPeni,
  giftReturnNote,
  giftWhat,
  itemChipLabel,
  itemPeni,
  NOTE_MAX,
  recentsFor,
  shortName,
  whatsappHref,
  whatsappText,
} from "./wallet-model";


/*
 * GiftSheet, "Ismarla" (design-system.md §9.6, D14, D15, [G6]). Same-café gifts only, so the
 * café comes first:
 *
 *   1. "Hangi kafede?"         cafés with a balance, "Moda Kahvesi · 90 peni". Skipped when the
 *                              café is preselected (the counter then reads 1/2, 2/2).
 *   2. "Kime ısmarlıyorsun?"   "Son ısmarladıkların" (initials), or a phone number that is
 *                              looked up at this café: "Mehmet K. · bu kafenin üyesi" + "Devam".
 *   3. "Ne ısmarlıyorsun?"     "1 çay · 30 peni", "1 Türk kahvesi · 90 peni", "Başka" (a peni
 *                              stepper), each capped by the balance ("Bakiyen 25") and today's
 *                              limit ("Günlük sınır 200 peni"); the note inside an envelope.
 *   Done (same sheet):         "Mehmet'e 1 çay ısmarladın.", when the peni comes back,
 *                              "WhatsApp'ta haber ver", "Tamam". No toast (D15).
 *
 * Errors stay inline, beside what caused them; nothing typed is lost. A retry of the same gift
 * re-uses its idempotency key, so a double tap can never send twice.
 */

type Step = "cafe" | "who" | "what" | "done";

interface Recipient {
  phone: string;
  first: string;
  label: string;
  initials: string;
}

type Lookup =
  | { state: "idle" }
  | { state: "loading"; digits: string }
  | { state: "found"; digits: string; recipient: Recipient }
  | { state: "error"; digits: string; message: string };

const OTHER = "other" as const;
const STEP = 5;

export interface GiftSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: FullWalletDTO;
  /** City per café slug, for the coin's initials triad. */
  cities?: Readonly<Record<string, string | null>>;
  /** Open on this café (from a coin card, or `?ismarla=moda`): step 1 is skipped. */
  cafeSlug: string | null;
  /** The gift went out. The page reloads the wallet; the sheet stays on its done screen. */
  onSent: (gift: GiftDTO) => void;
  /** The sheet has finished closing. */
  onClosed?: () => void;
}

export function GiftSheet({ open, onOpenChange, wallet, cities, cafeSlug, onSent, onClosed }: GiftSheetProps) {
  /* ---------- everything resets each time the sheet opens ---------- */
  const [wasOpen, setWasOpen] = useState(false);
  const [skipCafe, setSkipCafe] = useState(false);
  const [step, setStep] = useState<Step>("cafe");
  const [slug, setSlug] = useState<string | null>(null);
  const [digits, setDigits] = useState("");
  const [touched, setTouched] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [choice, setChoice] = useState<number | typeof OTHER | null>(null);
  const [custom, setCustom] = useState(10);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<GiftDTO | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const pre = cafeSlug && wallet.cafes.some((c) => c.cafeSlug === cafeSlug) ? cafeSlug : null;
      setSkipCafe(pre != null);
      setSlug(pre);
      setStep(pre ? "who" : "cafe");
      setDigits("");
      setTouched(false);
      setLookup({ state: "idle" });
      setRecipient(null);
      setChoice(null);
      setNote("");
      setSending(false);
      setSendError(null);
      setSent(null);
    }
  }

  const cafe = wallet.cafes.find((c) => c.cafeSlug === slug) ?? null;
  const coinCafe: CoinCafe | null = cafe
    ? { name: cafe.cafeName, district: cafe.district, city: cities?.[cafe.cafeSlug] ?? null, slug: cafe.cafeSlug }
    : null;
  const balance = Math.max(0, Math.floor(cafe?.balancePeni ?? 0));
  // Frozen once the gift is out: the reloaded wallet must not rewrite the done screen.
  const caps = giftCaps(balance, cafe ? giftedTodayPeni(wallet.ledger, cafe.cafeSlug) : 0);
  const refItems = cafe?.refItems ?? [];

  /* ---------- focus follows the step (the control that moved us has left the DOM) ---------- */
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (!open) {
      firstStep.current = true;
      return;
    }
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    bodyRef.current?.focus({ preventScroll: true });
  }, [step, open]);

  /* ---------- step 2: member lookup [G6], as soon as the number is whole ---------- */
  const lookupSeq = useRef(0);
  useEffect(() => {
    if (step !== "who" || !cafe || !isPhoneComplete(digits)) return;
    if (lookup.state !== "idle" && lookup.digits === digits) return;
    const seq = ++lookupSeq.current;
    setLookup({ state: "loading", digits });
    const t = setTimeout(async () => {
      try {
        const r = await peni.cafes.lookupMember(cafe.cafeSlug, phoneE164(digits));
        if (seq !== lookupSeq.current) return;
        setLookup({
          state: "found",
          digits,
          recipient: {
            phone: phoneE164(digits),
            first: r.firstName,
            label: shortName(r.firstName, r.lastInitial),
            initials: `${r.firstName.slice(0, 1)}${r.lastInitial ?? ""}`.toLocaleUpperCase("tr"),
          },
        });
      } catch (e) {
        if (seq !== lookupSeq.current) return;
        setLookup({ state: "error", digits, message: messageOf(e) });
      }
    }, 150);
    return () => clearTimeout(t);
    // `lookup` is read only to skip a repeat of the same number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, step, cafe?.cafeSlug]);

  const onDigits = (next: string) => {
    setDigits(next);
    if (!isPhoneComplete(next)) {
      lookupSeq.current++;
      setLookup({ state: "idle" });
    }
  };

  const toWhat = (r: Recipient) => {
    setRecipient(r);
    setSendError(null);
    // The first gift that fits, else "Başka" when anything fits at all.
    const fits = refItems.findIndex((it) => itemPeni(it) <= caps.max);
    setChoice(fits >= 0 ? fits : caps.max >= 1 ? OTHER : null);
    setCustom(Math.max(1, Math.min(caps.max, 2 * STEP)));
    setStep("what");
  };

  const found = lookup.state === "found" && lookup.digits === digits ? lookup.recipient : null;
  const phoneError =
    lookup.state === "error" && lookup.digits === digits
      ? lookup.message
      : touched && !isPhoneComplete(digits)
        ? errorCopy.phone
        : null;

  const continueWho = () => {
    if (found) toWhat(found);
    else if (!isPhoneComplete(digits)) setTouched(true);
  };

  /* ---------- step 3: the amount ---------- */
  const item = typeof choice === "number" ? (refItems[choice] ?? null) : null;
  const itemFits = item ? capReason(itemPeni(item), caps) == null : false;
  const isOther = choice === OTHER && caps.max >= 1;
  const customPeni = Math.min(caps.max, Math.max(1, custom));
  const amount = item && itemFits ? itemPeni(item) : isOther ? customPeni : 0;

  const stepCustom = (next: number) => {
    const up = next > customPeni;
    setCustom(
      up
        ? Math.min(caps.max, Math.floor(customPeni / STEP) * STEP + STEP)
        : Math.max(1, Math.ceil(customPeni / STEP) * STEP - STEP),
    );
    setSendError(null);
  };

  /* ---------- send ---------- */
  const key = useRef<{ sig: string; key: string } | null>(null);
  const send = async () => {
    if (sending || !cafe || !recipient || amount < 1) return;
    const message = note.trim() || undefined;
    const sig = `${cafe.cafeSlug}|${recipient.phone}|${amount}|${message ?? ""}`;
    if (!key.current || key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setSending(true);
    setSendError(null);
    try {
      const gift = await peni.gifts.send({ cafeSlug: cafe.cafeSlug, toPhone: recipient.phone, peni: amount, message, idempotencyKey: key.current.key });
      key.current = null;
      setSent(gift);
      setStep("done");
      onSent(gift);
    } catch (e) {
      setSendError(messageOf(e));
    } finally {
      setSending(false);
    }
  };

  /* ---------- chrome per step ---------- */
  const total = skipCafe ? 2 : 3;
  const index = step === "cafe" ? 1 : step === "who" ? (skipCafe ? 1 : 2) : skipCafe ? 2 : 3;
  const eyebrow = step === "done" ? undefined : `ADIM ${index}/${total}`;
  const back =
    step === "who" && !skipCafe ? () => setStep("cafe") : step === "what" ? () => setStep("who") : undefined;

  const sentWhat = sent ? giftWhat(sent.peni, refItems) : "";
  const title =
    step === "cafe"
      ? "Hangi kafede?"
      : step === "who"
        ? "Kime ısmarlıyorsun?"
        : step === "what"
          ? "Ne ısmarlıyorsun?"
          : `${dativeName(recipient?.first ?? "")} ${sentWhat} ısmarladın.`;

  const cafeLine =
    cafe && coinCafe ? (
      <span className="inline-flex items-center gap-1.5">
        <Coin size={16} cafe={coinCafe} />
        <span>
          {cafe.cafeName}
          {SEP}
          <span className="font-semibold text-peni-ink tabular-nums">{formatPeni(balance)}</span>
        </span>
      </span>
    ) : undefined;
  const description =
    step === "who" ? cafeLine : step === "what" && recipient && cafe ? `${recipient.label} için${SEP}${cafe.cafeName}` : undefined;

  let footer: React.ReactNode = null;
  if (step === "who") {
    footer = (
      <Button fullWidth loading={lookup.state === "loading"} loadingLabel="Bakılıyor…" onClick={continueWho}>
        {actionCopy.continue}
      </Button>
    );
  } else if (step === "what") {
    const reason =
      amount >= 1 ? undefined : caps.dailyLeft < 1 ? "Bugünkü ısmarlama sınırına ulaştın." : `Bakiyen ${formatNumber(caps.balance)}`;
    footer = (
      <div className="flex flex-col gap-3">
        {sendError && (
          <p role="alert" className="flex items-start gap-2 text-body text-danger">
            <CircleAlert aria-hidden size={20} strokeWidth={1.75} className="mt-px size-5 shrink-0" />
            <span className="min-w-0 flex-1">{sendError}</span>
          </p>
        )}
        <Button fullWidth loading={sending} disabled={amount < 1} disabledReason={reason} onClick={() => void send()}>
          {amount >= 1 ? `${actionCopy.gift}${SEP}${formatPeni(amount)}` : actionCopy.gift}
        </Button>
      </div>
    );
  } else if (step === "done") {
    footer = (
      <Button fullWidth onClick={() => onOpenChange(false)}>
        {actionCopy.ok}
      </Button>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (sending && !next) return;
        onOpenChange(next);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
      // Typed input (a number, a note) survives a stray tap outside.
      dismissible={step === "cafe" || step === "done"}
      eyebrow={eyebrow}
      title={title}
      description={description}
      onBack={back}
      footer={footer}
    >
      <div ref={bodyRef} tabIndex={-1} className="outline-none">
        {step === "cafe" && <CafeStep wallet={wallet} cities={cities} onPick={(s) => {
              setSlug(s);
              setStep("who");
            }} />}

        {step === "who" && cafe && (
          <div className="flex flex-col gap-6">
            <Recents
              recents={recentsFor(wallet.recentRecipients, cafe.cafeSlug)}
              onPick={(r) =>
                toWhat({ phone: r.phone, first: r.firstName, label: shortName(r.firstName, r.lastInitial), initials: r.initials })
              }
            />
            <div className="flex flex-col gap-3">
              <Field label="Telefon numarası" hint="Bu kafenin üyesi olmalı." error={phoneError}>
                <PhoneInput
                  value={digits}
                  onValueChange={onDigits}
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") continueWho();
                  }}
                />
              </Field>
              {lookup.state === "loading" && lookup.digits === digits && (
                <p className="text-meta text-ink-2" role="status">
                  Bu kafenin üyelerine bakılıyor…
                </p>
              )}
              {found && (
                <div role="status" className="flex items-center gap-3 rounded-[10px] bg-success-soft px-3 py-2.5 text-success-ink">
                  <Avatar initials={found.initials} />
                  <p className="min-w-0 flex-1 text-body">
                    <span className="font-semibold">{found.label}</span>
                    {SEP}bu kafenin üyesi
                  </p>
                  <Check aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0" />
                </div>
              )}
            </div>
          </div>
        )}

        {step === "what" && cafe && coinCafe && recipient && (
          <div className="flex flex-col gap-5">
            {caps.dailyLeft < 1 && (
              <Banner tone="warning" title="Bugünkü ısmarlama sınırına ulaştın. Yarın yine ısmarlayabilirsin." />
            )}
            <ChipGroup label="Ne ısmarlıyorsun?">
              {refItems.map((it, i) => {
                const why = capReason(itemPeni(it), caps);
                return (
                  <Chip
                    key={it.name}
                    kind="choice"
                    className="grow"
                    selected={choice === i && why == null}
                    disabledReason={why ?? undefined}
                    onClick={() => {
                      setChoice(i);
                      setSendError(null);
                    }}
                  >
                    <span className="tabular-nums">{itemChipLabel(it)}</span>
                  </Chip>
                );
              })}
              <Chip
                kind="choice"
                className="grow"
                selected={isOther}
                disabledReason={caps.max >= 1 ? undefined : capReason(1, caps) ?? undefined}
                onClick={() => {
                  setChoice(OTHER);
                  setSendError(null);
                }}
              >
                Başka
              </Chip>
            </ChipGroup>

            {isOther && (
              <div className="-mt-1 flex min-h-14 items-center justify-between gap-4 rounded-[10px] bg-surface-2 py-1.5 pr-1.5 pl-4">
                <span className="text-body text-ink" aria-hidden>
                  Peni
                </span>
                <Stepper
                  value={customPeni}
                  onChange={stepCustom}
                  min={1}
                  max={caps.max}
                  step={STEP}
                  collapsible={false}
                  itemName="Peni"
                  maxReason={capReason(caps.max + 1, caps)}
                />
              </div>
            )}

            <Envelope cafe={coinCafe} to={recipient.label}>
              <Field label="Notun (isteğe bağlı)" counter={{ length: note.length, max: NOTE_MAX }}>
                <Textarea
                  value={note}
                  maxLength={NOTE_MAX}
                  placeholder="Afiyet olsun!"
                  onChange={(e) => {
                    setNote(e.target.value);
                    setSendError(null);
                  }}
                />
              </Field>
            </Envelope>

            <div className="flex flex-col gap-1 text-meta text-ink-2">
              <p>{`Günde en fazla ${formatPeni(DAILY_GIFT_LIMIT_PENI)} ısmarlayabilirsin.`}</p>
              {caps.binding === "daily" && caps.dailyLeft > 0 && <p>{`Bugün ${formatPeni(caps.dailyLeft)} daha ısmarlayabilirsin.`}</p>}
              <p>{`Kabul edilmezse peni ${GIFT_EXPIRY_HOURS} saat içinde sana döner.`}</p>
            </div>
          </div>
        )}

        {step === "done" && sent && coinCafe && recipient && (
          <div className="flex flex-col gap-4">
            <Envelope cafe={coinCafe} to={recipient.label}>
              <p className="text-item text-ink tabular-nums">
                {sentWhat.endsWith("peni") ? null : `${sentWhat}${SEP}`}
                <span className="whitespace-nowrap text-peni-ink">{formatPeni(sent.peni)}</span>
              </p>
              {sent.message && (
                <p className="mt-2 font-display text-[17px] leading-6 font-medium text-ink italic">
                  {"\u201C"}
                  {sent.message}
                  {"\u201D"}
                </p>
              )}
            </Envelope>
            <p className="text-body text-ink-2">{giftReturnNote(sent.expiresAt)}</p>
            <Button
              variant="secondary"
              fullWidth
              iconStart={Share2}
              href={whatsappHref(whatsappText(sentWhat, sent.cafeName, `${window.location.origin}/hediye/${sent.id}`))}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp&apos;ta haber ver
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ========================================================================================== */
/* Parts                                                                                      */
/* ========================================================================================== */

function CafeStep({
  wallet,
  cities,
  onPick,
}: {
  wallet: FullWalletDTO;
  cities?: Readonly<Record<string, string | null>>;
  onPick: (slug: string) => void;
}) {
  const withBalance = wallet.cafes.filter((c) => c.balancePeni > 0);
  if (withBalance.length === 0) {
    return <p className="pb-2 text-body text-ink-2">Ismarlamak için önce bir kafede peni biriktir.</p>;
  }
  return (
    <div className="-mx-4 md:-mx-6">
      <RowGroup flat>
        {withBalance.map((c) => (
          <Row
            key={c.cafeSlug}
            onClick={() => onPick(c.cafeSlug)}
            arrow
            start={<Coin size={28} cafe={{ name: c.cafeName, district: c.district, city: cities?.[c.cafeSlug] ?? null, slug: c.cafeSlug }} />}
            title={
              <>
                {c.cafeName}
                {SEP}
                <span className="font-semibold text-peni-ink tabular-nums">{formatPeni(c.balancePeni)}</span>
              </>
            }
            className="md:px-6"
          />
        ))}
      </RowGroup>
    </div>
  );
}

function Recents({ recents, onPick }: { recents: RecentRecipientDTO[]; onPick: (r: RecentRecipientDTO) => void }) {
  if (recents.length === 0) return null;
  return (
    <section aria-labelledby="gift-recents">
      <h3 id="gift-recents" className="mb-2 legend text-ink-2">
        Son ısmarladıkların
      </h3>
      <div className="-mx-4 md:-mx-6">
        <RowGroup flat>
          {recents.map((r) => (
            <Row
              key={r.phone}
              onClick={() => onPick(r)}
              arrow
              start={<Avatar initials={r.initials} />}
              title={shortName(r.firstName, r.lastInitial)}
              className="md:px-6"
            />
          ))}
        </RowGroup>
      </div>
    </section>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-button text-ink">
      {initials}
    </span>
  );
}

/**
 * The envelope preview (§9.6): a `surface` card with a dashed `line-strong` border, the
 * recipient on top and the café's coin as its stamp.
 */
function Envelope({ cafe, to, children }: { cafe: CoinCafe; to: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border-[1.5px] border-dashed border-line-strong bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="legend text-ink-2">Kime</p>
          <p className="mt-1 text-item text-ink">{to}</p>
        </div>
        <Coin size={28} cafe={cafe} className="rotate-[-8deg]" />
      </div>
      {children}
    </div>
  );
}

function messageOf(e: unknown): string {
  return e instanceof PeniApiError || e instanceof Error ? e.message || errorCopy.generic : errorCopy.generic;
}
