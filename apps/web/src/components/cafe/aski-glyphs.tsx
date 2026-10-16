import type { MenuItemDTO } from "@peni/api";
import { askiItemFor } from "@peni/brand/shapes";
import { DeviceGlyph, SimitGlyph, type GlyphProps } from "@/components/brand";
import type { IconComponent } from "@/components/ui";

/*
 * The askı item glyphs on the 24-grid (§6.7) as icon-slot components, so a choice chip shows
 * the same thing the rail hangs: "çay" is a tea glass, "simit" a simit, anything else a fincan.
 */

function GlassIcon(props: GlyphProps) {
  return <DeviceGlyph kind="glass" {...props} />;
}

function FincanIcon(props: GlyphProps) {
  return <DeviceGlyph kind="fincan" {...props} />;
}

const BY_KIND = { glass: GlassIcon, fincan: FincanIcon, simit: SimitGlyph } as const;

/** The glyph for one askı item, by its name (the rule of `askiItemFor`). */
export function askiItemIcon(item: Pick<MenuItemDTO, "name">): IconComponent {
  return BY_KIND[askiItemFor(item.name)] as IconComponent;
}
