import type { MenuItemDTO } from "@peni/api";
import { askiItemFor } from "@peni/brand/shapes";
import { DeviceGlyph, SimitGlyph, type GlyphProps } from "@/components/brand";
import type { IconComponent } from "@/components/ui";

/*
 * The askı item glyphs on the 24-grid (§6.7) as icon-slot components, so a choice chip shows
 * the same thing the rail hangs: "çay" is a tea glass, "simit" a simit, a coffee a fincan.
 *
 * The rail draws a fincan for anything else (§6.2): it has to hang something. A labelled chip
 * does not, and a cup beside "Peynirli Poğaça" would simply be wrong, so there it shows no icon.
 */

function GlassIcon(props: GlyphProps) {
  return <DeviceGlyph kind="glass" {...props} />;
}

function FincanIcon(props: GlyphProps) {
  return <DeviceGlyph kind="fincan" {...props} />;
}

const COFFEE = ["kahve", "latte", "espresso", "filtre", "americano", "cappuccino", "kapuçino", "flat white", "mocha", "macchiato", "cortado"];

function looksLikeCoffee(name: string): boolean {
  const n = name.toLocaleLowerCase("tr");
  return COFFEE.some((w) => n.includes(w));
}

/** The glyph for one askı item's chip, by its name: glass, simit, fincan for a coffee, otherwise none. */
export function askiItemIcon(item: Pick<MenuItemDTO, "name">): IconComponent | undefined {
  const kind = askiItemFor(item.name);
  if (kind === "glass") return GlassIcon as IconComponent;
  if (kind === "simit") return SimitGlyph as IconComponent;
  return looksLikeCoffee(item.name) ? (FincanIcon as IconComponent) : undefined;
}

/**
 * Icons for a whole set of chips stacked in one column: all or nothing. If one item has no glyph
 * ("Peynirli Poğaça"), none of them gets one, so every label starts on the same line.
 */
export function askiChipIcons(items: readonly Pick<MenuItemDTO, "name">[]): (item: Pick<MenuItemDTO, "name">) => IconComponent | undefined {
  const all = items.length > 0 && items.every((i) => askiItemIcon(i) != null);
  return all ? askiItemIcon : () => undefined;
}
