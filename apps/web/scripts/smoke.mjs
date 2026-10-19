// End-to-end smoke test against a running Peni web server in demo mode.
//   pnpm --filter @peni/web start &   then   node scripts/smoke.mjs [baseUrl]
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3000";
const STAFF_PASSWORD = process.env.PENI_DEMO_STAFF_PASSWORD ?? "demo-staff";
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

/** Staff sign-in: the token goes in x-peni-staff-token, as the Expo app sends it. */
async function staffSignIn(email, password = STAFF_PASSWORD) {
  const res = await call("POST", "/staff-session", { body: { email, password } });
  assert.equal(res.status, 200, `staff sign-in failed for ${email}`);
  return { "x-peni-staff-token": res.json.token };
}

const step = (name) => console.log(`✓ ${name}`);
const modaBalance = async (token) =>
  (await call("GET", "/me/wallet", { token })).json.cafes.find((c) => c.cafeSlug === "moda").balancePeni;

// 0. Baseline. Neighbours seeded around the demo customers also hold peni, so the
//    report check at the end compares changes, not totals.
const deniz = await signIn("cus_deniz");
const ayse = await signIn("cus_ayse");
const mehmet = await signIn("cus_mehmet");
const STAFF = await staffSignIn("leyla@moda.test");
const dash0 = (await call("GET", "/staff/moda", { headers: STAFF })).json;
const wallets0 = await Promise.all([ayse, mehmet, deniz].map(modaBalance)); // Nazlı joins later, with 0

// 1. Deniz is new and has no peni; she may take from the askı.
let cafe = (await call("GET", "/cafes/moda", { token: deniz })).json;
assert.equal(cafe.membership.balancePeni, 0);
const askiBefore = cafe.askida.balancePeni;
assert.ok(cafe.askida.itemsAvailable > 0);
assert.deepEqual(cafe.askida.myEligibility, { status: "ok" });
assert.equal((await call("GET", "/cafes/moda")).json.askida.myEligibility.status, "not_member");
assert.ok(cafe.askida.wall.every((e) => e.type !== "claim"), "claims are never listed");
assert.equal((await call("GET", "/staff/moda")).status, 401);
assert.equal((await call("GET", "/staff/moda", { token: deniz })).status, 401, "a customer session is not a staff session");
step(`Deniz signs in; the askı holds ${askiBefore} peni and she may take from it; the café view needs a staff sign-in`);

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

// 3. Staff: roles decide who sees what; the owner runs the team and the roles.
assert.equal((await call("POST", "/staff-session", { body: { email: "leyla@moda.test", password: "wrong-password" } })).json.error.code, "SIGN_IN_FAILED");
const ece = await staffSignIn("ece@moda.test");
const till = await call("POST", "/staff/moda/askida/till", { headers: ece, body: { peni: 20, idempotencyKey: key() } });
assert.equal(till.status, 200, "a barista records askı cash");
const eceDash = await call("GET", "/staff/moda", { headers: ece });
assert.equal(eceDash.status, 403, "a barista doesn't see the peni report");
assert.equal(eceDash.json.error.code, "FORBIDDEN");
assert.equal((await call("GET", "/staff/kuzguncuk", { headers: ece })).json.error.code, "NOT_STAFF");
const staffMe = (await call("GET", "/staff-session", { headers: STAFF })).json;
assert.deepEqual(staffMe.cafes.map((c) => `${c.slug}:${c.role}`), ["moda:owner", "kuzguncuk:manager"]);
const email = `ali.${key().slice(0, 8)}@moda.test`;
const team = (await call("POST", "/staff/moda/team", { headers: STAFF, body: { name: "Ali Vural", email, role: "barista", password: "ali-first-day" } })).json;
const ali = team.members.find((m) => m.email === email);
assert.equal(ali.role, "barista");
const aliHeaders = await staffSignIn(email, "ali-first-day");
assert.equal((await call("GET", "/staff/moda/team", { headers: aliHeaders })).status, 403, "baristas don't see the team");
const roles = (await call("POST", "/staff/moda/roles", { headers: STAFF, body: { roles: { barista: { "team.view": true } } } })).json;
assert.equal(roles.sections.flatMap((s) => s.permissions).find((p) => p.key === "team.view").roles.barista, true);
assert.equal((await call("GET", "/staff/moda/team", { headers: aliHeaders })).status, 200, "the owner let baristas see the team");
await call("POST", "/staff/moda/roles", { headers: STAFF, body: { roles: {} } });
assert.equal((await call("POST", `/staff/moda/team/${ali.id}`, { headers: STAFF, body: { removed: true } })).status, 200);
assert.equal((await call("GET", "/staff/moda", { headers: aliHeaders })).json.error.code, "NOT_STAFF");
await call("POST", "/staff-session/sign-out", { headers: ece });
assert.equal((await call("GET", "/staff-session", { headers: ece })).status, 401);
step("Staff sign in by email; Ece records askı cash but can't see the report; Leyla adds Ali, lets baristas see the team, then removes him");

