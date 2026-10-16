/**
 * CafeCard (design-system.md §9.1, §10.1): a raised card that is one link to the café.
 *
 * - The cover (16:7, the café's colourway and device, or its photo).
 * - Body, padding 16: the place legend ("KADIKÖY · İSTANBUL"), the name in `h3`, then up to four
 *   quiet lines 8pt apart:
 *   - members: a 16pt coin + "Sende **90 peni**" + " · ≈ 3 çay" [G1], or "Üyesin" with a check;
 *   - the askı: the small rail (6 hooks) + "Askıda 7 çay", or "Askı boş" over empty hooks. No coin;
 *   - the next Peni masası [G2], a vişne chip "PER 19:00 · Peni masası" (hidden without data);
 *   - "Sipariş alıyor" (success dot) or "Şu an sipariş almıyor" (`CirclePause`, warning).
 *
 * The whole card is the target. It is named by the café alone, and the lines are read as its
 * hint, so VoiceOver says "Moda Kahvesi, bağlantı" first and the details after. The press is a
 * gentler .99 (the A1 press at card size) with the body stepping to `surface2`, which is also
 * what reduced motion keeps.
 *
 * On iOS the card is wrapped in `Link.AppleZoom`, so it zooms into the café hero
 * (`Link.AppleZoomTarget` there). Android and the browser get a plain link.
 */
import type { CafeSummaryDTO } from "@peni/api";
import { askiCopy, peniCopy } from "@peni/brand/copy";
import { dateBlock, formatTime, goods, relDay, SEP } from "@peni/brand/format";
import { askiItemFor } from "@peni/brand/shapes";
import { Link } from "expo-router";
import { Check, CirclePause } from "lucide-react-native";
import { memo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Amount, AskiRail, CafeCover } from "@/components/brand";
import { Chip, Icon, PressableScale, Skeleton, StatusDot, T } from "@/components/ui";
import { elevation, fonts, radius, space, useTokens } from "@/lib/theme";

/** The card press: A1 at card size (a 358pt card at .97 would jump 11pt). */
const CARD_PRESS = 0.99;

export const CafeCard = memo(function CafeCard({ cafe }: { cafe: CafeSummaryDTO }) {
  const t = useTokens();
  const place = [cafe.district, cafe.city].filter(Boolean).join(SEP);
  // The askı reference item is the cheapest askı item; refItems[0] is that same item unless the
  // café picked other reference items (CafeSummaryDTO has no askı item name of its own). The
  // glyph and the caption always use the same name, so "7 çay" hangs glasses.
  const askiName = cafe.refItems[0]?.name ?? null;

  const card = (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={cafe.name}
      accessibilityHint={spokenDetails(cafe, askiName)}
      targetScale={CARD_PRESS}
      pressedColor={t.surface2}
      // Link's Slot takes one style object, not an array.
      style={StyleSheet.flatten([styles.card, { backgroundColor: t.surface }, elevation("raised", t)])}
    >
      <View style={styles.clip}>
        <CafeCover cafe={cafe} size="card" />
        <View style={styles.body}>
          {place ? (
            <T variant="legend" color="ink2" numberOfLines={1}>
              {place}
            </T>
          ) : null}
          <T variant="h3" accessibilityRole="none" style={styles.name}>
            {cafe.name}
          </T>

          <View style={styles.lines}>
            {cafe.isMember ? <MemberLine cafe={cafe} /> : null}

            <View style={styles.aski}>
              <AskiRail count={cafe.askidaItemsAvailable} item={askiItemFor(askiName)} size="sm" />
              <T variant="meta" style={styles.shrink}>
                {askiCopy.cardLine(cafe.askidaItemsAvailable, askiName)}
              </T>
            </View>

            {cafe.nextEvent ? <EventChip startsAt={cafe.nextEvent.startsAt} /> : null}

            <View style={styles.status}>
              {cafe.acceptingOrders ? (
                <Chip tone="success" icon={<StatusDot tone="success" />}>
                  Sipariş alıyor
                </Chip>
              ) : (
                <Chip tone="warning" icon={CirclePause}>
                  Şu an sipariş almıyor
                </Chip>
              )}
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );

  return (
    <Link href={{ pathname: "/kafe/[slug]", params: { slug: cafe.slug } }} asChild>
      {Platform.OS === "ios" ? <Link.AppleZoom>{card}</Link.AppleZoom> : card}
    </Link>
  );
});

