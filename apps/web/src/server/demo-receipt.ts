/**
 * A small receipt as a PDF, for the demo's first draft (piece 24): something to look at
 * beside what the assistant read. Courier in WinAnsi, which has ç, ö and ü but not ı, ğ
 * or ş, so those are written plain.
 */
export function receiptPdf(lines: { text: string; bold?: boolean }[]): Uint8Array {
  const plain = (s: string) =>
    s
      .replace(/ı/g, "i")
      .replace(/İ/g, "I")
      .replace(/ğ/g, "g")
      .replace(/Ğ/g, "G")
      .replace(/ş/g, "s")
      .replace(/Ş/g, "S")
      .replace(/[\\()]/g, (c) => `\\${c}`);
  const top = 40 + lines.length * 13;
  const text = lines.map((l, i) => `BT /${l.bold ? "F2" : "F1"} 9 Tf 18 ${top - i * 13} Td (${plain(l.text)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 280 ${top + 30}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${latin1(text).length} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(latin1(out).length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = latin1(out).length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1(out);
}

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
