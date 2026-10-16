import { light } from "@peni/brand/tokens";
import { useMemo } from "react";
import { encode } from "uqr";

/**
 * The Peni kodu as a QR code (design-system.md §9.6): generated with `uqr`, quiet zone 4,
 * modules in light-theme `ink` on white in BOTH themes (a scanner needs dark on light; the
 * dark theme's cream ink would not scan). One path of horizontal runs, crisp edges.
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

  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={n} height={n} fill="white" />
      <path d={d} fill={light.ink} />
    </svg>
  );
}
