/**
 * Cüzdan (design-system.md §10.5, with §9.6 for anatomy and copy, D19).
 *
 *   Cüzdan                                        [QR]
 *   2 kafede peni biriktirdin.
 *   ┌ incoming gifts: gift fişes ┐   "Kabul et" flips the coin (A7 + `success` haptic)
 *   JETON KESESİ   one raised coin card per membership (CountWheel balance, A6 strike)
 *   HAREKETLER     the ledger by day, as sentences, with state chips and "Geri al" [G16, G17]
 *
 * "Peni kodum" is the native toolbar button on iOS (the tab's Stack) and a 44pt `QrCode` icon
 * button beside the in-content title elsewhere. "Ismarla" on a coin card opens the `ismarla`
 * sheet on that café.
 *
 * Loads when the tab comes into focus (after an order, a gift sent in the sheet) and on pull to
 * refresh. Signed out, loading, error and empty each have their own state; once the wallet is
 * on screen a failed refresh never wipes it (a top toast says so instead).
 */
import type { GiftDTO } from "@peni/api";
import { actionCopy, errorCopy, peniCopy } from "@peni/brand/copy";
import { router, useFocusEffect } from "expo-router";
import { QrCode, Store } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Coin } from "@/components/brand";
import { Banner, Button, EmptyState, IconButton, Skeleton, T, toast } from "@/components/ui";
import { GiftInvite } from "@/components/wallet/gift-invite";
import { HistoryList, HistoryListSkeleton } from "@/components/wallet/history-list";
import { markBalanceSeen, WalletCoinCard, WalletCoinCardSkeleton } from "@/components/wallet/wallet-coin-card";
import { buildHistory, walletCopy } from "@/components/wallet/wallet-model";
import { WalletScreen } from "@/components/wallet/wallet-screen";
import { loadWallet, messageOf, resetWallet, useWalletEntry } from "@/components/wallet/wallet-store";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";

const openPeniKodu = () => router.push("/peni-kodum");

