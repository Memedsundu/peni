/**
 * Peni kodum (design-system.md §10.6, with §9.6 for anatomy and copy, [G7b]): a
 * fullScreenModal the barista scans at the till.
 *
 *   Peni kodum                                   [×]
 *        [Moda Kahvesi] [Kuzguncuk Kıraathanesi]     café chips, with more than one membership
 *                    (96pt coin)
 *        ┌───────────────────────────┐
 *        │  MODA KAHVESİ · KADIKÖY    │             a white pass in both themes (scanners
 *        │        [ QR code ]         │             need dark on light): uqr, ecc M, quiet
 *        │        FDY-2GG             │             zone 4; the code in Brygada 600 40,
 *        └───────────────────────────┘             tabular, tracked .08em
 *        Kasada bu kodu göster, peni kazan.
 *        [ Kapat ]
 *
 * The coin sits over the pass's top edge like a seal: the café's own coin, or the generic one
 * while nothing is chosen. `expo-brightness` turns the screen up to 1 while this is in focus
 * and puts the previous value back on blur or unmount (a no-op in the browser). The chosen café
 * is remembered on this phone; `?kafe=moda` opens on that café.
 */
import type { WalletCafeDTO } from "@peni/api";
import { actionCopy, errorCopy, peniCopy } from "@peni/brand/copy";
import { coinLegend } from "@peni/brand/format";
import { light } from "@peni/brand/tokens";
import * as Brightness from "expo-brightness";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { CircleAlert, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Coin } from "@/components/brand";
import { Button, Chip, ChipGroup, Icon, IconButton, Skeleton, T } from "@/components/ui";
import { QrCode } from "@/components/wallet/qr-code";
import { koduCopy } from "@/components/wallet/wallet-model";
import { loadWallet, resetWallet, useWalletEntry } from "@/components/wallet/wallet-store";
import { durations } from "@/lib/motion";
import { storage } from "@/lib/storage";
import { useSession } from "@/lib/session";
import { fonts, isDark, radius, space, useTokens } from "@/lib/theme";

const LAST_KEY = "peni.koduCafe";
const QR_SIZE = 232;
const COIN = 96;
const passIn = FadeIn.duration(durations.ui).reduceMotion(ReduceMotion.System);

/** Full brightness while the code is on screen; the previous level comes back on blur. */
function useFullBrightness() {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") return;
      let cancelled = false;
      let previous: number | null = null;
      (async () => {
        try {
          if (!(await Brightness.isAvailableAsync())) return;
          const level = await Brightness.getBrightnessAsync();
          if (cancelled) return;
          previous = level;
          await Brightness.setBrightnessAsync(1);
        } catch {
          // No brightness control: the code still shows.
        }
      })();
      return () => {
        cancelled = true;
        if (previous != null) Brightness.setBrightnessAsync(previous).catch(() => {});
      };
    }, []),
  );
}

