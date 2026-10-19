import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSession } from "../lib/session";
import { Screen, Title, Txt } from "../ui/kit";
import { SignIn } from "../ui/sign-in";

/** "Giriş yap": Google, Apple or an email code. */
export default function SignInScreen() {
  const { me, t } = useSession();
  if (me) return <Redirect href="/" />;
  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Title>{t("signInTitle")}</Title>
        <Txt muted>{t("signInBody")}</Txt>
      </View>
      <SignIn />
    </Screen>
  );
}
