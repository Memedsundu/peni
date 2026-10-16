/**
 * `ismarla` sheet (design-system.md §10.5, §9.6 GiftSheet, D14, D15, [G6]): formSheet, detents
 * [0.6, 1]. Same-café gifts only, so the café comes first:
 *
 *   1. "Hangi kafede?"        cafés with a balance, "Moda Kahvesi · 90 peni". Skipped when the
 *                             café comes with the link (`?kafe=moda`): the counter reads 1/2, 2/2.
 *   2. "Kime ısmarlıyorsun?"  "Son ısmarladıkların" (initials), or a phone number ("TELEFON
 *                             NUMARASI", +90) looked up at this café as soon as it is whole:
 *                             "Mehmet K. · bu kafenin üyesi" + "Devam".
 *   3. "Ne ısmarlıyorsun?"    "1 çay · 30 peni", "1 Türk kahvesi · 90 peni", "Başka" (a peni
 *                             stepper), capped by the balance ("Bakiyen 25") and today's limit
 *                             ("Günlük sınır 200 peni"); the note (max 140) inside an envelope.
 *   Done (same sheet):        "Mehmet'e 1 çay ısmarladın.", when the peni comes back,
 *                             "WhatsApp'ta haber ver" (whatsapp://send, else the share sheet),
 *                             "Tamam". No toast (D15); the `confirm` haptic.
 *
 * Errors stay inline at what caused them; nothing typed is lost. A retry of the same gift
 * re-uses its idempotency key, so a double tap can never send twice. Android's back button
 * steps back before it closes the sheet.
 */
import { newIdempotencyKey, type GiftDTO, type RecentRecipientDTO } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { formatNumber } from "@peni/brand/format";
import { router, useLocalSearchParams } from "expo-router";
import { CircleAlert, LogIn, MessageCircle, Store } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, BackHandler, Linking, Platform, Share, StyleSheet, View } from "react-native";
import { Button, Skeleton } from "@/components/ui";
import {
  CafeLine,
  CafeStep,
  DoneStep,
  GiftFrame,
  OTHER,
  WhatStep,
  WhoStep,
  type Choice,
  type Recipient,
} from "@/components/wallet/gift-steps";
import { InlineError, StateNote } from "@/components/wallet/parts";
import {
  capReason,
  formatPhoneDigits,
  giftCaps,
  giftCopy,
  giftedTodayPeni,
  giftReturnNote,
  giftWhat,
  isPhoneComplete,
  itemPeni,
  nameInitials,
  phoneDigits,
  phoneE164,
  recentsFor,
  shortName,
  whatsappText,
} from "@/components/wallet/wallet-model";
import { loadWallet, messageOf, resetWallet, useWalletEntry } from "@/components/wallet/wallet-store";
import { haptic } from "@/lib/haptics";
import { API_URL, useSession } from "@/lib/session";

type Step = "cafe" | "who" | "what" | "done";

type Lookup =
  | { state: "idle" }
  | { state: "loading"; digits: string }
  | { state: "found"; digits: string; recipient: Recipient }
  | { state: "error"; digits: string; message: string };

const STEP = 5;

