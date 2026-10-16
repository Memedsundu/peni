/**
 * Keeping the askı intent through sign-in (§9.3): a signed-out "Askıya bırak" or "Giriş yap ve
 * katıl" (take sheet) goes to /giris with a return address that carries `?aski=birak` or
 * `?aski=al`, the way the menu carries `?ekle=latte`. Back on the page, the panel reads the
 * marker once, removes it from the address bar and re-opens the matching sheet (after the join
 * sheet, for someone who is not a member yet).
 *
 * The page shell's `requireJoin` sends a signed-out visitor to `/giris?returnTo=/k/{slug}`; the
 * askı module builds its own return address only for that one case.
 */

export type AskiIntent = "al" | "birak";

const PARAM = "aski";

/** The sign-in URL that comes back to this page, scrolled to the askı, with the intent. */
export function signInUrlFor(intent: AskiIntent): string {
  const here = new URL(window.location.href);
  here.searchParams.set(PARAM, intent);
  here.hash = "aski";
  return `/giris?returnTo=${encodeURIComponent(here.pathname + here.search + here.hash)}`;
}

/** Reads the intent from the address bar and removes it, so a reload doesn't replay it. */
export function takeAskiIntent(): AskiIntent | null {
  if (typeof window === "undefined") return null;
  const here = new URL(window.location.href);
  const raw = here.searchParams.get(PARAM);
  if (raw == null) return null;
  here.searchParams.delete(PARAM);
  try {
    window.history.replaceState(window.history.state, "", here.pathname + here.search + here.hash);
  } catch {
    // The marker stays in the address bar; harmless, it has been read.
  }
  return raw === "al" || raw === "birak" ? raw : null;
}
