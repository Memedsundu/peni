import { deflateRawSync } from "node:zlib";

/**
 * A ZIP writer, just enough for the month-end package (plan piece 30) and the .xlsx inside
 * it: files one after another, deflated when that helps, names in UTF-8 so Turkish letters
 * survive. Written as a stream, a file at a time, so a month of photos never sits in memory
 * all at once and the response can start before the last bill is read.
 */
export interface ZipEntry {
  /** "faturalar/Hammadde/2026-09-12 Moda Süt.pdf"; "/" between folders. */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date, as ZIP keeps them (local time, two-second steps). */
function dosTime(at: Date): { time: number; date: number } {
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((Math.max(1980, at.getFullYear()) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

const UTF8_NAMES = 0x0800;

/** Files already squeezed (photos, PDFs mostly) are stored as they are. */
const STORED = /\.(jpe?g|png|webp|heic|gif|zip|xlsx|pdf)$/i;

export function zipStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>, at: Date = new Date()): ReadableStream<Uint8Array> {
  const { time, date } = dosTime(at);
  const central: Uint8Array[] = [];
  let offset = 0;
  let count = 0;
  const iterator = (Symbol.asyncIterator in entries ? entries[Symbol.asyncIterator]() : (entries as Iterable<ZipEntry>)[Symbol.iterator]()) as
    | AsyncIterator<ZipEntry>
    | Iterator<ZipEntry>;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        const cd = concat(central);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, count, true);
        end.setUint16(10, count, true);
        end.setUint32(12, cd.length, true);
        end.setUint32(16, offset, true);
        controller.enqueue(cd);
        controller.enqueue(new Uint8Array(end.buffer));
        controller.close();
        return;
      }
      const { name, data } = next.value;
      const nameBytes = new TextEncoder().encode(name);
      const crc = crc32(data);
      let body = data;
      let method = 0;
      if (!STORED.test(name) && data.length > 64) {
        const deflated = deflateRawSync(data, { level: 6 });
        if (deflated.length < data.length) {
          body = new Uint8Array(deflated.buffer, deflated.byteOffset, deflated.length);
          method = 8;
        }
      }
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, UTF8_NAMES, true);
      local.setUint16(8, method, true);
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, body.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);

      const dir = new DataView(new ArrayBuffer(46));
      dir.setUint32(0, 0x02014b50, true);
      dir.setUint16(4, 20, true);
      dir.setUint16(6, 20, true);
      dir.setUint16(8, UTF8_NAMES, true);
      dir.setUint16(10, method, true);
      dir.setUint16(12, time, true);
      dir.setUint16(14, date, true);
      dir.setUint32(16, crc, true);
      dir.setUint32(20, body.length, true);
      dir.setUint32(24, data.length, true);
      dir.setUint16(28, nameBytes.length, true);
      dir.setUint32(42, offset, true);
      central.push(new Uint8Array(dir.buffer), nameBytes);

      controller.enqueue(concat([new Uint8Array(local.buffer), nameBytes, body]));
      offset += 30 + nameBytes.length + body.length;
      count++;
    },
  });
}

/** The whole ZIP at once, for something small (an .xlsx). */
export async function zipBytes(entries: ZipEntry[], at?: Date): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const reader = zipStream(entries, at).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return concat(parts);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A name safe in a ZIP on Windows and macOS: no slashes or reserved signs, not too long. */
export function safeName(s: string, max = 80): string {
  const clean = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return clean.slice(0, max) || "adsız";
}
