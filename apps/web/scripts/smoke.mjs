// End-to-end smoke test against a running Peni web server in demo mode.
//   pnpm --filter @peni/web start &   then   node scripts/smoke.mjs [baseUrl]
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3000";
const STAFF = { "x-peni-staff-key": process.env.PENI_DEMO_STAFF_KEY ?? "demo-staff" };
const key = () => crypto.randomUUID();

async function call(method, path, { body, token, headers = {} } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function signIn(phone) {
  const code = (await call("POST", "/auth/request-code", { body: { phone } })).json.devCode;
  const { json } = await call("POST", "/auth/verify", { body: { phone, code } });
  assert.ok(json.token, `sign-in failed for ${phone}`);
  assert.equal(json.isNew, false, `${phone} is a seeded neighbour, not new`);
  assert.deepEqual(json.staffCafes, [], "no demo customer is staff");
  return json.token;
}

const step = (name) => console.log(`✓ ${name}`);
const modaBalance = async (token) =>
  (await call("GET", "/me/wallet", { token })).json.cafes.find((c) => c.cafeSlug === "moda").balancePeni;

// 0. Baseline. Neighbours seeded around the demo customers also hold peni, so the
//    report check at the end compares changes, not totals.
const deniz = await signIn("+905320000003");
const ayse = await signIn("+905320000001");
const mehmet = await signIn("+905320000002");
const dash0 = (await call("GET", "/staff/moda", { headers: STAFF })).json;
const wallets0 = await Promise.all([ayse, mehmet, deniz].map(modaBalance));

// 1. Deniz is new and has no peni. Today she takes a tea from the askı.
let cafe = (await call("GET", "/cafes/moda", { token: deniz })).json;
assert.equal(cafe.membership.balancePeni, 0);
const askiBefore = cafe.askida.balancePeni;
assert.ok(cafe.askida.itemsAvailable > 0);
assert.deepEqual(cafe.askida.myEligibility, { status: "ok" });
assert.equal((await call("GET", "/cafes/moda")).json.askida.myEligibility.status, "not_member");
step(`Deniz signs in by phone; the askı holds ${askiBefore} peni and she may take from it`);

let order = (
  await call("POST", "/orders", {
    token: deniz,
    body: { cafeSlug: "moda", lines: [{ productId: "cay", quantity: 1 }, { productId: "simit", quantity: 1 }], askidaProductId: "cay", idempotencyKey: key() },
  })
).json;
assert.equal(order.askidaKurus, 3000);
assert.equal(order.dueKurus, 2500, "Deniz pays only for the simit");
assert.equal(order.earnedPeni, null, "nothing earned before paying");
assert.equal(order.memberCode, cafe.membership.memberCode);
step(`Deniz orders tea from the askı + a simit; pays ${order.dueKurus / 100} TL at the till`);

assert.equal((await call("GET", "/cafes/moda", { token: deniz })).json.askida.myEligibility.status, "claimed_today");
const second = await call("POST", "/orders", {
  token: deniz,
  body: { cafeSlug: "moda", lines: [{ productId: "cay", quantity: 1 }], askidaProductId: "cay", idempotencyKey: key() },
});
assert.equal(second.json.error.code, "ASKIDA_LIMIT");
step("The take sheet now says claimed_today, and a second askı tea is refused (ASKIDA_LIMIT)");

// 2. The barista works the order through.
const forbidden = await call("GET", "/staff/moda");
assert.equal(forbidden.status, 403);
for (const action of ["accept", "ready", "collect"]) {
  order = (await call("POST", `/staff/moda/orders/${order.id}`, { headers: STAFF, body: { action } })).json;
}
assert.equal(order.status, "collected");
assert.equal(order.earnedPeni, 1, "the fiş shows +1 peni");
cafe = (await call("GET", "/cafes/moda", { token: deniz })).json;
assert.equal(cafe.membership.balancePeni, 1, "5 % of the 25 TL she paid");
assert.ok(cafe.askida.wall.every((e) => e.type !== "claim"), "claims are never listed");
assert.ok(!JSON.stringify(cafe.askida).includes("Deniz"), "takers are never named");
const denizLedger = (await call("GET", "/me/wallet", { token: deniz })).json.ledger;
assert.deepEqual(denizLedger.map((l) => [l.kind, l.peni]), [["earn", 1]], "her history shows the earn, never the ikram");
step("Barista accepts, readies, gets paid; Deniz earns 1 peni; the askı lists no claim and her history no ikram");

// 3. Ayşe treats Mehmet, then leaves coffee on the askı.
const lookup = await call("POST", "/cafes/moda/members/lookup", { token: ayse, body: { phone: "+905320000002" } });
assert.deepEqual(lookup.json, { firstName: "Mehmet", lastInitial: "K" });
const unknown = await call("POST", "/cafes/moda/members/lookup", { token: ayse, body: { phone: "+905559999999" } });
assert.equal(unknown.status, 404);
assert.equal(unknown.json.error.code, "RECIPIENT_NOT_MEMBER");
const gift = (await call("POST", "/gifts", { token: ayse, body: { cafeSlug: "moda", toPhone: "+905320000002", peni: 30, message: "Afiyet olsun", idempotencyKey: key() } })).json;
assert.equal(gift.status, "pending");
assert.equal(gift.canCancel, true);
const preview = await call("GET", `/gifts/${gift.id}/preview`);
assert.equal(preview.status, 200, "the gift link works signed out");
assert.equal(preview.json.fromFirstName, "Ayşe");
assert.equal(preview.json.goods, "1 çay");
assert.equal(preview.json.viewer, "signed_out");
assert.equal((await call("GET", `/gifts/${gift.id}/preview`, { token: mehmet })).json.viewer, "recipient");
const accepted = (await call("POST", `/gifts/${gift.id}/accept`, { token: mehmet })).json;
assert.equal(accepted.status, "accepted");
const thanked = (await call("POST", `/gifts/${gift.id}/thanks`, { token: mehmet })).json;
const thankedAgain = (await call("POST", `/gifts/${gift.id}/thanks`, { token: mehmet })).json;
assert.ok(thanked.thankedAt);
assert.equal(thankedAgain.thankedAt, thanked.thankedAt);
step("Ayşe finds 'Mehmet K.' by phone and sends 30 peni; the public link previews it; Mehmet accepts and thanks her once");

const undo = (await call("POST", "/gifts", { token: ayse, body: { cafeSlug: "moda", toPhone: "+905320000002", peni: 10, idempotencyKey: key() } })).json;
const undone = (await call("POST", `/gifts/${undo.id}/cancel`, { token: ayse })).json;
assert.equal(undone.cancelledBySender, true);
assert.ok(!(await call("GET", "/me/wallet", { token: mehmet })).json.gifts.some((g) => g.id === undo.id));
step("Ayşe takes back a second gift before Mehmet sees it");

const donation = (await call("POST", "/askida/donate", { token: ayse, body: { cafeSlug: "moda", peni: 60, showName: true, idempotencyKey: key() } })).json;
assert.equal(donation.matchedPeni, 30, "Moda matches 50 %");
step("Ayşe leaves 60 peni on the askı; the café adds 30");

// 4. A rejected order gives the peni back.
const before = (await call("GET", "/cafes/moda", { token: mehmet })).json.membership.balancePeni;
let mo = (await call("POST", "/orders", { token: mehmet, body: { cafeSlug: "moda", lines: [{ productId: "latte", quantity: 1 }], usePeni: 40, idempotencyKey: key() } })).json;
assert.equal(mo.peniDiscountKurus, 4000);
mo = (await call("POST", `/staff/moda/orders/${mo.id}`, { headers: STAFF, body: { action: "reject", reason: "Süt bitti" } })).json;
const after = (await call("GET", "/cafes/moda", { token: mehmet })).json.membership.balancePeni;
assert.equal(after, before);
const [refund, redeem] = (await call("GET", "/me/wallet", { token: mehmet })).json.ledger;
assert.deepEqual([refund.kind, refund.peni, redeem.kind, redeem.peni], ["refund", 40, "redeem", -40]);
step("Mehmet spends 40 peni on a latte; the barista rejects it; the 40 peni come back, both lines in his history");

// 5. Pausing app orders: the original boolean call, then a timed pause.
await call("POST", "/staff/moda/pause", { headers: STAFF, body: { paused: true } });
const paused = await call("POST", "/orders", { token: mehmet, body: { cafeSlug: "moda", lines: [{ productId: "cay", quantity: 1 }], idempotencyKey: key() } });
assert.equal(paused.json.error.code, "ORDERING_CLOSED");
await call("POST", "/staff/moda/pause", { headers: STAFF, body: { paused: false } });
const timed = (await call("POST", "/staff/moda/pause", { headers: STAFF, body: { pause: { minutes: 15 } } })).json;
assert.equal(timed.appOrderingPaused, true);
assert.ok(Math.abs(new Date(timed.pausedUntil).getTime() - Date.now() - 15 * 60_000) < 60_000);
assert.equal((await call("GET", "/staff/moda", { headers: STAFF })).json.cafe.pausedUntil, timed.pausedUntil);
const resumed = (await call("POST", "/staff/moda/pause", { headers: STAFF, body: { pause: null } })).json;
assert.deepEqual(resumed, { appOrderingPaused: false, pausedUntil: null });
step("Paused café refuses app orders; a 15-minute pause carries its end time; null resumes");

// 6. Profile, calendar.
const me = (await call("GET", "/me", { token: ayse })).json;
assert.equal(me.customer.displayName, "Ayşe Yılmaz");
assert.deepEqual(me.staffCafes, []);
const hidden = (await call("POST", "/me/profile", { token: ayse, body: { profileVisible: false } })).json;
assert.equal(hidden.customer.profileVisible, false);
await call("POST", "/me/profile", { token: ayse, body: { profileVisible: true } });
const ics = await fetch(`${BASE}/api/v1/cafes/moda/posts/post_event_1/ics`);
assert.equal(ics.status, 200);
assert.match(ics.headers.get("content-type") ?? "", /^text\/calendar/);
assert.match(await ics.text(), /BEGIN:VEVENT\r\n[\s\S]*SUMMARY:Mahalleye bir takas kütüphanesi kursak\?/);
step("Profil loads and saves; the Peni masası downloads as text/calendar");

// 7. The café report adds up: every change in what is owed is a change in wallets or the askı.
const dash = (await call("GET", "/staff/moda", { headers: STAFF })).json;
const wallets = await Promise.all([ayse, mehmet, deniz].map(modaBalance));
const delta = (xs, ys) => ys.reduce((a, b) => a + b, 0) - xs.reduce((a, b) => a + b, 0);
assert.equal(
  dash.report.outstandingPeni - dash0.report.outstandingPeni,
  delta(wallets0, wallets) + (dash.askida.balancePeni - dash0.askida.balancePeni),
);
assert.ok(dash.report.previous && dash.report.previous.untilIso === dash.report.sinceIso);
step(
  `Report: ${dash.report.outstandingPeni} peni outstanding; this run moved ${dash.report.outstandingPeni - dash0.report.outstandingPeni} = wallets ${delta(wallets0, wallets)} + askı ${dash.askida.balancePeni - dash0.askida.balancePeni}`,
);

console.log("\nAll smoke checks passed.");
