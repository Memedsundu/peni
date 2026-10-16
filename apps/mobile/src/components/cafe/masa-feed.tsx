/**
 * Masa, the café's feed (design-system.md §9.3 "Masa", §10.2): h2 "Masa", the compact masthead
 * ("MODA KAHVESİ GAZETESİ · 16 EKİM 2026"), then the cards — pinned on top, newest first:
 * Günün sorusu, Peni masası and café posts. Each card reports where it sits, so "Bugün masada"
 * can scroll straight to it.
 */
import type { PostDTO } from "@peni/api";
import { masaCopy } from "@peni/brand/copy";
import { MessageCircle } from "lucide-react-native";
import { useRef, type ComponentRef } from "react";
import { View } from "react-native";
import { Masthead } from "@/components/brand";
import { EmptyState, T } from "@/components/ui";
import { useCafe } from "./cafe-context";
import { EventInvite } from "./masa-event";
import { feedOrder } from "./masa-model";
import { CafePost } from "./masa-post";
import { QuestionCard } from "./masa-question";

export function MasaFeed({
  onPostY,
  onPostNode,
}: {
  /** Each card's top inside the feed (from onLayout). */
  onPostY?: (postId: string, y: number) => void;
  /** Each card's view (react-native-web reads positions from the DOM instead). */
  onPostNode?: (postId: string, node: ComponentRef<typeof View> | null) => void;
}) {
  const { cafe, now } = useCafe();
  const posts = feedOrder(cafe.posts);
  const listY = useRef(0);
  const cardY = useRef(new Map<string, number>());

  const report = (id: string) => {
    const y = cardY.current.get(id);
    if (y != null) onPostY?.(id, listY.current + y);
  };
  // Zero-height layouts come from a hidden screen (web, under a sheet): keep the real ones.

  return (
    <View>
      <T variant="h2">{masaCopy.section}</T>
      <Masthead cafe={cafe} date={now} compact style={{ marginTop: 12 }} />

      {posts.length === 0 ? (
        <EmptyState icon={MessageCircle} text={masaCopy.empty} style={{ marginTop: 8 }} />
      ) : (
        <View
          style={{ marginTop: 24, gap: 16 }}
          onLayout={(e) => {
            if (e.nativeEvent.layout.height === 0) return;
            listY.current = e.nativeEvent.layout.y;
            for (const id of cardY.current.keys()) report(id);
          }}
        >
          {posts.map((post) => (
            <View
              key={post.id}
              ref={(node) => onPostNode?.(post.id, node)}
              onLayout={(e) => {
                if (e.nativeEvent.layout.height === 0) return;
                cardY.current.set(post.id, e.nativeEvent.layout.y);
                report(post.id);
              }}
            >
              <MasaItem post={post} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function MasaItem({ post }: { post: PostDTO }) {
  switch (post.kind) {
    case "question":
      return <QuestionCard post={post} />;
    case "event":
      return <EventInvite post={post} />;
    default:
      return <CafePost post={post} />;
  }
}
