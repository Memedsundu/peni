/**
 * `returnTo` for /giris (design-system.md §9.2): MUST be a same-origin path. Anything else —
 * an absolute URL, a protocol-relative "//evil.example", a backslash trick, a `javascript:`
 * scheme, or a loop back to /giris — gives null, and the caller goes to "/".
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  // Must be a path: "/" followed by anything but a second slash or a backslash.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  // No control characters or whitespace inside (browsers strip some of them, then re-read the URL).
  if (/[\u0000-\u001F\u007F\s\\]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, "https://peni.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://peni.invalid") return null;
  if (url.pathname === "/giris" || url.pathname.startsWith("/giris/")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** "/giris?returnTo=/hediye/g_1" for a path on this site. */
export function signInHref(returnTo: string): string {
  return `/giris?returnTo=${encodeURIComponent(returnTo)}`;
}
