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

/** Demo sign-in: the session cookie's value also works as a bearer token. */
async function signIn(customerId) {
  const res = await fetch(`${BASE}/api/v1/auth/demo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerId }),
  });
  const token = /peni_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
  assert.ok(token, `sign-in failed for ${customerId}`);
  const me = (await call("GET", "/me", { token })).json;
  assert.deepEqual(me.staffCafes, [], "no demo customer is staff");
  return token;
}

const step = (name) => console.log(`✓ ${name}`);
const modaBalance = async (token) =>
  (await call("GET", "/me/wallet", { token })).json.cafes.find((c) => c.cafeSlug === "moda").balancePeni;

// 0. Baseline. Neighbours seeded around the demo customers also hold peni, so the
//    report check at the end compares changes, not totals.
const deniz = await signIn("cus_deniz");
const ayse = await signIn("cus_ayse");
const mehmet = await signIn("cus_mehmet");
const dash0 = (await call("GET", "/staff/moda", { headers: STAFF })).json;
const wallets0 = await Promise.all([ayse, mehmet, deniz].map(modaBalance));

// 1. Deniz is new and has no peni; she may take from the askı.
let cafe = (await call("GET", "/cafes/moda", { token: deniz })).json;
assert.equal(cafe.membership.balancePeni, 0);
const askiBefore = cafe.askida.balancePeni;
assert.ok(cafe.askida.itemsAvailable > 0);
assert.deepEqual(cafe.askida.myEligibility, { status: "ok" });
assert.equal((await call("GET", "/cafes/moda")).json.askida.myEligibility.status, "not_member");
assert.ok(cafe.askida.wall.every((e) => e.type !== "claim"), "claims are never listed");
const forbidden = await call("GET", "/staff/moda");
assert.equal(forbidden.status, 403);
step(`Deniz signs in; the askı holds ${askiBefore} peni and she may take from it; the staff view needs the key`);

// 2. Ayşe treats Mehmet, then leaves coffee on the askı.
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

// 3. Profile, calendar.
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

// 4. The café report adds up: every change in what is owed is a change in wallets or the askı.
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
