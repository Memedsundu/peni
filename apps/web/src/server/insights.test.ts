import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app, { drafts: false, history: true });
  leyla = await at("leyla");
});

describe("Müdavimler (plan piece 32)", { timeout: 30_000 }, () => {
  it("counts this month's members against the same days last month, and who came back", async () => {
    const d = await app.insights.get(leyla);
    expect(d).toMatchObject({ month: "2026-10", thisMonth: "2026-10", through: "2026-10-16", members: 30, joined: 5 });
    expect([d.visitors, d.visitorsBefore, d.newcomers, d.regulars]).toEqual([16, 15, 4, 4]);
    expect(d.cameBack).toEqual({ people: 17, cameBack: 12, pct: 71 });
    expect(d.weeks).toHaveLength(12);
    expect(d.weeks.at(-1)).toEqual({ week: "2026-10-12", newcomers: 0, returning: 8 });

    // A month that's over counts all of it.
    const sept = await app.insights.get(leyla, "2026-09");
    expect(sept).toMatchObject({ month: "2026-09", through: "2026-09-30", visitors: 17 });
    expect(await code(app.insights.get(leyla, "2026-11"))).toBe("VALIDATION");
    expect(await code(app.insights.get(leyla, "2024-01"))).toBe("VALIDATION");
  });

  it("compares coming back after peni, treats, the askı and events, only once everyone has had 30 days", async () => {
    const d = await app.insights.get(leyla);
    expect([d.effectFrom, d.effectThrough]).toEqual(["2026-06-19", "2026-09-16"]);
    const by = Object.fromEntries(d.effects.map((e) => [e.kind, e]));
    // Aslı, Bora, Ceren and Doruk spent peni; all four came again.
    expect(by.spentPeni!.with).toEqual({ people: 4, cameBack: 4, pct: 100 });
    // Three took a çay from the askı; Jale never came again.
    expect(by.tookAskida!.with).toEqual({ people: 3, cameBack: 2, pct: 67 });
    expect(by.gaveAskida!.with).toEqual({ people: 3, cameBack: 3, pct: 100 });
    expect(by.wentToEvent!.with).toEqual({ people: 5, cameBack: 5, pct: 100 });
    for (const e of d.effects) expect(e.with.people + e.without.people).toBe(23);
  });

  it("shows how each of the month's events went, with the day's orders against the usual", async () => {
    const sept = await app.insights.get(leyla, "2026-09");
    expect(sept.events).toEqual([
      expect.objectContaining({
        id: "post_event_breakfast",
        title: "Mahalle kahvaltısı",
        day: "2026-09-01",
        byMember: false,
        going: 6,
        came: 5,
        cameBackAfter: 4,
      }),
    ]);
    // Nil's first visit was the breakfast (and one other neighbour's). The till's history starts after it: no usual yet.
    expect(sept.events[0]).toMatchObject({ newcomers: 2, usualOrders: null, liftPct: null });
    const oct = await app.insights.get(leyla);
    expect(oct.events.map((e) => e.id)).toEqual(["post_event_past"]);
    expect(oct.events[0]).toMatchObject({ going: 9, orders: 98, usualOrders: 84.8, liftPct: 16 });
  });

  it("counts the askı without ever naming who took from it", async () => {
    const d = await app.insights.get(leyla);
    expect(d.askida).toEqual({ given: 5, donatedKurus: 36_200, donors: 4 });
    const all = JSON.stringify(d);
    for (const name of ["Kerem", "Elif", "Burak", "Oğuz", "Hande", "Ilgaz", "Jale"]) expect(all).not.toContain(name);
  });

  it("is for those who see reports; the assistant can look too, and links here", async () => {
    expect(await code(app.insights.get(await at("ece")))).toBe("FORBIDDEN");
    expect(await code(app.insights.get(await at("hakan")))).toBe("FORBIDDEN");
    const chat = await app.chat.ask(leyla, { key: "c1", text: "Bu ay müdavimler geri geliyor mu?" });
    expect(chat.messages[1]!.text).toBe(
      "Ekim 2026: 16 üye geldi (geçen ay aynı günlerde 15); 4 kişi müdavim. Geçen ay gelen 17 kişinin %71'i bu ay da geldi. Sadece Peni kullanan üyeler sayılıyor. (Demo yanıtı.)",
    );
    expect(chat.messages[1]!.sources).toEqual([{ kind: "page", label: "mudavimler", href: "/panel/mudavimler?kafe=moda&ay=2026-10" }]);
  });
});
