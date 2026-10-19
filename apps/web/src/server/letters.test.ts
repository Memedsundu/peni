import { ScriptedModel, type AiRequest, type LetterOutput } from "@peni/ai";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import type { EmailMessage } from "./customer-auth";
import { LETTER } from "./letters";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: ReturnType<typeof inMemoryStores>;
let now: Date;
let sent: EmailMessage[];

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );

async function make(ai?: ConstructorParameters<typeof PeniApp>[0]["ai"], opts: { sales?: boolean } = {}) {
  stores = inMemoryStores();
  app = new PeniApp(
    {
      demo: true,
      bcryptRounds: 4,
      clock: () => now,
      publicUrl: "https://peni.test/",
      auth: { email: { send: async (m) => void sent.push(m) } },
      ...(ai ? { ai } : {}),
    },
    stores,
  );
  await seed(app, { drafts: false, ...opts });
}

beforeEach(() => {
  // Monday 19 October, 09:00 in Istanbul: last week is 12–18 October.
  now = new Date("2026-10-19T06:00:00Z");
  sent = [];
});

describe("The weekly letter (plan piece 30, B10)", { timeout: 30_000 }, () => {
  it("is started by the cron on Monday morning, written by the assistant, and emailed to those who see reports", async () => {
    await make();
    now = new Date("2026-10-19T04:30:00Z");
    expect(await app.letters.startDue()).toEqual([]);
    now = new Date("2026-10-19T06:00:00Z");
    const [moda] = (await app.letters.startDue()).filter((s) => s.state === "writing");
    expect(moda).toMatchObject({ weekStart: "2026-10-12" });
    // Asked again, nothing new is queued.
    await app.letters.startDue();
    expect((await stores.assistant.listJobs(moda!.cafeId, { kinds: [LETTER], since: new Date(0) })).length).toBe(1);

    const leyla = await at("leyla");
    expect(await app.letters.get(leyla)).toMatchObject({ state: "writing", letter: null, lastWeek: { from: "2026-10-12", through: "2026-10-18" } });
    await app.jobs.runDue(10);

    const page = await app.letters.get(leyla);
    expect(page).toMatchObject({ state: "ready", weeks: [{ weekStart: "2026-10-12", weekEnd: "2026-10-18" }] });
    const letter = page.letter!;
    expect(letter).toMatchObject({ weekStart: "2026-10-12", weekEnd: "2026-10-18", demo: true });
    expect(letter.points.length).toBeGreaterThanOrEqual(2);
    // Milk went from ₺43 to ₺45 a litre on the 13th: a point, with the bill and the item behind it.
    const milk = letter.points.find((p) => p.title.startsWith("Süt"))!;
    expect(milk.text).toContain("%5");
    expect(milk.links.map((l) => l.kind).sort()).toEqual(["bill", "item", "page"]);
    expect(milk.links.find((l) => l.kind === "bill")!.href).toBe("/panel/faturalar?kafe=moda&fatura=bil_seed_sut2");
    expect(letter.points[0]!.links).toEqual([{ kind: "page", label: "raporlar", href: "/panel/raporlar?kafe=moda&from=2026-10-12&through=2026-10-18" }]);
    expect(letter.todo.text).toBeTruthy();

    // Leyla and Murat see reports; Ece and Hakan don't.
    expect(sent.map((m) => m.to).sort()).toEqual([DEMO_STAFF.leyla.email, DEMO_STAFF.murat.email].sort());
    expect(sent[0]!.subject).toBe("Haftalık mektup · 12–18 Ekim · Moda Kahvesi");
    expect(sent[0]!.text).toContain("https://peni.test/panel/mektup?kafe=moda&hafta=2026-10-12");
    expect((await stores.letters.getLetter(moda!.cafeId, "2026-10-12"))!.emailedAt).toEqual(now);

    // Bugün shows it to Leyla, not to Ece.
    expect((await app.alerts.today(leyla)).letter).toEqual({ weekStart: "2026-10-12", weekEnd: "2026-10-18", headline: letter.headline });
    const ece = await at("ece");
    expect((await app.alerts.today(ece)).letter).toBeNull();
    expect(await code(app.letters.get(ece))).toBe("FORBIDDEN");

    // Started once more, the job finds the letter there and writes nothing new.
    await app.jobs.add(moda!.cafeId, LETTER, { weekStart: "2026-10-12" });
    await app.jobs.runDue(10);
    expect(sent.length).toBe(2);
  });

  it("is started by opening the page when the cron didn't, and shows older weeks by their Monday", async () => {
    // Monday 26 October: the café's history runs up to today, so both weeks before had sales.
    now = new Date("2026-10-26T06:00:00Z");
    await make();
    const murat = await at("murat");
    await app.jobs.add(murat.cafe.id, LETTER, { weekStart: "2026-10-12" });
    expect((await app.letters.get(murat)).state).toBe("writing");
    await app.jobs.runDue(10);
    const page = await app.letters.get(murat);
    expect(page.state).toBe("ready");
    expect(page.weeks.map((w) => w.weekStart)).toEqual(["2026-10-19", "2026-10-12"]);
    expect(page.letter!.weekStart).toBe("2026-10-19");
    expect((await app.letters.get(murat, "2026-10-12")).letter!.weekStart).toBe("2026-10-12");
    expect(await code(app.letters.get(murat, "2026-10-13"))).toBe("VALIDATION");
    expect(await code(app.letters.get(murat, "2026-09-28"))).toBe("LETTER_NOT_FOUND");
  });

  it("follows the morning email's switch", async () => {
    await make();
    const murat = await at("murat");
    await app.alerts.setEmail(murat, false);
    await app.letters.get(murat);
    await app.jobs.runDue(10);
    expect(sent.map((m) => m.to)).toEqual([DEMO_STAFF.leyla.email]);
  });

  it("isn't written with the assistant off, or for a week nothing sold", async () => {
    await make({ model: null, mode: "off" });
    expect((await app.letters.get(await at("leyla"))).state).toBe("off");
    expect(await app.letters.startDue()).toEqual(expect.arrayContaining([expect.objectContaining({ state: "off" })]));

    await make(undefined, { sales: false });
    const leyla = await at("leyla");
    expect((await app.letters.get(leyla)).state).toBe("writing");
    await app.jobs.runDue(10);
    expect(await app.letters.get(leyla)).toMatchObject({ state: "quiet", letter: null });
    expect((await app.alerts.today(leyla)).letter).toBeNull();
    expect(sent).toEqual([]);
  });

  it("keeps only the refs it was given, and says so when the assistant fails", async () => {
    let reply: (r: AiRequest<unknown>) => LetterOutput = () => {
      throw new Error("no reply");
    };
    const seen: AiRequest<unknown>[] = [];
    const model = new ScriptedModel((r) => {
      seen.push(r);
      return reply(r);
    }, "test-model");
    await make({ model, mode: "on" });
    reply = () => ({
      headline: "  Süt pahalandı  ",
      points: [
        { title: "Süt", text: "Litresi ₺45 oldu.", refs: ["item:stk_sut", "bill:bil_seed_sut2", "bill:uydurma", "sales"] },
        { title: " ", text: "Boş başlık", refs: [] },
      ],
      todo: { text: "Latte fiyatına bak.", refs: ["product:nope"] },
    });
    const leyla = await at("leyla");
    await app.letters.get(leyla);
    await app.jobs.runDue(10);

    const facts = JSON.parse((seen[0]!.parts[0] as { text: string }).text.split("\n").slice(2).join("\n"));
    expect(facts.priceChanges[0]).toMatchObject({ ref: "item:stk_sut", item: "Süt", per: "L", before: 43, now: 45, changePct: 5, since: "2026-10-13" });
    expect(facts.sales.days.length).toBe(7);

    const { letter } = await app.letters.get(leyla);
    expect(letter).toMatchObject({ headline: "Süt pahalandı", demo: false, todo: { text: "Latte fiyatına bak.", links: [] } });
    expect(letter!.points).toHaveLength(1);
    expect(letter!.points[0]!.links.map((l) => l.kind)).toEqual(["item", "bill", "page"]);
    const stored = await stores.letters.getLetter(leyla.cafe.id, "2026-10-12");
    expect(Object.keys(stored!.body.links).sort()).toEqual(["bill:bil_seed_sut2", "item:stk_sut", "sales"]);
    const events = await stores.assistant.listEvents(leyla.cafe.id, { limit: 10 });
    expect(events.find((e) => e.purpose === LETTER)).toMatchObject({ kind: "ai.call", model: "test-model", ok: true });
  });

  it("shows a week whose letter couldn't be written as failed, and doesn't try it again", async () => {
    const model = new ScriptedModel(() => {
      throw Object.assign(new Error("bad answer"), { code: "AI_BAD_OUTPUT" });
    }, "test-model");
    await make({ model, mode: "on" });
    const leyla = await at("leyla");
    expect((await app.letters.get(leyla)).state).toBe("writing");
    for (let i = 0; i < 4; i++) {
      await app.jobs.runDue(10);
      now = new Date(now.getTime() + 60 * 60_000);
    }
    expect((await app.letters.get(leyla)).state).toBe("failed");
    expect(await app.letters.startDue()).toEqual(expect.arrayContaining([expect.objectContaining({ cafeId: leyla.cafe.id, state: "failed" })]));
    expect(await stores.assistant.listJobs(leyla.cafe.id, { kinds: [LETTER], since: new Date(0) })).toHaveLength(1);
  });
});
