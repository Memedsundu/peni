/**
 * `kafe-modu` sheet (design-system.md §10.7; formSheet, "fitToContents").
 *
 * - `Field` "Personel anahtarı" (secure, no autocorrect).
 * - The café picker: one row per café from `cafes.list()` — never a free-text slug. Staff
 *   cafés [G19] come first and the first of them is picked; otherwise the café the key was last
 *   used for.
 * - Primary "Kafe moduna geç": validates with `staff.dashboard(slug)` using exactly this key,
 *   stores the key and the slug, sets the mode and lands on `/tezgah`. Opened from Ayarlar while
 *   already in Kafe modu (switching café), it only closes.
 * - Error, at the key: "Anahtar tutmadı." A network failure says so instead; the key stays.
 */
import { createPeniClient, PeniApiError, type CafeSummaryDTO } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { SEP } from "@peni/brand/format";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SheetFrame } from "@/components/cafe/sheet";
import { Banner, Button, Field, Icon, PressableScale, Skeleton, T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useMode } from "@/lib/mode";
import { API_URL, useSession } from "@/lib/session";
import { radius, space, useTokens } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const TITLE = "Kafe modu";
const KEY_LABEL = "Personel anahtarı";
const CAFE_LABEL = "Kafe";
const KEY_EMPTY = "Personel anahtarını yaz.";

export default function KafeModuSheet() {
  const t = useTokens();
  const { api, staffKey, staffSlug, staffCafes, setStaff } = useSession();
  const { mode, setMode } = useMode();
  const { data, error: listError, refresh } = useLoad(useCallback(() => api.cafes.list(), [api]));

  const cafes = useMemo(
    () =>
      orderCafes(
        data?.cafes ?? [],
        staffCafes.map((c) => c.slug),
      ),
    [data, staffCafes],
  );
  const [picked, setPicked] = useState<string | null>(staffSlug ?? staffCafes[0]?.slug ?? null);
  const slug = picked ?? cafes[0]?.slug ?? null;

  const [key, setKey] = useState(staffKey ?? "");
  const [busy, setBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const enter = async () => {
    if (busy) return;
    const k = key.trim();
    if (!k) {
      haptic("error");
      setKeyError(KEY_EMPTY);
      return;
    }
    if (!slug) return;
    setBusy(true);
    setKeyError(null);
    try {
      // Validate with exactly this key before storing it.
      const probe = createPeniClient({ baseUrl: API_URL, getStaffKey: () => k });
      await probe.staff.dashboard(slug);
      await setStaff({ key: k, slug });
      haptic("success");
      if (router.canGoBack()) router.back();
      // Already in Kafe modu (switching café from Ayarlar): closing is all.
      if (mode !== "staff") await setMode("staff");
    } catch (e) {
      haptic("error");
      setKeyError(e instanceof PeniApiError && e.code === "NETWORK" ? errorCopy.network : errorCopy.staffKey);
      setBusy(false);
    }
  };

  return (
    <SheetFrame
      title={TITLE}
      footer={
        <Button
          title="Kafe moduna geç"
          fullWidth
          size="lg"
          loading={busy}
          loadingLabel="Kontrol ediliyor…"
          haptic="confirm"
          disabled={!slug && !busy}
          disabledReason={!slug && data ? "Önce bir kafe seç." : undefined}
          onPress={() => void enter()}
        />
      }
    >
      <View style={styles.body}>
        <Field
          label={KEY_LABEL}
          value={key}
          onChangeText={(v) => {
            setKey(v);
            if (keyError) setKeyError(null);
          }}
          error={keyError}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void enter()}
        />

        <View style={styles.picker}>
          <T variant="strong" aria-hidden>
            {CAFE_LABEL}
          </T>
          {listError && !data ? (
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
                  onPress={async () => {
                    setRetrying(true);
                    await refresh();
                    setRetrying(false);
                  }}
                />
              }
            />
          ) : (
            <View
              role="radiogroup"
              aria-label={CAFE_LABEL}
              accessibilityState={!data ? { busy: true } : undefined}
              style={[styles.list, { borderColor: t.lineStrong, backgroundColor: t.surface }]}
            >
              {data
                ? cafes.map((c, i) => (
                    <CafeOption
                      key={c.slug}
                      cafe={c}
                      first={i === 0}
                      selected={c.slug === slug}
                      onPress={() => setPicked(c.slug)}
                    />
                  ))
                : [0, 1].map((i) => (
                    <View key={i} aria-hidden style={[styles.option, i ? { borderTopWidth: 1, borderTopColor: t.line } : null]}>
                      <View style={styles.optionText}>
                        <Skeleton width={i ? "64%" : "48%"} line="body" />
                        <Skeleton width={96} line="meta" />
                      </View>
                    </View>
                  ))}
            </View>
          )}
        </View>
      </View>
    </SheetFrame>
  );
}

function CafeOption({
  cafe,
  first,
  selected,
  onPress,
}: {
  cafe: CafeSummaryDTO;
  first: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTokens();
  const place = [cafe.district, cafe.city].filter(Boolean).join(SEP);
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={place ? `${cafe.name}, ${place}` : cafe.name}
      targetScale={1}
      pressedColor={t.surface2}
      onPress={() => {
        haptic("selection");
        onPress();
      }}
      style={[styles.option, first ? null : { borderTopWidth: 1, borderTopColor: t.line }]}
    >
      <View style={styles.optionText}>
        <T variant={selected ? "strong" : "body"}>{cafe.name}</T>
        {place ? (
          <T variant="meta" color="ink2">
            {place}
          </T>
        ) : null}
      </View>
      {/* An iOS-style list check: round marks are kept for coins, seats and the switch (§5). */}
      <View style={styles.mark}>{selected ? <Icon icon={Check} size={20} color={t.ink} /> : null}</View>
    </PressableScale>
  );
}

/** Staff cafés first (in their order), then the rest as listed. */
function orderCafes(cafes: CafeSummaryDTO[], staffSlugs: string[]): CafeSummaryDTO[] {
  const rank = (slug: string) => {
    const i = staffSlugs.indexOf(slug);
    return i < 0 ? staffSlugs.length : i;
  };
  return [...cafes].sort((a, b) => rank(a.slug) - rank(b.slug));
}

const styles = StyleSheet.create({
  body: { gap: 20 },
  picker: { gap: 8 },
  list: { borderWidth: 1.5, borderRadius: radius.control, overflow: "hidden" },
  option: {
    minHeight: space.row,
    paddingHorizontal: space.rowH,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  mark: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
});
