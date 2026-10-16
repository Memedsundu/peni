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
import { Coin, type CoinCafe } from "@/components/brand";
import { NumberRoll, T } from "@/components/ui";
import { storage } from "@/lib/storage";

const COIN = 28;

export type EarnMode = "pending" | "strike" | "still";

export function EarnMoment({ peni, cafe, mode }: { peni: number; cafe: CoinCafe; mode: EarnMode }) {
  const [landed, setLanded] = useState(mode !== "strike");
  // "+2 peni cüzdanında": "+2" rolls, "+2 peni" is peni ink (an amount), "cüzdanında" is ink.
  const tail = orderCopy.earned(peni).slice(formatPeni(peni, { signed: true }).length);

  if (mode === "pending") return <View style={styles.reserve} />;

  return (
    <View aria-hidden accessible={false} style={styles.row}>
      <Coin size={COIN} cafe={cafe} animate={mode === "strike" ? "strike" : null} onLand={() => setLanded(true)} />
      <View style={styles.words}>
        <NumberRoll
          kind="peni"
          signed
          value={landed ? peni : 0}
          trend={1}
          animated={mode === "strike"}
          variant="item"
          color="peniInk"
        />
        {/* Word spaces as margins: a leading or trailing space between flex items is not measured reliably. */}
        <T variant="item" color="peniInk" style={styles.word}>
          peni
        </T>
        <T variant="item" style={styles.word}>
          {tail.trim()}
        </T>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Once per order                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** SecureStore keys allow letters, digits, ".", "-" and "_". */
const seenKey = (orderId: string) => `peni.earnSeen.${orderId.replace(/[^A-Za-z0-9._-]/g, "_")}`;

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
      void storage.set(seenKey(orderId), "1").catch(() => {});
      return;
    }
    let alive = true;
    (async () => {
      let seen = false;
      try {
        seen = (await storage.get(seenKey(orderId))) === "1";
        if (!seen) await storage.set(seenKey(orderId), "1");
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
