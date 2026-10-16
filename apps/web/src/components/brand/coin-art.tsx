import { cafeDevice, coinInitials, coinLegend } from "@peni/brand/format";
import { beads, COIN, coinLayers, DEVICE, type CoinSize } from "@peni/brand/shapes";
import { useId } from "react";
import { svgId } from "./_cx";

/*
 * The Peni jetonu as a still picture (design-system.md §6.1). Every number comes from
 * `COIN` / `coinLayers()` in @peni/brand; this file only turns them into SVG. `Coin`
 * (coin.tsx) adds the strike and flip animations around it.
 *
 * Server-safe (no client hooks besides `useId`), so static coins render in server components.
 */

/** The café a coin belongs to. Without one the coin is the generic coin (sign-in, app icon). */
export interface CoinCafe {
  name: string;
  district?: string | null;
  city?: string | null;
  slug: string;
}

export interface CoinArtProps {
  size: CoinSize;
  cafe?: CoinCafe | null;
  face?: "front" | "back";
  /** Back face value, "+30". Default "1". */
  backLabel?: string;
  className?: string;
}

const BEADS = beads();
const C = COIN;

/** Ids MUST be unique per instance (§6): every coin gets its own gradient and rim path. */
export function CoinArt({ size, cafe, face = "front", backLabel, className }: CoinArtProps) {
  const id = svgId(useId());
  const layers = coinLayers(size, { generic: !cafe, face });
  const device = cafe && layers.device ? DEVICE[cafeDevice(cafe.slug)] : null;
  const triad = cafe && layers.initials ? coinInitials(cafe) : null;
  const legend = layers.legend ? (cafe ? coinLegend(cafe.name, cafe.district, C.rim.maxChars) : C.generic.legend) : null;
  const pT = layers.pTransform;

  return (
    <svg
      viewBox={C.viewBox}
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={className ? `block shrink-0 ${className}` : "block shrink-0"}
    >
      <defs>
        <radialGradient id={`${id}-face`} cx={C.gradient.cx} cy={C.gradient.cy} r={C.gradient.r}>
          {C.gradient.stops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </radialGradient>
        {legend && <path id={`${id}-rim`} d={C.rim.d} fill="none" />}
      </defs>

      <circle cx={C.face.cx} cy={C.face.cy} r={C.face.r} fill={`url(#${id}-face)`} />
      {/* Dark theme only: the edge holds against the dark page (3.45:1). */}
      <circle
        cx={C.darkRing.cx}
        cy={C.darkRing.cy}
        r={C.darkRing.r}
        fill="none"
        stroke={C.darkRing.stroke}
        strokeOpacity={C.darkRing.strokeOpacity}
        strokeWidth={C.darkRing.strokeWidth}
        className="hidden dark:inline"
      />

      {layers.beads && (
        <g fill={C.beads.fill}>
          {BEADS.map((b, i) => (
            <circle key={i} cx={b.cx} cy={b.cy} r={C.beads.r} />
          ))}
        </g>
      )}
      {layers.hairline && (
        <circle
          cx={C.hairline.cx}
          cy={C.hairline.cy}
          r={C.hairline.r}
          fill="none"
          stroke={C.hairline.stroke}
          strokeWidth={C.hairline.strokeWidth}
        />
      )}

      {layers.band && (
        <>
          <circle
            cx={C.band.ring.cx}
            cy={C.band.ring.cy}
            r={C.band.ring.r}
            fill="none"
            stroke={C.band.ring.stroke}
            strokeWidth={C.band.ring.strokeWidth}
          />
          <circle
            cx={C.band.outer.cx}
            cy={C.band.outer.cy}
            r={C.band.outer.r}
            fill="none"
            stroke={C.band.outer.stroke}
            strokeWidth={C.band.outer.strokeWidth}
          />
          <circle
            cx={C.band.inner.cx}
            cy={C.band.inner.cy}
            r={C.band.inner.r}
            fill="none"
            stroke={C.band.inner.stroke}
            strokeWidth={C.band.inner.strokeWidth}
          />
        </>
      )}
      {legend && (
        <text
          className="font-sans"
          fontWeight={C.rim.fontWeight}
          fontSize={C.rim.fontSize}
          letterSpacing={C.rim.letterSpacing}
          fill={C.rim.fill}
          style={{ fontStretch: C.rim.fontStretch }}
        >
          <textPath href={`#${id}-rim`} startOffset={C.rim.startOffset} textAnchor="middle">
            {legend}
          </textPath>
        </text>
      )}

      {layers.p && (
        <g fillRule={C.p.fillRule} transform={pT && pT.scale !== 1 ? pT.transform : undefined}>
          <path
            d={C.p.d}
            transform={`translate(${C.p.highlight.dx} ${C.p.highlight.dy})`}
            fill={C.p.highlight.fill}
            fillOpacity={C.p.highlight.fillOpacity}
          />
          <path d={C.p.d} fill={C.p.fill} />
        </g>
      )}

      {device && layers.deviceTransform && (
        <g
          transform={layers.deviceTransform.transform}
          fill="none"
          strokeWidth={C.device.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d={device}
            stroke={C.device.highlight.stroke}
            strokeOpacity={C.device.highlight.strokeOpacity}
            transform={`translate(${C.device.highlight.dx} ${C.device.highlight.dy})`}
          />
          <path d={device} stroke={C.device.stroke} />
        </g>
      )}
      {triad && layers.initialsAt && (
        <g fill={C.initials.fill} textAnchor="middle" fontWeight={600}>
          <text x={32} y={layers.initialsAt.topY} fontSize={layers.initialsAt.topSize} className="font-display">
            {triad.top}
          </text>
          {triad.bottom && (
            <text
              x={32}
              y={layers.initialsAt.bottomY}
              fontSize={layers.initialsAt.bottomSize}
              letterSpacing={C.initials.bottom.letterSpacing}
              className="font-sans"
            >
              {triad.bottom}
            </text>
          )}
        </g>
      )}

      {face === "back" && (
        <g fill={C.back.fill} textAnchor="middle" fontWeight={600}>
          <text
            x={C.back.value.x}
            y={C.back.value.y}
            fontSize={C.back.value.fontSize}
            className="font-display"
            style={{ fontVariantNumeric: "lining-nums tabular-nums" }}
          >
            {backLabel ?? C.back.value.fallback}
          </text>
          <text
            x={C.back.label.x}
            y={C.back.label.y}
            fontSize={C.back.label.fontSize}
            letterSpacing={C.back.label.letterSpacing}
            className="font-sans"
            style={{ fontStretch: C.back.label.fontStretch }}
          >
            {C.back.label.text}
          </text>
        </g>
      )}
    </svg>
  );
}
