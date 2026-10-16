import { askiCopy } from "@peni/brand/copy";
import type { Metadata } from "next";
import { Button } from "@/components/ui";

export const metadata: Metadata = {
  title: "Masa kuralları",
  description: "Kapıdan giren herkes masaya oturabilir; kimse kimseden üstün değildir.",
};

/** §9.9, verbatim. */
const RULES = [
  "Kapıdan giren herkes masaya oturabilir; kimse kimseden üstün değildir.",
  "Askıdaki çay herkesin. İsteyen alır, kimse sormaz.",
  "Bırakan söylemez, alan teşekkür borçlu değildir.",
  "Fikrine karşı çıkılabilir, sana değil.",
  "Masada konuşulan masada kalır; mesaj kutusu yok.",
  "Siparişin ancak barista dokununca ilerler; emeği görünür.",
  "Bir fincan kahvenin kırk yıl hatırı vardır.",
] as const;

const WHY_PENI =
  "1554'te İstanbul'da, Tahtakale'de açılan ilk kahvehanelere “mekteb-i irfan”, yani irfan mektebi denirdi. Yaklaşık yüz yıl sonra, 1652'de İzmirli Pasqua Rosée Londra'nın ilk kahvehanesini açtı. Orada bir peni veren herkes aynı masaya otururdu; tüccar da öğrenci de konuşurdu. Adı “peni üniversitesi” olarak kaldı. Peni o masayı mahallene geri getiriyor.";

/**
 * Masa kuralları (design-system.md §9.9): a reading page, 640px, centred. Legend, h1 and the
 * Oxford rule, then the seven rules with Brygada numerals, "Neden peni?" and "Askı neden
 * böyle?". Static: no data, no client code.
 */
export default function MasaKurallariPage() {
  return (
    <article className="mx-auto max-w-[640px] md:pt-4">
      <p className="legend text-ink-2">Masa kuralları</p>
      <h1 className="mt-2 font-display text-h1 text-ink">Masa kuralları</h1>
      <div aria-hidden className="rule-oxford mt-5" />

      <ol className="mt-2">
        {RULES.map((rule, i) => (
          <li key={rule} className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-x-2 border-b border-line py-4 last:border-b-0 md:py-5">
            <span aria-hidden className="font-display text-[22px] leading-6 font-semibold text-ink lining-nums tabular-nums">
              {i + 1}
            </span>
            <p className="text-body-lg text-ink">{rule}</p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="neden-peni" className="mt-8 border-t border-line pt-8 md:mt-10">
        {/* The hero's "Neden peni?" link lands here, with the section rule still in view. */}
        <h2 id="neden-peni" className="scroll-mt-[calc(var(--header-h)+48px)] font-display text-h2 text-ink">
          Neden peni?
        </h2>
        <p className="mt-4 text-body-lg text-ink">{WHY_PENI}</p>
      </section>

      <section aria-labelledby="aski-neden" className="mt-10">
        <h3 id="aski-neden" className="font-display text-h3 text-ink">
          Askı neden böyle?
        </h3>
        <p className="mt-3 text-body-lg text-ink">{askiCopy.explainer}</p>
      </section>

      <div className="mt-10 border-t border-line pt-6">
        <Button variant="secondary" href="/">
          Kafelere bak
        </Button>
      </div>
    </article>
  );
}
