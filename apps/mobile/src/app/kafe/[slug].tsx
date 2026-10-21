import type { CafeDetailDTO, PostDTO, ReportInput } from "@peni/api";
import { fill } from "@peni/api/customer-text";
import { goods } from "@peni/brand/format";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Linking, Pressable, ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { api, imageUri, newKey } from "../../lib/api";
import { dayLabel, when } from "../../lib/dates";
import { useSession } from "../../lib/session";
import { FONTS } from "../../lib/theme";
import { Btn, Coin, Field, Loading, Notice, Photo, Pills, Screen, Sheet, styles, Txt, useScreenColors } from "../../ui/kit";
import { SignIn } from "../../ui/sign-in";

type ReportTarget = Pick<ReportInput, "targetType" | "targetId">;

/**
 * A café's page (DS25): its photo and name, the viewer's peni here, what's on the askı, then
 * the feed (plan piece 14). Anyone can read it; members like, comment, open events and report
 * what other members wrote (piece 15).
 */
export default function CafePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me, t, error } = useSession();
  const router = useRouter();
  const [cafe, setCafe] = useState<CafeDetailDTO | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  /** null: closed; "new": opening one; a post: editing it. */
  const [eventSheet, setEventSheet] = useState<"new" | PostDTO | null>(null);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.cafes.get(slug).then(setCafe, (e: unknown) => setMessage(error(e))), [slug, error]);
  useEffect(() => {
    void load();
  }, [load, me]);

  /** Runs an action on the feed, then shows the café as it is now. */
  const act = async (call: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await call();
    } catch (e) {
      setMessage(error(e));
    }
    await load();
  };

  if (!cafe) return <Screen>{message ? <Notice tone="red">{message}</Notice> : <Loading />}</Screen>;
  const member = !!cafe.membership;
  const paused = !!cafe.membership?.paused;
  const canWrite = member && !paused;
  const waiting = goods(
    cafe.askida.balancePeni,
    cafe.menu.filter((m) => m.askida && m.available),
  );
  const join = () => (me ? void act(() => api.cafes.join(cafe.slug)) : setSigningIn(true));

  return (
    <Screen
      hue={cafe.hue}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      <View style={{ gap: 16 }}>
        {cafe.coverImageUrl ? (
          <Photo url={cafe.coverImageUrl} label={cafe.name} />
        ) : (
          // No cover yet: the café's initial, as on its posts, rather than an empty box.
          <NoCover name={cafe.name} />
        )}
        <View style={{ gap: 4 }}>
          <Txt serif size={48} accessibilityRole="header">
            {cafe.name}
          </Txt>
          {cafe.district || cafe.address ? <Txt muted>{[cafe.address, cafe.district].filter(Boolean).join(" · ")}</Txt> : null}
        </View>
      </View>

      <Wallet cafe={cafe} onJoin={join} />

      {cafe.askida.enabled && (
        <AskiLink text={waiting ? fill(t("askidaLink"), { goods: waiting }) : t("askidaLinkEmpty")} onPress={() => router.push(`/aski?kafe=${encodeURIComponent(cafe.slug)}`)} />
      )}

      {paused && <Notice>{t("pausedNotice")}</Notice>}
      {canWrite && (
        <View style={{ gap: 10 }}>
          <Btn kind="secondary" onPress={() => setEventSheet("new")}>
            {`+  ${t("openEvent")}`}
          </Btn>
          <Txt size={14} muted center>
            {t("openEventHelp")}
          </Txt>
        </View>
      )}

      {message && <Notice tone="red">{message}</Notice>}
      <View style={{ gap: 16 }} accessibilityLabel={t("fromCafe")}>
        {cafe.posts.length === 0 && (
          <Txt muted center style={{ paddingVertical: 24 }}>
            {t("noFeed")}
          </Txt>
        )}
        {cafe.posts.map((p) => (
          <Post key={p.id} slug={cafe.slug} cafeName={cafe.name} post={p} member={member} paused={paused} act={act} onEdit={() => setEventSheet(p)} onReport={setReporting} onNeedMember={join} />
        ))}
      </View>

      {eventSheet && (
        <EventSheet
          slug={cafe.slug}
          editing={eventSheet === "new" ? null : eventSheet}
          onClose={() => setEventSheet(null)}
          onDone={async () => {
            setEventSheet(null);
            await load();
          }}
        />
      )}
      {reporting && (
        <ReportSheet
          slug={cafe.slug}
          target={reporting}
          onClose={() => {
            setReporting(null);
            void load();
          }}
        />
      )}
      {signingIn && (
        <Sheet title={t("signIn")} onClose={() => setSigningIn(false)}>
          <SignIn prompt={t("signInToJoin")} onDone={() => setSigningIn(false)} />
        </Sheet>
      )}
    </Screen>
  );
}

