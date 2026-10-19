import { ScriptedModel, type BillReading } from "@peni/ai";
import type { BillDraftDTO, DraftsDTO } from "@peni/api";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "./app";
import { ResendInbound, verifySvix } from "./inbound-mail";
import type { Mail, MailFile } from "./inbox";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: PeniStores;
let now: Date;
let answer: () => unknown;
let model: ScriptedModel;
let leyla: StaffContext;
let murat: StaffContext;
let ece: StaffContext;
let address: string;
let mails = 0;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );

const pdf = (n: number) => new TextEncoder().encode(`%PDF-1.4\n% emailed bill ${n}\n`);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const file = (name: string, bytes: Uint8Array, contentType = "application/pdf", size = bytes.length): MailFile & { reads: number } => {
  const f = {
    name,
    contentType,
    size,
    reads: 0,
    read: async () => {
      f.reads++;
      return bytes;
    },
  };
  return f;
};
const mail = (to: string[], files: MailFile[], over: Partial<Mail> = {}): Mail => ({
  providerId: `re_${++mails}`,
  from: "Ambalaj Dünyası <Satis@AmbalajDunyasi.test>",
  recipients: to,
  subject: "e-Fatura A-20511",
  files: async () => files,
  ...over,
});

const reading: BillReading = {
  kind: "bill",
  supplierName: "ADN AMBALAJ SAN.",
  supplierTaxNumber: null,
  number: "A-20511",
  date: "2026-10-15",
  dueDate: null,
  total: 1810,
  lines: [{ name: "Karton bardak 8 oz", quantity: 1000, unit: "adet", total: 1810, category: "supplies", stockItem: null, stockQuantity: null }],
  kdv: [],
  doubts: [],
};

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  answer = () => reading;
  model = new ScriptedModel(() => answer(), "test-model");
  stores = inMemoryStores();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on" }, inboxDomain: "fatura.peni.app" }, stores);
  await seed(app, { sales: false, drafts: false });
  [leyla, murat, ece] = await Promise.all([at("leyla"), at("murat"), at("ece")]);
  address = (await app.inbox.view(leyla)).address!;
});

