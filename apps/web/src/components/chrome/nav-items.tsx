import { Coffee, ReceiptText, UserRound } from "lucide-react";
import { CoinGlyph } from "@/components/brand/glyphs";

export type NavKey = "kafeler" | "siparisler" | "cuzdan" | "profil";

export interface NavItem {
  key: NavKey;
  href: string;
  /** Bottom nav label (phone). */
  label: string;
  /** Top nav label (≥768), where Profil lives in the avatar menu instead. */
  topLabel: string | null;
  icon: (props: { className?: string }) => React.ReactNode;
}

const iconProps = { size: 24, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Icon map from design-system.md §5; labels from §8.2. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "kafeler", href: "/", label: "Kafeler", topLabel: "Kafeler", icon: (p) => <Coffee {...iconProps} {...p} /> },
  {
    key: "siparisler",
    href: "/siparisler",
    label: "Siparişler",
    topLabel: "Siparişlerim",
    icon: (p) => <ReceiptText {...iconProps} {...p} />,
  },
  { key: "cuzdan", href: "/cuzdan", label: "Cüzdan", topLabel: "Cüzdan", icon: (p) => <CoinGlyph className={`size-6 ${p.className ?? ""}`} /> },
  { key: "profil", href: "/profil", label: "Profil", topLabel: null, icon: (p) => <UserRound {...iconProps} {...p} /> },
];

/** Which section a path belongs to. Café pages sit under Kafeler, the fiş under Siparişler. */
export function navKeyFor(pathname: string): NavKey | null {
  if (pathname === "/" || pathname.startsWith("/k/")) return "kafeler";
  if (pathname === "/siparisler" || pathname.startsWith("/siparis/")) return "siparisler";
  if (pathname === "/cuzdan" || pathname.startsWith("/hediye/")) return "cuzdan";
  if (pathname === "/profil") return "profil";
  return null;
}
