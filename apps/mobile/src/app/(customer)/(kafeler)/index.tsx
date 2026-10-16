/**
 * Kafeler (design-system.md §10.1, with §9.1 for anatomy and copy): the first tab, "/".
 *
 * - The large title "Kafeler" (native on iOS; in the content elsewhere, see `TabScreen`).
 * - Signed out: the slim strip "Kafeye katıl, peni biriktir." + "Giriş yap" (the `giris` modal).
 * - The CafeCards, 16pt apart. Each is a link to `kafe/[slug]` (with the iOS zoom).
 * - Loading: two skeleton cards. Empty: "Yakında burada mahallenin kafeleri olacak." Error:
 *   the danger banner "Kafeler yüklenemedi." + "Tekrar dene" — at the top, and over the list
 *   when a refresh fails, never in place of it.
 *
 * Reloads when the tab comes into focus (balances move after an order) and on pull to refresh.
 */
import { errorCopy } from "@peni/brand/copy";
import { Store } from "lucide-react-native";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CafeCard, CafeCardSkeleton } from "@/components/home/cafe-card";
import { SignedOutStrip } from "@/components/home/signed-out-strip";
import { TabScreen } from "@/components/home/tab-screen";
import { Banner, Button, EmptyState } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";

const EMPTY = "Yakında burada mahallenin kafeleri olacak.";

export default function Kafeler() {
  const { api, signedIn } = useSession();
  const { data, error, refresh } = useLoad(useCallback(() => api.cafes.list(), [api]));
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  };

  const cafes = data?.cafes ?? null;
  const loading = cafes == null && error == null;

  return (
    <TabScreen
      title="Kafeler"
      onRefresh={refresh}
      busy={loading}
      gap={16}
      centered={cafes?.length === 0 && !error}
      top={signedIn ? null : <SignedOutStrip />}
    >
      {error ? (
        <Banner
          tone="danger"
          title={errorCopy.cafesLoad}
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
        />
      ) : null}

      {loading ? (
        <View style={styles.list}>
          <CafeCardSkeleton />
          <CafeCardSkeleton nameWidth="78%" />
        </View>
      ) : null}

      {cafes && cafes.length > 0 ? (
        <View style={styles.list}>
          {cafes.map((cafe) => (
            <CafeCard key={cafe.id} cafe={cafe} />
          ))}
        </View>
      ) : null}

      {cafes && cafes.length === 0 ? <EmptyState icon={Store} text={EMPTY} /> : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 16 },
});
