/**
 * Pieces the three Masa cards share (design-system.md §9.3 "Masa"): the optimistic `act()`
 * (rollback and a toast on failure), the answer / comment form, and the "join to take part"
 * note that stands in for the web popover.
 */
import { PeniApiError } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { useCallback, useRef, useState, type ComponentRef } from "react";
import { TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { Button, Field, T, toast } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { durations } from "@/lib/motion";
import { useSession } from "@/lib/session";
import { radius, useTokens } from "@/lib/theme";
import { cafeSheets, useCafe } from "./cafe-context";
import { setPendingJoin } from "./cafe-store";
import { COMMENT_MAX, withOverlay, type Overlay } from "./masa-model";

/** Errors whose fix is to join (or sign in), not to read a message. */
function needsJoin(e: unknown): boolean {
  return e instanceof PeniApiError && (e.status === 401 || e.code === "NOT_A_MEMBER" || e.code === "UNAUTHENTICATED");
}

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : errorCopy.generic;
}

/**
 * An optimistic toggle against one post (heart, RSVP). `act(next, request)` shows `next` at once
 * and sends the request, one at a time. On success the café is re-read and the server's
 * picture takes over; on failure the old state comes back and a top toast says why (§9.3
 * "Errors from act()"). A missing membership opens the join sheet instead.
 */
export function usePostToggle<T extends object>(server: T) {
  const { refresh, slug } = useCafe();
  const [overlay, setOverlay] = useState<Overlay<T> | null>(null);
  const inFlight = useRef(false);
  const shown = withOverlay(server, overlay);

  const act = useCallback(
    async (next: T, request: () => Promise<unknown>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setOverlay({ base: server, value: next });
      try {
        await request();
        await refresh();
      } catch (e) {
        setOverlay(null);
        if (needsJoin(e)) cafeSheets.join(slug);
        else {
          haptic("error");
          toast(messageOf(e), { tone: "danger" });
          // "Masa doldu": let the card catch up with the table it couldn't join.
          if (e instanceof PeniApiError && e.code === "EVENT_FULL") void refresh();
        }
      } finally {
        inFlight.current = false;
      }
    },
    [server, refresh, slug],
  );

  return { shown, act };
}

/**
 * The answer / comment form: a labelled multi-line field (max 500) and "Gönder". Not
 * optimistic: the text stays in the field until the server has it; a failure is said under the
 * field and the text is kept.
 */
export function CommentForm({
  postId,
  label,
  autoFocus = false,
  onSent,
  onCancel,
  style,
}: {
  postId: string;
  label: string;
  autoFocus?: boolean;
  onSent?: () => void;
  onCancel?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { api } = useSession();
  const { slug, refresh } = useCafe();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const submit = async () => {
    const body = text.trim();
    if (busy) return;
    // Nothing to send yet: back to the field (the button stays enabled, so it needs no reason).
    if (!body) {
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.cafes.comment(slug, postId, body);
      setText("");
      onSent?.();
      await refresh();
    } catch (e) {
      if (needsJoin(e)) cafeSheets.join(slug);
      else {
        haptic("error");
        setError(messageOf(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(durations.ui).reduceMotion(ReduceMotion.System)} style={[{ gap: 12 }, style]}>
      <Field
        label={label}
        value={text}
        onChangeText={(v) => {
          setText(v);
          if (error) setError(null);
        }}
        rows={3}
        maxLength={COMMENT_MAX}
        counter={text.length > COMMENT_MAX - 100}
        error={error}
        autoFocus={autoFocus}
        ref={input}
      />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        {onCancel ? <Button variant="quiet" size="sm" title={actionCopy.cancel} onPress={onCancel} disabled={busy} /> : null}
        <Button size="sm" title="Gönder" loading={busy} onPress={() => void submit()} />
      </View>
    </Animated.View>
  );
}

/**
 * The non-member's way in, in place of a popover: one sentence and "Katıl", which opens the
 * join sheet. Signed out, "Giriş yap ve katıl" goes straight to sign-in, and the café finishes
 * the join on return. `bare` drops the well (inside a tinted card, where a second tint would
 * read as a card in a card).
 */
export function JoinNote({ text, bare = false, style }: { text: string; bare?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTokens();
  const { slug, signedIn } = useCafe();
  const join = () => {
    if (signedIn) return cafeSheets.join(slug);
    setPendingJoin(slug);
    router.push("/giris");
  };
  return (
    <Animated.View
      entering={FadeIn.duration(durations.ui).reduceMotion(ReduceMotion.System)}
      style={[
        { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 8 },
        bare
          ? null
          : { borderRadius: radius.control, backgroundColor: t.surface2, paddingVertical: 8, paddingLeft: 12, paddingRight: 8 },
        style,
      ]}
    >
      <T variant="body" style={{ flexShrink: 1 }}>
        {text}
      </T>
      <Button variant="secondary" size="sm" title={signedIn ? "Katıl" : actionCopy.signInAndJoin} onPress={join} />
    </Animated.View>
  );
}
