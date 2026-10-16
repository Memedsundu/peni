import type { GiftPreviewDTO } from "@peni/api";
import { formatPeni, numberWord } from "@peni/brand/format";

/**
 * The words a shared ısmarlama shows outside the page (design-system.md §15): the OG image's
 * title and line, its alt text, and the og:title / description. One source, so the alt text
 * always says what the picture says.
 */
export function giftShareCopy(gift: GiftPreviewDTO | null): { title: string; line: string | null } {
  if (!gift) return { title: "Mahallenin masası.", line: null };
  const what = gift.goods ?? formatPeni(gift.peni);
  if (gift.status === "expired" || gift.status === "declined") {
    return { title: "Bu ısmarlamanın süresi doldu.", line: null };
  }
  return {
    title: `Seni ${spoken(what)} bekliyor`,
    line: `${gift.fromFirstName} sana ${gift.cafeName} için ${what} ısmarladı.`,
  };
}

/** "1 çay" → "bir çay", "5 peni" → "beş peni": goods as they are said in a headline. */
export function spoken(goods: string): string {
  const m = /^(\d+)[  ](.+)$/.exec(goods);
  return m ? `${numberWord(Number(m[1]))} ${m[2]}` : goods;
}