export default function IsmarlaSheet() {
  const { kafe } = useLocalSearchParams<{ kafe?: string }>();
  const { api, signedIn, ready, customer } = useSession();
  const { wallet, status, error: loadError, cities } = useWalletEntry();

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/cuzdan");
  }, []);

  /* ---------- the wallet (fresh each time the sheet opens) ---------- */
  useEffect(() => {
    if (!ready) return;
    if (!signedIn) resetWallet();
    else void loadWallet(api);
  }, [api, ready, signedIn]);

  /* ---------- where the flow starts: once, when the wallet is first there ---------- */
  const [started, setStarted] = useState(false);
  const [skipCafe, setSkipCafe] = useState(false);
  const [step, setStep] = useState<Step>("cafe");
  const [slug, setSlug] = useState<string | null>(null);
  if (wallet && !started) {
    setStarted(true);
    const pre = kafe && wallet.cafes.some((c) => c.cafeSlug === kafe) ? kafe : null;
    setSkipCafe(pre != null);
    setSlug(pre);
    setStep(pre ? "who" : "cafe");
  }

  const cafe = wallet?.cafes.find((c) => c.cafeSlug === slug) ?? null;
  const coin = cafe
    ? { name: cafe.cafeName, district: cafe.district, city: cities[cafe.cafeSlug] ?? null, slug: cafe.cafeSlug }
    : null;
  const balance = Math.max(0, Math.floor(cafe?.balancePeni ?? 0));
  const refItems = cafe?.refItems ?? [];

  /* ---------- step 2: the recipient ---------- */
  const [digits, setDigits] = useState("");
  const [touched, setTouched] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [lookupTry, setLookupTry] = useState(0);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const lookupSeq = useRef(0);
  const ownDigits = customer ? phoneDigits(customer.phone) : null;

  // As soon as the number is whole: is this a member here? [G6] Only "Mehmet K." comes back.
  useEffect(() => {
    if (step !== "who" || !cafe || !isPhoneComplete(digits)) return;
    if (lookup.state !== "idle" && lookup.digits === digits) return;
    const seq = ++lookupSeq.current;
    if (ownDigits === digits) {
      setLookup({ state: "error", digits, message: errorCopy.giftSelf });
      return;
    }
    setLookup({ state: "loading", digits });
    const timer = setTimeout(async () => {
      try {
        const r = await api.cafes.lookupMember(cafe.cafeSlug, phoneE164(digits));
        if (seq !== lookupSeq.current) return;
        setLookup({
          state: "found",
          digits,
          recipient: {
            phone: phoneE164(digits),
            first: r.firstName,
            label: shortName(r.firstName, r.lastInitial),
            initials: nameInitials(r.firstName, r.lastInitial),
          },
        });
        haptic("selection");
      } catch (e) {
        if (seq !== lookupSeq.current) return;
        setLookup({ state: "error", digits, message: messageOf(e) });
      }
    }, 150);
    return () => clearTimeout(timer);
    // `lookup` is read only to skip a repeat of the same number; `lookupTry` asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, step, cafe?.cafeSlug, lookupTry, ownDigits, api]);

  const onDigits = (text: string) => {
    let next = phoneDigits(text);
    // Deleting the space after "532" must delete the "2", not bounce back.
    if (next === digits && text.length < formatPhoneDigits(digits).length) next = digits.slice(0, -1);
    setDigits(next);
    setTouched(false);
    if (!isPhoneComplete(next)) {
      lookupSeq.current++;
      setLookup({ state: "idle" });
    }
  };

  const found = lookup.state === "found" && lookup.digits === digits ? lookup.recipient : null;
  const looking = lookup.state === "loading" && lookup.digits === digits;
  const phoneError =
    lookup.state === "error" && lookup.digits === digits
      ? lookup.message
      : touched && !isPhoneComplete(digits)
        ? errorCopy.phone
        : null;

  /* ---------- step 3: the amount ---------- */
  const caps = giftCaps(balance, cafe ? giftedTodayPeni(wallet?.ledger, cafe.cafeSlug) : 0);
  const [choice, setChoice] = useState<Choice>(null);
  const [custom, setCustom] = useState(10);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ gift: GiftDTO; what: string; to: Recipient } | null>(null);

  const toWhat = (r: Recipient) => {
    setRecipient(r);
    setSendError(null);
    // The first gift that fits, else "Başka" when anything fits at all.
    const fits = refItems.findIndex((it) => itemPeni(it) <= caps.max);
    setChoice(fits >= 0 ? fits : caps.max >= 1 ? OTHER : null);
    setCustom(Math.max(1, Math.min(caps.max, 2 * STEP)));
    setStep("what");
  };

  const pickRecent = (r: RecentRecipientDTO) =>
    toWhat({ phone: r.phone, first: r.firstName, label: shortName(r.firstName, r.lastInitial), initials: r.initials });

  const continueWho = () => {
    if (found) toWhat(found);
    else if (!isPhoneComplete(digits)) setTouched(true);
    else if (lookup.state === "error" && lookup.digits === digits) {
      setLookup({ state: "idle" });
      setLookupTry((n) => n + 1);
    }
  };

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

  const key = useRef<{ sig: string; key: string } | null>(null);
  const send = async () => {
    if (sending || !cafe || !recipient || amount < 1) return;
    const message = note.trim() || undefined;
    const sig = `${cafe.cafeSlug}|${recipient.phone}|${amount}|${message ?? ""}`;
    if (!key.current || key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setSending(true);
    setSendError(null);
    try {
      const gift = await api.gifts.send({
        cafeSlug: cafe.cafeSlug,
        toPhone: recipient.phone,
        peni: amount,
        message,
        idempotencyKey: key.current.key,
      });
      key.current = null;
      haptic("confirm");
      const what = giftWhat(gift.peni, refItems);
      setSent({ gift, what, to: recipient });
      setStep("done");
      void loadWallet(api, { force: true }); // Cüzdan underneath shows the new balance and the "bekliyor" line
    } catch (e) {
      haptic("error");
      setSendError(messageOf(e));
    } finally {
      setSending(false);
    }
  };

  /* ---------- WhatsApp, else the share sheet ---------- */
  const tell = async () => {
    if (!sent) return;
    const text = whatsappText(sent.what, sent.gift.cafeName, `${API_URL.replace(/\/$/, "")}/hediye/${sent.gift.id}`);
    if (Platform.OS === "web") {
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => {});
      return;
    }
    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`);
    } catch {
      await Share.share({ message: text }).catch(() => {});
    }
  };

  /* ---------- back ---------- */
  const back = step === "who" && !skipCafe ? () => setStep("cafe") : step === "what" ? () => setStep("who") : null;
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (sending) return true;
      if (!backRef.current) return false;
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, [sending]);

  useEffect(() => {
    if (step === "done" && sent && Platform.OS !== "web") {
      AccessibilityInfo.announceForAccessibility(giftCopy.doneTitle(sent.to.first, sent.what));
    }
  }, [step, sent]);

  /* ================================ render ================================ */

  const frame = (props: Omit<Parameters<typeof GiftFrame>[0], "onClose">) => <GiftFrame onClose={close} {...props} />;

  if (ready && (!signedIn || status === "signed_out")) {
    return frame({
      title: actionCopy.gift,
      stepKey: "signed-out",
      footer: <Button title={actionCopy.signIn} size="lg" fullWidth onPress={() => router.push("/giris")} />,
      children: <StateNote icon={LogIn} text={giftCopy.signedOut} />,
    });
  }

  if (!wallet) {
    if (status === "error") {
      return frame({
        title: actionCopy.gift,
        stepKey: "error",
        footer: <Button title={errorCopy.retry} variant="secondary" fullWidth onPress={() => void loadWallet(api)} />,
        children: <StateNote icon={CircleAlert} text={loadError ?? errorCopy.generic} />,
      });
    }
    return frame({
      eyebrow: " ",
      title: giftCopy.cafeTitle,
      stepKey: "loading",
      children: (
        <View aria-hidden style={styles.skeleton}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={28} height={28} radius="full" />
              <Skeleton width={i ? 170 : 210} line="body" />
            </View>
          ))}
        </View>
      ),
    });
  }

  const total = skipCafe ? 2 : 3;
  const index = step === "cafe" ? 1 : step === "who" ? (skipCafe ? 1 : 2) : skipCafe ? 2 : 3;
  const eyebrow = step === "done" ? null : giftCopy.step(index, total);
  const cafeLine = cafe && coin ? <CafeLine cafe={cafe} coin={coin} balance={balance} /> : undefined;

  /* 1 */
  // Also when the chosen café has left the wallet meanwhile: back to the list, never a blank sheet.
  if (step === "cafe" || !cafe || !coin) {
    const withBalance = wallet.cafes.filter((c) => c.balancePeni >= 1);
    if (withBalance.length === 0) {
      return frame({
        title: giftCopy.cafeTitle,
        stepKey: "cafe-empty",
        footer: <Button title={actionCopy.ok} variant="secondary" fullWidth onPress={close} />,
        children: <StateNote icon={Store} text={giftCopy.noBalanceAnywhere} />,
      });
    }
    return frame({
      eyebrow,
      title: giftCopy.cafeTitle,
      stepKey: "cafe",
      children: (
        <CafeStep
          cafes={withBalance}
          cities={cities}
          onPick={(s) => {
            setSlug(s);
            setDigits("");
            setLookup({ state: "idle" });
            setStep("who");
          }}
        />
      ),
    });
  }


  /* A preselected café with nothing to give yet. */
  if (step === "who" && balance < 1) {
    return frame({
      title: giftCopy.whoTitle,
      description: cafeLine,
      stepKey: "who-empty",
      onBack: back,
      footer: <Button title={actionCopy.ok} variant="secondary" fullWidth onPress={close} />,
      children: <StateNote icon={Store} text={giftCopy.noBalanceHere} />,
    });
  }

  /* 2 */
  if (step === "who") {
    return frame({
      eyebrow,
      title: giftCopy.whoTitle,
      description: cafeLine,
      onBack: back,
      stepKey: "who",
      footer: (
        <Button
          title={actionCopy.continue}
          size="lg"
          fullWidth
          loading={looking}
          loadingLabel={giftCopy.lookingUpButton}
          onPress={continueWho}
        />
      ),
      children: (
        <WhoStep
          recents={recentsFor(wallet.recentRecipients, cafe.cafeSlug)}
          digits={digits}
          onDigits={onDigits}
          phoneError={phoneError}
          looking={looking}
          found={found}
          onPickRecent={pickRecent}
          onSubmit={continueWho}
        />
      ),
    });
  }

  /* 3 */
  if (step === "what" && recipient) {
    const reason =
      amount >= 1 ? undefined : caps.dailyLeft < 1 ? giftCopy.dailyReachedShort : `Bakiyen ${formatNumber(caps.balance)}`;
    return frame({
      eyebrow,
      title: giftCopy.whatTitle,
      description: giftCopy.forWhom(recipient.label, cafe.cafeName),
      onBack: back,
      stepKey: "what",
      footer: (
        <>
          <InlineError message={sendError} />
          <Button
            title={amount >= 1 ? giftCopy.submit(amount) : actionCopy.gift}
            size="lg"
            fullWidth
            loading={sending}
            disabled={amount < 1}
            disabledReason={reason}
            onPress={() => void send()}
          />
        </>
      ),
      children: (
        <WhatStep
          refItems={refItems}
          caps={caps}
          choice={choice}
          onChoice={(c) => {
            setChoice(c);
            setSendError(null);
          }}
          isOther={isOther}
          customPeni={customPeni}
          onCustom={stepCustom}
          coin={coin}
          to={recipient.label}
          note={note}
          onNote={(text) => {
            setNote(text);
            setSendError(null);
          }}
        />
      ),
    });
  }

  /* Done */
  if (step === "done" && sent) {
    return frame({
      title: giftCopy.doneTitle(sent.to.first, sent.what),
      stepKey: "done",
      footer: (
        <>
          <Button
            title={giftCopy.whatsapp}
            variant="secondary"
            size="lg"
            fullWidth
            icon={MessageCircle}
            onPress={() => void tell()}
          />
          <Button title={actionCopy.ok} size="lg" fullWidth onPress={close} />
        </>
      ),
      children: (
        <DoneStep
          coin={coin}
          to={sent.to.label}
          what={sent.what}
          peni={sent.gift.peni}
          message={sent.gift.message}
          returnNote={giftReturnNote(sent.gift.expiresAt)}
        />
      ),
    });
  }

  return null;
}

const styles = StyleSheet.create({
  skeleton: { gap: 0 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
});
