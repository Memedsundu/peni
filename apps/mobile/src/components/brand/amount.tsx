/**
 * Amount (design-system.md §12.5): coin + CountWheel + "peni" + "≈ goods". Amounts read as
 * goods (principle 2): "Sende 90 peni · ≈ 3 çay". Peni in rows (sm, md) is Archivo 600
 * tabular; the big wallet balance (lg) is Brygada, lining and tabular (§4.1). Peni amounts are
 * `peniInk`; the goods line is `meta`, `ink2`. Only whole items are ever shown (D9).
 *
 * The mobile fonts include "≈" (D23 is web only), so the goods read "≈ 3 çay"; screen readers
 * hear one sentence: "Sende 90 peni, yaklaşık 3 çay".
 *
 * A6 coin-strike: pass `from`, the balance last seen, when it is lower than `peni` (see
 * `useLastSeenBalance`). The coin strikes, the number holds `from` until the coin lands, then
 * rolls up. Without a coin it rolls at once.
 */
import { goods as goodsOf, goodsLine, formatPeni, SEP, type RefItem } from "@peni/brand/format";
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { CountWheel, T } from "@/components/ui";
import { storage } from "@/lib/storage";
import type { TypeVariant } from "@/lib/theme";
import { Coin, type CoinCafe } from "./coin";

