/**
 * Tezgâh (design-system.md §10.10, with §9.10 for the anatomy and the copy).
 *
 *   ▓ Moda Kahvesi                                   large title, press
 *   ▓ 17:50                 [● Uygulama siparişleri: Açık ⌄]   → durdur sheet
 *   ━ café band
 *   [banners: error · paused "· 12 dk kaldı" + Şimdi aç · Ses kapalı + Sesi aç]
 *   Yeni (2) · Hazırlanıyor (1) · Hazır (0)          sticky Segmented
 *   StaffTicket … (one column, 56pt actions)
 *
 * - The board is polled every 4s by the staff tab layout (new orders ring and badge from any
 *   tab); this screen draws it. Pull to refresh reloads at once.
 * - Bumps are deferred commits with a 5s "Geri al" toast (A12: the ticket leaves its column at
 *   once; the ones under it slide up; taps wait until it has settled). Reject opens `reddet`.
 * - The screen stays awake while this tab is focused.
 * - Loading: skeleton tickets. Errors: a danger Banner with "Tekrar dene"; the last board stays.
 */
import type { OrderDTO } from "@peni/api";
import { errorCopy, staffCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { CirclePause, VolumeX } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition, ReduceMotion } from "react-native-reanimated";
import {
  BoardErrorBanner,
  boardColumns,
  bumpOrder,
  COLUMN_KEY,
  KeepAwakeWhileFocused,
  loadBoard,
  pausedBannerText,
  setPause,
  StaffGate,
  StaffScreen,
  StaffTicket,
  StaffTicketSkeleton,
  TezgahStrip,
  useBoard,
  useCafeHue,
  useNow,
  useSettling,
  type BoardColumn,
  type BumpAction,
} from "@/components/staff";
import { Banner, Button, Segmented, T, toast } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { durations } from "@/lib/motion";
import { useSession } from "@/lib/session";
import { useRememberedCafeName, useStaffSound } from "@/lib/staff-prefs";
import { radius, useTokens } from "@/lib/theme";

const LABEL: Record<BoardColumn, string> = {
  submitted: staffCopy.columns.new,
  accepted: staffCopy.columns.accepted,
  ready: staffCopy.columns.ready,
};

/**
 * "Yeni sipariş yok. Gelince ses çalar." promises a chime; with "Ses" off (the banner above says
 * so) the column only says what is true: "Yeni sipariş yok."
 */
function emptyText(column: BoardColumn, soundOn: boolean): string {
  const text = staffCopy.columnEmpty[COLUMN_KEY[column]];
  if (column !== "submitted" || soundOn) return text;
  return text.slice(0, text.indexOf(".") + 1);
}

const ticketMotion = {
  layout: LinearTransition.duration(durations.move).reduceMotion(ReduceMotion.System),
  entering: FadeIn.duration(durations.ui).reduceMotion(ReduceMotion.System),
  exiting: FadeOut.duration(durations.reduced).reduceMotion(ReduceMotion.System),
};