/** The viewer's peni here and the two things to do with them, or the way in. */
function Wallet({ cafe, onJoin }: { cafe: CafeDetailDTO; onJoin: () => void }) {
  const { me, t } = useSession();
  const c = useScreenColors();
  const router = useRouter();
  const box = { gap: 16, borderRadius: 28, backgroundColor: c.panel, padding: 20 } as const;
  if (!cafe.membership) {
    return (
      <View style={box}>
        <Txt>{me ? t("joinHelp") : t("signInToJoin")}</Txt>
        <Btn kind="cafe" size="lg" onPress={onJoin}>
          {me ? t("joinCafe") : t("signIn")}
        </Btn>
      </View>
    );
  }
  const q = `?kafe=${encodeURIComponent(cafe.slug)}`;
  return (
    <View style={box}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt muted>{t("yourPeni")}</Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Coin size={42} />
          <Txt serif size={48} color={c.cafe}>
            {cafe.membership.balancePeni} <Txt serif size={24} color={c.cafe}>penny</Txt>
          </Txt>
        </View>
      </View>
      {cafe.pennyOn ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Btn kind="quiet" onPress={() => router.push(`/harca${q}`)} style={{ flex: 1, paddingHorizontal: 8 }}>
            {t("payWithPeni")}
          </Btn>
          <Btn kind="quiet" onPress={() => router.push(`/ismarla${q}`)} style={{ flex: 1, paddingHorizontal: 8 }}>
            {t("treatSomeoneHere")}
          </Btn>
        </View>
      ) : (
        // The plan has no pennies now: the balance stays, but can't be spent or given here.
        <Txt muted size={14}>
          {t("pennyOff")}
        </Txt>
      )}
    </View>
  );
}

function AskiLink({ text, onPress }: { text: string; onPress: () => void }) {
  const c = useScreenColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => [{ minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }, pressed && { opacity: 0.7 }]}
    >
      <Txt size={18}>{text}</Txt>
      <Txt muted>→</Txt>
    </Pressable>
  );
}

