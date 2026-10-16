/**
 * GiftInvite (design-system.md §9.6, §10.5, A7, [G15]): an incoming, pending ısmarlama as a
 * gift fiş at the top of Cüzdan.
 *
 *   ═══════════════════════════
 *   ISMARLAMA · MODA KAHVESİ
 *   (coin)  Ayşe sana 1 çay ısmarladı
 *           "Afiyet olsun!"
 *           Yarın 14:30'a kadar kabul edebilirsin.
 *   [ Kabul et ]  Geri çevir
 *
 * "Kabul et" flips the 56pt coin (A7, the back reads "+30 / PENİ", with the `success` haptic,
 * both played by `Coin`); the words become "Afiyet olsun! 30 peni cüzdanında." and the café
 * card's balance rolls (the screen reloads the wallet). Then "Teşekkür et" [G15], which turns
 * into "Teşekkürün Ayşe'ye iletildi.". "Geri çevir" asks first, in a sheet: "Geri çevirelim mi?"
 * / "Peni Ayşe'ye döner." Errors stay on the fiş, at the buttons; nothing is lost.
 */
import type { GiftDTO, PeniClient, RefItemDTO } from "@peni/api";
import { actionCopy } from "@peni/brand/copy";
import { formatNumber, formatPeni, SEP } from "@peni/brand/format";
import { Check, Heart } from "lucide-react-native";
import { memo, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import { Coin, Fis, FisText, type CoinCafe } from "@/components/brand";
import { Button, ButtonRow, Icon, T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { fonts, radius, useTokens } from "@/lib/theme";
import { ConfirmSheet } from "./confirm-sheet";
import { InlineError } from "./parts";
import { messageOf } from "./wallet-store";
import { firstName, giftDeadline, giftInviteTitle, giftLegend, giftWhat, walletCopy } from "./wallet-model";

export interface GiftInviteProps {
  api: PeniClient;
  gift: GiftDTO;
  cafe: CoinCafe;
  refItems: readonly RefItemDTO[];
  /** Accepted on this screen already (the fiş stays, as "Afiyet olsun!", until the tab is left). */
  accepted?: boolean;
  onAccepted: (gift: GiftDTO) => void;
  onDeclined: (gift: GiftDTO) => void;
}

function announce(text: string) {
  if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(text);
}

export const GiftInvite = memo(function GiftInvite({
  api,
  gift,
  cafe,
  refItems,
  accepted: acceptedProp = false,
  onAccepted,
  onDeclined,
}: GiftInviteProps) {
  const t = useTokens();
  const [accepted, setAccepted] = useState(acceptedProp);
  const [flips, setFlips] = useState(0);
  const [thanked, setThanked] = useState(gift.thankedAt != null);
  const [busy, setBusy] = useState<"accept" | "thank" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const from = firstName(gift.fromName);
  const amount = formatPeni(gift.peni);

  const accept = async () => {
    if (busy) return;
    setBusy("accept");
    setError(null);
    try {
      const done = await api.gifts.accept(gift.id);
      setAccepted(true);
      setFlips((n) => n + 1); // the flip plays the `success` haptic
      announce(`${walletCopy.afiyet} ${amount}${walletCopy.inWallet}`);
      onAccepted(done);
    } catch (e) {
      haptic("error");
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
      await api.gifts.thank(gift.id);
      haptic("tap");
      setThanked(true);
      announce(walletCopy.thanked(from));
    } catch (e) {
      haptic("error");
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
      const done = await api.gifts.decline(gift.id);
      setDeclineOpen(false);
      onDeclined(done);
    } catch (e) {
      haptic("error");
      setDeclineError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Fis variant="gift" legend={giftLegend(gift.cafeName)}>
        <View style={styles.head}>
          <Coin key={flips} size={56} cafe={cafe} backLabel={`+${formatNumber(gift.peni)}`} animate={flips > 0 ? "flip" : null} />
          <View style={styles.words} accessibilityLiveRegion="polite">
            {accepted ? (
              <>
                <FisText variant="h3">{walletCopy.afiyet}</FisText>
                <FisText variant="body">
                  <FisText variant="strong" color="peniInk" tabular>
                    {amount.replace(" ", " ")}
                  </FisText>
                  {walletCopy.inWallet}
                </FisText>
              </>
            ) : (
              <>
                <FisText variant="h3">{giftInviteTitle(gift, refItems)}</FisText>
                {gift.message ? (
                  <FisText variant="question" style={styles.note}>
                    {`“${gift.message}”`}
                  </FisText>
                ) : null}
                <FisText variant="meta" color="ink2">
                  {giftDeadline(gift.expiresAt)}
                </FisText>
              </>
            )}
          </View>
        </View>

        <InlineError message={error} style={styles.error} />

        <View style={styles.actions}>
          {!accepted ? (
            <>
              <Button
                title={walletCopy.accept}
                loading={busy === "accept"}
                loadingLabel={walletCopy.accepting}
                onPress={() => void accept()}
              />
              <Button
                title={walletCopy.decline}
                variant="quiet"
                disabled={busy === "accept"}
                onPress={() => {
                  setDeclineError(null);
                  setDeclineOpen(true);
                }}
              />
            </>
          ) : thanked ? (
            <View accessibilityRole="text" style={styles.thanked}>
              <Icon icon={Check} size={20} color={t.successInk} />
              <T variant="body" color="successInk" style={styles.flex}>
                {walletCopy.thanked(from)}
              </T>
            </View>
          ) : (
            <Button
              title={walletCopy.thank}
              variant="secondary"
              icon={Heart}
              loading={busy === "thank"}
              onPress={() => void thank()}
            />
          )}
        </View>
      </Fis>

      <ConfirmSheet
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        busy={busy === "decline"}
        title={walletCopy.declineSheet.title}
        description={walletCopy.declineSheet.body(from)}
        actions={
          <ButtonRow>
            <Button
              title={walletCopy.decline}
              variant="secondary"
              fullWidth
              size="lg"
              loading={busy === "decline"}
              onPress={() => void decline()}
            />
            <Button
              title={actionCopy.cancel}
              fullWidth
              size="lg"
              disabled={busy === "decline"}
              onPress={() => setDeclineOpen(false)}
            />
          </ButtonRow>
        }
      >
        {/* Which gift: with two fişes waiting, the sheet names the one it is about. */}
        <View style={[styles.which, { backgroundColor: t.surface2 }]}>
          <Coin size={28} cafe={cafe} />
          <T variant="body" color="ink2" style={styles.flex}>
            <T variant="strong">{giftWhat(gift.peni, refItems)}</T>
            {`${SEP}${gift.cafeName}`}
          </T>
        </View>
        <InlineError message={declineError} />
      </ConfirmSheet>
    </>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: 16, marginTop: 16 },
  words: { flex: 1, minWidth: 0, gap: 8, paddingTop: 2 },
  note: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 24 },
  error: { marginTop: 16 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 20 },
  thanked: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  which: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
