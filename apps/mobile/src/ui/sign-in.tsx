import type { SessionDTO } from "@peni/api";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { Btn, Field, Notice, Txt, useScreenColors } from "./kit";

WebBrowser.maybeCompleteAuthSession();

/** Google's client id for this platform; the button only shows when the build has one. */
const GOOGLE_CLIENT = {
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
}[Platform.OS as "ios" | "android" | "web"] || undefined;

/**
 * Google, Apple or an email code, whichever the server has turned on. `onDone` runs once
 * they're in; new customers are asked their name over whatever comes next (`NameStep`).
 */
export function SignIn({ prompt, onDone }: { prompt?: string; onDone?: () => void | Promise<void> }) {
  const { t, error, signedIn } = useSession();
  const [providers, setProviders] = useState<{ google: boolean; apple: boolean; email: boolean } | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.auth.providers().then(setProviders, () => setProviders({ google: false, apple: false, email: true }));
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleReady, () => setAppleReady(false));
  }, []);

  const finish = async (session: SessionDTO) => {
    await signedIn(session);
    await onDone?.();
  };
  const run = async (fn: () => Promise<SessionDTO | null>) => {
    setMessage(null);
    try {
      const session = await fn();
      if (session) await finish(session);
    } catch (e) {
      setMessage(error(e));
    }
  };

  if (!providers) return null;
  const apple = providers.apple && appleReady;
  const google = providers.google && !!GOOGLE_CLIENT;
  return (
    <View style={{ gap: 14 }}>
      {prompt ? <Txt size={18}>{prompt}</Txt> : null}
      {apple && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={999}
          style={{ height: 52 }}
          onPress={() =>
            void run(async () => {
              const r = await AppleAuthentication.signInAsync({
                requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
              }).catch((e: { code?: string }) => {
                // Closing Apple's sheet is not an error.
                if (e.code === "ERR_REQUEST_CANCELED") return null;
                throw e;
              });
              if (!r?.identityToken) return null;
              const name = [r.fullName?.givenName, r.fullName?.familyName].filter(Boolean).join(" ") || undefined;
              return api.auth.apple({ idToken: r.identityToken, name });
            })
          }
        />
      )}
      {google && <GoogleButton label={t("continueGoogle")} onIdToken={(idToken) => void run(() => api.auth.google(idToken))} />}
      {(apple || google) && providers.email && (
        <Txt size={14} muted center>
          {t("orEmail")}
        </Txt>
      )}
      {providers.email ? <EmailCode onSession={(s) => run(async () => s)} /> : !apple && !google ? <Notice>{t("emailOff")}</Notice> : null}
      {message ? <Notice tone="red">{message}</Notice> : null}
    </View>
  );
}

function GoogleButton({ label, onIdToken }: { label: string; onIdToken: (idToken: string) => void }) {
  const [request, response, prompt] = Google.useIdTokenAuthRequest({ clientId: GOOGLE_CLIENT });
  // Each answer from Google signs in once, however often this renders.
  const used = useRef<string | null>(null);
  useEffect(() => {
    const idToken = response?.type === "success" ? response.params.id_token : undefined;
    if (idToken && used.current !== idToken) {
      used.current = idToken;
      onIdToken(idToken);
    }
  }, [response, onIdToken]);
  return (
    <Btn kind="secondary" size="md" disabled={!request} onPress={() => void prompt()}>
      {label}
    </Btn>
  );
}

/** Email, then the 6-digit code from it. */
function EmailCode({ onSession }: { onSession: (s: SessionDTO) => Promise<void> }) {
  const { t, error } = useSession();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(error(e));
    } finally {
      setBusy(false);
    }
  };

  if (!sentTo) {
    return (
      <View style={{ gap: 12 }}>
        <Field
          label={t("email")}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
        />
        <Btn
          kind="primary"
          size="lg"
          busy={busy}
          disabled={!email.includes("@")}
          onPress={() =>
            void go(async () => {
              await api.auth.emailStart(email.trim());
              setSentTo(email.trim());
              setCode("");
            })
          }
        >
          {t("sendCode")}
        </Btn>
        {message ? <Notice tone="red">{message}</Notice> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <Txt size={15} muted>
        {t("codeSent")} <Txt size={15}>{sentTo}</Txt>
      </Txt>
      <Field
        label={t("emailCode")}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        style={{ fontSize: 26, letterSpacing: 10 }}
      />
      <Btn kind="primary" size="lg" busy={busy} disabled={code.length !== 6} onPress={() => void go(async () => onSession(await api.auth.emailVerify({ email: sentTo, code })))}>
        {t("signIn")}
      </Btn>
      <Btn kind="bare" size="sm" onPress={() => setSentTo(null)}>
        {t("otherEmail")}
      </Btn>
      {message ? <Notice tone="red">{message}</Notice> : null}
    </View>
  );
}

/** "Adın ne?": the first time only, so cafés and friends see "Ayşe Y." (G8). */
export function NameStep() {
  const { me, t, error, setMe, named } = useSession();
  const c = useScreenColors();
  const [name, setName] = useState(me && !me.customer.displayName.includes("@") ? me.customer.displayName : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setMe(await api.me.updateProfile({ displayName: name.trim() }));
      named();
    } catch (e) {
      setMessage(error(e));
      setBusy(false);
    }
  };
  return (
    <Modal animationType="slide" visible onRequestClose={() => undefined}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
        <View style={{ gap: 14, padding: 24, paddingTop: 48, maxWidth: 560, width: "100%", alignSelf: "center" }}>
          <Txt serif size={40} accessibilityRole="header">
            {t("whatsYourName")}
          </Txt>
          <Field label={t("profileName")} value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={40} autoFocus />
          <Txt size={15} muted>
            {t("nameHelp")}
          </Txt>
          <Btn kind="primary" size="lg" busy={busy} disabled={!name.trim()} onPress={() => void save()}>
            {t("continue")}
          </Btn>
          {message ? <Notice tone="red">{message}</Notice> : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
