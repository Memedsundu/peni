import { zipBytes } from "./zip";

/**
 * A small .xlsx writer for the month-end package (plan piece 30): sheets of text and
 * numbers, a bold header row that stays in view, money with two decimals, a bold total
 * row. Enough for a mali müşavir to open in Excel and sum up; no formulas, no styles beyond that.
 */
export type CellKind = "text" | "tl" | "int" | "pct";

export interface SheetColumn {
  title: string;
  kind?: CellKind;
  /** In characters. */
  width?: number;
}

export interface Sheet {
  /** At most 31 characters; Excel's own rule. */
  name: string;
  columns: SheetColumn[];
  rows: (string | number | null)[][];
  /** A last row in bold: "Toplam" and the sums. */
  total?: (string | number | null)[];
}

// Style ids in cellXfs below.
const S = { text: 0, head: 1, tl: 2, int: 3, pct: 4, boldText: 5, boldTl: 6, boldInt: 7 } as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0&quot;%&quot;"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEEEEA"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

/** "A", "B", … "Z", "AA". */
function column(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Text as XML, without the control characters XML can't hold. */
function xml(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function cell(ref: string, v: string | number | null, style: number): string {
  if (v === null || v === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const kinds = sheet.columns.map((c) => c.kind ?? "text");
  const style = (k: CellKind, bold: boolean) =>
    bold ? (k === "tl" ? S.boldTl : k === "int" ? S.boldInt : S.boldText) : k === "tl" ? S.tl : k === "int" ? S.int : k === "pct" ? S.pct : S.text;
  const rows: string[] = [];
  rows.push(`<row r="1">${sheet.columns.map((c, i) => cell(`${column(i)}1`, c.title, S.head)).join("")}</row>`);
  const body = [...sheet.rows.map((r) => ({ r, bold: false })), ...(sheet.total ? [{ r: sheet.total, bold: true }] : [])];
  body.forEach(({ r, bold }, n) => {
    const at = n + 2;
    rows.push(`<row r="${at}">${r.map((v, i) => cell(`${column(i)}${at}`, v, style(typeof v === "number" ? kinds[i]! : "text", bold))).join("")}</row>`);
  });
  const widths = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? Math.max(10, c.title.length + 2)}" customWidth="1"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

/** Excel's sheet names: 31 characters, none of []:*?/\, each different. */
function sheetNames(sheets: Sheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((s, i) => {
    let name =
      s.name
        .replace(/[[\]:*?/\\]/g, " ")
        .trim()
        .slice(0, 31) || `Sayfa ${i + 1}`;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${i + 1}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export async function xlsxBytes(sheets: Sheet[], at?: Date): Promise<Uint8Array> {
  const names = sheetNames(sheets);
  const enc = (s: string) => new TextEncoder().encode(s);
  return zipBytes(
    [
      {
        name: "[Content_Types].xml",
        data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("")}</Types>`),
      },
      {
        name: "_rels/.rels",
        data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      },
      {
        name: "xl/workbook.xml",
        data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
          .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("")}</sheets></workbook>`),
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join(
            "",
          )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
      },
      { name: "xl/styles.xml", data: enc(STYLES) },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(s)) })),
    ],
    at,
  );
}
