/**
 * Developer-only route group (/kit). No customer chrome: no top bar, no bottom nav, no footer —
 * just the page, padded like the app container (§5: 16 / 24 / 32px gutters, 1120px max).
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">{children}</main>;
}
