/**
 * Peni kodu: the short code a member shows at the till ("M7K-42Q") so a walk-in
 * purchase still earns peni. It is derived from the membership id, so it never
 * needs storing. It is read aloud and typed by hand, so the alphabet drops the
 * classic look-alikes (0 O, 1 I L) and every vowel, which also means a code can
 * never spell a word in Turkish or English. 28 symbols, 6 places: 481 million codes.
 */
export const MEMBER_CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXYZ23456789";

const GROUP = 3;
const LENGTH = GROUP * 2;

/**
 * Deterministic code for a membership. `attempt` picks another code for the
 * same id; stores that keep a unique index bump it on the (very rare) collision.
 */
export function memberCode(membershipId: string, attempt = 0): string {
  let n = cyrb53(membershipId, attempt);
  const base = MEMBER_CODE_ALPHABET.length;
  let out = "";
  for (let i = 0; i < LENGTH; i++) {
    out += MEMBER_CODE_ALPHABET[n % base];
    n = Math.floor(n / base);
  }
  return `${out.slice(0, GROUP)}-${out.slice(GROUP)}`;
}

/**
 * Normalises what a barista typed or a scanner read ("m7k 42q", "M7K42Q") to the
 * canonical "M7K-42Q". Returns null when it cannot be a Peni kodu.
 */
export function normalizeMemberCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s\-_.·]/g, "");
  if (raw.length !== LENGTH) return null;
  for (const ch of raw) if (!MEMBER_CODE_ALPHABET.includes(ch)) return null;
  return `${raw.slice(0, GROUP)}-${raw.slice(GROUP)}`;
}

/** cyrb53 (public domain): a fast 53-bit string hash with good spread. */
function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
