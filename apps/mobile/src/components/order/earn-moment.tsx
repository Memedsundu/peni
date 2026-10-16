/**
 * The earn moment on a collected fiş (§9.4, A6 coin-strike): the café's 28pt coin drops in,
 * and when it lands the `success` haptic plays (the Coin does it) and "+2 peni" rolls up from
 * 0 on the CountWheel; "cüzdanında" stays put. Played once per order: live, or the first time
 * this collected order is opened (`useEarnMoment`). Otherwise it is simply there.
 * Reduced motion: the coin fades in over 150ms and the number swaps.
 *
 * Decorative for screen readers: the fiş headline's live region says it in words.
 */
import { orderCopy } from "@peni/brand/copy";
import { formatPeni } from "@peni/brand/format";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Coin, type CoinCafe } from "@/components/brand";
import { NumberRoll, T } from "@/components/ui";
import { durations, useMotionReduced } from "@/lib/motion";
import { storage } from "@/lib/storage";

const COIN = 28;
/** The words' fade, about as long as the coin's fall. */
const WORDS_MS = 300;

export type EarnMode = "pending" | "strike" | "still";

export function EarnMoment({ peni, cafe, mode }: { peni: number; cafe: CoinCafe; mode: EarnMode }) {
  if (mode === "pending") return <View style={styles.reserve} />;
  // Keyed: `landed` starts again from scratch when the strike begins, so the number rolls.
  return <EarnLine key={mode} peni={peni} cafe={cafe} strike={mode === "strike"} />;
}

function EarnLine({ peni, cafe, strike }: { peni: number; cafe: CoinCafe; strike: boolean }) {
  const reduced = useMotionReduced();
  const [landed, setLanded] = useState(!strike);
  // "+2 peni cüzdanında": "+2" rolls, "+2 peni" is peni ink (an amount), "cüzdanında" is ink.
  const tail = orderCopy.earned(peni).slice(formatPeni(peni, { signed: true }).length);

  return (
    <View aria-hidden accessible={false} style={styles.row}>
      <Coin size={COIN} cafe={cafe} animate={strike ? "strike" : null} onLand={() => setLanded(true)} />
      {/* The words come in as the coin falls, so a bare "+0" is never read on its own. */}
      <Animated.View entering={strike ? FadeIn.duration(reduced ? durations.reduced : WORDS_MS) : undefined} style={styles.words}>
        <NumberRoll kind="peni" signed value={landed ? peni : 0} trend={1} animated={strike} variant="item" color="peniInk" />
        {/* Word spaces as margins: a leading or trailing space between flex items is not measured reliably. */}
        <T variant="item" color="peniInk" style={styles.word}>
          peni
        </T>
        <T variant="item" style={styles.word}>
          {tail.trim()}
        </T>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Once per order                                                                              */
/* ------------------------------------------------------------------------------------------ */

/**
 * The orders whose earn moment has played here: one bounded key (the newest 50 ids), never a
 * key per order — Keychain items outlive the app, even an uninstall on iOS.
 */
const SEEN_KEY = "peni.earnSeen";
const SEEN_MAX = 50;

async function readSeen(): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse((await storage.get(SEEN_KEY)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Marks `orderId` as seen; returns whether it already was. */
async function markSeen(orderId: string): Promise<boolean> {
  const seen = await readSeen();
  if (seen.includes(orderId)) return true;
  await storage.set(SEEN_KEY, JSON.stringify([orderId, ...seen].slice(0, SEEN_MAX)));
  return false;
}

/**
 * Whether the A6 strike plays for this order: `strike` when the order was collected while the
 * customer was looking (`live`), or when its peni is seen here for the first time; `still`
 * after that. `pending` while the stored flag is read (a few ms), so the line never shows
 * still and then strikes.
 */
export function useEarnMoment(orderId: string | null, earned: number | null, live: boolean): EarnMode {
  const [mode, setMode] = useState<EarnMode>("pending");
  const decided = useRef<string | null>(null);

  useEffect(() => {
    if (!orderId || earned == null) return;
    // `live` is in the key: a collect seen live always strikes, whichever render learns it first.
    const key = `${orderId}:${earned}:${live}`;
    if (decided.current === key) return;
    decided.current = key;
    if (live) {
      setMode("strike");
      void markSeen(orderId).catch(() => {});
      return;
    }
    let alive = true;
    (async () => {
      let seen = false;
      try {
        seen = await markSeen(orderId);
      } catch {
        // Keychain unavailable: it may strike once more next time. Harmless.
      }
      if (alive) setMode(seen ? "still" : "strike");
    })();
    return () => {
      alive = false;
    };
  }, [orderId, earned, live]);

  return mode;
}

const styles = StyleSheet.create({
  reserve: { height: COIN },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: COIN },
  words: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", flexShrink: 1 },
  word: { marginLeft: 5 },
});
