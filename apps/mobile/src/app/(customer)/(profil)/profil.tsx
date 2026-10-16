/**
 * Profil (design-system.md §10.7, with §9.8 for copy).
 *
 * - The large title "Profil"; under it, signed in, the initials disc, the name and the phone.
 * - The account card: "Adın" + "Kaydet" [G18], "Profilim görünsün" [G18], "Peni kodum".
 * - The app card: "Titreşim" (SecureStore, read by `haptic()`), "Masa kuralları" (push) and, for
 *   staff [G19], "Kafe moduna geç".
 * - "Çıkış yap" on its own, in danger.
 * - At the very bottom, for everyone else: "Kafede mi çalışıyorsun?" + quiet "Kafe modu".
 *
 * The name and visibility come from `GET /me` on focus; until it answers, the session's copy is
 * shown (or skeletons on a cold start). A failed read keeps the screen and says so on top.
 * Signed out: an invitation to sign in, and the rows that need no account.
 */
import { PeniApiError, type MeDTO } from "@peni/api";
import { actionCopy, errorCopy, peniCopy } from "@peni/brand/copy";
import { router, useFocusEffect } from "expo-router";
import { LogOut, QrCode } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { TabScreen } from "@/components/home/tab-screen";
import { errorMessage, withoutRetry } from "@/components/order/use-order";
import { Identity, IdentitySkeleton } from "@/components/profile/identity";
import { KafeModuLine } from "@/components/profile/kafe-modu-line";
import { NameForm } from "@/components/profile/name-form";
import { Banner, Button, Card, Icon, Row, RowGroup, Skeleton, SwitchRow, T, toast } from "@/components/ui";
import { useHapticsPreference } from "@/lib/haptics";
import { useMode } from "@/lib/mode";
import { useSession } from "@/lib/session";
import { space, useTokens } from "@/lib/theme";

const VISIBLE_HINT = "Açıkken Peni masasında baş harflerin, cevaplarda adın görünür.";
// A no-break space keeps "giriş yap." together when the sentence wraps.
const SIGNED_OUT = "Adını ve görünürlüğünü ayarlamak için giriş\u00A0yap.";