describe("The forward-to-Peni inbox (plan piece 26)", () => {
  it("gives each café its own secret address, and only those who use the assistant see it", async () => {
    expect(address).toMatch(/^moda\.[a-z2-9]{10}@fatura\.peni\.app$/);
    expect(await app.inbox.view(murat)).toMatchObject({ ready: true, address, enabled: true, canManage: true, canSendSample: true, emails: [] });
    expect(await code(app.inbox.view(ece))).toBe("FORBIDDEN");
  });

  it("reads each photo or PDF in an email, names what it left and why, and the draft knows who sent it", async () => {
    const big = file("katalog.pdf", pdf(9), "application/pdf", 11 * 1024 * 1024);
    const files = [
      file("A-20511.pdf", pdf(1)),
      file("A-20511.xml", new TextEncoder().encode("<Invoice/>"), "application/xml"),
      file("", PNG, "image/png"),
      big,
    ];
    expect(await app.inbox.receive(mail([`Moda Kahvesi <${address.toUpperCase()}>`], files))).toBe(2);
    expect(big.reads).toBe(0);
    await app.assistant.runSoon();

    const drafts = billDrafts(await app.assistant.list(leyla));
    expect(drafts).toHaveLength(2);
    // The name read doesn't match a supplier; the sender's address does.
    expect(drafts.map((d) => [d.proposal.supplierId, d.document?.sender])).toEqual([
      ["sup_seed_ambalaj", "satis@ambalajdunyasi.test"],
      ["sup_seed_ambalaj", "satis@ambalajdunyasi.test"],
    ]);
    // Two copies of one bill: the second is marked.
    expect(drafts.filter((d) => d.duplicateOf?.kind === "draft")).toHaveLength(1);

    const [email] = (await app.inbox.view(leyla)).emails;
    expect(email).toMatchObject({ sender: "satis@ambalajdunyasi.test", subject: "e-Fatura A-20511", at: now.toISOString() });
    expect(email!.documents.map((d) => [d.name, d.state])).toEqual([
      ["A-20511.pdf", "waiting"],
      ["ek-3", "waiting"],
    ]);
    expect(email!.skipped).toEqual([
      { name: "A-20511.xml", why: "type" },
      { name: "katalog.pdf", why: "large" },
    ]);
    expect((await app.assistant.log(leyla)).events.map((e) => e.kind)).toContain("email.received");

    // Confirmed, the email says so.
    const d = drafts.find((x) => !x.duplicateOf)!;
    await app.assistant.confirm(leyla, d.id, {
      supplierId: d.proposal.supplierId,
      number: d.proposal.number,
      date: d.proposal.date!,
      lines: [{ itemId: null, name: "Bardak", category: "supplies", totalKurus: 181_000 }],
    });
    expect((await app.inbox.view(leyla)).emails[0]!.documents.find((x) => x.documentId === d.document!.id)?.state).toBe("saved");
  });

  it("takes an email once, ignores addresses that aren't a café's, and reads forwarded and copied mail", async () => {
    const m = mail([address], [file("a.pdf", pdf(1))]);
    expect(await app.inbox.receive(m)).toBe(1);
    expect(await app.inbox.receive(m)).toBe(0);

    let fetched = 0;
    const counted = (to: string[]) => mail(to, [], { files: async () => (fetched++, [file("b.pdf", pdf(2))]) });
    const token = address.split("@")[0]!.split(".")[1]!;
    expect(await app.inbox.receive(counted(["moda.zzzzzzzzzz@fatura.peni.app"]))).toBe(0);
    expect(await app.inbox.receive(counted([`moda.${token}@elsewhere.test`]))).toBe(0);
    expect(fetched).toBe(0);

    // Forwarded from the owner's mailbox: it's addressed to them, received for the café.
    expect(await app.inbox.receive({ ...mail(["leyla@moda.test"], [file("c.pdf", pdf(3))]), recipients: ["leyla@moda.test", address] })).toBe(1);
    expect(await app.inbox.receive(mail(["leyla@moda.test", `fatura+ekim@x.test`, address.replace("@", "+ekim@")], [file("d.pdf", pdf(4))]))).toBe(1);
    expect((await app.inbox.view(leyla)).emails).toHaveLength(3);
  });

  it("doesn't read a file the café already has, and stops at ten files an email", async () => {
    await app.assistant.upload(murat, pdf(1), "elle.pdf");
    const files = Array.from({ length: 12 }, (_, i) => file(`f${i}.pdf`, pdf(i + 1)));
    expect(await app.inbox.receive(mail([address], files))).toBe(9);
    const [email] = (await app.inbox.view(leyla)).emails;
    expect(email!.skipped).toEqual([
      { name: "f0.pdf", why: "same" },
      { name: "f10.pdf", why: "limit" },
      { name: "f11.pdf", why: "limit" },
    ]);
  });

  it("can be turned off or given a new address, by those who manage bills; the old address stops at once", async () => {
    expect(await code(app.inbox.update(ece, { enabled: false }))).toBe("FORBIDDEN");
    expect((await app.inbox.update(murat, { enabled: false })).enabled).toBe(false);
    expect(await app.inbox.receive(mail([address], [file("a.pdf", pdf(1))]))).toBe(0);
    await app.inbox.update(murat, { enabled: true });

    const fresh = (await app.inbox.update(leyla, { newAddress: true })).address!;
    expect(fresh).not.toBe(address);
    expect(await app.inbox.receive(mail([address], [file("a.pdf", pdf(1))]))).toBe(0);
    expect(await app.inbox.receive(mail([fresh], [file("a.pdf", pdf(1))]))).toBe(1);
  });

  it("takes an email again when its files couldn't be fetched, so the mail service's retry works", async () => {
    const m = mail([address], [], {
      files: async () => {
        throw new Error("Resend answered 500");
      },
    });
    await expect(app.inbox.receive(m)).rejects.toThrow("Resend answered 500");
    expect(await app.inbox.receive({ ...m, files: async () => [file("a.pdf", pdf(1))] })).toBe(1);
  });

  it("sends itself a sample in the demo; elsewhere there's no address until the server takes email", async () => {
    const demo = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on" } }, inMemoryStores());
    await seed(demo, { sales: false, drafts: false });
    const ctx = await demo.staff.at((await demo.staff.signIn(DEMO_STAFF.murat.email, DEMO_STAFF_PASSWORD)).token, "moda");
    expect((await demo.inbox.view(ctx)).address).toMatch(/@fatura\.peni\.test$/);
    const sent = await demo.inbox.sample(ctx);
    expect(sent.emails[0]).toMatchObject({ sender: "satis@ambalajdunyasi.test", skipped: [{ name: "A-20511.xml", why: "type" }] });
    expect((await demo.inbox.sample(ctx)).emails[0]!.documents).toHaveLength(1);

    const live = new PeniApp({ demo: false, bcryptRounds: 4, clock: () => now, ai: { model, mode: "on" } }, inMemoryStores());
    await seed(live, { sales: false, drafts: false });
    const owner = await live.staff.at((await live.staff.signIn(DEMO_STAFF.leyla.email, DEMO_STAFF_PASSWORD)).token, "moda");
    expect(await live.inbox.view(owner)).toMatchObject({ ready: false, address: null, canSendSample: false });
    expect(await code(live.inbox.update(owner, { newAddress: true }))).toBe("INBOX_NOT_READY");
    expect(await code(live.inbox.sample(owner))).toBe("INBOX_SAMPLE_DEMO");
  });
});

