/**
 * Günün sorusu (design-system.md §9.3): a flat `masaSoft` card, radius 14, padding 16.
 *
 * - Legend "GÜNÜN SORUSU" (`masaInk`) and the time; the question in `question` italic.
 * - The three newest answers as notes on `surface`: "Ayşe K. · 09:12" and the body. A quiet
 *   "12 cevabın hepsini gör" opens the rest in place.
 * - Members: "Sen de cevapla" reveals the "Cevabın" field + "Gönder"; once they have answered
 *   today: "Bugünkü cevabın masada." [G13]. Non-members: "Cevap yazmak için kafeye katıl."
 */
import type { PostDTO } from "@peni/api";
import { masaCopy } from "@peni/brand/copy";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Icon, T } from "@/components/ui";
import { radius, useTokens } from "@/lib/theme";
import { useCafe } from "./cafe-context";
import { ANSWERS_SHOWN, newestFirst, whenLabel } from "./masa-model";
import { CommentForm, JoinNote } from "./masa-shared";

export function QuestionCard({ post }: { post: PostDTO }) {
  const t = useTokens();
  const { member, now } = useCafe();
  const [allOpen, setAllOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  // The server says so on the next read [G13]; this covers the moment in between.
  const [justAnswered, setJustAnswered] = useState(false);
  const answered = post.answeredTodayByMe || justAnswered;

  const answers = newestFirst(post.comments);
  const shown = allOpen ? answers : answers.slice(0, ANSWERS_SHOWN);
  const more = answers.length > ANSWERS_SHOWN;

  return (
    <Card tone="masa">
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <T variant="legend" color="masaInk">
          {masaCopy.questionLegend}
        </T>
        <T variant="meta" color="ink2" tabular>
          {whenLabel(post.publishedAt, now)}
        </T>
      </View>

      <T variant="question" accessibilityRole="header" style={{ marginTop: 12 }}>
        {post.body}
      </T>

      {answers.length > 0 ? (
        <View style={{ marginTop: 16, gap: 8 }} accessibilityLabel="Cevaplar">
          {shown.map((a) => (
            <View key={a.id} style={{ borderRadius: radius.control, backgroundColor: t.surface, paddingHorizontal: 14, paddingVertical: 12 }}>
              <T variant="meta" color="ink2" tabular>
                {`${a.authorName} · ${whenLabel(a.createdAt, now)}`}
              </T>
              <T variant="body" style={{ marginTop: 4 }}>
                {a.body}
              </T>
            </View>
          ))}
          {more ? (
            <Button
              variant="quiet"
              size="sm"
              title={allOpen ? "Daha az göster" : masaCopy.allAnswers(answers.length)}
              accessibilityHint={allOpen ? undefined : "Cevapların hepsi burada açılır"}
              onPress={() => setAllOpen((v) => !v)}
              style={{ alignSelf: "flex-start", marginLeft: -12 }}
            />
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: answers.length > 0 && !more ? 16 : more ? 4 : 20 }}>
        {!member ? (
          <JoinNote bare text={masaCopy.answerJoin} />
        ) : answered ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
            <Icon icon={Check} size={20} color={t.masaInk} />
            <T variant="body">{masaCopy.answered}</T>
          </View>
        ) : composing ? (
          <CommentForm
            postId={post.id}
            label={masaCopy.answerLabel}
            autoFocus
            onSent={() => {
              setComposing(false);
              setJustAnswered(true);
            }}
            onCancel={() => setComposing(false)}
          />
        ) : (
          <Button variant="secondary" title={masaCopy.answer} onPress={() => setComposing(true)} style={{ alignSelf: "flex-start" }} />
        )}
      </View>
    </Card>
  );
}
