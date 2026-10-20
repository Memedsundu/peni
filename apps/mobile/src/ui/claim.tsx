import type { ClaimDTO } from "@peni/api";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useSession } from "../lib/session";
import { Amount, Btn, CafeLine, Stat, Title, Txt } from "./kit";

/** After taking it: the peni, the balance, and how to spend it. */
export function Taken({ claim }: { claim: ClaimDTO }) {
  const { t } = useSession();
  const router = useRouter();
  return (
    <View style={{ gap: 22 }} accessibilityLiveRegion="polite">
      <CafeLine name={claim.cafeName} />
      <Amount peni={claim.peni} goods={claim.goods} caption={t("yours")} />
      <Stat label={t("balance")} value={`${claim.balancePeni ?? 0} penny`} />
      {claim.joined ? <Txt>{t("joined")}</Txt> : null}
      <Txt muted>{t("spendHint")}</Txt>
      <Btn kind="secondary" size="md" onPress={() => router.push(`/harca?kafe=${encodeURIComponent(claim.cafeSlug)}`)}>
        {t("mySpendCode")}
      </Btn>
    </View>
  );
}

/** Someone else took it, the day ended, or the café took the sale back. */
export function Closed({ claim }: { claim: ClaimDTO }) {
  const { t } = useSession();
  const [title, body] =
    claim.state === "taken" ? [t("taken"), t("takenBody")] : claim.state === "expired" ? [t("expired"), t("expiredBody")] : [t("cancelled"), t("cancelledBody")];
  return (
    <View style={{ gap: 14 }}>
      <CafeLine name={claim.cafeName} />
      <Title>{title}</Title>
      <Txt muted>{body}</Txt>
    </View>
  );
}