describe("Resend's inbound webhook", () => {
  const secret = `whsec_${Buffer.from("a very secret key").toString("base64")}`;
  const sign = (id: string, ts: string, body: string) =>
    `v1,${createHmac("sha256", Buffer.from("a very secret key")).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const t = new Date("2026-10-16T09:00:00Z");
  const ts = String(t.getTime() / 1000);

  it("accepts only requests signed with the secret, and not old ones", () => {
    const body = '{"type":"email.received"}';
    const ok = { id: "msg_1", timestamp: ts, signature: `v1,bm9wZQ== ${sign("msg_1", ts, body)}` };
    expect(verifySvix(secret, ok, body, t)).toBe(true);
    expect(verifySvix(secret, ok, body.replace("}", " }"), t)).toBe(false);
    expect(verifySvix(secret, { ...ok, id: "msg_2" }, body, t)).toBe(false);
    expect(verifySvix(secret, ok, body, new Date(t.getTime() + 6 * 60_000))).toBe(false);
    expect(verifySvix(secret, { ...ok, signature: null }, body, t)).toBe(false);
  });

  it("turns an email.received event into mail, fetching attachments only when asked", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.includes("/attachments"))
        return Response.json({
          object: "list",
          has_more: false,
          data: [{ id: "att_1", filename: "fatura.pdf", size: 21, content_type: "application/pdf", download_url: "https://cdn.test/att_1" }],
        });
      return new Response(pdf(1));
    }) as typeof fetch;
    const inbound = new ResendInbound("re_key", fake);
    expect(inbound.mail({ type: "email.sent", data: { email_id: "x" } })).toBeNull();
    const m = inbound.mail({
      type: "email.received",
      data: { email_id: "e1", from: "Satış <satis@ambalajdunyasi.test>", to: ["a@x.test"], cc: ["b@x.test"], received_for: ["c@x.test"], subject: "Fatura" },
    })!;
    expect([m.providerId, m.recipients, calls]).toEqual(["e1", ["a@x.test", "b@x.test", "c@x.test"], []]);
    const [f] = await m.files();
    expect([f!.name, f!.contentType, f!.size, calls]).toEqual([
      "fatura.pdf",
      "application/pdf",
      21,
      ["https://api.resend.com/emails/receiving/e1/attachments"],
    ]);
    expect(await f!.read()).toEqual(pdf(1));
  });
});

/** The bill drafts waiting (piece 27 adds statements and Z reports). */
function billDrafts(list: DraftsDTO): BillDraftDTO[] {
  return list.open.filter((d): d is BillDraftDTO => d.kind === "bill");
}
