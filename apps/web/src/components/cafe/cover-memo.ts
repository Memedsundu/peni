import type { CafeHue } from "@peni/brand/tokens";

/**
 * The cover a café card showed, remembered for the moment between tapping it and the café
 * page arriving. The loading skeleton (and the A16 morph that lands on it) can then draw the
 * café's real colourway (G9) instead of guessing one from the slug.
 *
 * In memory only, on purpose: a hard load starts empty on the server and in the browser alike,
 * so the server-rendered skeleton and the hydrated one always match.
 */
export interface RememberedCover {
  hue: CafeHue | null;
  coverImageUrl: string | null;
}

const covers = new Map<string, RememberedCover>();

export function rememberCover(slug: string, cover: RememberedCover): void {
  if (typeof window === "undefined") return; // Never share state between server requests.
  covers.set(slug, { hue: cover.hue, coverImageUrl: cover.coverImageUrl });
}

export function recallCover(slug: string): RememberedCover | null {
  return covers.get(slug) ?? null;
}