export default function Cuzdan() {
  const { api, signedIn, ready } = useSession();
  const { wallet, status, error, cities } = useWalletEntry();
  /** Gifts accepted on this screen keep their fiş (now "Afiyet olsun!") until the tab is left. */
  const [acceptedHere, setAcceptedHere] = useState<GiftDTO[]>([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (ready && !signedIn) resetWallet();
  }, [ready, signedIn]);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) void loadWallet(api);
      return () => setAcceptedHere([]);
    }, [api, signedIn]),
  );

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    const failed = await loadWallet(api);
    if (failed && wallet) toast(failed, { tone: "danger" });
  }, [api, signedIn, wallet]);

  const retry = async () => {
    setRetrying(true);
    await loadWallet(api);
    setRetrying(false);
  };

  /* ---------- gift actions ---------- */
  const onAccepted = useCallback(
    async (gift: GiftDTO) => {
      setAcceptedHere((list) => (list.some((g) => g.id === gift.id) ? list : [...list, gift]));
      const before = wallet?.cafes.find((c) => c.cafeSlug === gift.cafeSlug)?.balancePeni;
      // The fiş's coin flip is this moment; the card's number only rolls (no second coin).
      if (before != null) await markBalanceSeen(gift.cafeSlug, before + gift.peni);
      void loadWallet(api, { force: true });
    },
    [api, wallet],
  );

  const onDeclined = useCallback(() => void loadWallet(api, { force: true }), [api]);

  const onCancelGift = useCallback(
    async (giftId: string) => {
      const gift = wallet?.gifts.find((g) => g.id === giftId);
      try {
        await api.gifts.cancel(giftId);
      } catch (e) {
        haptic("error");
        toast(messageOf(e), { tone: "danger" });
        return;
      }
      const before = gift ? wallet?.cafes.find((c) => c.cafeSlug === gift.cafeSlug)?.balancePeni : undefined;
      if (gift && before != null) await markBalanceSeen(gift.cafeSlug, before + gift.peni);
      const failed = await loadWallet(api, { force: true });
      if (failed) toast(failed, { tone: "danger" });
    },
    [api, wallet],
  );

  /* ---------- derived ---------- */
  const incoming = useMemo(() => {
    if (!wallet) return [];
    const pending = wallet.gifts.filter((g) => g.direction === "in" && g.status === "pending");
    const ids = new Set(pending.map((g) => g.id));
    // Newest first; an accepted fiş keeps its place, so nothing jumps when one is accepted.
    return [
      ...acceptedHere.filter((g) => !ids.has(g.id)).map((gift) => ({ gift, accepted: true })),
      ...pending.map((gift) => ({ gift, accepted: false })),
    ].sort((a, b) => b.gift.createdAt.localeCompare(a.gift.createdAt));
  }, [wallet, acceptedHere]);
  const history = useMemo(() => (wallet ? buildHistory(wallet) : []), [wallet]);
  const saving = wallet ? wallet.cafes.filter((c) => c.balancePeni > 0).length : 0;

  const hasCode = !!wallet && wallet.cafes.length > 0;
  const titleAction =
    signedIn && hasCode && Platform.OS !== "ios" ? (
      <IconButton label={peniCopy.peniCode} icon={QrCode} iconSize={24} onPress={openPeniKodu} />
    ) : null;

  /* ---------- signed out ---------- */
  if (!ready || !signedIn || status === "signed_out") {
    return (
      <WalletScreen title={walletCopy.title} centered>
        {ready ? (
          <View style={styles.signedOut}>
            <Coin size={96} />
            <T variant="body" color="ink2" align="center" style={styles.signedOutText}>
              {walletCopy.signedOut}
            </T>
            <Button title={actionCopy.signIn} size="lg" fullWidth onPress={() => router.push("/giris")} />
          </View>
        ) : null}
      </WalletScreen>
    );
  }

  /* ---------- first load ---------- */
  if (!wallet && status !== "error") {
    return (
      <WalletScreen title={walletCopy.title} busy>
        <View style={styles.page} aria-hidden>
          <Skeleton width={210} line="body" />
          <View style={styles.section}>
            <Skeleton width={110} line="legend" style={styles.legend} />
            <View style={styles.cards}>
              <WalletCoinCardSkeleton />
              <WalletCoinCardSkeleton nameWidth={190} />
            </View>
          </View>
          <View style={styles.section}>
            <Skeleton width={100} line="legend" style={styles.legend} />
            <HistoryListSkeleton />
          </View>
        </View>
      </WalletScreen>
    );
  }

  /* ---------- first load failed ---------- */
  if (!wallet) {
    return (
      <WalletScreen title={walletCopy.title} onRefresh={retry}>
        <View style={styles.page}>
          <Banner
            tone="danger"
            title={walletCopy.loadError}
            action={
              <Button
                size="sm"
                variant="secondary"
                title={errorCopy.retry}
                loading={retrying}
                loadingLabel={errorCopy.retry}
                onPress={() => void retry()}
              />
            }
          >
            {error ?? errorCopy.generic}
          </Banner>
        </View>
      </WalletScreen>
    );
  }

  /* ---------- no memberships ---------- */
  if (wallet.cafes.length === 0) {
    return (
      <WalletScreen title={walletCopy.title} onRefresh={refresh} centered>
        <EmptyState
          icon={Store}
          text={walletCopy.empty}
          action={{ label: actionCopy.browseCafes, onPress: () => router.navigate("/") }}
        />
      </WalletScreen>
    );
  }

  return (
    <WalletScreen title={walletCopy.title} titleAction={titleAction} onRefresh={refresh}>
      <View style={styles.page}>
        {/* Only cafés where peni really is: "2 kafede peni biriktirdin." */}
        {saving > 0 ? (
          <T variant="body" color="ink2">
            {peniCopy.walletSummary(saving)}
          </T>
        ) : null}

        {incoming.length > 0 ? (
          <View style={styles.incoming}>
            {incoming.map(({ gift, accepted }) => {
              const c = wallet.cafes.find((x) => x.cafeSlug === gift.cafeSlug);
              return (
                <GiftInvite
                  key={gift.id}
                  api={api}
                  gift={gift}
                  accepted={accepted}
                  cafe={{ name: gift.cafeName, district: c?.district, city: cities[gift.cafeSlug] ?? null, slug: gift.cafeSlug }}
                  refItems={c?.refItems ?? []}
                  onAccepted={onAccepted}
                  onDeclined={onDeclined}
                />
              );
            })}
          </View>
        ) : null}

        <View style={styles.section}>
          <T variant="legend" color="ink2" accessibilityRole="header" style={styles.legend}>
            {peniCopy.coinPurse}
          </T>
          <View style={styles.cards}>
            {wallet.cafes.map((c) => (
              <WalletCoinCard key={c.membershipId} cafe={c} city={cities[c.cafeSlug] ?? null} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <T variant="legend" color="ink2" accessibilityRole="header" style={styles.legend}>
            {peniCopy.movements}
          </T>
          <HistoryList items={history} showCafe={wallet.cafes.length > 1} onCancelGift={onCancelGift} />
        </View>
      </View>
    </WalletScreen>
  );
}

const styles = StyleSheet.create({
  page: { gap: 28, paddingTop: 4 },
  section: { gap: 0 },
  legend: { marginBottom: 12 },
  cards: { gap: 16 },
  incoming: { gap: 16 },
  signedOut: { alignItems: "center", gap: 20, width: "100%", maxWidth: 360, alignSelf: "center" },
  signedOutText: { maxWidth: 280 },
});