export default function PeniKodum() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const { kafe } = useLocalSearchParams<{ kafe?: string }>();
  const { api, ready, signedIn } = useSession();
  const { wallet, status, error, cities } = useWalletEntry();
  const [selected, setSelected] = useState<string | null>(kafe ?? null);
  const [retrying, setRetrying] = useState(false);

  useFullBrightness();

  useEffect(() => {
    if (!ready) return;
    if (!signedIn) resetWallet();
    else void loadWallet(api);
  }, [api, ready, signedIn]);

  // The café shown last time, unless the link names one.
  useEffect(() => {
    if (kafe) return;
    let alive = true;
    storage
      .get(LAST_KEY)
      .then((slug) => {
        if (alive && slug) setSelected((s) => s ?? slug);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kafe]);

  const choose = (slug: string) => {
    setSelected(slug);
    storage.set(LAST_KEY, slug).catch(() => {});
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/cuzdan");
  };

  const cafes = wallet?.cafes ?? [];
  const current: WalletCafeDTO | null = cafes.find((c) => c.cafeSlug === selected) ?? cafes[0] ?? null;
  const many = cafes.length > 1;

  let body: React.ReactNode;
  if (ready && (!signedIn || status === "signed_out")) {
    body = (
      <Centered>
        <Coin size={COIN} />
        <T variant="body" color="ink2" align="center" style={styles.note}>
          {koduCopy.signedOut}
        </T>
        <Button title={actionCopy.signIn} size="lg" fullWidth onPress={() => router.push("/giris")} style={styles.wide} />
      </Centered>
    );
  } else if (!wallet && status === "error") {
    body = (
      <Centered>
        <View accessibilityRole="alert" style={styles.errorNote}>
          <Icon icon={CircleAlert} size={32} color={t.danger} />
          <T variant="body" align="center">
            {error ?? errorCopy.generic}
          </T>
        </View>
        <Button
          title={errorCopy.retry}
          variant="secondary"
          size="lg"
          fullWidth
          loading={retrying}
          loadingLabel={errorCopy.retry}
          style={styles.wide}
          onPress={async () => {
            setRetrying(true);
            await loadWallet(api);
            setRetrying(false);
          }}
        />
      </Centered>
    );
  } else if (!wallet) {
    body = (
      <Centered busy>
        <Skeleton width={COIN} height={COIN} radius="full" style={{ marginBottom: -COIN / 2, zIndex: 1 }} />
        <View style={[styles.pass, { backgroundColor: t.surface2 }]}>
          <Skeleton width={150} line="legend" />
          <Skeleton width={QR_SIZE} height={QR_SIZE} radius={4} />
          <Skeleton width={170} height={30} />
        </View>
      </Centered>
    );
  } else if (!current) {
    body = (
      <Centered>
        <Coin size={COIN} />
        <T variant="body" color="ink2" align="center" style={styles.note}>
          {koduCopy.empty}
        </T>
        <Button
          title={actionCopy.browseCafes}
          variant="secondary"
          size="lg"
          fullWidth
          style={styles.wide}
          onPress={() => router.navigate("/")}
        />
      </Centered>
    );
  } else {
    const coinCafe = {
      name: current.cafeName,
      district: current.district,
      city: cities[current.cafeSlug] ?? null,
      slug: current.cafeSlug,
    };
    // "MODA KAHVESİ · KADIKÖY"; a long name goes alone, so the dot never dangles at a line end.
    const legend = coinLegend(current.cafeName, current.district, 26);
    body = (
      <Centered>
        {many ? (
          <ChipGroup label={koduCopy.cafes} style={styles.chips}>
            {cafes.map((c) => (
              <Chip key={c.cafeSlug} kind="choice" selected={c.cafeSlug === current.cafeSlug} onPress={() => choose(c.cafeSlug)}>
                {c.cafeName}
              </Chip>
            ))}
          </ChipGroup>
        ) : null}

        <Animated.View key={current.cafeSlug} entering={passIn} style={styles.passWrap}>
          <Coin size={COIN} cafe={coinCafe} style={styles.seal} />
          <View style={[styles.pass, styles.passPaper, isDark(t) ? { borderColor: t.lineStrong } : { borderColor: t.line }]}>
            <T variant="legend" align="center" numberOfLines={2} style={{ color: light.ink2 }} aria-hidden>
              {legend}
            </T>
            <QrCode value={current.memberCode} size={QR_SIZE} />
            <T
              variant="h2"
              align="center"
              accessibilityRole="text"
              accessibilityLabel={koduCopy.spoken(current.cafeName, current.memberCode)}
              accessibilityLiveRegion="polite"
              style={styles.code}
            >
              {current.memberCode}
            </T>
          </View>
        </Animated.View>

        <T variant="body" color="ink2" align="center" style={styles.hint}>
          {peniCopy.peniCodeBody}
        </T>
      </Centered>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <View style={styles.top}>
            <T variant="h2" accessibilityRole="header" style={styles.title}>
              {peniCopy.peniCode}
            </T>
            <IconButton label={actionCopy.close} icon={X} iconSize={24} onPress={close} style={styles.close} />
          </View>
          {body}
          <Button title={actionCopy.close} variant="secondary" size="lg" fullWidth onPress={close} />
        </View>
      </ScrollView>
    </View>
  );
}

function Centered({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <View aria-busy={busy || undefined} accessibilityState={busy ? { busy: true } : undefined} style={styles.centered}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space.gutter },
  column: { flexGrow: 1, width: "100%", maxWidth: 480, alignSelf: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  title: { flex: 1, minWidth: 0 },
  close: { marginRight: -10 },
  centered: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingVertical: 24 },
  chips: { justifyContent: "center" },
  passWrap: { alignItems: "center" },
  /** The coin straddles the pass's top edge. */
  seal: { marginBottom: -COIN / 2, zIndex: 1 },
  /** The QR's own quiet zone (4 modules) is the air between it, the legend and the code. */
  pass: {
    alignItems: "center",
    gap: 2,
    borderRadius: radius.card,
    paddingTop: COIN / 2 + 16,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  /** White in both themes, with a hairline ring (the dark theme's is stronger). */
  passPaper: { backgroundColor: light.onPeni, borderWidth: 1 },
  code: {
    color: light.ink,
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: 3.2,
    fontVariant: ["lining-nums", "tabular-nums"],
  },
  hint: { maxWidth: 300 },
  note: { maxWidth: 300 },
  errorNote: { alignItems: "center", gap: 12, maxWidth: 300 },
  wide: { alignSelf: "stretch" },
});
