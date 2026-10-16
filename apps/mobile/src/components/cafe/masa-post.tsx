/**
 * Café post (design-system.md §9.3): a raised card with a 3pt café-hue left edge.
 *
 * - Head: the 28pt café coin, the café name (`button`) and `relDay` (`meta`).
 * - The body.
 * - Footer: the heart (44pt, optimistic, filled ink when mine, count tabular, `tap` haptic) and
 *   "4 yorum", which opens the comments in place; members get the "Yorum yaz" field there.
 * - Non-members tapping the heart get "Kalp bırakmak için kafeye katıl." + "Katıl" (the web
 *   popover, as an inline note under the footer).
 */
import type { PostDTO } from "@peni/api";
import { masaCopy } from "@peni/brand/copy";
import { formatNumber, relDay } from "@peni/brand/format";
import { Heart, MessageCircle } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { CafeHueBand, Coin } from "@/components/brand";
import { Card, Icon, PressableScale, T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { radius, useTokens } from "@/lib/theme";
import { useCafe } from "./cafe-context";
import { newestFirst, toggledHeart, whenLabel } from "./masa-model";
import { CommentForm, JoinNote, usePostToggle } from "./masa-shared";

export function CafePost({ post }: { post: PostDTO }) {
  const t = useTokens();
  const { api } = useSession();
  const { cafe, slug, member, now } = useCafe();
  const [open, setOpen] = useState(false);
  const [joinNote, setJoinNote] = useState(false);
  const { shown, act } = usePostToggle({ reactedByMe: post.reactedByMe, reactionCount: post.reactionCount });
  const comments = newestFirst(post.comments);
  const count = Math.max(post.commentCount, comments.length);

  const heart = () => {
    haptic("tap");
    if (!member) {
      setJoinNote((v) => !v);
      return;
    }
    void act(toggledHeart(shown), () => api.cafes.react(slug, post.id));
  };

  return (
    <Card padding="none" style={{ flexDirection: "row" }}>
      <CafeHueBand slug={cafe.slug} hue={cafe.hue} size={3} orientation="vertical" />
      <View style={{ flex: 1, minWidth: 0, padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Coin size={28} cafe={cafe} />
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8 }}>
            <T variant="button">{cafe.name}</T>
            <T variant="meta" color="ink2">
              {relDay(post.publishedAt, now)}
            </T>
          </View>
        </View>

        <T variant="body" style={{ marginTop: 12 }}>
          {post.body}
        </T>

        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 8, marginLeft: -12, marginBottom: -8 }}>
          <PressableScale
            onPress={heart}
            pressedColor={t.surface2}
            accessibilityRole={member ? "togglebutton" : "button"}
            accessibilityLabel={shown.reactionCount > 0 ? `Kalp, ${formatNumber(shown.reactionCount)}` : "Kalp"}
            accessibilityState={member ? { checked: shown.reactedByMe } : { expanded: joinNote }}
            style={footerButton}
          >
            <Icon icon={Heart} size={20} color={t.ink} fill={shown.reactedByMe ? t.ink : undefined} />
            {shown.reactionCount > 0 ? (
              <T variant="button" tabular>
                {formatNumber(shown.reactionCount)}
              </T>
            ) : null}
          </PressableScale>
          {count > 0 || member ? (
            <PressableScale
              onPress={() => setOpen((v) => !v)}
              pressedColor={t.surface2}
              accessibilityLabel={count > 0 ? masaCopy.comments(count) : masaCopy.commentLabel}
              accessibilityState={{ expanded: open }}
              style={footerButton}
            >
              <Icon icon={MessageCircle} size={20} color={t.ink} />
              <T variant="button" tabular>
                {count > 0 ? masaCopy.comments(count) : masaCopy.commentLabel}
              </T>
            </PressableScale>
          ) : null}
        </View>

        {joinNote && !member ? <JoinNote text={masaCopy.heartJoin} style={{ marginTop: 16 }} /> : null}

        {open ? (
          <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: t.line }}>
            {comments.map((c, i) => (
              <View key={c.id} style={{ paddingVertical: 12, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: t.line }}>
                <T variant="meta" color="ink2" tabular>
                  {`${c.authorName} · ${whenLabel(c.createdAt, now)}`}
                </T>
                <T variant="body" style={{ marginTop: 4 }}>
                  {c.body}
                </T>
              </View>
            ))}
            {member ? (
              <CommentForm
                postId={post.id}
                label={masaCopy.commentLabel}
                autoFocus={comments.length === 0}
                style={comments.length > 0 ? { borderTopWidth: 1, borderTopColor: t.line, paddingTop: 16 } : { paddingTop: 12 }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const footerButton = {
  minHeight: 44,
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 12,
  borderRadius: radius.control,
} as const;
