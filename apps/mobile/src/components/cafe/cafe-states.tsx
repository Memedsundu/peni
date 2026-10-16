/**
 * The café screen before it has a café (design-system.md §9.3 "Page states", §10.2):
 *
 * - Loading: the screen draws the hero (in the colourway the link passed with `?hue=`, else a
 *   plain `surface2` plate, never a guessed colourway [G9]); below it, skeletons for the
 *   masthead lines, the segmented bar and 4 menu rows. Static, no shimmer.
 * - Not found: "Bu kafe masada yok." + "Kafelere dön".
 * - Network error on the first load: a danger banner ("Bağlantı kurulamadı.") + "Tekrar dene".
 */
import { errorCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { Coffee } from "lucide-react-native";
import { View } from "react-native";
import { Banner, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { space, useTokens } from "@/lib/theme";

export function CafeSkeleton() {
  const t = useTokens();
  return (
    <View accessibilityState={{ busy: true }} accessibilityLabel="Kafe yükleniyor" style={{ paddingHorizontal: space.gutter, paddingTop: 20 }}>
      {/* Masthead: Oxford rule, name, ink rule, dateline. */}
      <View aria-hidden style={{ height: 6, justifyContent: "space-between" }}>
        <View style={{ height: 3, backgroundColor: t.surface2 }} />
        <View style={{ height: 1, backgroundColor: t.surface2 }} />
      </View>
      <Skeleton width="72%" height={30} style={{ marginTop: 16 }} />
      <View aria-hidden style={{ height: 1, marginTop: 12, backgroundColor: t.surface2 }} />
      <Skeleton width="86%" line="plate" style={{ marginTop: 6 }} />
      {/* Meta and the membership row. */}
      <Skeleton width="58%" line="body" style={{ marginTop: 18 }} />
      <Skeleton width="80%" line="meta" />
      <Skeleton width={196} height={44} radius={10} style={{ marginTop: 16 }} />
      {/* Segmented. */}
      <View style={{ marginTop: 28, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-around", borderBottomWidth: 1, borderBottomColor: t.line }}>
        <Skeleton width={56} line="button" />
        <Skeleton width={44} line="button" />
        <Skeleton width={52} line="button" />
      </View>
      {/* 4 menu rows. */}
      <Skeleton width={72} line="legend" style={{ marginTop: 24, marginLeft: 4 }} />
      <Card padding="none" containerStyle={{ marginTop: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              minHeight: 72,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: space.rowH,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: t.line,
            }}
          >
            <View style={{ flex: 1 }}>
              <Skeleton width={i % 2 ? "42%" : "55%"} line="item" />
              <Skeleton width={i % 2 ? "64%" : "38%"} line="meta" />
            </View>
            <Skeleton width={44} height={44} radius="full" />
          </View>
        ))}
      </Card>
    </View>
  );
}

export function CafeNotFound() {
  return (
    <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: space.gutter, paddingBottom: 80 }}>
      <EmptyState
        icon={Coffee}
        text={errorCopy.cafeNotFound}
        action={{ label: errorCopy.cafeNotFoundAction, onPress: () => (router.canGoBack() ? router.back() : router.replace("/")) }}
      />
    </View>
  );
}

export function CafeLoadError({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <View style={{ paddingHorizontal: space.gutter, paddingTop: 20 }}>
      <Banner
        tone="danger"
        // The button says "Tekrar dene"; the sentence doesn't say it too (as on web).
        title={message.replace(/\s*Tekrar dene\.$/, "") || errorCopy.generic}
        action={<Button size="sm" variant="secondary" title={errorCopy.retry} loading={retrying} loadingLabel={errorCopy.retry} onPress={onRetry} />}
      />
    </View>
  );
}
