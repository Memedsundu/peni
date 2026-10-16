/**
 * Peni masası (design-system.md §9.3, §10.2, §6.5, A14): a raised card with no fiş scallop.
 *
 * - Head: md `DateBlock`; beside it "PENİ MASASI" (`masaInk`), the mobile date line
 *   "22 Eki Per · 19:00" (§10.2), and the topic in `h3` [G4; until a title exists, the body's
 *   first line].
 * - The body, the long table and its seats line ("6/14 yer dolu · sen de geliyorsun").
 * - "Geliyorum" (primary) takes a seat at once (A14 and its `tap` haptic play inside
 *   `LongTable`); then "Geliyorsun" (secondary, `Check`) gives it back with no confirm.
 *   "Takvime ekle" opens the café's .ics with `Linking` [G22]; "Paylaş", a quiet `Share2`
 *   IconButton (§9.3), is the system share sheet (`Share.share`). On the web preview without
 *   `navigator.share` it copies the link instead: "Bağlantı kopyalandı." (as on web).
 * - Full: "Geliyorum" is disabled with the reason "Masa doldu". Past: a "GEÇTİ" tag, no actions.
 */
import type { PostDTO } from "@peni/api";
import { errorCopy, masaCopy } from "@peni/brand/copy";
import { dateBlock, formatNumber, formatTime, SEP } from "@peni/brand/format";
import { CalendarPlus, Check, Share2 } from "lucide-react-native";
import { Linking, Platform, Share, View } from "react-native";
import { DateBlock, LongTable } from "@/components/brand";
import { Button, Card, Chip, IconButton, T, toast } from "@/components/ui";
import { API_URL, useSession } from "@/lib/session";
import { cafeSheets, useCafe } from "./cafe-context";
import { eventBody, eventIsFull, eventIsPast, eventTopic, toggledRsvp } from "./masa-model";
import { usePostToggle } from "./masa-shared";

/** What the share fallback needs from the browser (react-native-web only). */
type WebNavigator = { share?: unknown; clipboard?: { writeText: (text: string) => Promise<void> } };

/** The café's web page, scrolled to this card: what "Paylaş" hands out. */
export function postUrl(slug: string, postId: string): string {
  return `${API_URL.replace(/\/$/, "")}/k/${encodeURIComponent(slug)}#post-${encodeURIComponent(postId)}`;
}

export function EventInvite({ post }: { post: PostDTO }) {
  const { api } = useSession();
  const { cafe, slug, member, now } = useCafe();
  const { shown, act } = usePostToggle({ rsvpedByMe: post.rsvpedByMe, rsvpCount: post.rsvpCount });

  if (!post.eventStartsAt) return null;
  const startsAt = post.eventStartsAt;
  const topic = eventTopic(post);
  const body = eventBody(post);
  const past = eventIsPast(post, now);
  const full = eventIsFull({ eventCapacity: post.eventCapacity, rsvpCount: shown.rsvpCount });
  const capacity = post.eventCapacity;
  const when = `${dateBlock(startsAt).short}${SEP}${formatTime(startsAt)}`;

  // Taking a seat is for members: everyone else is offered the join sheet first.
  const toggle = () => (member ? void act(toggledRsvp(shown), () => api.cafes.rsvp(slug, post.id)) : cafeSheets.join(slug));

  const share = async () => {
    const url = postUrl(slug, post.id);
    const message = `${topic}\n${cafe.name}${SEP}Peni masası${SEP}${when}\n${url}`;
    // react-native-web's Share needs `navigator.share`; without it, copy the link (web §9.3).
    const nav = Platform.OS === "web" ? (globalThis as { navigator?: WebNavigator }).navigator : undefined;
    if (Platform.OS === "web" && !nav?.share) {
      try {
        if (!nav?.clipboard) throw new Error("no clipboard");
        await nav.clipboard.writeText(url);
        toast(masaCopy.linkCopied);
      } catch {
        toast(errorCopy.generic, { tone: "danger" });
      }
      return;
    }
    try {
      await Share.share({ message, url, title: topic });
    } catch (e) {
      // Closing the share sheet is not an error.
      if ((e as { name?: string } | null)?.name === "AbortError") return;
      toast(errorCopy.generic, { tone: "danger" });
    }
  };

  const calendar = async () => {
    try {
      await Linking.openURL(api.cafes.icsUrl(slug, post.id));
    } catch {
      toast(errorCopy.generic, { tone: "danger" });
    }
  };

  // The table's own line, except when it is full and I'm not at it: then the disabled
  // "Geliyorum" carries "Masa doldu" as its reason, and the line isn't printed twice.
  const blockedByFull = full && !shown.rsvpedByMe && !past;

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
        <DateBlock date={startsAt} size="md" />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 22 }}>
            <T variant="legend" color="masaInk" style={{ flexShrink: 1 }}>
              {masaCopy.eventLegend}
            </T>
            {past ? (
              <Chip kind="tag" style={{ marginLeft: "auto" }}>
                {masaCopy.past}
              </Chip>
            ) : null}
          </View>
          <T variant="meta" color="ink2" tabular>
            {when}
          </T>
        </View>
      </View>

      <T variant="h3" style={{ marginTop: 14 }}>
        {topic}
      </T>
      {body ? (
        <T variant="body" style={{ marginTop: 8 }}>
          {body}
        </T>
      ) : null}

      <View style={{ marginTop: 18 }}>
        {capacity != null && capacity > 0 ? (
          <>
            {/* The table sits centred in the card; its line stays left with the text. */}
            <View style={{ alignItems: "center" }}>
              <LongTable capacity={capacity} seats={post.attendees} count={shown.rsvpCount} rsvpedByMe={shown.rsvpedByMe} caption={false} />
            </View>
            {!blockedByFull && !past ? (
              <T variant="meta" tabular style={{ marginTop: 8 }}>
                {masaCopy.seats(shown.rsvpCount, capacity, shown.rsvpedByMe)}
              </T>
            ) : null}
          </>
        ) : !past ? (
          <T variant="meta" tabular>
            {`${formatNumber(shown.rsvpCount)} kişi geliyor${shown.rsvpedByMe ? `${SEP}sen de geliyorsun` : ""}`}
          </T>
        ) : null}
        {/* Over: the table as it was, in the past tense. */}
        {past && shown.rsvpCount > 0 ? (
          <T variant="meta" tabular style={{ marginTop: 8 }}>
            {capacity
              ? `${formatNumber(shown.rsvpCount)}/${formatNumber(capacity)} yer doluydu`
              : `${formatNumber(shown.rsvpCount)} kişi geldi`}
          </T>
        ) : null}
      </View>

      {!past ? (
        <View style={{ marginTop: 16, gap: 8 }}>
          {shown.rsvpedByMe ? (
            <Button
              variant="secondary"
              icon={Check}
              title={masaCopy.rsvped}
              fullWidth
              accessibilityHint="Dokununca yerini bırakırsın"
              onPress={toggle}
            />
          ) : (
            <Button
              title={masaCopy.rsvp}
              fullWidth
              disabled={blockedByFull}
              disabledReason={blockedByFull ? masaCopy.full : undefined}
              onPress={toggle}
            />
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              variant="secondary"
              icon={CalendarPlus}
              title={masaCopy.addToCalendar}
              onPress={() => void calendar()}
              style={{ flex: 1 }}
            />
            <IconButton variant="quiet" size={48} icon={Share2} label={masaCopy.share} onPress={() => void share()} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
