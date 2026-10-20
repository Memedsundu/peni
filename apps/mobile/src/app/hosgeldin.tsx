import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useSession } from "../lib/session";
import { Btn, Screen, Sheet, Txt } from "../ui/kit";

/** The first screen (design: welcome): what Peni is, and the two ways in. */
export default function Welcome() {
  const { me, t, lang, toggleLang } = useSession();
  const router = useRouter();
  const [cafeOwner, setCafeOwner] = useState(false);
  if (me) return <Redirect href="/" />;
  return (
    <Screen back={false}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt serif size={30}>
          Penny
        </Txt>
        <Btn kind="bare" size="sm" onPress={toggleLang} accessibilityLabel={lang === "tr" ? "English" : "Türkçe"}>
          {lang === "tr" ? "EN" : "TR"}
        </Btn>
      </View>
      <View style={{ gap: 20, paddingTop: 48 }}>
        <Txt serif size={56} accessibilityRole="header">
          {t("welcomeHeadline")}
        </Txt>
        <Txt size={18} muted>
          {t("welcomeBody")}
        </Txt>
      </View>
      <View style={{ gap: 10, paddingTop: 24 }}>
        <Btn kind="primary" size="lg" onPress={() => router.push("/giris")}>
          {t("welcomeStart")}
        </Btn>
        <Btn kind="bare" size="md" onPress={() => setCafeOwner(true)}>
          {t("haveCafe")}
        </Btn>
      </View>
      {cafeOwner && (
        <Sheet title={t("haveCafe")} onClose={() => setCafeOwner(false)}>
          <Txt size={17}>{t("haveCafeBody")}</Txt>
          <Btn kind="primary" onPress={() => setCafeOwner(false)}>
            {t("close")}
          </Btn>
        </Sheet>
      )}
    </Screen>
  );
}
