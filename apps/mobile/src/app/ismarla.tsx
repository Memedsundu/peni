import type { CafeMemberDTO, FullWalletDTO, GiftDTO, RecentRecipientDTO, SendGiftInput, WalletCafeDTO } from "@peni/api";
import { fill } from "@peni/api/customer-text";
import { dativeName, goods } from "@peni/brand/format";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { api, newKey } from "../lib/api";
import { useSession } from "../lib/session";
import { FONTS } from "../lib/theme";
import { GiftActions, ShareLink } from "../ui/gifts";
import { AmountPicker, Btn, CafeLine, CafePicker, Coin, Field, Label, Loading, Notice, Screen, styles, Title, Txt, useScreenColors } from "../ui/kit";
import { SignIn } from "../ui/sign-in";

/** Whom the treat goes to, as the server wants it, and how to say their name. */
interface Recipient {
  to: Pick<SendGiftInput, "toMemberId" | "toCode" | "toPhone">;
  label: string;
  firstName: string;
}

type Mode = "list" | "code" | "phone";

const nameOf = (p: { firstName: string; lastInitial: string | null }) => (p.lastInitial ? `${p.firstName} ${p.lastInitial}.` : p.firstName);

/** "0532 000 00 01" or "5320000001" as +905320000001; anything else as typed. */
function e164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("90") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+9${digits}`;
  if (digits.length === 10) return `+90${digits}`;
  return raw.trim();
}

/** "Ismarla" (plan piece 12): pick the café, the person and the amount, then share the treat's link. */
export default function SendTreat() {
  const params = useLocalSearchParams<{ kafe?: string }>();
  const { me, t, lang, error } = useSession();
  const [wallet, setWallet] = useState<FullWalletDTO | null>(null);
  const [cafe, setCafe] = useState<string | null>(params.kafe ?? null);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [sent, setSent] = useState<GiftDTO | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    api.wallet.get().then(
      (w) => {
        setWallet(w);
        setCafe((c) => (c && w.cafes.some((x) => x.cafeSlug === c) ? c : w.cafes.length === 1 ? w.cafes[0]!.cafeSlug : null));
      },
      (e: unknown) => setMessage(error(e)),
    );
  }, [me, error]);

  const here = wallet?.cafes.find((c) => c.cafeSlug === cafe) ?? null;
  const restart = () => {
    setSent(null);
    setRecipient(null);
    setMessage(null);
    api.wallet.get().then(setWallet, () => undefined);
  };

  let body;
  if (!me) body = <SignIn prompt={t("signInToTreat")} />;
  else if (!wallet) body = message ? null : <Loading />;
  else if (wallet.cafes.length === 0) body = <Txt size={18}>{t("treatNoCafe")}</Txt>;
  else if (!here)
    body = <CafePicker title={t("treatWhichCafe")} cafes={wallet.cafes.map((c) => ({ slug: c.cafeSlug, name: c.cafeName, right: `${c.balancePeni} penny` }))} onPick={setCafe} />;
  else if (sent && recipient) {
    body = (
      <View style={{ gap: 22 }} accessibilityLiveRegion="polite">
        <CafeLine name={here.cafeName} />
        {sent.status === "pending" ? (
          <>
            <Title>{fill(t("sent"), { name: lang === "tr" ? dativeName(recipient.firstName) : recipient.firstName, n: sent.peni })}</Title>
            <Txt muted>{fill(t("sentBody"), { h: Math.round((Date.parse(sent.expiresAt) - Date.parse(sent.createdAt)) / 3_600_000) })}</Txt>
            <Txt>{t("shareHelp")}</Txt>
            <ShareLink gift={sent} />
          </>
        ) : (
          <Title>{t("takenBack")}</Title>
        )}
        <GiftActions gift={sent} onChange={setSent} onError={setMessage} />
        <Btn kind="bare" size="sm" onPress={restart}>
          {t("treatAnother")}
        </Btn>
      </View>
    );
  } else {
    body = (
      <View style={{ gap: 24 }}>
        <CafeLine name={here.cafeName} />
        {recipient ? (
          <HowMuch cafe={here} recipient={recipient} onChange={() => setRecipient(null)} onSent={setSent} onError={setMessage} />
        ) : (
          <Who cafeSlug={here.cafeSlug} recents={wallet.recentRecipients.filter((r) => r.cafeSlug === here.cafeSlug)} onPick={(r) => (setMessage(null), setRecipient(r))} onError={setMessage} />
        )}
        {wallet.cafes.length > 1 && !recipient && (
          <Btn kind="bare" size="sm" onPress={() => setCafe(null)}>
            {t("otherCafe")}
          </Btn>
        )}
      </View>
    );
  }

  return (
    <Screen hue={here?.hue ?? null}>
      {body}
      {message && <Notice tone="red">{message}</Notice>}
    </Screen>
  );
}

/** "Kime ısmarlıyorsun?": someone treated before, a member from the list, a Peni kodu or a phone. */
function Who({ cafeSlug, recents, onPick, onError }: { cafeSlug: string; recents: RecentRecipientDTO[]; onPick: (r: Recipient) => void; onError: (m: string | null) => void }) {
  const { t, error } = useSession();
  const c = useScreenColors();
  const [mode, setMode] = useState<Mode>("list");
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<CafeMemberDTO[] | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "list") return;
    const timer = setTimeout(
      () =>
        api.cafes.members(cafeSlug, q.trim() || undefined).then(
          (r) => setMembers(r.members),
          () => setMembers([]),
        ),
      q ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [mode, q, cafeSlug]);

  const find = async () => {
    setBusy(true);
    onError(null);
    try {
      const by = mode === "code" ? { code: typed.trim() } : { phone: e164(typed) };
      const found = await api.cafes.lookupMember(cafeSlug, by);
      onPick({ to: "code" in by ? { toCode: by.code } : { toPhone: by.phone }, label: nameOf(found), firstName: found.firstName });
    } catch (e) {
      onError(error(e));
    } finally {
      setBusy(false);
    }
  };

  const tabs: [Mode, string][] = [
    ["list", t("byList")],
    ["code", t("byCode")],
    ["phone", t("byPhone")],
  ];
  return (
    <>
      <View style={{ gap: 8 }}>
        <Title>{t("treatWho")}</Title>
        <Txt muted>{t("treatOnlyHere")}</Txt>
      </View>
      {recents.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>{t("recents")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {recents.map((r) => (
              <Btn key={r.memberId} kind="quiet" size="sm" onPress={() => onPick({ to: { toMemberId: r.memberId }, label: nameOf(r), firstName: r.firstName })}>
                {nameOf(r)}
              </Btn>
            ))}
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row", backgroundColor: c.panel, borderRadius: 999, padding: 4 }} accessibilityRole="tablist">
        {tabs.map(([m, name]) => (
          <Pressable
            key={m}
            onPress={() => (setMode(m), setTyped(""), onError(null))}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
            style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: mode === m ? c.paper : "transparent" }}
          >
            <Txt size={15} weight={mode === m ? "medium" : "regular"} muted={mode !== m}>
              {name}
            </Txt>
          </Pressable>
        ))}
      </View>
      {mode === "list" ? (
        <View style={{ gap: 6 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t("searchMembers")}
            placeholderTextColor={c.muted}
            accessibilityLabel={t("searchMembers")}
            autoCorrect={false}
            style={[styles.field, { borderRadius: 999, borderColor: c.line, color: c.ink, fontFamily: FONTS.sans, minHeight: 50 }]}
          />
          {members?.length === 0 && (
            <Txt muted style={{ paddingVertical: 8 }}>
              {t("noMembers")}
            </Txt>
          )}
          {members?.map((m) => (
            <Pressable
              key={m.memberId}
              onPress={() => onPick({ to: { toMemberId: m.memberId }, label: nameOf(m), firstName: m.firstName })}
              accessibilityRole="button"
              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, borderBottomWidth: 1, borderColor: c.line }, pressed && { opacity: 0.7 }]}
            >
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.panel, alignItems: "center", justifyContent: "center" }}>
                <Txt size={14} weight="medium">
                  {m.initials}
                </Txt>
              </View>
              <Txt size={18}>{nameOf(m)}</Txt>
            </Pressable>
          ))}
          <Txt size={14} muted style={{ paddingTop: 8 }}>
            {t("listHelp")}
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Field
            label={mode === "code" ? t("byCode") : t("phoneNumber")}
            value={typed}
            onChangeText={setTyped}
            keyboardType={mode === "phone" ? "phone-pad" : "default"}
            autoCapitalize={mode === "code" ? "characters" : "none"}
            autoCorrect={false}
            placeholder={mode === "code" ? "M7K-42Q" : "0532 000 00 00"}
            hint={mode === "code" ? t("codeHelpTreat") : undefined}
            onSubmitEditing={() => typed.trim() && void find()}
            style={{ fontSize: 20, letterSpacing: 1 }}
          />
          <Btn kind="primary" busy={busy} disabled={!typed.trim()} onPress={() => void find()}>
            {t("find")}
          </Btn>
        </View>
      )}
    </>
  );
}

/** "Kaç peni?": a few amounts to tap or one to type, a note, and the send. */
function HowMuch({ cafe, recipient, onChange, onSent, onError }: { cafe: WalletCafeDTO; recipient: Recipient; onChange: () => void; onSent: (g: GiftDTO) => void; onError: (m: string | null) => void }) {
  const { t, lang, error } = useSession();
  const c = useScreenColors();
  const balance = cafe.balancePeni;
  const [peni, setPeni] = useState(Math.min(20, balance));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // One key per treat (a new person remounts this): a retried tap sends it once.
  const [key] = useState(newKey);

  const send = async () => {
    setBusy(true);
    onError(null);
    try {
      onSent(await api.gifts.send({ cafeSlug: cafe.cafeSlug, ...recipient.to, peni, message: note.trim() || undefined, idempotencyKey: key }));
    } catch (e) {
      onError(error(e));
    } finally {
      setBusy(false);
    }
  };

  const ok = peni >= 1 && peni <= balance;
  const name = lang === "tr" ? dativeName(recipient.firstName) : recipient.firstName;
  const asGoods = goods(peni, cafe.refItems);
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.panel, borderRadius: 18, paddingLeft: 20, paddingVertical: 6 }}>
        <Txt size={20} weight="medium">
          {recipient.label}
        </Txt>
        <Btn kind="bare" size="sm" onPress={onChange}>
          {t("change")}
        </Btn>
      </View>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Title>{t("howMuch")}</Title>
          <Txt muted>{`${t("yourBalance")}: ${balance}`}</Txt>
        </View>
        <AmountPicker amounts={[10, 20, 50]} value={peni} max={balance} onChange={setPeni} otherLabel={t("other")} label={t("howMuch")} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Coin size={54} />
          <Txt serif size={60} color={c.cafe}>
            {peni} <Txt serif size={30} color={c.cafe}>penny</Txt>
          </Txt>
        </View>
        {asGoods ? <Txt muted>{`≈ ${asGoods}`}</Txt> : null}
      </View>
      <Field label={t("note")} value={note} onChangeText={setNote} maxLength={140} placeholder={t("notePlaceholder")} />
      <Btn kind="cafe" size="lg" busy={busy} disabled={!ok} onPress={() => void send()}>
        {fill(t("treatTo"), { name, n: peni })}
      </Btn>
    </>
  );
}
