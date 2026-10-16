/**
 * Askıda kahve on the café screen (design-system.md §9.3 "Askı", §6.2, §10.2, A8, D7, D8).
 *
 * A flat `askiSoft` panel: the legend and "Askı nedir?", the hook rail and its caption, two
 * equal buttons ("Askıdan al" in askı turquoise → `askidan-al`, "Askıya bırak" secondary →
 * `askiya-birak`) and up to three named donors.
 *
 * Dignity (review blockers, §17):
 * - Nothing about anyone who takes is shown: no names, initials or times of claims.
 * - The rail animates ONLY for the viewer's own donation (A8, `donation` from the give sheet).
 *   A refetch that brings someone else's donation or claim re-renders it silently.
 * - The weekly ikram count is hidden below 3 (`askiCaption`, D8).
 */
import type { AskidaDTO } from "@peni/api";
import { askiCopy } from "@peni/brand/copy";
import { Check, Info } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { AskiCaption, AskiRail, askiRailProps, HookGlyph, type HangSignal } from "@/components/brand";
import { Button, ButtonRow, Card, Icon, PressableScale, T, toast, withAlpha } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { durations } from "@/lib/motion";
import { fonts, radius, useTokens } from "@/lib/theme";
import { afterDonation, donationToast, donorLines, referenceItem } from "./aski-model";
import { cafeSheets, useCafe } from "./cafe-context";
import type { Donation } from "./cafe-store";

export interface DonationEvent {
  n: number;
  donation: Donation;
}

interface OwnPool {
  /** The server's pool when the donation was made; the overlay holds until a refetch moves it. */
  base: Pick<AskidaDTO, "balancePeni" | "itemsAvailable">;
  itemsAvailable: number;
  donatedPeni: number;
}

export function AskiPanel({ donation, ikramProductId }: { donation: DonationEvent | null; ikramProductId: string | null }) {
  const t = useTokens();
  const { cafe, slug, member, now } = useCafe();
  const askida = cafe.askida;
  const [explain, setExplain] = useState(false);
  const [own, setOwn] = useState<OwnPool | null>(null);
  const [hangSignal, setHangSignal] = useState<HangSignal>({ n: 0 });

  /*
   * A8 after one's own donation: the new count and the hang signal land in ONE render (the rail
   * hangs only the items that arrive with its signal); the refetch then replaces this local
   * picture with the server's, without replaying anything.
   */
  const [seen, setSeen] = useState(donation?.n ?? 0);
  if (donation && donation.n !== seen) {
    setSeen(donation.n);
    const next = afterDonation(askida, referenceItem(cafe), donation.donation);
    if (next && (next.own > 0 || next.match)) {
      setOwn({
        base: { balancePeni: askida.balancePeni, itemsAvailable: askida.itemsAvailable },
        itemsAvailable: next.itemsAvailable,
        donatedPeni: donation.donation.peni + donation.donation.matchedPeni,
      });
      const n = (typeof hangSignal === "number" ? hangSignal : hangSignal.n) + 1;
      setHangSignal({ n, count: next.own, match: next.match });
    }
  }
  // The toast (and, when no whole cup was hung, the success haptic the rail would have played).
  useEffect(() => {
    if (!donation) return;
    const next = afterDonation(askida, referenceItem(cafe), donation.donation);
    if (!next || (next.own === 0 && !next.match)) haptic("success");
    toast(donationToast(donation.donation), { tone: "success" });
    // Once per donation.
  }, [donation?.n]);

  if (!askida.enabled) return null;

  // Until the refetch lands the server still reports the pool as it was before the donation.
  const local =
    own && own.base.balancePeni === askida.balancePeni && own.base.itemsAvailable === askida.itemsAvailable ? own : null;
  const shown = {
    itemsAvailable: local ? local.itemsAvailable : askida.itemsAvailable,
    referenceItemName: askida.referenceItemName,
    claimsPerDay: askida.claimsPerDay,
    claimedLast7Days: askida.claimedLast7Days,
    donatedLast7DaysPeni: askida.donatedLast7DaysPeni + (local ? local.donatedPeni : 0),
  };
  const rail = askiRailProps(shown);
  const donors = donorLines(cafe, now);
  const ikram = ikramProductId ? cafe.menu.find((m) => m.productId === ikramProductId) : null;

  const give = () => (member ? cafeSheets.give(slug) : cafeSheets.join(slug, { then: "birak" }));

  return (
    <Card tone="aski">
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
          <HookGlyph size={20} color={t.askiInk} />
          <T variant="legend" color="askiInk" accessibilityRole="header">
            {askiCopy.legend}
          </T>
        </View>
        <PressableScale
          onPress={() => setExplain((v) => !v)}
          pressedColor={withAlpha(t.askiInk, 0.1)}
          accessibilityLabel={askiCopy.whatIs}
          accessibilityState={{ expanded: explain }}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, marginRight: -10, borderRadius: radius.control }}
        >
          <Icon icon={Info} size={20} color={t.ink} />
          <T variant="button">{askiCopy.whatIs}</T>
        </PressableScale>
      </View>

      {explain ? (
        <Animated.View
          entering={FadeIn.duration(durations.ui).reduceMotion(ReduceMotion.System)}
          style={{ marginTop: 8, borderRadius: radius.control, backgroundColor: t.surface, padding: 12 }}
        >
          <T variant="body">{askiCopy.explainer}</T>
        </Animated.View>
      ) : null}

      <AskiRail count={rail.count} item={rail.item} size="md" hangSignal={hangSignal} style={{ marginTop: 12 }} />
      <AskiCaption askida={shown} style={{ marginTop: 12 }} />

      <ButtonRow style={{ marginTop: 20 }}>
        <Button variant="aski" fullWidth title={askiCopy.take} haptic="tap" onPress={() => cafeSheets.take(slug)} />
        <Button variant="secondary" fullWidth title={askiCopy.give} onPress={give} />
      </ButtonRow>

      {ikram ? (
        <View accessibilityLiveRegion="polite" style={{ marginTop: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ paddingTop: 1 }}>
            <Icon icon={Check} size={16} color={t.ink2} />
          </View>
          <T variant="meta" style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.sansSemiBold }}>{ikram.name}</T>
            {" siparişine eklendi. Kasada ₺0 görünür."}
          </T>
        </View>
      ) : null}

      {donors.length > 0 ? (
        <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: withAlpha(t.askiInk, 0.2), gap: 8 }}>
          {donors.map((d) => (
            <T key={d.key} variant="meta" color="ink2">
              {/* "Ayşe K. 1 çay bıraktı · bugün": the name carries the weight, the rest is quiet. */}
              <T color="ink" style={{ fontFamily: fonts.sansSemiBold }}>
                {d.name}
              </T>
              {askiCopy.donorLine(d.name, d.what, d.day).slice(d.name.length)}
            </T>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