function Post({
  slug,
  cafeName,
  post,
  member,
  paused,
  act,
  onEdit,
  onReport,
  onNeedMember,
}: {
  slug: string;
  cafeName: string;
  post: PostDTO;
  member: boolean;
  paused: boolean;
  act: (call: () => Promise<unknown>) => Promise<void>;
  onEdit: () => void;
  onReport: (target: ReportTarget) => void;
  onNeedMember: () => void;
}) {
  const { t, lang } = useSession();
  const c = useScreenColors();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const canWrite = member && !paused;
  const run = async (call: () => Promise<unknown>) => {
    setBusy(true);
    await act(call);
    setBusy(false);
  };
  const label = post.kind === "event" ? t("eventLabel") : post.kind === "question" ? t("questionOfDay") : null;
  const sendComment = () => {
    const body = comment.trim();
    if (body) void run(() => api.cafes.comment(slug, post.id, body)).then(() => setComment(""));
  };

  return (
    <View style={{ gap: 14, borderWidth: 1, borderColor: c.line, borderRadius: 24, padding: 16 }}>
      {/* Who it's from comes first, as on every social feed: it's what tells one post from the next. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Initial name={post.host ? post.host.name : cafeName} cafe={!post.host} size={36} />
        <Txt size={16} style={{ fontWeight: "600" }}>
          {post.host ? post.host.name : cafeName}
        </Txt>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {post.pinned && <Chip filled>{t("pinnedPost")}</Chip>}
        {label && <Chip>{label}</Chip>}
        {post.host?.mine && (
          <Txt size={14} muted>
            {t("hostedByYou")}
          </Txt>
        )}
        <Txt size={14} muted>
          {when(post.publishedAt, lang)}
        </Txt>
        {post.host && !post.host.mine && canWrite && (
          <View style={{ marginLeft: "auto" }}>
            <ReportButton done={post.reportedByMe} onPress={() => onReport({ targetType: "post", targetId: post.id })} />
          </View>
        )}
      </View>
      {post.title ? (
        <Txt serif size={32} accessibilityRole="header">
          {post.title}
        </Txt>
      ) : null}
      {post.kind === "event" && post.eventStartsAt ? <Txt size={18}>{when(post.eventStartsAt, lang, true)}</Txt> : null}

      <Photos urls={post.imageUrls} />
      {post.body ? <Txt style={{ lineHeight: 26 }}>{post.body}</Txt> : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={() => (member ? void run(() => api.cafes.react(slug, post.id)) : onNeedMember())}
          disabled={busy || paused}
          accessibilityRole="button"
          accessibilityLabel={post.reactedByMe ? t("unlike") : t("like")}
          accessibilityState={{ selected: post.reactedByMe, disabled: busy || paused }}
          style={[styles.pill, { minHeight: 44, flexDirection: "row", gap: 8, borderColor: post.reactedByMe ? c.heart : c.line }]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
              fill={post.reactedByMe ? c.heart : "none"}
              stroke={post.reactedByMe ? c.heart : c.ink}
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
          </Svg>
          <Txt size={15} color={post.reactedByMe ? c.heart : c.ink}>
            {post.reactionCount}
          </Txt>
        </Pressable>
        {post.kind === "event" && post.host?.mine && <Chip filled big>{`${t("goingYes")} ✓`}</Chip>}
        {post.kind === "event" && !post.host?.mine && (
          <Btn kind={post.rsvpedByMe ? "cafe" : "quiet"} size="sm" disabled={busy || paused} onPress={() => (member ? void run(() => api.cafes.rsvp(slug, post.id)) : onNeedMember())}>
            {post.rsvpedByMe ? `${t("goingYes")} ✓` : t("join")}
          </Btn>
        )}
        <View style={{ marginLeft: "auto" }}>
          <Txt size={14} muted>
            {post.kind !== "event"
              ? fill(t("commentsN"), { n: post.commentCount })
              : post.eventCapacity
                ? fill(t("goingOfN"), { n: post.rsvpCount, max: post.eventCapacity })
                : fill(t("goingN"), { n: post.rsvpCount })}
          </Txt>
        </View>
      </View>

      {post.kind === "event" && (post.rsvpedByMe || post.host?.mine) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {post.host?.mine && (
            <>
              <Btn kind="quiet" size="sm" disabled={busy || paused} onPress={onEdit}>
                {t("editEvent")}
              </Btn>
              <Btn kind="quiet" size="sm" disabled={busy} onPress={() => setCancelling(true)}>
                {t("cancelEvent")}
              </Btn>
            </>
          )}
          <Btn kind="bare" size="sm" onPress={() => void Linking.openURL(api.cafes.icsUrl(slug, post.id))}>
            {t("addToCalendar")}
          </Btn>
        </View>
      )}
      {cancelling && (
        <Sheet title={t("cancelEventTitle")} onClose={() => setCancelling(false)}>
          <Txt muted>{t("cancelEventBody")}</Txt>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn kind="quiet" onPress={() => setCancelling(false)} style={{ flex: 1 }}>
              {t("keepEvent")}
            </Btn>
            <Btn kind="danger" busy={busy} onPress={() => void run(() => api.cafes.cancelEvent(slug, post.id)).then(() => setCancelling(false))} style={{ flex: 1 }}>
              {t("cancelEventYes")}
            </Btn>
          </View>
        </Sheet>
      )}

      {post.comments.length > 0 && (
        <View style={{ gap: 10, borderLeftWidth: 2, borderColor: c.line, paddingLeft: 16 }}>
          {post.comments.map((cm) => (
            <View key={cm.id} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt>
                  <Txt weight="semibold">{cm.authorName}</Txt> {cm.body}
                </Txt>
              </View>
              {cm.mine && (
                <Btn kind="bare" size="sm" disabled={busy} onPress={() => void run(() => api.cafes.deleteComment(slug, post.id, cm.id))} style={{ minHeight: 28, paddingHorizontal: 4 }}>
                  {t("deleteComment")}
                </Btn>
              )}
              {!cm.mine && canWrite && <ReportButton done={cm.reportedByMe} onPress={() => onReport({ targetType: "comment", targetId: cm.id })} />}
            </View>
          ))}
        </View>
      )}
      {post.kind === "question" && post.answeredTodayByMe && (
        <Txt size={14} muted>
          {t("answeredToday")}
        </Txt>
      )}
      {canWrite && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            placeholder={post.kind === "question" ? t("writeAnswer") : t("writeComment")}
            placeholderTextColor={c.muted}
            accessibilityLabel={post.kind === "question" ? t("writeAnswer") : t("writeComment")}
            returnKeyType="send"
            onSubmitEditing={sendComment}
            style={[styles.field, { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 999, borderColor: c.line, color: c.ink, fontFamily: FONTS.sans, fontSize: 16 }]}
          />
          <Btn kind="secondary" size="sm" disabled={busy || !comment.trim()} onPress={sendComment}>
            {t("sendComment")}
          </Btn>
        </View>
      )}
    </View>
  );
}

function Chip({ children, filled = false, big = false }: { children: string; filled?: boolean; big?: boolean }) {
  const c = useScreenColors();
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: big ? 16 : 12, minHeight: big ? 44 : 28, justifyContent: "center", backgroundColor: filled ? c.cafe : c.panel }}>
      <Txt size={14} weight={filled ? "semibold" : "regular"} color={filled ? c.paper : c.muted}>
        {children}
      </Txt>
    </View>
  );
}

/** One photo across, or several to swipe through. */
function Photos({ urls }: { urls: string[] }) {
  const { t } = useSession();
  const { width } = useWindowDimensions();
  const c = useScreenColors();
  const inner = Math.min(width, 560) - 48;
  if (urls.length === 0) return null;
  if (urls.length === 1) {
    return <Image source={{ uri: imageUri(urls[0]!) }} accessibilityLabel={fill(t("photoN"), { n: 1 })} style={{ width: inner, height: inner, borderRadius: 24, backgroundColor: c.tile }} resizeMode="cover" />;
  }
  const w = Math.round(inner * 0.85);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={w + 8} decelerationRate="fast" style={{ marginHorizontal: -24 }} contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}>
      {urls.map((url, i) => (
        <Image key={url} source={{ uri: imageUri(url) }} accessibilityLabel={fill(t("photoN"), { n: i + 1 })} style={{ width: w, height: Math.round(w * 1.25), borderRadius: 24, backgroundColor: c.tile }} resizeMode="cover" />
      ))}
    </ScrollView>
  );
}

/** A small flag: reports a member's comment or event, once. */
function ReportButton({ done, onPress }: { done: boolean; onPress: () => void }) {
  const { t } = useSession();
  const c = useScreenColors();
  const colour = done ? c.red : c.muted;
  return (
    <Pressable onPress={onPress} disabled={done} accessibilityRole="button" accessibilityLabel={done ? t("reported") : t("report")} hitSlop={8} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", marginVertical: -6 }}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d="M5 21V4M5 4h11l-2 4 2 4H5" fill={done ? colour : "none"} stroke={colour} strokeWidth={1.8} strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Opening an event, or the host changing theirs: a plan, a day and a time, maybe a limit. */
function EventSheet({ slug, editing, onClose, onDone }: { slug: string; editing: PostDTO | null; onClose: () => void; onDone: () => Promise<void> }) {
  const { t, lang, error } = useSession();
  const [createKey] = useState(() => `event-${newKey()}`);
  const start = editing?.eventStartsAt ? new Date(editing.eventStartsAt) : null;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [day, setDay] = useState(() => dayKey(start ?? new Date(Date.now() + 86_400_000)));
  const [time, setTime] = useState(start ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : "19:00");
  const [capacity, setCapacity] = useState(editing?.eventCapacity ? String(editing.eventCapacity) : "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // The next four weeks to tap, and the event's own day if it's further out.
  const days: [string, string][] = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return [dayKey(d), i === 0 ? t("today") : i === 1 ? t("tomorrow") : dayLabel(d, lang)];
  });
  if (start && !days.some(([k]) => k === dayKey(start))) days.push([dayKey(start), dayLabel(start, lang)]);

  const hm = /^(\d{1,2})[:.](\d{2})$/.exec(time.trim());
  const startsAt = (() => {
    if (!hm || Number(hm[1]) > 23 || Number(hm[2]) > 59) return null;
    const [y, m, d] = day.split("-").map(Number) as [number, number, number];
    return new Date(y, m - 1, d, Number(hm[1]), Number(hm[2]));
  })();
  const ready = title.trim().length >= 3 && !!startsAt;

  const submit = async () => {
    if (!startsAt) return;
    setBusy(true);
    setMessage(null);
    const input = { title: title.trim(), body: body.trim(), startsAt: startsAt.toISOString(), capacity: capacity ? Number(capacity) : null };
    try {
      if (editing) await api.cafes.updateEvent(slug, editing.id, input);
      else await api.cafes.openEvent(slug, { createKey, ...input });
      await onDone();
    } catch (e) {
      setMessage(error(e));
      setBusy(false);
    }
  };

  return (
    <Sheet title={editing ? t("editEventTitle") : t("openEvent")} onClose={onClose}>
      <Field label={t("eventTitle")} value={title} onChangeText={setTitle} maxLength={120} placeholder={t("eventTitleHint")} />
      <View style={{ gap: 8 }}>
        <Txt size={15} weight="medium">
          {t("eventDay")}
        </Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24 }} contentContainerStyle={{ paddingHorizontal: 24 }}>
          <View style={{ flexDirection: "row" }}>
            <Pills options={days} value={day} onChange={setDay} nowrap />
          </View>
        </ScrollView>
      </View>
      <Field label={t("eventHour")} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" maxLength={5} hint={t("eventHourHelp")} style={{ fontSize: 20 }} />
      <Field label={t("eventCapacity")} value={capacity} onChangeText={(v) => setCapacity(v.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" hint={t("eventCapacityHelp")} />
      <Field label={`${t("eventBody")} (${t("optional")})`} value={body} onChangeText={setBody} maxLength={1000} multiline />
      {message && <Notice tone="red">{message}</Notice>}
      <Btn kind="cafe" size="lg" busy={busy} disabled={!ready} onPress={() => void submit()}>
        {editing ? t("eventSave") : t("eventOpenSubmit")}
      </Btn>
    </Sheet>
  );
}

/** Why a member reports something: four plain reasons and room for a note. */
function ReportSheet({ slug, target, onClose }: { slug: string; target: ReportTarget; onClose: () => void }) {
  const { t, error } = useSession();
  const c = useScreenColors();
  const [reason, setReason] = useState<ReportInput["reason"] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const reasons: [ReportInput["reason"], string][] = [
    ["spam", t("reasonSpam")],
    ["rude", t("reasonRude")],
    ["unsafe", t("reasonUnsafe")],
    ["other", t("reasonOther")],
  ];

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.cafes.report(slug, { ...target, reason, note: note.trim() || undefined });
      setSent(true);
    } catch (e) {
      setMessage(error(e));
    }
    setBusy(false);
  };

  if (sent) {
    return (
      <Sheet title={t("report")} onClose={onClose}>
        <Txt size={18}>{t("reportThanks")}</Txt>
        <Btn kind="primary" onPress={onClose}>
          {t("close")}
        </Btn>
      </Sheet>
    );
  }
  return (
    <Sheet title={t("reportTitle")} onClose={onClose}>
      <Txt size={15} muted>
        {t("reportHelp")}
      </Txt>
      <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={t("reportTitle")}>
        {reasons.map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setReason(key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: reason === key }}
            style={{ minHeight: 52, justifyContent: "center", borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, borderColor: reason === key ? c.ink : c.line, backgroundColor: reason === key ? c.panel : c.paper }}
          >
            <Txt weight={reason === key ? "semibold" : "regular"}>{label}</Txt>
          </Pressable>
        ))}
      </View>
      <Field label={`${t("reportNote")} (${t("optional")})`} value={note} onChangeText={setNote} maxLength={300} multiline />
      {message && <Notice tone="red">{message}</Notice>}
      <Btn kind="primary" busy={busy} disabled={!reason} onPress={() => void send()}>
        {t("reportSend")}
      </Btn>
    </Sheet>
  );
}

/** A round initial: dark for the café, quiet grey for a member. Stands in for a photo. */
function Initial({ name, cafe = false, size }: { name: string; cafe?: boolean; size: number }) {
  const c = useScreenColors();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: cafe ? c.ink : c.tile, alignItems: "center", justifyContent: "center" }}>
      <Txt serif size={Math.round(size / 2)} color={cafe ? c.paper : c.ink}>
        {name.trim().charAt(0).toLocaleUpperCase("tr-TR")}
      </Txt>
    </View>
  );
}

function NoCover({ name }: { name: string }) {
  const c = useScreenColors();
  return (
    <View style={{ aspectRatio: 5 / 2, borderRadius: 24, backgroundColor: c.tile, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Initial name={name} cafe size={80} />
    </View>
  );
}