// 4. The till: Leyla sets the café computer up once; Ece signs in on it with her PIN.
const setup = (await call("POST", "/staff/moda/devices", { headers: STAFF, body: { name: "Kasa bilgisayarı" } })).json;
const TILL = { "x-peni-till-token": setup.token };
assert.equal((await call("GET", "/till")).json.error.code, "DEVICE_UNKNOWN");
const tillScreen = (await call("GET", "/till", { headers: TILL })).json;
const eceAtTill = tillScreen.staff.find((s) => s.name === "Ece Tan");
assert.equal(eceAtTill.hasPin, true);
assert.equal((await call("POST", "/till/pin", { headers: TILL, body: { memberId: eceAtTill.memberId, pin: "0007" } })).json.error.code, "PIN_WRONG");
const pinSession = (await call("POST", "/till/pin", { headers: TILL, body: { memberId: eceAtTill.memberId, pin: "2580" } })).json;
assert.equal(pinSession.signedInWith, "pin");
const ecePin = { "x-peni-staff-token": pinSession.token };
assert.equal((await call("POST", "/staff/moda/askida/till", { headers: ecePin, body: { peni: 10, idempotencyKey: key() } })).status, 200);
assert.equal((await call("POST", "/staff/moda/pin", { headers: ecePin, body: { pin: "9137" } })).json.error.code, "NEEDS_PASSWORD");
await call("POST", `/staff/moda/devices/${setup.device.id}/revoke`, { headers: STAFF });
assert.equal((await call("GET", "/staff-session", { headers: ecePin })).status, 401, "revoking the till signs everyone on it out");
step("Leyla sets up a till; Ece signs in with her PIN, records askı cash, can't change her PIN there; revoking the till signs her out");

// 5. A newcomer signs in with an email code; a second code replaces the first.
const providers = (await call("GET", "/auth/providers")).json;
assert.equal(providers.email, true);
const newcomer = `zeynep.${key().slice(0, 8)}@example.com`;
assert.equal((await call("POST", "/auth/email/start", { body: { email: newcomer } })).status, 200);
const firstCode = (await call("GET", `/auth/demo/outbox?email=${encodeURIComponent(newcomer)}`)).json.code;
await call("POST", "/auth/email/start", { body: { email: newcomer.toUpperCase() } });
const code = (await call("GET", `/auth/demo/outbox?email=${encodeURIComponent(newcomer)}`)).json.code;
assert.match(code, /^\d{6}$/);
if (firstCode !== code) {
  assert.equal((await call("POST", "/auth/email/verify", { body: { email: newcomer, code: firstCode } })).json.error.code, "CODE_WRONG");
}
const emailSession = await call("POST", "/auth/email/verify", { body: { email: newcomer, code } });
assert.equal(emailSession.status, 200);
assert.equal(emailSession.json.isNew, true);
const zeynep = (await call("GET", "/me", { token: emailSession.json.token })).json;
assert.equal(zeynep.customer.email, newcomer);
assert.equal(zeynep.customer.phone, null);
assert.equal((await call("POST", "/auth/email/verify", { body: { email: newcomer, code } })).json.error.code, "CODE_EXPIRED", "a code works once");
step("A newcomer asks for two email codes; only the newest works, once, and she lands without a name or phone");

