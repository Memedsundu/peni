import { alertWords } from "@peni/api/alert-text";
import { formatTL } from "@peni/brand/format";
import { beforeEach, describe, expect, it } from "vitest";
import type { EmailMessage } from "./customer-auth";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let sent: EmailMessage[];
let leyla: StaffContext;
let murat: StaffContext;
let hakan: StaffContext;
let ece: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const every = [1, 2, 3, 4, 5, 6, 7] as const;

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul. Ece opened at 8; Murat closes tonight.
  now = new Date("2026-10-16T09:00:00Z");
  sent = [];
  app = new PeniApp(
    { demo: true, bcryptRounds: 4, clock: () => now, publicUrl: "https://peni.test/", auth: { email: { send: async (m) => void sent.push(m) } } },
    inMemoryStores(),
  );
  await seed(app);
  [leyla, murat, hakan, ece] = await Promise.all([at("leyla"), at("murat"), at("hakan"), at("ece")]);
});

describe("Görevler (plan piece 22)", () => {
  it("shows today's lists with the viewer's own first, and who they are for", async () => {
    const day = await app.tasks.day(ece);
    expect(day).toMatchObject({ day: "2026-10-16", today: "2026-10-16", canCheck: true, canEdit: false, week: [] });
    expect(day.lists.map((l) => [l.name, l.mine, l.people, l.done, l.total])).toEqual([
      ["Açılış", true, ["Ece"], 3, 4],
      ["Haftalık temizlik", true, [], 0, 1],
      ["Kapanış", false, ["Murat"], 0, 5],
      ["Mutfak", false, [], 0, 1],
    ]);
    expect(day.lists[0]!.items.map((i) => [i.title, i.status, i.by])).toEqual([
      ["Işıkları ve müziği aç", "done", "Ece Tan"],
      ["Espresso makinesini ısıt, ilk iki shot'u dök", "done", "Ece Tan"],
      ["Vitrini doldur", "done", "Ece Tan"],
      ["Kasayı aç ve sayımı gir", "open", null],
    ]);
    // Weekly jobs only on their day: Friday is the windows.
    expect(day.lists[1]!.items.map((i) => i.title)).toEqual(["Camları sil"]);
    expect((await app.tasks.day(hakan)).lists[0]).toMatchObject({ name: "Mutfak", mine: true });
    expect((await app.tasks.day(murat)).lists[0]).toMatchObject({ name: "Kapanış", mine: true });
  });

  it("lets anyone tick today's tasks, skip one with why, and undo; earlier days only for those who edit lists", async () => {
    let day = await app.tasks.check(ece, { itemId: "tsl_seed_open_3", day: "2026-10-16", status: "done" });
    expect(day.lists[0]).toMatchObject({ name: "Açılış", done: 4, total: 4 });
    expect(day.lists[0]!.items[3]).toMatchObject({ status: "done", by: "Ece Tan", at: now.toISOString() });

    // The closing isn't Ece's list, but she can still do a job on it.
    day = await app.tasks.check(ece, { itemId: "tsl_seed_close_3", day: "2026-10-16", status: "skipped", note: "  Çöp kamyonu gelmedi " });
    expect(day.lists.find((l) => l.name === "Kapanış")!.items[3]).toMatchObject({ status: "skipped", checkNote: "Çöp kamyonu gelmedi", by: "Ece Tan" });
    day = await app.tasks.check(ece, { itemId: "tsl_seed_close_3", day: "2026-10-16", status: "open" });
    expect(day.lists.find((l) => l.name === "Kapanış")!.items[3]).toMatchObject({ status: "open", by: null, checkNote: null });

    expect(await code(app.tasks.day(ece, "2026-10-15"))).toBe("TASK_DAY");
    expect(await code(app.tasks.check(ece, { itemId: "tsl_seed_close_3", day: "2026-10-13", status: "done" }))).toBe("TASK_DAY");
    expect(await code(app.tasks.check(murat, { itemId: "tsl_seed_close_3", day: "2026-10-17", status: "done" }))).toBe("TASK_FUTURE");
    // The fridge is a Monday job.
    expect(await code(app.tasks.check(murat, { itemId: "tsl_seed_weekly_0", day: "2026-10-16", status: "done" }))).toBe("TASK_NOT_DUE");
    expect(await code(app.tasks.check(murat, { itemId: "nope", day: "2026-10-16", status: "done" }))).toBe("TASK_NOT_FOUND");

    // Murat looks back: Tuesday's closing was left half done; he marks the rest done late.
    const tuesday = await app.tasks.day(murat, "2026-10-13");
    expect(tuesday).toMatchObject({ canCheck: true, canEdit: true });
    expect(tuesday.lists.find((l) => l.name === "Kapanış")).toMatchObject({ done: 3, total: 5 });
    await app.tasks.check(murat, { itemId: "tsl_seed_close_3", day: "2026-10-13", status: "done" });
    const week = (await app.tasks.day(murat)).week;
    expect(week.map((d) => d.day)).toEqual(["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
    expect(week.find((d) => d.day === "2026-10-13")).toEqual({ day: "2026-10-13", done: 9, total: 10 });
    // A skipped job counts as dealt with.
    expect(week.find((d) => d.day === "2026-10-12")).toEqual({ day: "2026-10-12", done: 11, total: 11 });
  });

  it("sets up lists: one per key, items with their days, changes from today with the history kept", async () => {
    expect(await code(app.tasks.lists(ece))).toBe("FORBIDDEN");
    const k = key();
    const input = {
      key: k,
      name: " Teras ",
      assign: "all" as const,
      items: [
        { id: "new:a", title: "Masaları sil", days: [...every] },
        { id: "new:b", title: "Saksıları sula", note: "Akşam değil, sabah", days: [2, 5] as (2 | 5)[] },
      ],
    };
    const list = await app.tasks.addList(murat, input);
    expect(await app.tasks.addList(murat, input)).toEqual(list);
    expect(list).toMatchObject({ name: "Teras", assign: "all" });
    expect(list.items.map((i) => [i.title, i.note, i.days])).toEqual([
      ["Masaları sil", null, [1, 2, 3, 4, 5, 6, 7]],
      ["Saksıları sula", "Akşam değil, sabah", [2, 5]],
    ]);
    expect((await app.tasks.lists(murat)).lists.map((l) => l.name)).toEqual(["Açılış", "Kapanış", "Haftalık temizlik", "Mutfak", "Teras"]);

    // "Everyone" is everyone's.
    let day = await app.tasks.day(ece);
    expect(day.lists.find((l) => l.name === "Teras")).toMatchObject({ mine: true, total: 2 });

    // Retitle the first, drop the second, add one; sending it twice adds it once.
    const [tables, plants] = list.items;
    const save = {
      name: "Teras",
      assign: "barista" as const,
      items: [
        { id: "new:c", title: "Şemsiyeleri aç", days: [...every] },
        { ...tables!, title: "Masaları sil ve kurula" },
      ],
    };
    await app.tasks.saveList(murat, list.id, save);
    const saved = await app.tasks.saveList(murat, list.id, save);
    expect(saved.items.map((i) => i.title)).toEqual(["Şemsiyeleri aç", "Masaları sil ve kurula"]);
    expect(saved.items.some((i) => i.id === plants!.id)).toBe(false);
    expect(await code(app.tasks.saveList(murat, list.id, { ...save, items: [{ id: plants!.id, title: "x", days: [1] }] }))).toBe("TASK_NOT_FOUND");

    // Earlier work on Açılış keeps its words when the item changes.
    const open = (await app.tasks.lists(murat)).lists.find((l) => l.name === "Açılış")!;
    await app.tasks.saveList(murat, open.id, { name: "Açılış", assign: "first", items: open.items.map((i, n) => (n === 0 ? { ...i, title: "Işıklar" } : i)) });
    expect((await app.tasks.day(murat, "2026-10-15")).lists.find((l) => l.name === "Açılış")!.items[0]).toMatchObject({
      title: "Işıkları ve müziği aç",
      status: "done",
    });
    expect((await app.tasks.day(murat)).lists.find((l) => l.name === "Açılış")!.items[0]).toMatchObject({ title: "Işıkları ve müziği aç", status: "done" });

    // Taking a list off: not due from today, still there in the history.
    const after = await app.tasks.removeList(murat, "tsl_seed_kitchen");
    expect(after.lists.map((l) => l.name)).not.toContain("Mutfak");
    day = await app.tasks.day(murat);
    expect(day.lists.map((l) => l.name)).not.toContain("Mutfak");
    expect((await app.tasks.day(murat, "2026-10-15")).lists.map((l) => l.name)).toContain("Mutfak");
    expect(await code(app.tasks.saveList(murat, "tsl_seed_kitchen", save))).toBe("TASK_LIST_NOT_FOUND");
  });
});

describe("Bugün and its alerts (plan piece 22)", () => {
  it("works out what needs doing from the café's numbers, as far as each role sees", async () => {
    const today = await app.alerts.today(leyla);
    expect(today).toMatchObject({ today: "2026-10-16", me: { name: "Leyla Kara" }, email: { eligible: true, on: true } });
    expect(today.alerts.map((a) => [a.type, a.level, a.count, a.amountKurus])).toEqual([
      ["cardDue", "critical", 1, 170_000],
      ["debtsOverdue", "critical", 1, 385_000],
      ["stockOut", "critical", 1, null],
      ["payClose", "critical", 1, null],
      ["payLeft", "warning", 1, 500_000],
      ["hoursMissing", "warning", 8, null],
      ["draftsOpen", "warning", 1, null],
      ["stockLow", "warning", 3, null],
      ["tasksLate", "warning", 3, null],
      ["stockNoCost", "warning", 1, null],
    ]);
    const words = (type: string) => alertWords(today.alerts.find((a) => a.type === type)!, "tr", formatTL, today.today);
    expect(words("cardDue")).toEqual({ title: "İş kartı ekstresi: ₺1.700", detail: "Son ödeme günü 6 Ekim geçti.", action: "Kartı öde" });
    expect(words("payLeft")).toMatchObject({ title: "Eylül 2026 maaşından ₺5.000 ödenmedi", detail: "Hakan Usta" });
    expect(words("tasksLate")).toMatchObject({ title: "3 görev yapılmadı", detail: "Son 7 günde: Kapanış (2), Mutfak (1)" });
    expect(words("draftsOpen")).toEqual({ title: "1 taslak onay bekliyor", detail: "Ambalaj Dünyası Tic. Ltd. Şti. · ₺1.810", action: "Taslaklara bak" });
    expect(words("hoursMissing")).toMatchObject({ title: "8 günün saati girilmedi", detail: "Hakan Usta, Murat Aksu, Ece Tan" });
    expect(today.alerts.find((a) => a.type === "hoursMissing")).toMatchObject({ month: "2026-10", href: "/panel/puantaj?ay=2026-10" });
    expect(today.tasks).toMatchObject({ done: 3, total: 11 });

    // The chef sees no card or month close; a barista sees no alerts and gets no email.
    expect((await app.alerts.today(hakan)).alerts.map((a) => a.type)).toEqual([
      "debtsOverdue",
      "stockOut",
      "payLeft",
      "hoursMissing",
      "stockLow",
      "tasksLate",
      "stockNoCost",
    ]);
    expect(await app.alerts.today(ece)).toMatchObject({ alerts: [], email: { eligible: false } });
  });

  it("clears an alert once the thing is done", async () => {
    await app.tasks.check(murat, { itemId: "tsl_seed_close_3", day: "2026-10-13", status: "done" });
    await app.tasks.check(murat, { itemId: "tsl_seed_close_4", day: "2026-10-13", status: "done" });
    await app.tasks.check(hakan, { itemId: "tsl_seed_kitchen_0", day: "2026-10-14", status: "skipped", note: "Un bitti" });
    expect((await app.alerts.today(murat)).alerts.map((a) => a.type)).not.toContain("tasksLate");
  });

  it("emails each person their alerts once each morning, unless they turned it off", async () => {
    await app.alerts.setEmail(hakan, false);
    expect((await app.alerts.today(hakan)).email).toEqual({ eligible: true, on: false });

    // 07:00 in Istanbul: not yet.
    now = new Date("2026-10-16T04:00:00Z");
    expect(await app.alerts.sendDigests()).toEqual([]);
    now = new Date("2026-10-16T05:00:00Z");
    expect(await app.alerts.sendDigests()).toEqual([
      { cafeId: "cafe_moda", day: "2026-10-16", sent: 2 },
      { cafeId: "cafe_kuzguncuk", day: "2026-10-16", sent: 0 },
    ]);
    expect(sent.map((m) => m.to).sort()).toEqual([DEMO_STAFF.leyla.email, DEMO_STAFF.murat.email].sort());
    const mail = sent.find((m) => m.to === DEMO_STAFF.murat.email)!;
    expect(mail.subject).toBe("Bugün 10 konu · Moda Kahvesi");
    expect(mail.text).toContain("Günaydın Murat, bugün 10 konu var:");
    expect(mail.text).toContain("• İş kartı ekstresi: ₺1.700 (Son ödeme günü 6 Ekim geçti.)");
    expect(mail.text).toContain("https://peni.test/panel/bugun?kafe=moda");
    expect(mail.html).toContain("Bugün'e git");
    // Once a day.
    expect(await app.alerts.sendDigests()).toEqual([]);
    expect(sent).toHaveLength(2);
  });
});
