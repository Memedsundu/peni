/**
 * Kafe modu · Ayarlar (design-system.md §10.10).
 *
 * - KAFE: the café picker — one row per café from `cafes.list()` (the staff's own cafés [G19]
 *   first), never a free-text slug. Switching re-validates the stored key against the new café
 *   (`staff.dashboard`) before it is kept; "Anahtar tutmadı." stays at the list, with the way to
 *   enter another key. With no key stored there is nothing to switch: the section says so and
 *   offers "Anahtarı gir" (the `kafe-modu` sheet, which has its own picker).
 * - BU TELEFON: what lives on this phone — the "Ses" switch (the new-order chime; off shows the
 *   "Ses kapalı" banner on Tezgâh) and "Personel anahtarını unut" (the café is remembered for
 *   next time; every tab then asks for a key).
 * - "Müşteri moduna dön" (secondary, 56pt): sends any bump still waiting, sets the mode to
 *   customer and lands on "/".
 */
import { createPeniClient, PeniApiError, type CafeSummaryDTO } from "@peni/api";
import { errorCopy, staffCopy } from "@peni/brand/copy";
import { SEP } from "@peni/brand/format";
import { router } from "expo-router";
import { Check, CircleAlert, KeyRound } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BACK_TO_CUSTOMER, flushBumps, GATE_ACTION, StaffScreen } from "@/components/staff";
import { Banner, Button, Card, Icon, PressableScale, Row, RowGroup, Skeleton, Spinner, SwitchRow, T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useMode } from "@/lib/mode";
import { API_URL, useSession } from "@/lib/session";
import { useStaffSound } from "@/lib/staff-prefs";
import { space, useTokens } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const CAFE_LEGEND = "Kafe";
const DEVICE_LEGEND = "Bu telefon";
const SOUND = "Ses";
const SOUND_HINT = "Yeni sipariş gelince ses çalar.";
const SOUND_OFF_HINT = "Yeni sipariş gelince ses çalmaz.";
const FORGET = "Personel anahtarını unut";
const FORGET_HINT = "Bu telefonda kayıtlı anahtar silinir.";
const NO_KEY = "Personel anahtarı kayıtlı değil.";
const OTHER_KEY = "Bu kafe için başka bir anahtar gir.";