export default function Profil() {
  const t = useTokens();
  const session = useSession();
  const { api, signedIn, staffKey, staffSlug, signOut } = session;
  const { setMode } = useMode();
  const [hapticsOn, setHapticsOn] = useHapticsPreference();

  /* ------------------------------------------------ GET /me [G18, G19] */

  const [me, setMe] = useState<MeDTO | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  /** "Profilim görünsün" while a change is on its way (null: show the server's value). */
  const [visible, setVisible] = useState<boolean | null>(null);
  const [visiblePending, setVisiblePending] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setMe(null);
      setMeError(null);
      setVisible(null);
    }
  }, [signedIn]);

  const loadMe = useCallback(async () => {
    if (!signedIn) return;
    try {
      const next = await api.me.get();
      setMe(next);
      setMeError(null);
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 401) {
        await signOut();
        return;
      }
      setMeError(errorMessage(e));
    }
  }, [api, signedIn, signOut]);

  useFocusEffect(
    useCallback(() => {
      void loadMe();
    }, [loadMe]),
  );

  const person = me?.customer ?? session.customer;
  const staffCafes = me?.staffCafes ?? session.staffCafes;

  /** Keeps the session (and everything that reads it) in step with a saved profile. */
  const adopt = useCallback(
    (next: MeDTO) => {
      setMe(next);
      void session.refreshMe();
    },
    [session],
  );

  /* ------------------------------------------------ Profilim görünsün [G18] */

  const shownVisible = visible ?? person?.profileVisible ?? false;

  const toggleVisible = async (next: boolean) => {
    if (visiblePending) return;
    setVisible(next); // optimistic; put back if the server says no
    setVisiblePending(true);
    try {
      const saved = await api.me.updateProfile({ profileVisible: next });
      setVisible(saved.customer.profileVisible);
      adopt(saved);
    } catch (e) {
      setVisible(!next);
      toast(e instanceof PeniApiError && e.code === "NETWORK" ? errorCopy.network : errorCopy.change, { tone: "danger" });
    } finally {
      setVisiblePending(false);
    }
  };

  /* ------------------------------------------------ Kafe modu */

  const enterStaff = () => {
    if (staffKey && staffSlug) void setMode("staff");
    else router.push("/kafe-modu");
  };

  const [signingOut, setSigningOut] = useState(false);
  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  /* ------------------------------------------------ render */

  const retry = async () => {
    setRetrying(true);
    await loadMe();
    setRetrying(false);
  };

  const appRows = (
    <RowGroup>
      <SwitchRow label="Titreşim" checked={hapticsOn} onCheckedChange={setHapticsOn} style={styles.switchRow} />
      <Row title="Masa kuralları" href="/masa-kurallari" />
      {signedIn
        ? staffCafes.map((cafe) => <Row key={cafe.slug} title="Kafe moduna geç" meta={cafe.name} onPress={enterStaff} arrow />)
        : null}
    </RowGroup>
  );

  const kafeModu = signedIn && staffCafes.length > 0 ? null : <KafeModuLine />;

  if (!signedIn) {
    return (
      <TabScreen title="Profil">
        <Card style={styles.invite}>
          <T variant="body">{SIGNED_OUT}</T>
          <Button title={actionCopy.signIn} fullWidth onPress={() => router.push("/giris")} />
        </Card>
        {appRows}
        <View style={styles.bottom}>{kafeModu}</View>
      </TabScreen>
    );
  }

  return (
    <TabScreen title="Profil" onRefresh={loadMe} busy={!person}>
      {meError ? (
        <Banner
          tone="danger"
          title={withoutRetry(meError)}
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

      {person ? <Identity name={person.displayName} phone={person.phone} /> : <IdentitySkeleton />}

      <RowGroup>
        <View style={styles.nameRow}>
          {person ? (
            <NameForm key={person.id} api={api} initial={person.displayName} onSaved={adopt} />
          ) : (
            <View aria-hidden style={styles.nameSkeleton}>
              <Skeleton width={44} line="strong" />
              <Skeleton height={48} radius={10} />
              <Skeleton width="80%" line="meta" />
            </View>
          )}
        </View>
        {person ? (
          <SwitchRow
            label="Profilim görünsün"
            hint={VISIBLE_HINT}
            checked={shownVisible}
            onCheckedChange={(next) => void toggleVisible(next)}
            style={styles.switchRow}
          />
        ) : (
          // Unknown until GET /me answers: never show a guessed "off".
          <View aria-hidden style={[styles.switchRow, styles.switchSkeleton]}>
            <View style={styles.switchSkeletonText}>
              <Skeleton width="58%" line="body" />
              <Skeleton width="86%" line="meta" />
            </View>
            <Skeleton width={51} height={31} radius="full" />
          </View>
        )}
        <Row
          title={peniCopy.peniCode}
          onPress={() => router.push("/peni-kodum")}
          end={<Icon icon={QrCode} size={20} color={t.ink2} />}
          accessibilityLabel={peniCopy.peniCode}
          accessibilityHint={peniCopy.peniCodeBody}
        />
      </RowGroup>

      {appRows}

      <RowGroup>
        <Row
          title={signingOut ? "Çıkış yapılıyor…" : actionCopy.signOut}
          tone="danger"
          start={<Icon icon={LogOut} size={20} color={t.danger} />}
          disabled={signingOut}
          onPress={() => void doSignOut()}
        />
      </RowGroup>

      <View style={styles.bottom}>{kafeModu}</View>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  invite: { gap: 16 },
  nameRow: { paddingHorizontal: space.rowH, paddingTop: 16, paddingBottom: 16 },
  nameSkeleton: { gap: 8 },
  switchRow: { paddingHorizontal: space.rowH, paddingVertical: space.rowV },
  switchSkeleton: { minHeight: space.row, flexDirection: "row", alignItems: "center", gap: 16 },
  switchSkeletonText: { flex: 1, gap: 2 },
  bottom: { flexGrow: 1, justifyContent: "flex-end", paddingTop: 8 },
});
