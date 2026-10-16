/**
 * Theme preference (design-system.md §8.1, §9.8). `localStorage["peni-theme"]` holds
 * "light" | "dark"; anything else (or nothing) means "follow the system". tokens.css reads
 * `<html data-theme>`; with no attribute the `prefers-color-scheme` block applies.
 */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "peni-theme";

/**
 * Inline <script> for <head>: runs before first paint, so a forced theme never flashes.
 * Kept tiny and dependency-free; every storage access is inside try/catch (private mode).
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export function readTheme(): ThemePreference {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Stores the preference and applies it at once ("Görünüm: Sistem · Açık · Koyu" in Profil). */
export function applyTheme(pref: ThemePreference): void {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private mode: the choice applies to this page only.
  }
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}
