import type { CafeSummaryDTO, ClaimDTO } from "@peni/api";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { api, claimTokenOf } from "../../lib/api";
import { useSession } from "../../lib/session";
import { FONTS } from "../../lib/theme";
import { Taken } from "../../ui/claim";
import { Btn, Hue, Label, Notice, Pills, Screen, styles, Title, Txt, useScreenColors } from "../../ui/kit";

/**
 * "Peni al": scan the QR on the café's small screen, or type its 4-digit code
 * (plan pieces 7 and 10). A scanned QR opens the same screen as its link, `/p/<token>`.
 */
export default function Earn() {
  const { t } = useSession();
  const [scanning, setScanning] = useState(false);
  // The camera stops when the tab is left.
  useFocusEffect(useCallback(() => () => setScanning(false), []));
  return (
    <Screen back={false}>
      <View style={{ gap: 10 }}>
        <Title>{t("earnTitle")}</Title>
        <Txt muted>{t("earnBody")}</Txt>
      </View>
      <Scanner on={scanning} onStart={() => setScanning(true)} onStop={() => setScanning(false)} />
      <Label>{t("orTypeCode")}</Label>
      <TypedCode />
    </Screen>
  );
}

function Scanner({ on, onStart, onStop }: { on: boolean; onStart: () => void; onStop: () => void }) {
  const { t } = useSession();
  const c = useScreenColors();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [wrong, setWrong] = useState(false);
  // One scan opens one claim; the camera keeps reporting the same QR until it stops.
  const done = useRef(false);

  const start = async () => {
    setWrong(false);
    const answer = permission?.granted ? permission : await requestPermission();
    if (answer.granted) {
      done.current = false;
      onStart();
    }
  };

  if (on && permission?.granted) {
    return (
      <View style={{ gap: 12 }}>
        <View style={{ aspectRatio: 1, borderRadius: 28, overflow: "hidden", backgroundColor: c.tile }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              if (done.current) return;
              const token = claimTokenOf(data);
              if (!token) {
                setWrong(true);
                return;
              }
              done.current = true;
              onStop();
              router.push(`/p/${encodeURIComponent(token)}`);
            }}
          />
        </View>
        <Txt muted center>
          {t("scanning")}
        </Txt>
        {wrong && <Notice tone="red">{t("notPeniQr")}</Notice>}
        <Btn kind="quiet" size="sm" onPress={onStop}>
          {t("close")}
        </Btn>
      </View>
    );
  }
  const denied = permission && !permission.granted && !permission.canAskAgain;
  return (
    <View style={{ gap: 10 }}>
      <Btn kind="primary" size="lg" onPress={() => void start()} disabled={!!denied}>
        {t("scanQr")}
      </Btn>
      {denied ? <Notice>{t("cameraDenied")}</Notice> : permission && !permission.granted && Platform.OS !== "web" ? <Txt size={14} muted center>{t("cameraNeeded")}</Txt> : null}
    </View>
  );
}

/** The 4-digit code for when the camera can't read the QR. */
function TypedCode() {
  const { t, error } = useSession();
  const c = useScreenColors();
  const [cafes, setCafes] = useState<CafeSummaryDTO[] | null>(null);
  const [cafe, setCafe] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [taken, setTaken] = useState<ClaimDTO | null>(null);

  useEffect(() => {
    api.cafes.list().then(
      ({ cafes }) => {
        setCafes(cafes);
        // One café, or the one they belong to: nothing to pick.
        setCafe((s) => s || (cafes.length === 1 ? cafes[0]!.slug : (cafes.find((x) => x.isMember)?.slug ?? "")));
      },
      () => setCafes([]),
    );
  }, []);

  const take = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setTaken(await api.claims.take({ cafeSlug: cafe, code }));
    } catch (e) {
      setMessage(error(e));
    } finally {
      setBusy(false);
    }
  };

  if (taken) {
    return (
      <View style={{ gap: 18 }}>
        <Hue hue={taken.hue}>
          <Taken claim={taken} />
        </Hue>
        <Btn kind="quiet" size="md" onPress={() => (setTaken(null), setCode(""))}>
          {t("another")}
        </Btn>
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {cafes && cafes.length > 1 ? (
        <View style={{ gap: 8 }}>
          <Txt size={15} weight="medium">
            {t("whichCafe")}
          </Txt>
          <Pills options={cafes.map((x) => [x.slug, x.name] as [string, string])} value={cafe || null} onChange={setCafe} />
        </View>
      ) : null}
      <TextInput
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        accessibilityLabel={t("code")}
        placeholder="0000"
        placeholderTextColor={c.line}
        style={[styles.field, { minHeight: 84, borderColor: c.line, color: c.ink, fontFamily: FONTS.serif, fontSize: 52, letterSpacing: 18, textAlign: "center" }]}
      />
      <Btn kind="primary" size="lg" busy={busy} disabled={!cafe || code.length !== 4} onPress={() => void take()}>
        {t("take")}
      </Btn>
      {message && <Notice tone="red">{message}</Notice>}
    </View>
  );
}