/** "Sende **90 peni** · ≈ 3 çay" [G1], or "Üyesin" with a check while the balance is unknown. */
function MemberLine({ cafe }: { cafe: CafeSummaryDTO }) {
  const t = useTokens();
  if (cafe.balancePeni == null) {
    return (
      <View style={styles.member}>
        <Icon icon={Check} size={16} color={t.successInk} />
        <T variant="body">{peniCopy.member}</T>
      </View>
    );
  }
  return (
    <Amount
      size="sm"
      peni={cafe.balancePeni}
      refItems={cafe.refItems}
      cafe={{ name: cafe.name, district: cafe.district, city: cafe.city, slug: cafe.slug }}
      prefix={peniCopy.balance(0).before.trim()}
    />
  );
}

/**
 * The next Peni masası [G2]: "PER 19:00 · Peni masası" on the vişne soft fill, the day in the
 * date block's plate style. Within a week the weekday is enough; further out, "22 EKİ".
 * Masa colour sets only the chip, never a sentence (D1).
 */
function EventChip({ startsAt }: { startsAt: string }) {
  const t = useTokens();
  return (
    <View style={[styles.event, { backgroundColor: t.masaSoft }]}>
      <T variant="plate" color="masaInk">
        {eventDay(startsAt)}
      </T>
      <T variant="meta" color="masaInk" tabular style={styles.eventTime}>
        {formatTime(startsAt)}
      </T>
      <T variant="meta" color="masaInk" aria-hidden>
        ·
      </T>
      <T variant="meta" color="masaInk">
        Peni masası
      </T>
    </View>
  );
}

function eventDay(iso: string): string {
  const rel = relDay(iso);
  if (rel === "bugün") return "Bugün";
  if (rel === "yarın") return "Yarın";
  const d = dateBlock(iso);
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  return days < 6.5 ? d.weekday : `${d.day} ${d.month}`;
}

/** The lines as one sentence for the card's hint ("Sende 90 peni, yaklaşık 3 çay. Askıda 7 çay. …"). */
function spokenDetails(cafe: CafeSummaryDTO, askiName: string | null): string {
  const parts: string[] = [];
  if (cafe.isMember) {
    if (cafe.balancePeni == null) parts.push(peniCopy.member);
    else {
      const g = goods(cafe.balancePeni, cafe.refItems);
      const b = peniCopy.balance(cafe.balancePeni);
      parts.push(`${b.before}${b.amount}${g ? `, ${peniCopy.approxSr} ${g}` : ""}`);
    }
  }
  parts.push(askiCopy.cardLine(cafe.askidaItemsAvailable, askiName));
  if (cafe.nextEvent) {
    const rel = relDay(cafe.nextEvent.startsAt);
    parts.push(
      `${rel === "bugün" || rel === "yarın" ? rel : dateBlock(cafe.nextEvent.startsAt).short} ${formatTime(cafe.nextEvent.startsAt)}, Peni masası`,
    );
  }
  parts.push(cafe.acceptingOrders ? "Sipariş alıyor" : "Şu an sipariş almıyor");
  return parts.map((p) => p.charAt(0).toLocaleUpperCase("tr") + p.slice(1)).join(". ");
}

/* ------------------------------------------------------------------------------------------ */
/* Skeleton                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** Loading (§10.1): the card's final geometry — the 16:7 cover, the legend, name and first line, the chip. */
export function CafeCardSkeleton({ nameWidth = "62%" }: { nameWidth?: `${number}%` }) {
  const t = useTokens();
  return (
    <View aria-hidden style={[styles.card, { backgroundColor: t.surface }, elevation("raised", t)]}>
      <View style={styles.clip}>
        <View style={{ aspectRatio: 16 / 7, backgroundColor: t.surface2 }} />
        <View style={styles.body}>
          <Skeleton width="38%" line="legend" />
          <Skeleton width={nameWidth} line="h3" style={styles.name} />
          <View style={styles.lines}>
            <Skeleton width="52%" line="body" />
            <Skeleton width={112} height={24} style={styles.status} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card },
  // The raised border is 1pt, so the clip is 1pt tighter than the card.
  clip: { borderRadius: radius.card - 1, overflow: "hidden" },
  body: { padding: space.card, paddingBottom: space.card + 2 },
  name: { marginTop: 4 },
  lines: { marginTop: 14, gap: 8, alignItems: "flex-start" },
  member: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 22 },
  aski: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 28 },
  shrink: { flexShrink: 1 },
  event: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: radius.tag,
  },
  eventTime: { fontFamily: fonts.sansSemiBold },
  status: { paddingTop: 4 },
});
