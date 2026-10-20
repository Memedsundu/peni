import type { RecipeDrafting } from "@peni/ai";
import { trLower } from "@peni/brand/format";

/**
 * What the demo's stand-in drafts without a key: common café measures picked by the
 * product's name, using the café's items where one's name fits and suggesting the rest.
 * Real drafting is the model's; this only shows the flow.
 */
export function demoRecipe(texts: string[]): RecipeDrafting {
  const text = texts.join("\n");
  const name = trLower(/^Product: (.*)$/m.exec(text)?.[1] ?? "");
  const items = [...text.matchAll(/^(\d+)\. (.*) \((kg|l|adet)\)$/gm)].map((m) => ({ n: Number(m[1]), name: trLower(m[2]!), unit: m[3]! }));
  const newItems: RecipeDrafting["newItems"] = [];
  const line = (words: string[], amount: number, fresh: RecipeDrafting["newItems"][number]) => {
    const found = items.find((i) => words.some((w) => i.name.includes(w)));
    if (found) return { stockItem: found.n, newItem: null, amount };
    newItems.push(fresh);
    return { stockItem: null, newItem: newItems.length, amount };
  };
  const beans = () => line(["espresso"], 18, { name: "Espresso çekirdeği", unit: "kg", kind: "ingredient" });
  const milk = (ml: number) => line(["süt"], ml, { name: "Süt", unit: "l", kind: "ingredient" });
  const demo = "Demo: gerçek asistan yazmadı; ölçüler örnek.";
  const recipe = (lines: RecipeDrafting["lines"], notes: string[] = []): RecipeDrafting => ({ mode: "recipe", lines, newItems, reason: null, notes: [...notes, demo] });

  if (/wi-?fi|hizmet|servis|kuver/.test(name)) return { mode: "none", lines: [], newItems: [], reason: "Hizmet; stoktan bir şey kullanmıyor.", notes: [demo] };
  if (/latte/.test(name)) {
    const ml = /buzlu|ice/.test(name) ? 180 : 220;
    return recipe([beans(), milk(ml)], [`Süt miktarı standart ${ml} ml varsayıldı.`]);
  }
  if (/cappuccino|kapuçino/.test(name)) return recipe([beans(), milk(150)]);
  if (/flat white/.test(name)) return recipe([beans(), milk(120)]);
  if (/americano|espresso/.test(name)) return recipe([beans()]);
  if (/salep|sahlep/.test(name))
    return recipe([
      line(["salep"], 20, { name: "Salep tozu", unit: "kg", kind: "ingredient" }),
      milk(200),
      line(["tarçın"], 1, { name: "Tarçın", unit: "kg", kind: "ingredient" }),
    ]);
  if (/türk kahve/.test(name)) return recipe([line(["türk kahve"], 7, { name: "Türk kahvesi", unit: "kg", kind: "ingredient" })]);
  if (/filtre/.test(name)) return recipe([line(["filtre"], 15, { name: "Filtre kahve çekirdeği", unit: "kg", kind: "ingredient" })]);
  if (/^çay|\bçay\b/.test(name)) return recipe([line(["çay"], 2, { name: "Dökme çay", unit: "kg", kind: "ingredient" })]);
  if (/limonata/.test(name)) return recipe([line(["limon"], 150, { name: "Limon", unit: "kg", kind: "ingredient" })]);
  // Bought in and sold as it came: a bottle, a can, a pastry.
  if (/su\b|soda|kola|ayran|şişe|gazoz|meyve suyu|simit|poğaça|pogaca|kurabiye|dilim|kruvasan|börek/.test(name)) {
    const label = (/^Product: (.*)$/m.exec(text)?.[1] ?? "").trim();
    return { mode: "counted", lines: [line([name], 1, { name: label, unit: "adet", kind: "ingredient" })], newItems, reason: null, notes: [demo] };
  }
  return recipe([], [`Demo: "${name}" için örnek bir ölçü yok.`]);
}