export default function Ayarlar() {
  const t = useTokens();
  const { api, staffKey, staffSlug, staffCafes, setStaff, setStaffKey } = useSession();
  const { setMode } = useMode();
  const [soundOn, setSoundOn] = useStaffSound();
  const { data, error: listError, refresh } = useLoad(useCallback(() => api.cafes.list(), [api]));
  // The staff's own cafés [G19] first, then the rest in the list's order.
  const cafes = useMemo(() => {
    const own = new Set(staffCafes.map((c) => c.slug));
    const list = data?.cafes ?? [];
    return [...list.filter((c) => own.has(c.slug)), ...list.filter((c) => !own.has(c.slug))];
  }, [data, staffCafes]);
  const [checking, setChecking] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const pick = async (cafe: CafeSummaryDTO) => {
    if (checking || cafe.slug === staffSlug || !staffKey) return;
    setChecking(cafe.slug);
    setPickError(null);
    try {
      // Validate the stored key for the new café before keeping it.
      const probe = createPeniClient({ baseUrl: API_URL, getStaffKey: () => staffKey });
      await probe.staff.dashboard(cafe.slug);
      flushBumps();
      await setStaff({ key: staffKey, slug: cafe.slug });
      haptic("success");
    } catch (e) {
      haptic("error");
      setPickError(e instanceof PeniApiError && e.code === "NETWORK" ? errorCopy.network : errorCopy.staffKey);
    } finally {
      setChecking(null);
    }
  };

  const forget = async () => {
    flushBumps();
    haptic("confirm");
    setPickError(null);
    await setStaffKey(null);
  };

  const backToCustomer = () => {
    flushBumps();
    haptic("confirm");
    void setMode("customer");
  };

  return (
    <StaffScreen title={staffCopy.sections.ayarlar} slug={staffKey ? staffSlug : null}>
      <View style={styles.sections}>
        {/* KAFE */}
        <View style={styles.section}>
          <T variant="legend" color="ink2" accessibilityRole="header">
            {CAFE_LEGEND}
          </T>
          {!staffKey ? (
            <Banner
              tone="info"
              icon={KeyRound}
              title={NO_KEY}
              action={<Button title={GATE_ACTION} size="sm" onPress={() => router.push("/kafe-modu")} />}
            />
          ) : listError && !data ? (
            <Banner
              tone="danger"
              title={errorCopy.cafesLoad}
              action={
                <Button
                  title={errorCopy.retry}
                  variant="secondary"
                  size="sm"
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
            <Card padding="none" role="radiogroup" aria-label={CAFE_LEGEND} accessibilityState={!data ? { busy: true } : undefined}>
              {data
                ? cafes.map((c, i) => (
                    <CafeChoice
                      key={c.slug}
                      cafe={c}
                      first={i === 0}
                      selected={c.slug === staffSlug}
                      checking={checking === c.slug}
                      disabled={checking != null && checking !== c.slug}
                      onPress={() => void pick(c)}
                    />
                  ))
                : [0, 1].map((i) => (
                    <View key={i} aria-hidden style={[styles.choice, i ? { borderTopWidth: 1, borderTopColor: t.line } : null]}>
                      <View style={styles.choiceText}>
                        <Skeleton width={i ? "62%" : "48%"} line="body" />
                        <Skeleton width={96} line="meta" />
                      </View>
                    </View>
                  ))}
            </Card>
          )}
          {staffKey && pickError ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
              <View style={styles.errorIcon}>
                <Icon icon={CircleAlert} size={20} color={t.danger} />
              </View>
              <View style={styles.errorText}>
                <T variant="body" color="danger">
                  {pickError}
                </T>
                {pickError === errorCopy.staffKey ? (
                  <T variant="meta" color="ink2">
                    {OTHER_KEY}
                  </T>
                ) : null}
              </View>
              {pickError === errorCopy.staffKey ? (
                <Button title={GATE_ACTION} variant="secondary" size="sm" onPress={() => router.push("/kafe-modu")} />
              ) : null}
            </View>
          ) : null}
        </View>

        {/* BU TELEFON */}
        <RowGroup title={DEVICE_LEGEND}>
          <SwitchRow
            label={SOUND}
            hint={soundOn ? SOUND_HINT : SOUND_OFF_HINT}
            checked={soundOn}
            onCheckedChange={setSoundOn}
            style={styles.switchRow}
          />
          {staffKey ? (
            <Row
              title={FORGET}
              meta={FORGET_HINT}
              tone="danger"
              start={<Icon icon={KeyRound} size={20} color={t.danger} />}
              onPress={() => void forget()}
            />
          ) : null}
        </RowGroup>

        <Button title={BACK_TO_CUSTOMER} variant="secondary" size="lg" fullWidth onPress={backToCustomer} />
      </View>
    </StaffScreen>
  );
}

function CafeChoice({
  cafe,
  first,
  selected,
  checking,
  disabled,
  onPress,
}: {
  cafe: CafeSummaryDTO;
  first: boolean;
  selected: boolean;
  checking: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTokens();
  const place = [cafe.district, cafe.city].filter(Boolean).join(SEP);
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: disabled && !selected, busy: checking }}
      accessibilityLabel={place ? `${cafe.name}, ${place}` : cafe.name}
      targetScale={1}
      pressedColor={t.surface2}
      disabled={disabled}
      onPress={() => {
        if (selected) return;
        haptic("selection");
        onPress();
      }}
      style={[styles.choice, first ? null : { borderTopWidth: 1, borderTopColor: t.line }]}
    >
      <View style={styles.choiceText}>
        <T variant={selected ? "strong" : "body"}>{cafe.name}</T>
        {place ? (
          <T variant="meta" color="ink2">
            {place}
          </T>
        ) : null}
      </View>
      <View style={styles.choiceEnd}>
        {checking ? <Spinner color={t.ink} /> : selected ? <Icon icon={Check} size={20} color={t.ink} /> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  sections: { gap: space.section - 4 },
  section: { gap: 8 },
  choice: {
    minHeight: space.row,
    paddingVertical: space.rowV,
    paddingHorizontal: space.rowH,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  choiceText: { flex: 1, minWidth: 0, gap: 2 },
  choiceEnd: { width: 24, alignItems: "center" },
  switchRow: { paddingHorizontal: space.rowH },
  error: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 8, paddingTop: 4 },
  errorIcon: { alignSelf: "flex-start", paddingTop: 1 },
  errorText: { flex: 1, minWidth: 160, gap: 2 },
});
