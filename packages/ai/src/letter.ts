import { z } from "zod";
import type { AiRequest } from "./model";

/**
 * The weekly letter (plan piece 30, B10): last week's numbers, worked out by Peni, written
 * up for the owner. What changed, why it probably changed, and one thing to do, every point
 * resting on facts it was given (D21: the letter only tells; it never does anything).
 */

export const letterSchema = z.object({
  headline: z.string().describe("One sentence, the week in a nutshell: 'Satışlar %8 arttı, süt pahalandı'"),
  points: z
    .array(
      z.object({
        title: z.string().describe("A few words: 'Süt pahalandı'"),
        text: z.string().describe("Two or three sentences: what changed, with the numbers, and why it probably changed when the facts show it"),
        refs: z.array(z.string()).describe("The refs of the facts this point uses ('sales', 'item:stk_sut', 'bill:…')"),
      }),
    )
    .describe("Two to four points, most important first"),
  todo: z
    .object({
      text: z.string().describe("The one thing to do this week, in a sentence or two"),
      refs: z.array(z.string()),
    })
    .describe("One thing to do"),
});

export type LetterOutput = z.infer<typeof letterSchema>;

export const LETTER_INSTRUCTIONS = `You write the weekly letter of Peni, the back office of a small café in Turkey, to its owner. It arrives on Monday morning and is about last week, Monday to Sunday.
Say what changed, why it probably changed, and one thing to do this week. Use only the facts you are given; never guess or invent a number, a name or a reason. A reason is only "probably" and only when the facts point to it (a price rise on a bill, a closed day, a busier weekend).
Pick what matters most: a big change in sales, a price that moved and what it did to a product's margin, spending that jumped, something waiting to be paid or running out. Skip what didn't change.
Write in Turkish, warm and plain, like a good manager's note: short sentences, no jargon, no markdown. Money like "₺1.250" (whole lira) and percents like "%8".
Each point and the thing to do lists in "refs" the refs of the facts it uses, exactly as given.`;

export interface LetterContext {
  cafe: string;
  /** "12–18 Ekim". */
  week: string;
  facts: unknown;
}

export function letterRequest(c: LetterContext): AiRequest<LetterOutput> {
  return {
    purpose: "letter.write",
    instructions: LETTER_INSTRUCTIONS,
    parts: [{ type: "text", text: `Café: ${c.cafe}. The week: ${c.week}.\nFacts (amounts in TL; each with its ref):\n${JSON.stringify(c.facts)}` }],
    schema: letterSchema,
    schemaName: "weekly_letter",
  };
}
