/**
 * The balance this device last showed for each café: the A6 coin-strike trigger ("a wallet
 * balance higher than last seen, stored per café in localStorage", design-system.md §7.2).
 *
 * DEVIATION (written down, as "How to read this document" asks): the value is ALSO kept in a
 * first-party cookie, `peni_seen`, so the server can paint the frame before the strike (the old
 * number, the coin not dropped in yet). With localStorage alone the server paints the new
 * balance, hydration snaps it back to the old one, and the strike rolls it up again: the number
 * visibly goes backwards. localStorage (`peni.lastSeen.{slug}`, the key `useLastSeenBalance`
 * reads) is still written, and the higher of the two counts as seen.
 *
 * No React, no "use client": the parser runs on the server (cuzdan/page.tsx), the rest only
 * touches `document` and `localStorage` when called in the browser.
 */

export const SEEN_COOKIE = "peni_seen";
const MAX_AGE_S = 60 * 60 * 24 * 365;
const storageKey = (slug: string) => `peni.lastSeen.${slug}`;

/** "moda:442|kuzguncuk:27" → { moda: 442, kuzguncuk: 27 }. Anything malformed is skipped. */
export function parseSeen(raw: string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const pair of raw.split("|")) {
    const at = pair.lastIndexOf(":");
    if (at <= 0) continue;
    let slug: string;
    try {
      slug = decodeURIComponent(pair.slice(0, at));
    } catch {
      continue;
    }
    const value = Number(pair.slice(at + 1));
    if (slug && Number.isFinite(value) && value >= 0) out[slug] = Math.floor(value);
  }
  return out;
}

/** The inverse of `parseSeen`: only cookie-safe characters (`|` and `:` are allowed octets). */
export function serializeSeen(seen: Readonly<Record<string, number>>): string {
  return Object.entries(seen)
    .map(([slug, value]) => `${encodeURIComponent(slug)}:${Math.max(0, Math.floor(value))}`)
    .join("|");
}

function readCookie(): Record<string, number> {
  if (typeof document === "undefined") return {};
  const prefix = `${SEEN_COOKIE}=`;
  const raw = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix));
  return parseSeen(raw?.slice(prefix.length));
}

/** The balance last seen on this device for the café, or null (browser only). */
export function readSeen(cafeSlug: string): number | null {
  const fromCookie = readCookie()[cafeSlug] ?? null;
  let fromStorage: number | null = null;
  try {
    const raw = window.localStorage.getItem(storageKey(cafeSlug));
    const value = raw === null ? Number.NaN : Number(raw);
    if (Number.isFinite(value)) fromStorage = value;
  } catch {
    // Private mode or blocked storage: the cookie alone decides.
  }
  if (fromCookie === null) return fromStorage;
  if (fromStorage === null) return fromCookie;
  return Math.max(fromCookie, fromStorage);
}

/** Remember a balance as seen on this device (cookie and localStorage, best effort). */
export function writeSeen(cafeSlug: string, balance: number): void {
  if (typeof document === "undefined") return;
  const value = Math.max(0, Math.floor(balance));
  const seen = readCookie();
  seen[cafeSlug] = value;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SEEN_COOKIE}=${serializeSeen(seen)}; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax${secure}`;
  try {
    window.localStorage.setItem(storageKey(cafeSlug), String(value));
  } catch {
    // Private mode: the cookie still carries it.
  }
}
