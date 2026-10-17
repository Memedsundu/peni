import { dark, light } from "@peni/brand/tokens";
import type { Metadata, Viewport } from "next";
import { themeScript } from "@/components/chrome/theme";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  // Where shared links' preview images resolve. Set PENI_PUBLIC_URL in each deployment.
  metadataBase: new URL(process.env.PENI_PUBLIC_URL ?? "http://localhost:3300"),
  title: { default: "Peni", template: "%s · Peni" },
  description: "Siparişini önceden ver, kasada öde. Her harcamada o kafeye özel peni biriktir, askıya bir çay bırak.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets env(safe-area-inset-bottom) reach the bottom nav and the cart bar on notched phones.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: light.bg },
    { media: "(prefers-color-scheme: dark)", color: dark.bg },
  ],
};

/**
 * Preload exactly three faces (§4.2): Archivo latin + latin-ext and Brygada latin normal.
 * Brygada latin-ext loads on the first İ/ğ/ş in a heading; the italic loads with the Masa section.
 */
const PRELOAD = [
  "/fonts/archivo-latin-wdth-normal.woff2",
  "/fonts/archivo-latin-ext-wdth-normal.woff2",
  "/fonts/brygada-1918-latin-wght-normal.woff2",
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang="tr": CSS `uppercase` gives "SİPARİŞ" and both fonts apply locl (Turkish i).
    // data-theme is set by the inline script before paint, hence suppressHydrationWarning.
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {PRELOAD.map((href) => (
          <link key={href} rel="preload" as="font" type="font/woff2" crossOrigin="" href={href} />
        ))}
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
