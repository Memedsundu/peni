/**
 * One coin card in JETON KESESİ (design-system.md §9.6, §10.5, §6.6, A6): a raised card with
 * the café colourway band on top (6pt), the café's 56pt coin, its name (`h3`) and district
 * (`legend`), the balance in `balance` ("90") + " peni" (`body`) rolling with the CountWheel,
 * the goods line [G1] ("≈ 3 çay · 1 Türk kahvesi"), "1 peni = ₺1, yalnız bu kafe için.", then
 * "Ismarla" (secondary, `Gift`) and "Kafeye git" (quiet).
 *
 * A6 coin-strike: when the balance is higher than the one last seen on this phone, the coin
 * drops in (with the `success` haptic, played by `Coin`), the number holds the old value until
 * it lands, then rolls up. A rise the screen made itself (a gift accepted here, a gift taken
 * back) is marked seen first (`markBalanceSeen`), so it just rolls: that moment already had
 * its own motion.
 */
import type { WalletCafeDTO } from "@peni/api";
import { actionCopy, peniCopy } from "@peni/brand/copy";
import { formatNumber, formatPeni, goodsLine, SEP } from "@peni/brand/format";
import { router } from "expo-router";
import { Gift } from "lucide-react-native";
import { memo, useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CafeHueBand, Coin, useLastSeenBalance, type CoinCafe } from "@/components/brand";
import { Button, Card, CountWheel, Skeleton, T } from "@/components/ui";
import { storage } from "@/lib/storage";
import { useTokens } from "@/lib/theme";
import { walletCopy } from "./wallet-model";

/** The key `useLastSeenBalance` reads (SecureStore keys allow only letters, digits, ". - _"). */
function lastSeenKey(slug: string): string {
  return `peni.lastSeen.${slug.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/** Record a balance as already seen, so the next render rolls to it without a strike. */
export async function markBalanceSeen(cafeSlug: string, balance: number): Promise<void> {
  try {
    await storage.set(lastSeenKey(cafeSlug), String(Math.max(0, Math.floor(balance))));
  } catch {
    // Not remembered: at worst the coin strikes once more.
  }
}

export interface WalletCoinCardProps {
  cafe: WalletCafeDTO;
  /** For the coin's initials triad ("M" over "K · İ"), from the café list. */
  city?: string | null;
}

interface Run {
  id: number;
  from: number;
  to: number;
  landed: boolean;
}

export const WalletCoinCard = memo(function WalletCoinCard({ cafe, city }: WalletCoinCardProps) {
  const t = useTokens();
  const balance = Math.max(0, Math.floor(cafe.balancePeni));
  const coinCafe: CoinCafe = { name: cafe.cafeName, district: cafe.district, city, slug: cafe.cafeSlug };
  const goods = goodsLine(balance, cafe.refItems);

  /* ---------- A6: one strike per rise over the last seen balance ---------- */
  const from = useLastSeenBalance(cafe.cafeSlug, balance);
  const [run, setRun] = useState<Run | null>(null);
  const [seenFrom, setSeenFrom] = useState<number | null>(null);
  if (from !== seenFrom) {
    setSeenFrom(from);
    if (from != null && from < balance) setRun({ id: (run?.id ?? 0) + 1, from, to: balance, landed: false });
  }
  const landed = useCallback(() => setRun((r) => (r && !r.landed ? { ...r, landed: true } : r)), []);
  const active = run && run.to === balance ? run : null;
  const shown = active && !active.landed ? active.from : balance;

  const spoken = `${cafe.cafeName}: ${formatPeni(balance)}${goods ? `, yaklaşık ${goods.split(SEP).join(", ")}` : ""}`;

  return (
    <Card padding="none">
      <CafeHueBand slug={cafe.cafeSlug} hue={cafe.hue} size={6} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Coin key={run?.id ?? 0} size={56} cafe={coinCafe} animate={active ? "strike" : null} onLand={landed} />
          <View style={styles.name}>
            <T variant="h3">{cafe.cafeName}</T>
            {cafe.district ? (
              <T variant="legend" color="ink2">
                {cafe.district}
              </T>
            ) : null}
          </View>
        </View>

        <View accessible accessibilityLabel={spoken} style={styles.balance}>
          <View style={styles.balanceLine}>
            <CountWheel key={run?.id ?? 0} value={shown} variant="balance" color="peniInk" trend={active ? 1 : undefined} />
            <T variant="body" color="peniInk">
              {" peni"}
            </T>
          </View>
          <View style={styles.notes}>
            {goods ? (
              <T variant="meta" color="ink2">
                {`≈ ${goods.split(SEP).join(" · ")}`}
              </T>
            ) : null}
            <T variant="meta" color="ink2">
              {peniCopy.walletRule}
            </T>
          </View>
        </View>

        <View style={[styles.actions, { borderTopColor: t.line }]}>
          <Button
            title={actionCopy.gift}
            variant="secondary"
            size="sm"
            icon={Gift}
            accessibilityLabel={`${cafe.cafeName} için ısmarla`}
            disabled={balance < 1}
            disabledReason={balance < 1 ? `Bakiyen ${formatNumber(balance)}` : undefined}
            onPress={() => router.push({ pathname: "/ismarla", params: { kafe: cafe.cafeSlug } })}
          />
          <Button
            title={walletCopy.goToCafe}
            variant="quiet"
            size="sm"
            onPress={() => router.push({ pathname: "/kafe/[slug]", params: { slug: cafe.cafeSlug } })}
          />
        </View>
      </View>
    </Card>
  );
});

/** The card's final geometry, for the loading state. */
export function WalletCoinCardSkeleton({ nameWidth = 150 }: { nameWidth?: number }) {
  const t = useTokens();
  return (
    <Card padding="none">
      <Skeleton height={6} radius={0} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Skeleton width={56} height={56} radius="full" />
          <View style={[styles.name, { gap: 8 }]}>
            <Skeleton width={nameWidth} line="h3" />
            <Skeleton width={72} line="legend" />
          </View>
        </View>
        <View style={styles.balance}>
          <Skeleton width={96} line="balance" />
          <View style={[styles.notes, { gap: 6 }]}>
            <Skeleton width={170} line="meta" />
            <Skeleton width={210} line="meta" />
          </View>
        </View>
        <View style={[styles.actions, { borderTopColor: t.line }]}>
          <Skeleton width={112} height={44} radius={10} />
          <Skeleton width={96} height={44} radius={10} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { flex: 1, minWidth: 0, gap: 4 },
  balance: { marginTop: 18 },
  balanceLine: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  notes: { marginTop: 6, gap: 2 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    columnGap: 8,
    rowGap: 4,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
});
