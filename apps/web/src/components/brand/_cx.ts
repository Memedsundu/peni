/** Joins class names, skipping falsy parts. Local to the brand components. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** A `useId()` value that is safe inside `url(#…)` and `href="#…"` references. */
export function svgId(reactId: string): string {
  return `p${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