export interface AmountProps {
  peni: number;
  /** The café's reference items, cheapest first [G1]. Without them there is no goods part. */
  refItems?: readonly RefItem[] | null;
  /**
   * sm: 16pt coin, `strong` ("Sende 90 peni · ≈ 3 çay" on café cards and chips).
   * md: 28pt coin, `item`.
   * lg: wallet balance, `balance` "90" + " peni" in `body`, with the goods on their own line,
   *     both reference items ("≈ 3 çay · 1 Türk kahvesi").
   */
  size?: "sm" | "md" | "lg";
  /** Show the coin. Default true. */
  coin?: boolean;
  /** Show the goods. Default true (only when at least one whole item fits). */
  goods?: boolean;
  /** Whose coin (only the 56/96 layouts differ per café, so this is optional here). */
  cafe?: CoinCafe | null;
  /** Text before the number: "Sende". A string is set in the size's text style. */
  prefix?: ReactNode;
  /** A6: the balance last seen, when lower than `peni`. */
  from?: number | null;
  /** Overrides the spoken sentence. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const SIZES = {
  sm: { coin: 16, gap: 6, number: "strong", unit: "strong", prefix: "body" },
  md: { coin: 28, gap: 8, number: "item", unit: "item", prefix: "item" },
  lg: { coin: 28, gap: 10, number: "balance", unit: "body", prefix: "body" },
} as const satisfies Record<string, { coin: 16 | 28; gap: number; number: TypeVariant; unit: TypeVariant; prefix: TypeVariant }>;

/** The dot stays with the word before it, so a wrapped goods part never starts with "·". */
const DOT = SEP.trimEnd().replace(/^ /, "\u00A0");
/** A word space between flex items (trailing spaces are not reliably measured in a Text). */
const WORD_GAP = 4;

export const Amount = memo(function Amount({
  peni,
  refItems,
  size = "sm",
  coin = true,
  goods = true,
  cafe,
  prefix,
  from,
  accessibilityLabel,
  style,
}: AmountProps) {
  const s = SIZES[size];
  const { shown, run, runId, landed } = useStrike(peni, from, coin);
  const goodsText = goods ? (size === "lg" ? goodsLine(peni, refItems) : goodsOf(peni, refItems)) : null;
  const inline = size !== "lg" && goodsText != null;

  const prefixText = typeof prefix === "string" ? prefix.trimEnd() : null;
  const spoken =
    accessibilityLabel ??
    (prefix == null || prefixText != null
      ? `${prefixText ? `${prefixText} ` : ""}${formatPeni(peni)}${goodsText ? `, yaklaşık ${goodsText}` : ""}`
      : undefined);

  const prefixEl =
    prefix == null ? null : prefixText != null ? (
      <T variant={s.prefix} style={{ marginRight: WORD_GAP }}>
        {prefixText}
      </T>
    ) : (
      <View style={{ marginRight: WORD_GAP }}>{prefix}</View>
    );

  const number = (
    <View style={styles.line}>
      {prefixEl}
      {/* A new strike remounts the wheel, so it starts at `from` instead of rolling down to it. */}
      <CountWheel key={runId} value={shown} variant={s.number} color="peniInk" trend={run ? 1 : undefined} />
      <T variant={s.unit} color="peniInk">
        {" peni"}
        {inline ? (
          <T variant="meta" color="ink2">
            {DOT}
          </T>
        ) : null}
      </T>
      {inline ? (
        <T variant="meta" color="ink2" style={{ marginLeft: WORD_GAP }}>
          {`≈\u00A0${goodsText}`}
        </T>
      ) : null}
    </View>
  );

  return (
    <View
      accessible={spoken != null}
      accessibilityLabel={spoken}
      style={[size === "lg" ? styles.stack : null, style]}
    >
      <View style={[styles.row, { gap: s.gap }]}>
        {coin ? <Coin key={runId} size={s.coin} cafe={cafe} animate={run ? "strike" : null} onLand={landed} /> : null}
        {number}
      </View>
      {size === "lg" && goodsText ? (
        <T variant="meta" color="ink2">
          {`≈\u00A0${goodsText.split(SEP).join("\u00A0· ")}`}
        </T>
      ) : null}
    </View>
  );
});

/* ------------------------------------------------------------------------------------------ */
/* The strike                                                                                 */
/* ------------------------------------------------------------------------------------------ */

interface StrikeRun {
  id: number;
  from: number;
  to: number;
  landed: boolean;
}

/**
 * A strike starts when `from` arrives lower than `peni` (at mount, or later, once
 * `useLastSeenBalance` has read storage), holds the old value until the coin lands, then shows
 * `peni`. Later changes of `peni` roll as usual.
 */
function useStrike(peni: number, from: number | null | undefined, coin: boolean) {
  const [run, setRun] = useState<StrikeRun | null>(from != null && from < peni ? { id: 1, from, to: peni, landed: false } : null);
  const [seenFrom, setSeenFrom] = useState(from);

  // A new `from` after mount starts a new strike (adjusted during render, not in an effect).
  if (from !== seenFrom) {
    setSeenFrom(from);
    if (from != null && from < peni) setRun({ id: (run?.id ?? 0) + 1, from, to: peni, landed: false });
  }

  const landed = useCallback(() => setRun((r) => (r && !r.landed ? { ...r, landed: true } : r)), []);

  // No coin to wait for: roll on the next frame.
  useEffect(() => {
    if (!coin && run && !run.landed) {
      const raf = requestAnimationFrame(landed);
      return () => cancelAnimationFrame(raf);
    }
  }, [coin, run, landed]);

  // The strike belongs to the value it was started for; a later change of `peni` rolls as usual.
  const active = run !== null && run.to === peni ? run : null;
  const shown = active && !active.landed ? active.from : peni;
  return { shown, run: active, runId: run?.id ?? 0, landed };
}

/* ------------------------------------------------------------------------------------------ */
/* Last seen balance                                                                          */
/* ------------------------------------------------------------------------------------------ */

/** SecureStore keys allow only letters, digits, ".", "-" and "_". */
function lastSeenKey(slug: string): string {
  return `peni.lastSeen.${slug.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/**
 * A6 trigger for the wallet: "a wallet balance higher than last seen (stored per café in
 * SecureStore)". Returns the last seen balance when it is lower than `balance` (pass it to
 * `<Amount from>`), otherwise null; then remembers `balance`. A storage failure simply means
 * no strike.
 */
export function useLastSeenBalance(cafeSlug: string | null | undefined, balance: number | null | undefined): number | null {
  const [from, setFrom] = useState<number | null>(null);
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!cafeSlug || balance == null) return;
    const key = lastSeenKey(cafeSlug);
    let alive = true;
    (async () => {
      let previous: number | null = null;
      try {
        const raw = await storage.get(key);
        previous = raw === null ? null : Number(raw);
        await storage.set(key, String(balance));
      } catch {
        return;
      }
      if (!alive) return;
      const sameKey = lastKey.current === key;
      lastKey.current = key;
      if (previous !== null && Number.isFinite(previous) && previous < balance) setFrom(previous);
      else if (!sameKey) setFrom(null);
    })();
    return () => {
      alive = false;
    };
  }, [cafeSlug, balance]);
  return from;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", flexShrink: 1, minWidth: 0 },
  stack: { gap: 4 },
});
