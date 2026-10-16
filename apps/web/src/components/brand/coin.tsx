"use client";

import type { CoinSize } from "@peni/brand/shapes";
import { useReducedMotionConfig, type TargetAndTransition, type Transition } from "motion/react";
import * as m from "motion/react-m";
import { memo, useEffect, useRef, useState } from "react";
import { ease, spring } from "@/lib/motion";
import { cx } from "./_cx";
import { CoinArt, type CoinCafe } from "./coin-art";

export type { CoinCafe } from "./coin-art";

export interface CoinProps {
  /** 16 inline and wordmark · 28 rows, cart, post avatar · 56 wallet cards · 96 earn moment, Peni kodum, sign-in. */
  size: CoinSize;
  /** The café whose token this is. Omit for the generic coin ("PENİ · MAHALLENİN MASASI"). */
  cafe?: CoinCafe | null;
  /** "back" shows the value side ("1 / PENİ", or `backLabel`). Normally only seen during the flip. */
  face?: "front" | "back";
  /** The back face value during a flip: "+30". */
  backLabel?: string;
  /**
   * Plays once when set (again when it changes from null, or when the `key` changes):
   * - "strike" (A6): peni earned. The coin drops in and lands; start the number roll from `onLand`.
   * - "flip" (A7): gift accepted. A 420ms turn that shows the back ("+30 / PENİ") half-way.
   * Reduced motion: strike is a 150ms fade-in; flip is a 150ms crossfade to the back and back
   * again. Nothing translates, scales or rotates.
   */
  animate?: "strike" | "flip" | null;
  /** Strike only: the coin has landed. NumberFlow `trend={1}` starts here (A6). */
  onLand?: () => void;
  /** The animation has fully finished (after the strike's squash, or the end of the flip). */
  onAnimationComplete?: () => void;
  className?: string;
}

/* Targets live outside render, so a re-render never restarts an animation. */
const STRIKE_FROM: TargetAndTransition = { y: -14, scale: 1.2, opacity: 0 };
const STRIKE_TO: TargetAndTransition = { y: 0, scale: 1, opacity: 1 };
const SQUASH: TargetAndTransition = { y: 0, scale: 1, opacity: 1, scaleY: [0.94, 1] };
const SQUASH_TRANSITION: Transition = { scaleY: { duration: 0.09, ease: ease.outStrong } };
/** The strike spring's visual duration: when the coin touches down. */
const LANDING_MS = spring.strike.visualDuration * 1000;
const FADE_FROM: TargetAndTransition = { opacity: 0 };
const FADE_TO: TargetAndTransition = { opacity: 1 };
const FADE_TRANSITION: Transition = { duration: 0.15 };

const FLIP_FROM: TargetAndTransition = { rotateY: 0 };
const FLIP: TargetAndTransition = { rotateY: [0, 180, 360] };
const FLIP_TRANSITION: Transition = { duration: 0.42, ease: ease.outStrong };
/** Reduced flip: 150ms in, a short hold, 150ms out: the same 420ms, and no rotation. */
const CROSSFADE: TargetAndTransition = { opacity: [0, 1, 1, 0] };
const CROSSFADE_TRANSITION: Transition = { duration: 0.42, times: [0, 0.15 / 0.42, 0.27 / 0.42, 1], ease: "linear" };

/**
 * The Peni jetonu (design-system.md §6.1, §12.3): each café's own copper trade token.
 * Always decorative (`aria-hidden`); the amount beside it is the text.
 */
export const Coin = memo(function Coin({
  size,
  cafe,
  face = "front",
  backLabel,
  animate,
  onLand,
  onAnimationComplete,
  className,
}: CoinProps) {
  const box = cx("relative inline-block shrink-0 align-middle", className);
  const style = { width: size, height: size };
  const art = <CoinArt size={size} cafe={cafe} face={face} backLabel={backLabel} />;

  if (animate === "strike") {
    return (
      <Strike key="strike" className={box} style={style} onLand={onLand} onComplete={onAnimationComplete}>
        {art}
      </Strike>
    );
  }
  if (animate === "flip") {
    return (
      <Flip
        key="flip"
        className={box}
        style={style}
        size={size}
        onComplete={onAnimationComplete}
        front={art}
        back={<CoinArt size={size} cafe={cafe} face="back" backLabel={backLabel} />}
      />
    );
  }
  return (
    <span aria-hidden className={box} style={style}>
      {art}
    </span>
  );
});

interface PartProps {
  className: string;
  style: React.CSSProperties;
  onComplete?: () => void;
}

/**
 * A6 coin-strike: drop in on `spring.strike`, then a 90ms `scaleY [.94, 1]` squash on landing.
 * "Landing" is the spring's visual duration (350ms), not its numeric rest (~500ms later), so the
 * squash and the number roll meet the moment the coin visibly touches down.
 */
function Strike({ className, style, children, onLand, onComplete }: PartProps & { children: React.ReactNode; onLand?: () => void }) {
  const reduced = useReducedMotionConfig() === true;
  const [phase, setPhase] = useState<"strike" | "squash" | "done">("strike");
  const landed = useRef(false);
  const land = useRef<() => void>(() => {});
  land.current = () => {
    if (landed.current) return;
    landed.current = true;
    onLand?.();
  };

  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => {
      land.current();
      setPhase((p) => (p === "strike" ? "squash" : p));
    }, LANDING_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  if (reduced) {
    return (
      <m.span
        aria-hidden
        className={className}
        style={style}
        initial={FADE_FROM}
        animate={FADE_TO}
        transition={FADE_TRANSITION}
        onAnimationComplete={() => {
          if (phase !== "strike") return;
          setPhase("done");
          land.current();
          onComplete?.();
        }}
      >
        {children}
      </m.span>
    );
  }

  return (
    <m.span
      aria-hidden
      className={className}
      style={style}
      initial={STRIKE_FROM}
      animate={phase === "strike" ? STRIKE_TO : SQUASH}
      transition={phase === "strike" ? spring.strike : SQUASH_TRANSITION}
      onAnimationComplete={(definition) => {
        // The drop's spring may come to rest after the squash; only the squash ends the strike.
        if (definition !== SQUASH || phase !== "squash") return;
        setPhase("done");
        onComplete?.();
      }}
    >
      {children}
    </m.span>
  );
}

/** A7 coin-flip: `rotateY 0->180->360` in 420ms; both faces hide their backs. */
function Flip({
  className,
  style,
  size,
  front,
  back,
  onComplete,
}: PartProps & { size: number; front: React.ReactNode; back: React.ReactNode }) {
  const reduced = useReducedMotionConfig() === true;

  if (reduced) {
    return (
      <span aria-hidden className={className} style={style}>
        <span className="absolute inset-0">{front}</span>
        <m.span
          className="absolute inset-0"
          initial={FADE_FROM}
          animate={CROSSFADE}
          transition={CROSSFADE_TRANSITION}
          onAnimationComplete={onComplete}
        >
          {back}
        </m.span>
      </span>
    );
  }

  return (
    <span aria-hidden className={className} style={{ ...style, perspective: Math.max(240, size * 6) }}>
      <m.span
        className="absolute inset-0 transform-3d"
        initial={FLIP_FROM}
        animate={FLIP}
        transition={FLIP_TRANSITION}
        onAnimationComplete={onComplete}
      >
        <span className="absolute inset-0 backface-hidden">{front}</span>
        <span className="absolute inset-0 backface-hidden [transform:rotateY(180deg)]">{back}</span>
      </m.span>
    </span>
  );
}
