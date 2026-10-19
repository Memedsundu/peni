import type { AskidaWallEventDTO, CafeDetailDTO, CafeSummaryDTO } from "@peni/api";
import { fill } from "@peni/api/customer-text";
import { goods } from "@peni/brand/format";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { api, newKey } from "../lib/api";
import { shortWhen } from "../lib/dates";
import { useSession } from "../lib/session";
import { AmountPicker, Btn, CafeLine, CafePicker, Loading, Notice, Screen, Toggle, Txt, useScreenColors } from "../ui/kit";
import { SignIn } from "../ui/sign-in";

/**
 * Askıda kahve (plan piece 13). Anyone takes from it at the till, with no account and no
 * limit (D8), so this screen only shows what's waiting and lets members leave peni on it.
 */
export default function Askida() {
  const params = useLocalSearchParams<{ kafe?: string }>();
  const { me, t, error } = useSession();
  const [cafes, setCafes] = useState<CafeSummaryDTO[] | null>(null);
  const [cafe, setCafe] = useState<CafeDetailDTO | null>(null);
  const [slug, setSlug] = useState<string | null>(params.kafe ?? null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback((s: string) => api.cafes.get(s).then(setCafe, (e: unknown) => setMessage(error(e))), [error]);
  useEffect(() => {
    if (slug) void load(slug);
    else api.cafes.list().then((r) => setCafes(r.cafes), (e: unknown) => setMessage(error(e)));
  }, [slug, me, load, error]);

  let body;
  if (message) body = <Notice tone="red">{message}</Notice>;
  else if (!slug) body = cafes ? <CafePicker title={t("askidaTitle")} cafes={cafes.map((c) => ({ slug: c.slug, name: c.name, right: String(c.askidaItemsAvailable) }))} onPick={setSlug} /> : <Loading />;
  else if (!cafe) body = <Loading />;
  else {
    const askida = cafe.askida;
    const waiting = goods(askida.balancePeni, cafe.menu.filter((m) => m.askida && m.available));
    body = (
      <>
        <View style={{ gap: 14 }}>
          <CafeLine name={cafe.name} />
          <Txt serif size={48} accessibilityRole="header">
            {!askida.enabled ? t("askidaOff") : waiting ? fill(t("askidaWaiting"), { goods: waiting }) : t("askidaNothing")}
          </Txt>
          {askida.enabled && (
            <>
              <Txt size={18}>{t("askidaHow")}</Txt>
              <Txt muted>{`${fill(t("askidaPeni"), { n: askida.balancePeni })}${askida.claimedLast7Days > 0 ? ` · ${fill(t("askidaWeek"), { n: askida.claimedLast7Days })}` : ""}`}</Txt>
            </>
          )}
        </View>
        {askida.enabled && (
          <>
            <Leave cafe={cafe} onLeft={() => void load(cafe.slug)} />
            <Wall wall={askida.wall} />
          </>
        )}
      </>
    );
  }
  return <Screen hue={cafe?.hue ?? null}>{body}</Screen>;
}

/** "Askıya bırak" with peni from the viewer's balance here, or how else to leave one. */
function Leave({ cafe, onLeft }: { cafe: CafeDetailDTO; onLeft: () => void }) {
  const { me, t, error } = useSession();
  const c = useScreenColors();
  const balance = cafe.balancePeni ?? 0;
  const [peni, setPeni] = useState(Math.min(10, balance));
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [left, setLeft] = useState<{ peni: number; matchedPeni: number } | null>(null);
  // One key per donation: a retried tap leaves it once.
  const [key, setKey] = useState(newKey);

  const leave = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.askida.donate({ cafeSlug: cafe.slug, peni, showName, idempotencyKey: key });
      setLeft({ peni, matchedPeni: r.matchedPeni });
      setKey(newKey());
      setPeni(Math.min(peni, r.balancePeni));
      onLeft();
    } catch (e) {
      setMessage(error(e));
    } finally {
      setBusy(false);
    }
  };

  let inner;
  if (!me) inner = <SignIn prompt={t("askidaSignIn")} />;
  else if (balance < 1 && !left) inner = <Txt muted>{t("askidaNoPeni")}</Txt>;
  else
    inner = (
      <>
        {left && <Notice tone="green">{`${fill(t("askidaLeft"), { n: left.peni })}${left.matchedPeni > 0 ? ` ${fill(t("askidaMatched"), { n: left.matchedPeni })}` : ""}`}</Notice>}
        {balance >= 1 && (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt muted>{t("howMuch")}</Txt>
              <Txt muted>{`${t("yourBalance")}: ${balance}`}</Txt>
            </View>
            <AmountPicker amounts={[10, 30, 50]} value={peni} max={balance} onChange={setPeni} otherLabel={t("other")} label={t("howMuch")} />
            <Toggle label={t("askidaShowName")} value={showName} onChange={setShowName} />
            {cafe.askida.matchPercent !== null && <Txt muted>{fill(t("askidaMatch"), { n: cafe.askida.matchPercent })}</Txt>}
            {message && <Notice tone="red">{message}</Notice>}
            <Btn kind="cafe" size="lg" busy={busy} disabled={peni < 1 || peni > balance} onPress={() => void leave()}>
              {fill(t("askidaLeaveN"), { n: peni })}
            </Btn>
          </>
        )}
      </>
    );
  return (
    <View style={{ gap: 16, borderTopWidth: 1, borderColor: c.line, paddingTop: 24 }}>
      <Txt size={20} weight="semibold" accessibilityRole="header">
        {t("askidaLeave")}
      </Txt>
      {inner}
      <Txt size={15} muted>
        {t("askidaAtTill")}
      </Txt>
    </View>
  );
}

/** Who left what lately. Takings are never listed (§17). */
function Wall({ wall }: { wall: AskidaWallEventDTO[] }) {
  const { t, lang } = useSession();
  const c = useScreenColors();
  const line = (e: AskidaWallEventDTO) => {
    if (e.type === "donation") return fill(t("wallDonation"), { name: e.donorName ?? t("wallSomeone"), n: e.peni });
    if (e.type === "till_donation") return fill(t("wallTill"), { n: e.peni });
    if (e.type === "cafe_match") return fill(t("wallMatch"), { n: e.peni });
    return null;
  };
  const rows = wall.flatMap((e) => {
    const text = line(e);
    return text ? [{ e, text }] : [];
  });
  return (
    <View style={{ gap: 4, borderTopWidth: 1, borderColor: c.line, paddingTop: 24 }}>
      <Txt size={20} weight="semibold" accessibilityRole="header" style={{ paddingBottom: 6 }}>
        {t("askidaWall")}
      </Txt>
      {rows.length === 0 && <Txt muted>{t("wallEmpty")}</Txt>}
      {rows.map(({ e, text }, i) => (
        <View key={`${e.at}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, borderBottomWidth: 1, borderColor: c.lineSoft, paddingVertical: 12 }}>
          <View style={{ flex: 1 }}>
            <Txt>{text}</Txt>
          </View>
          <Txt size={14} muted>
            {shortWhen(e.at, lang)}
          </Txt>
        </View>
      ))}
    </View>
  );
}
