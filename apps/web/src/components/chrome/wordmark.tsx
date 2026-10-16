import { COIN } from "@peni/brand/shapes";
import Link from "next/link";
import { useId } from "react";

/**
 * The 16-layout coin (face + embossed "p", design-system.md §6.1) drawn at the wordmark size.
 * Decorative: the wordmark link carries the name.
 */
export function WordmarkCoin({ size = 20, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { gradient, face, darkRing, p } = COIN;
  return (
    <svg viewBox={COIN.viewBox} width={size} height={size} aria-hidden focusable="false" className={`shrink-0 ${className}`}>
      <defs>
        <radialGradient id={`${id}-face`} cx={gradient.cx} cy={gradient.cy} r={gradient.r}>
          {gradient.stops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </radialGradient>
      </defs>
      <circle cx={face.cx} cy={face.cy} r={face.r} fill={`url(#${id}-face)`} />
      <circle
        cx={darkRing.cx}
        cy={darkRing.cy}
        r={darkRing.r}
        fill="none"
        stroke={darkRing.stroke}
        strokeOpacity={darkRing.strokeOpacity}
        strokeWidth={darkRing.strokeWidth}
        className="hidden dark:inline"
      />
      <g fillRule="evenodd">
        <path
          d={p.d}
          transform={`translate(${p.highlight.dx} ${p.highlight.dy})`}
          fill={p.highlight.fill}
          fillOpacity={p.highlight.fillOpacity}
        />
        <path d={p.d} fill={p.fill} />
      </g>
    </svg>
  );
}

/**
 * Wordmark (§8.2): a 20px coin plus "peni" in Brygada 600 24px, linking home. With `compact`
 * (the order chip is showing on a phone narrower than 390px) only the coin remains.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="peni ana sayfa"
      className="-ml-1.5 inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[10px] px-1.5"
    >
      <WordmarkCoin size={20} />
      <span
        aria-hidden
        className={`font-display text-2xl leading-none font-semibold tracking-[-.01em] text-ink ${compact ? "max-[390px]:hidden" : ""}`}
      >
        peni
      </span>
    </Link>
  );
}
