import { XLSX_TYPE, type SheetType } from "@peni/core";
import { inflateRawSync } from "node:zlib";

/**
 * A bank's statement as a spreadsheet (plan piece 27): the rows of a CSV, or of the first
 * sheet of an .xlsx, as text cells. Banks export both; the model is shown the rows and
 * works out which column is which. Excel dates come back as "YYYY-MM-DD".
 */
export function sheetRows(bytes: Uint8Array, type: SheetType, maxRows = 2000): string[][] {
  const rows = type === XLSX_TYPE ? xlsxRows(bytes, maxRows) : csvRows(decodeText(bytes), maxRows);
  return rows.filter((r) => r.some((c) => c.trim()));
}

// ─────────────────────────────────────────────── CSV

/** UTF-8 when it is, else Windows-1254, which Turkish banks' exports often are. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1254").decode(bytes);
  }
}

/** Splits CSV text on the separator its first line uses most: ";", "," or tab. Quotes as in RFC 4180. */
export function csvRows(text: string, maxRows: number): string[][] {
  const first = text.slice(0, text.indexOf("\n") >>> 0);
  const count = (c: string) => first.split(c).length - 1;
  const sep = [";", "\t", ",", "|"].sort((a, b) => count(b) - count(a))[0]!;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if ((cell || row.length) && rows.length < maxRows) rows.push([...row, cell]);
  return rows;
}

// ─────────────────────────────────────────────── XLSX

/** The first sheet's rows. Only what a statement needs: text, numbers and dates. */
export function xlsxRows(bytes: Uint8Array, maxRows: number): string[][] {
  const zip = unzip(bytes);
  // Some writers prefix every tag ("<x:row>"); the prefixes are dropped.
  const text = (name: string) => {
    const b = zip.get(name);
    return b ? new TextDecoder().decode(b).replace(/<(\/?)[A-Za-z]\w*:(?=[A-Za-z])/g, "<$1") : null;
  };
  const strings = [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]!));
  const dates = dateStyles(text("xl/styles.xml") ?? "");
  const sheet = text(firstSheet(text("xl/workbook.xml") ?? "", text("xl/_rels/workbook.xml.rels") ?? "") ?? "") ?? text("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("The workbook has no sheet");

  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= maxRows) break;
    const row: string[] = [];
    for (const c of r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const col = ref ? colIndex(ref) : row.length;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
      const body = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = strings[Number(v)] ?? "";
      else if (type === "inlineStr") value = textRuns(body);
      else if (v !== undefined) value = unescape(v);
      if ((!type || type === "n") && dates.has(style) && /^\d+(\.\d+)?$/.test(value)) value = excelDay(Number(value));
      while (row.length < col) row.push("");
      row[col] = value;
    }
    rows.push(row);
  }
  return rows;
}

/** The first sheet in the workbook's own order. */
function firstSheet(workbook: string, rels: string): string | null {
  const id = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (!id) return null;
  const target =
    new RegExp(`<Relationship\\b[^>]*\\bId="${id}"[^>]*\\bTarget="([^"]+)"`).exec(rels)?.[1] ??
    new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${id}"`).exec(rels)?.[1];
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

/** The cell styles whose number format shows a date. */
function dateStyles(styles: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(Number(m[1]), unescape(m[2]!));
  const isDate = (id: number) => (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dy]/i.test((custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, ""));
  const out = new Set<number>();
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  [...xfs.matchAll(/<xf\b([^>]*)/g)].forEach((m, i) => {
    if (isDate(Number(/numFmtId="(\d+)"/.exec(m[1]!)?.[1] ?? 0))) out.add(i);
  });
  return out;
}

/** Excel's day count (1900 system) as "YYYY-MM-DD"; the time of day is left off. */
export function excelDay(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const textRuns = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1]!)).join("");

function unescape(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
    const named: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
    if (named[e.toLowerCase()]) return named[e.toLowerCase()]!;
    return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  });
}

/** The files of a zip, by name, from its central directory. Stored and deflated entries only. */
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a zip file");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    if (!/^xl\/(sharedStrings|styles|workbook)\.xml$|^xl\/_rels\/workbook\.xml\.rels$|^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, new Uint8Array(inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 })));
  }
  return files;
}