export default function Tezgah() {
  const t = useTokens();
  const { api, staffKey } = useSession();
  const board = useBoard();
  const { slug, data, error, loading, unauthorized, overrides, arrivals } = board;
  const [column, setColumn] = useState<BoardColumn>("submitted");
  const now = useNow();
  const settling = useSettling(board.movedAt);
  const [soundOn, setSoundOn] = useStaffSound();
  const [resuming, setResuming] = useState(false);
  const hue = useCafeHue(slug);

  const cols = useMemo(() => (data ? boardColumns(data.orders, overrides) : null), [data, overrides]);

  const refresh = useCallback(async () => {
    if (slug) await loadBoard(api, slug);
  }, [api, slug]);

  const onBump = useCallback(
    (order: OrderDTO, action: BumpAction) => {
      if (slug) bumpOrder(api, slug, order, action);
    },
    [api, slug],
  );
  const onReject = useCallback((order: OrderDTO) => {
    router.push({ pathname: "/reddet", params: { id: order.id } });
  }, []);

  const resumeNow = async () => {
    if (!slug || resuming) return;
    setResuming(true);
    try {
      await setPause(api, slug, null);
      haptic("confirm");
    } catch {
      haptic("error");
      toast(errorCopy.change, { tone: "danger" });
    } finally {
      setResuming(false);
    }
  };

  const remembered = useRememberedCafeName(slug);
  const title = data?.cafe.name ?? remembered ?? staffCopy.sections.tezgah;

  if (!staffKey || !slug || unauthorized) {
    return (
      <StaffScreen title={staffCopy.sections.tezgah}>
        <StaffGate rejected={unauthorized} />
      </StaffScreen>
    );
  }

  const paused = data?.cafe.appOrderingPaused ?? null;
  const banners = (
    <>
      {error ? <BoardErrorBanner what={staffCopy.sections.tezgah} stale={data != null} onRetry={refresh} /> : null}
      {data && paused ? (
        <Banner
          tone="warning"
          icon={CirclePause}
          title={pausedBannerText(data.cafe.pausedUntil, Math.max(now, Date.now()))}
          action={
            <Button title={staffCopy.resume} size="sm" loading={resuming} loadingLabel={staffCopy.resume} onPress={() => void resumeNow()} />
          }
        />
      ) : null}
      {!soundOn ? (
        <Banner
          tone="warning"
          icon={VolumeX}
          title={staffCopy.soundOffBanner}
          action={<Button title={staffCopy.soundOffAction} variant="secondary" size="sm" onPress={() => setSoundOn(true)} />}
        />
      ) : null}
    </>
  );
  const hasBanners = !!error || !!(data && paused) || !soundOn;

  const orders = cols?.[column] ?? [];
  const items = (["submitted", "accepted", "ready"] as const).map((id) => ({
    id,
    label: LABEL[id],
    count: cols ? cols[id].length : undefined,
  }));

  return (
    <StaffScreen
      title={title}
      slug={slug}
      strip={<TezgahStrip paused={paused} />}
      top={hasBanners ? banners : undefined}
      sticky={
        !data && !loading ? undefined : (
          <Segmented
            id="tezgah"
            label={staffCopy.sections.tezgah}
            items={items}
            value={column}
            onChange={(id) => setColumn(id as BoardColumn)}
            style={styles.segmented}
          />
        )
      }
      onRefresh={refresh}
      busy={loading && !data}
      bodyPointerEvents={settling ? "none" : "auto"}
    >
      <KeepAwakeWhileFocused />
      {!cols ? (
        loading ? (
          <View style={styles.list}>
            <StaffTicketSkeleton />
            <StaffTicketSkeleton />
          </View>
        ) : null
      ) : (
        <LayoutAnimationConfig key={column} skipEntering skipExiting>
          {orders.length === 0 ? (
            <Animated.View entering={ticketMotion.entering} style={[styles.empty, { backgroundColor: t.surface2 }]}>
              <T variant="meta" color="ink2" align="center">
                {emptyText(column, soundOn)}
              </T>
            </Animated.View>
          ) : null}
          <View style={styles.list}>
            {orders.map((order) => (
              <Animated.View key={order.id} {...ticketMotion}>
                <StaffTicket
                  order={order}
                  slug={slug}
                  hue={hue}
                  posKind={data!.cafe.posKind}
                  now={now}
                  arrivedAt={arrivals.get(order.id)}
                  onBump={onBump}
                  onReject={onReject}
                />
              </Animated.View>
            ))}
          </View>
        </LayoutAnimationConfig>
      )}
    </StaffScreen>
  );
}

const styles = StyleSheet.create({
  segmented: { marginTop: 4 },
  list: { gap: 16 },
  empty: {
    height: 120,
    borderRadius: radius.card,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
