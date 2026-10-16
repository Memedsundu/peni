import { light } from "@peni/brand/tokens";
import { useMemo } from "react";
import { encode } from "uqr";

/**
 * The Peni kodu as a QR code (design-system.md §9.6): generated with `uqr`, quiet zone 4,
 * modules in light-theme `ink` on white in BOTH themes (a scanner needs dark on light; the
 * dark theme's cream ink would not scan). One path of horizontal runs, crisp edges.
 *
 * Every module is a whole number of pixels: 29 modules over 240px would be 8.28px each, and
 * crisp edges would snap them to an uneven mix of 8 and 9. So the code is drawn at
 * `n × floor(size / n)` (232px for 29 modules) and centred in the `size` white square, which
 * keeps the 240px footprint and adds a few pixels to the quiet zone.
 *
 * Decorative for screen readers: the code itself is printed as text right under it.
 */
export function QrCode({ value, size = 240, className }: { value: string; size?: number; className?: string }) {
  const { d, n } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 4 });
    let path = "";
    qr.data.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (!row[x]) {
          x++;
          continue;
        }
        const start = x;
        while (x < row.length && row[x]) x++;
        path += `M${start} ${y}h${x - start}v1h-${x - start}z`;
      }
    });
    return { d: path, n: qr.size };
  }, [value]);

  const drawn = n * Math.max(1, Math.floor(size / n));

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, background: "white" }}
    >
      <svg viewBox={`0 0 ${n} ${n}`} width={drawn} height={drawn} focusable="false" shapeRendering="crispEdges">
        <rect width={n} height={n} fill="white" />
        <path d={d} fill={light.ink} />
      </svg>
    </span>
  );
}
