import type { SpendCodeDTO, WalletCafeDTO } from "@peni/api";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { Btn, CafeLine, CafePicker, Loading, Notice, Qr, Screen, Stat, Title, Txt } from "../ui/kit";
import { SignIn } from "../ui/sign-in";

/** "Ödeme kodum" (plan piece 11): the code to show at the till to spend peni at one café. */
export default function SpendCode() {
  const params = useLocalSearchParams<{ kafe?: string }>();
  const { me, t, error } = useSession();
  const [cafes, setCafes] = useState<WalletCafeDTO[] | null>(null);
  const [cafe, setCafe] = useState<string | null>(params.kafe ?? null);
  const [code, setCode] = useState<SpendCodeDTO | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!me) return;
    api.wallet.get().then(
      (w) => {
        setCafes(w.cafes);
        // One café, or the one the link named: straight to its code.
        setCafe((c) => (c && w.cafes.some((x) => x.cafeSlug === c) ? c : w.cafes.length === 1 ? w.cafes[0]!.cafeSlug : null));
      },
      (e: unknown) => setMessage(error(e)),
    );
  }, [me, error]);

  const fetchCode = useCallback(
    (slug: string) => {
      setMessage(null);
      api.wallet.spendCode(slug).then(setCode, (e: unknown) => setMessage(error(e)));
    },
    [error],
  );
  useEffect(() => {
    if (me && cafe) fetchCode(cafe);
    else setCode(null);
  }, [me, cafe, fetchCode]);

  // A second hand for the countdown; a code that runs out is replaced while the screen is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = code ? Math.max(0, Math.round((Date.parse(code.expiresAt) - now) / 1000)) : 0;
  useEffect(() => {
    if (code && left === 0 && AppState.currentState === "active") fetchCode(code.cafeSlug);
  }, [code, left, fetchCode]);

  let body;
  if (!me) body = <SignIn prompt={t("signInToSpend")} />;
  else if (cafes && cafes.length === 0) body = <Txt size={18}>{t("spendNoCafe")}</Txt>;
  else if (cafes && !cafe)
    body = <CafePicker title={t("spendWhichCafe")} cafes={cafes.map((c) => ({ slug: c.cafeSlug, name: c.cafeName, right: `${c.balancePeni} peni` }))} onPick={setCafe} />;
  else if (code) {
    const pretty = `${code.code.slice(0, 3)} ${code.code.slice(3)}`;
    body = (
      <View style={{ gap: 22, alignItems: "stretch" }}>
        <CafeLine name={code.cafeName} />
        <Title>{t("spendTitle")}</Title>
        <View style={{ alignItems: "center", gap: 18, opacity: left === 0 ? 0.3 : 1 }}>
          <Qr value={code.code} size={240} label={t("spendTitle")} />
          <Txt size={48} weight="semibold" center style={{ letterSpacing: 6 }} accessibilityRole="text">
            {pretty}
          </Txt>
        </View>
        <Txt muted center>
          {`${t("spendValid")}: `}
          <Txt>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</Txt>
        </Txt>
        <Stat label={t("balance")} value={`${code.balancePeni} peni`} />
        <Txt muted>{t("spendHelp")}</Txt>
        <Btn kind="quiet" onPress={() => fetchCode(code.cafeSlug)}>
          {t("spendRenew")}
        </Btn>
        {cafes && cafes.length > 1 && (
          <Btn kind="bare" size="sm" onPress={() => setCafe(null)}>
            {t("otherCafe")}
          </Btn>
        )}
      </View>
    );
  } else if (!message) body = <Loading />;

  return (
    <Screen hue={code?.hue ?? null}>
      {body}
      {message && <Notice tone="red">{message}</Notice>}
    </Screen>
  );
}
