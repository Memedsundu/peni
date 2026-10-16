/**
 * The top of the café screen under the masthead (design-system.md §9.3 items 3–5, §10.2):
 * the meta lines, the membership row and the "Bugün masada" strip.
 */
import type { CafeDetailDTO, PostDTO } from "@peni/api";
import { actionCopy, masaCopy, peniCopy } from "@peni/brand/copy";
import { formatTime, SEP } from "@peni/brand/format";
import { router } from "expo-router";
import { ArrowDown, Gift, MapPin } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Amount, DateBlock } from "@/components/brand";
import { Button, Icon, PressableScale, T, withAlpha } from "@/components/ui";
import { useSession } from "@/lib/session";
import { radius, useTokens } from "@/lib/theme";
import { cafeSheets } from "./cafe-context";
import { putCafe, messageOf, setPendingJoin } from "./cafe-store";
import { eventTopic, todaysQuestion, upcomingEvent } from "./masa-model";
import { InlineError } from "./sheet";

/** "Moda Cd. No: 42 · Kadıköy" with `MapPin`, then "Her harcamada %5 peni · 1 peni = ₺1, yalnız bu kafede". */
export function CafeMeta({ cafe }: { cafe: CafeDetailDTO }) {
  const t = useTokens();
  const place = [cafe.address, cafe.district].filter(Boolean).join(SEP);
  return (
    <View style={{ gap: 4 }}>
      {place ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <View style={{ paddingTop: 3 }}>
            <Icon icon={MapPin} size={16} color={t.ink2} />
          </View>
          <T variant="body" style={{ flex: 1 }}>
            {place}
          </T>
        </View>
      ) : null}
      <T variant="meta" color="ink2">
        {peniCopy.earnRule(cafe.earnRatePercent)}
      </T>
    </View>
  );
}

/** "Günaydın Ayşe." for members; nothing for everyone else. */
export function memberGreeting(member: boolean, hello: string, firstName: string | null): string | null {
  if (!member) return null;
  return firstName ? `${hello} ${firstName}.` : `${hello}.`;
}

const JOIN_META = "Üyelik ücretsiz. Sipariş verir, her harcamada peni biriktirirsin.";

/**
 * Membership row (§9.3 item 4).
 * - Member: a `peniSoft` chip "Sende **90 peni** · ≈ 3 çay", and a quiet "Bir çay ısmarla" that
 *   opens the gift sheet with this café chosen first (D14).
 * - Non-member: primary "Kafeye katıl" + the free-membership line.
 * - Signed out: primary "Giriş yap ve katıl"; back from the sign-in modal, the screen finishes
 *   the join.
 */
export function MembershipRow({ cafe, signedIn }: { cafe: CafeDetailDTO; signedIn: boolean }) {
  const t = useTokens();
  const { api } = useSession();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // On its own line the quiet button's icon starts on the content edge, like everything above.
  const [giftWrapped, setGiftWrapped] = useState(false);

  if (cafe.membership) {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4, rowGap: 4 }}>
        <View
          style={{
            minHeight: 44,
            justifyContent: "center",
            borderRadius: radius.control,
            backgroundColor: t.peniSoft,
            paddingHorizontal: 12,
            paddingVertical: 8,
            flexShrink: 1,
          }}
        >
          <Amount size="sm" peni={cafe.membership.balancePeni} refItems={cafe.refItems} cafe={cafe} prefix={peniCopy.balance(0).before} />
        </View>
        <View onLayout={(e) => setGiftWrapped(e.nativeEvent.layout.y > 8)} style={{ marginLeft: giftWrapped ? -12 : 0 }}>
          <Button variant="quiet" icon={Gift} title="Bir çay ısmarla" onPress={() => cafeSheets.gift(cafe.slug)} />
        </View>
      </View>
    );
  }

  if (!signedIn) {
    return (
      <View style={{ alignItems: "flex-start", gap: 8 }}>
        <Button
          title={actionCopy.signInAndJoin}
          onPress={() => {
            setPendingJoin(cafe.slug);
            router.push("/giris");
          }}
        />
        <T variant="meta" color="ink2">
          {JOIN_META}
        </T>
      </View>
    );
  }

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      putCafe(cafe.slug, await api.cafes.join(cafe.slug));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={{ alignItems: "flex-start", gap: 8 }}>
      <Button title={actionCopy.join} loading={joining} loadingLabel={actionCopy.join} onPress={() => void join()} />
      {error ? <InlineError message={error} /> : <T variant="meta" color="ink2">{JOIN_META}</T>}
    </View>
  );
}

/**
 * "Bugün masada" (§9.3 item 5): a `masaSoft` strip, radius 10, padding 12, with up to two rows
 * that scroll to the card in Masa. Only when there is an upcoming Peni masası or a question
 * today.
 */
export function TodayStrip({ cafe, now, onGo }: { cafe: CafeDetailDTO; now: Date; onGo: (post: PostDTO) => void }) {
  const t = useTokens();
  const event = upcomingEvent(cafe.posts, now);
  const question = todaysQuestion(cafe.posts, now);
  if (!event && !question) return null;

  return (
    <View style={{ borderRadius: radius.control, backgroundColor: t.masaSoft, padding: 12 }}>
      <T variant="legend" color="masaInk" accessibilityRole="header" style={{ paddingHorizontal: 4 }}>
        {masaCopy.todayLegend}
      </T>
      <View style={{ marginTop: 6 }}>
        {event ? (
          <StripRow onPress={() => onGo(event)} label={`Peni masası, ${formatTime(event.eventStartsAt!)}: ${eventTopic(event)}`}>
            <DateBlock date={event.eventStartsAt!} size="sm" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T variant="meta" color="ink2" tabular>
                {`Peni masası${SEP}${formatTime(event.eventStartsAt!)}`}
              </T>
              <T variant="item" numberOfLines={2}>
                {eventTopic(event)}
              </T>
            </View>
          </StripRow>
        ) : null}
        {event && question ? <View style={{ height: 1, marginHorizontal: 4, backgroundColor: withAlpha(t.masaInk, 0.15) }} /> : null}
        {question ? (
          <StripRow onPress={() => onGo(question)} label={`Günün sorusu: ${question.body}`}>
            <T variant="question" numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 17, lineHeight: 24 }}>
              {question.body}
            </T>
          </StripRow>
        ) : null}
      </View>
    </View>
  );
}

function StripRow({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  const t = useTokens();
  return (
    <PressableScale
      onPress={onPress}
      targetScale={1}
      pressedColor={withAlpha(t.masaInk, 0.08)}
      accessibilityLabel={label}
      accessibilityHint="Masa bölümüne gider"
      style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 8 }}
    >
      {children}
      <Icon icon={ArrowDown} size={20} color={t.masaInk} />
    </PressableScale>
  );
}
