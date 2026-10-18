import type { Kurus } from "./money";

/** One product a café sells. Prices are always read from here, never from a client. */
export interface MenuItem {
  productId: string;
  name: string;
  category: string;
  priceKurus: Kurus;
  available: boolean;
  description?: string | null;
  imageUrl?: string | null;
}

/** Where a café's menu lives. The Menü module (plan piece 5) will own it; for now it's in memory. */
export interface MenuStore {
  listMenu(cafeId: string): Promise<MenuItem[]>;
}

export class InMemoryMenuStore implements MenuStore {
  private readonly menus = new Map<string, MenuItem[]>();

  setMenu(cafeId: string, items: MenuItem[]): void {
    this.menus.set(cafeId, items.map((i) => ({ ...i })));
  }

  async listMenu(cafeId: string) {
    return (this.menus.get(cafeId) ?? []).map((i) => ({ ...i }));
  }
}