// 5b. Without a phone, friends find her by Peni kodu or from the café's member list.
const nazli = emailSession.json.token;
await call("POST", "/me/profile", { token: nazli, body: { displayName: "Nazlı Ekinci", profileVisible: true } });
const nazliCode = (await call("POST", "/cafes/moda/join", { token: nazli })).json.membership.memberCode;
const picked = (await call("GET", "/cafes/moda/members?q=naz", { token: ayse })).json.members;
assert.deepEqual(picked.map((m) => `${m.firstName} ${m.lastInitial}.`), ["Nazlı E."]);
assert.equal((await call("GET", "/cafes/moda/members")).status, 401, "the member list needs a sign-in");
const byCode = await call("POST", "/cafes/moda/members/lookup", { token: ayse, body: { code: nazliCode.toLowerCase().replace("-", " ") } });
assert.deepEqual(byCode.json, { firstName: "Nazlı", lastInitial: "E" });
assert.equal((await call("POST", "/gifts", { token: ayse, body: { cafeSlug: "moda", toPhone: "+905320000002", toCode: nazliCode, peni: 5, idempotencyKey: key() } })).json.error.code, "VALIDATION");
const welcome = (await call("POST", "/gifts", { token: ayse, body: { cafeSlug: "moda", toCode: nazliCode, peni: 20, message: "Hoş geldin", idempotencyKey: key() } })).json;
assert.equal((await call("POST", `/gifts/${welcome.id}/accept`, { token: nazli })).json.status, "accepted");
const again = (await call("GET", "/me/wallet", { token: ayse })).json.recentRecipients.find((r) => r.firstName === "Nazlı");
assert.equal(again.phone, null);
assert.equal(again.memberId, picked[0].memberId);
step("Ayşe finds Nazlı (no phone) in Moda's member list and by her Peni kodu, treats her 20 peni, and can send again from recents");

// 5c. Menü: Leyla adds a product, changes its price, takes it off and back; Ece can't edit.
let menu = (await call("GET", "/staff/moda/menu", { headers: STAFF })).json;
const cold = menu.categories.find((c) => c.name === "Soğuk");
assert.ok(cold, "Moda has a Soğuk category");
menu = (await call("POST", "/staff/moda/menu/products", { headers: STAFF, body: { name: "Soğuk Demleme", categoryId: cold.id, priceKurus: 14_000 } })).json;
const brew = menu.products.find((p) => p.name === "Soğuk Demleme");
assert.equal((await call("POST", `/staff/moda/menu/products/${brew.productId}`, { headers: STAFF, body: { priceKurus: 14_500 } })).json.products.find((p) => p.productId === brew.productId).priceKurus, 14_500);
assert.equal((await call("GET", "/cafes/moda")).json.menu.find((m) => m.productId === brew.productId).priceKurus, 14_500, "customers see the new price");
assert.equal((await call("POST", "/staff/moda/menu/categories", { headers: STAFF, body: { name: "soğuk" } })).json.error.code, "CATEGORY_EXISTS");
assert.equal((await call("POST", "/staff/moda/menu/categories", { headers: await staffSignIn("ece@moda.test"), body: { name: "Kahvaltı" } })).json.error.code, "FORBIDDEN");
menu = (await call("POST", `/staff/moda/menu/products/${brew.productId}`, { headers: STAFF, body: { removed: true } })).json;
assert.deepEqual(menu.removed.map((p) => p.productId), [brew.productId]);
assert.ok(!(await call("GET", "/cafes/moda")).json.menu.some((m) => m.productId === brew.productId), "removed products leave the customer page");
step("Leyla adds Soğuk Demleme, raises its price, which customers see at once, then takes it off the menu; Ece can't edit the menu");

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
const wallets = await Promise.all([ayse, mehmet, deniz, nazli].map(modaBalance));
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
