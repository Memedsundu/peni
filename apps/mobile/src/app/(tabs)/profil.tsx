import { fill } from "@peni/api/customer-text";
import { useState } from "react";
import { View } from "react-native";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { Btn, Field, Label, Notice, Pills, Screen, Title, Toggle, Txt } from "../../ui/kit";

/** "Ben": the name others see, whether members can find you, the language, signing out. */
export default function Me() {
  const { me, t, lang, toggleLang, error, setMe, signOut } = useSession();
  const [name, setName] = useState(me?.customer.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  if (!me) return null;

  const save = async (input: { displayName?: string; profileVisible?: boolean }) => {
    setBusy(true);
    setMessage(null);
    try {
      setMe(await api.me.updateProfile(input));
      setMessage({ tone: "green", text: t("saved") });
    } catch (e) {
      setMessage({ tone: "red", text: error(e) });
    } finally {
      setBusy(false);
    }
  };
  const changed = name.trim() !== me.customer.displayName;
  return (
    <Screen back={false}>
      <View style={{ gap: 6 }}>
        <Title>{me.customer.displayName}</Title>
        {me.customer.email ? <Txt muted>{me.customer.email}</Txt> : null}
      </View>
      <View style={{ gap: 12 }}>
        <Field label={t("profileName")} value={name} onChangeText={setName} maxLength={40} autoComplete="name" textContentType="name" hint={t("nameHelp")} />
        {changed && (
          <Btn kind="primary" busy={busy} disabled={!name.trim()} onPress={() => void save({ displayName: name.trim() })}>
            {t("save")}
          </Btn>
        )}
      </View>
      <Toggle label={t("profileVisible")} help={t("profileVisibleHelp")} value={me.customer.profileVisible} disabled={busy} onChange={(v) => void save({ profileVisible: v })} />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <View style={{ gap: 10 }}>
        <Label>{t("language")}</Label>
        <Pills
          options={[
            ["tr", "Türkçe"],
            ["en", "English"],
          ]}
          value={lang}
          onChange={(l) => l !== lang && toggleLang()}
        />
      </View>
      {me.staffCafes.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label>{t("cafePanel")}</Label>
          <Txt muted>{fill(t("cafePanelHelp"), { cafes: me.staffCafes.map((c) => c.name).join(", ") })}</Txt>
        </View>
      )}
      <Btn kind="quiet" onPress={() => void signOut()}>
        {t("signOut")}
      </Btn>
    </Screen>
  );
}
