import type { ClaimDTO } from "@peni/api";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { Closed, Taken } from "../../ui/claim";
import { Amount, Btn, CafeLine, Loading, Notice, Screen, Title, Txt } from "../../ui/kit";
import { SignIn } from "../../ui/sign-in";

/** What the customer screen's QR opens, scanned in the app or by the phone's camera: `/p/<token>`. */
export default function ClaimByToken() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { me, t, error } = useSession();
  const [claim, setClaim] = useState<ClaimDTO | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Asked again once signed in: the server then says whether it's already the viewer's.
  useEffect(() => {
    api.claims.get(token).then(setClaim, () => setMissing(true));
  }, [token, me]);

  const take = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      setClaim(await api.claims.take({ token }));
    } catch (e) {
      setMessage(error(e));
      // It may have closed or gone to someone else meanwhile: show where it stands.
      api.claims.get(token).then(setClaim, () => undefined);
    } finally {
      setBusy(false);
    }
  }, [token, error]);

  let body;
  if (missing) body = <Title>{t("notFound")}</Title>;
  else if (!claim) body = <Loading />;
  else if (claim.state === "yours") body = <Taken claim={claim} />;
  else if (claim.state !== "open") body = <Closed claim={claim} />;
  else
    body = (
      <>
        <View style={{ gap: 14 }}>
          <CafeLine name={claim.cafeName} />
          <Amount peni={claim.peni} goods={claim.goods} caption={t("waiting")} />
          <Txt muted>{t("waitingBody")}</Txt>
        </View>
        {me ? (
          <Btn kind="cafe" size="lg" busy={busy} onPress={() => void take()}>
            {t("take")}
          </Btn>
        ) : (
          <SignIn prompt={t("signInFirst")} onDone={take} />
        )}
        {message && <Notice tone="red">{message}</Notice>}
      </>
    );
  return <Screen hue={claim?.hue ?? null}>{body}</Screen>;
}
