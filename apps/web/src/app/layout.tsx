import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peni",
  description: "Mahallenin kahvehanesi, cebinde. Sipariş ver, peni biriktir, askıya kahve bırak.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight">
              <span className="coin" aria-hidden /> peni
            </Link>
            <div className="ml-auto flex items-center gap-1 text-sm font-medium sm:gap-3">
              <Link className="rounded-full px-3 py-1.5 hover:bg-surface-2" href="/">
                Kafeler
              </Link>
              <Link className="rounded-full px-3 py-1.5 hover:bg-surface-2" href="/cuzdan">
                Cüzdan
              </Link>
              <Link className="rounded-full px-3 py-1.5 text-ink-2 hover:bg-surface-2" href="/kafe/moda">
                Kafe paneli
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-sm text-ink-2">
          17. yüzyılda bir peniye kahvehaneye girilir, herkesle aynı masaya oturulurdu. Peni bu geleneği sürdürür.
        </footer>
      </body>
    </html>
  );
}
