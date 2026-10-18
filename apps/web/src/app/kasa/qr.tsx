import qrcode from "qrcode-generator";

/** A QR code as crisp SVG squares; scales to any size. */
export function Qr({ value, size, label }: { value: string; size: number; label: string }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={label} shapeRendering="crispEdges" className="shrink-0 rounded-xl">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#ffffff" />
      <path d={d} fill="#111111" />
    </svg>
  );
}
