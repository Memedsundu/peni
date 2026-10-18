import type { LetterBody, LetterStore, WeeklyLetter } from "@peni/core";
import type { Db } from "./db";
import { Prisma, type WeeklyLetter as LetterRow } from "./generated/client";

const toLetter = (r: LetterRow): WeeklyLetter => ({ ...r, facts: r.facts as unknown, body: r.body as unknown as LetterBody });
const json = (v: unknown) => v as Prisma.InputJsonValue;

export class PrismaLetterStore implements LetterStore {
  constructor(private readonly db: Db) {}

  async getLetter(cafeId: string, weekStart: string): Promise<WeeklyLetter | null> {
    const r = await this.db().weeklyLetter.findUnique({ where: { cafeId_weekStart: { cafeId, weekStart } } });
    return r ? toLetter(r) : null;
  }

  async listLetters(cafeId: string, limit: number): Promise<WeeklyLetter[]> {
    const rows = await this.db().weeklyLetter.findMany({ where: { cafeId }, orderBy: { weekStart: "desc" }, take: limit });
    return rows.map(toLetter);
  }

  async addLetter(letter: WeeklyLetter): Promise<WeeklyLetter> {
    const where = { cafeId_weekStart: { cafeId: letter.cafeId, weekStart: letter.weekStart } };
    const same = await this.db().weeklyLetter.findUnique({ where });
    if (same) return toLetter(same);
    try {
      return toLetter(await this.db().weeklyLetter.create({ data: { ...letter, facts: json(letter.facts), body: json(letter.body) } }));
    } catch (e) {
      // Two writers at once: the other one won.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const won = await this.db().weeklyLetter.findUnique({ where });
        if (won) return toLetter(won);
      }
      throw e;
    }
  }

  async markEmailed(cafeId: string, weekStart: string, at: Date): Promise<void> {
    await this.db().weeklyLetter.updateMany({ where: { cafeId, weekStart }, data: { emailedAt: at } });
  }
}
