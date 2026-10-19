// End-to-end smoke test against a running Peni web server in demo mode.
//   pnpm --filter @peni/web start &   then   node scripts/smoke.mjs [baseUrl]
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3000";
const STAFF_PASSWORD = process.env.PENI_DEMO_STAFF_PASSWORD ?? "demo-staff";
const key = () => crypto.randomUUID();

/** "2026-10-12" plus n days. */
function addDays(day, n) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

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
assert.equal((await call("GET", `/gifts/${welcome.id}/preview`)).json.gift, null, "a stranger with the link sees no note");
assert.equal((await call("GET", `/gifts/${welcome.id}/preview`, { token: nazli })).json.gift.message, "Hoş geldin");
assert.equal((await call("POST", `/gifts/${welcome.id}/accept`, { token: nazli })).json.status, "accepted");
await call("POST", `/gifts/${welcome.id}/thanks`, { token: nazli });
assert.ok((await call("GET", `/gifts/${welcome.id}/preview`, { token: ayse })).json.gift.thankedAt, "Ayşe sees the thanks on the link");
const again = (await call("GET", "/me/wallet", { token: ayse })).json.recentRecipients.find((r) => r.firstName === "Nazlı");
assert.equal(again.phone, null);
assert.equal(again.memberId, picked[0].memberId);
step("Ayşe finds Nazlı (no phone) in Moda's member list and by her Peni kodu, treats her 20 peni; Nazlı opens the link, accepts and says thanks, and Ayşe can send again from recents");

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

// 5d. Satış ekranı: Ece takes an order at the till, a retry makes no second one, she takes cash
//     and the till works out the change; Leyla voids an unpaid order and refunds a paid one.
const till2 = (await call("POST", "/staff/moda/devices", { headers: STAFF, body: { name: "Kasa" } })).json;
const TILL2 = { "x-peni-till-token": till2.token };
const eceId = (await call("GET", "/till", { headers: TILL2 })).json.staff.find((s) => s.name === "Ece Tan").memberId;
const ecePos = { "x-peni-staff-token": (await call("POST", "/till/pin", { headers: TILL2, body: { memberId: eceId, pin: "2580" } })).json.token };
const tiles = (await call("GET", "/staff/moda/till-menu", { headers: ecePos })).json;
assert.deepEqual(tiles.categories.map((c) => c.name), ["Sıcak", "Soğuk", "Yiyecek", "Tatlı"]);
const sale = { createKey: key(), lines: [{ productId: "latte", quantity: 2, discountPercent: 10 }, { productId: "simit", quantity: 1 }] };
const order = (await call("POST", "/staff/moda/orders", { headers: ecePos, body: sale })).json;
assert.equal(order.totalKurus, 24_100, "2 latte with 10% off and a simit");
assert.equal((await call("POST", "/staff/moda/orders", { headers: ecePos, body: sale })).json.id, order.id, "a retried tap makes no second order");
const payBody = { method: "cash", payKey: key(), tenderedKurus: 30_000 };
assert.equal((await call("POST", `/staff/moda/orders/${order.id}/pay`, { headers: ecePos, body: { ...payBody, payKey: key() } })).json.error.code, "CASH_CLOSED", "no cash with the drawer closed");
const drawer = (await call("POST", "/staff/moda/cash/open", { headers: ecePos, body: { key: key(), counts: { "20000": 2, "1000": 10 } } })).json;
assert.equal(drawer.open.opening.countKurus, 50_000, "Ece counts ₺500 into the drawer by notes");
// 5e. Payments (piece 8): a card waits for Ece's "approved" tap, as Peni can't drive the
//     terminal yet; she backs out when the customer pays cash instead, which goes through at once.
const card = (await call("POST", `/staff/moda/orders/${order.id}/pay`, { headers: ecePos, body: { method: "card", payKey: key() } })).json;
assert.deepEqual([card.payment.status, card.payment.confirmBy, card.order.status], ["pending", "staff", "open"]);
const backedOut = (await call("POST", `/staff/moda/orders/${order.id}/payments/${card.payment.id}/cancel`, { headers: ecePos, body: {} })).json;
assert.equal(backedOut.payment.status, "cancelled");
const paidAnswer = (await call("POST", `/staff/moda/orders/${order.id}/pay`, { headers: ecePos, body: payBody })).json;
assert.equal(paidAnswer.payment.status, "approved");
const paidOrder = paidAnswer.order;
assert.equal(paidOrder.changeKurus, 5_900);
assert.deepEqual(paidOrder.payments.map((p) => `${p.method} ${p.status}`), ["card cancelled", "cash approved"]);
assert.match(paidOrder.claim.code, /^\d{4}$/, "the customer screen gets a 4-digit peni code");
assert.equal(paidOrder.claim.peni, 12, "₺241 at Moda's 5 % is 12 peni");
assert.equal((await call("POST", `/staff/moda/orders/${order.id}/pay`, { headers: ecePos, body: payBody })).json.order.paidAt, paidOrder.paidAt);
// 5g. Earning peni (piece 10): the QR opens the claim for anyone; Ayşe takes it once, and
//     the same code typed by Mehmet is already gone.
const ayseBefore = await modaBalance(ayse);
const qr = (await call("GET", `/claims/${paidOrder.claim.token}`)).json;
assert.deepEqual([qr.state, qr.peni, qr.cafeSlug], ["open", 12, "moda"]);
const tookQr = (await call("POST", "/claims", { token: ayse, body: { token: paidOrder.claim.token } })).json;
assert.deepEqual([tookQr.state, tookQr.balancePeni], ["yours", ayseBefore + 12]);
assert.equal((await call("POST", "/claims", { token: ayse, body: { token: paidOrder.claim.token } })).json.balancePeni, ayseBefore + 12, "a second tap adds nothing");
const late = await call("POST", "/claims", { token: mehmet, body: { cafeSlug: "moda", code: paidOrder.claim.code } });
assert.deepEqual([late.status, late.json.error.code], [409, "CLAIM_TAKEN"]);
assert.equal((await call("GET", `/claims/${paidOrder.claim.token}`)).json.state, "taken");
const second = (await call("POST", "/staff/moda/orders", { headers: ecePos, body: { createKey: key(), lines: [{ productId: "cay", quantity: 1 }] } })).json;
assert.equal(second.number, order.number + 1);
assert.equal((await call("POST", `/staff/moda/orders/${second.id}/void`, { headers: ecePos, body: { reason: "Vazgeçti" } })).json.error.code, "FORBIDDEN");
assert.equal((await call("POST", `/staff/moda/orders/${second.id}/void`, { headers: STAFF, body: { reason: "Müşteri vazgeçti" } })).json.status, "voided");
assert.equal((await call("POST", `/staff/moda/orders/${order.id}/refund`, { headers: STAFF, body: { reason: "" } })).status, 400);
const refundedOrder = (await call("POST", `/staff/moda/orders/${order.id}/refund`, { headers: STAFF, body: { reason: "Latte soğuktu" } })).json;
assert.equal(refundedOrder.refunded.amountKurus, 24_100);
assert.deepEqual(refundedOrder.payments.at(-1), { ...refundedOrder.payments.at(-1), kind: "refund", method: "cash", status: "approved", reason: "Latte soğuktu" });
const day = (await call("GET", "/staff/moda/orders", { headers: ecePos })).json;
assert.deepEqual(day.orders.slice(0, 2).map((o) => o.status), ["voided", "refunded"]);
assert.equal(day.summary.refundedKurus >= 24_100, true);
assert.equal(await modaBalance(ayse), ayseBefore, "the refund took Ayşe's 12 peni back");
// Mehmet pays for a latte by card and types the screen's code.
const cardSale = (await call("POST", "/staff/moda/orders", { headers: ecePos, body: { createKey: key(), lines: [{ productId: "latte", quantity: 1 }] } })).json;
const onCard = (await call("POST", `/staff/moda/orders/${cardSale.id}/pay`, { headers: ecePos, body: { method: "card", payKey: key() } })).json;
const cardPaid = (await call("POST", `/staff/moda/orders/${cardSale.id}/payments/${onCard.payment.id}/confirm`, { headers: ecePos, body: {} })).json.order;
const mehmetBefore = await modaBalance(mehmet);
const wrongCode = cardPaid.claim.code === "0000" ? "0001" : "0000";
assert.equal((await call("POST", "/claims", { token: mehmet, body: { cafeSlug: "moda", code: wrongCode } })).json.error.code, "CLAIM_CODE_WRONG");
const typed = (await call("POST", "/claims", { token: mehmet, body: { cafeSlug: "moda", code: cardPaid.claim.code } })).json;
assert.deepEqual([typed.state, typed.balancePeni], ["yours", mehmetBefore + cardPaid.claim.peni]);
// 5h. Spending peni (piece 11): Ayşe opens her ödeme kodu; Ece takes 40 peni off a ₺265
//     order and the rest goes on card, which alone earns peni.
const ayseSpendBefore = await modaBalance(ayse);
const payCode = (await call("POST", "/me/spend-code", { token: ayse, body: { cafeSlug: "moda" } })).json;
assert.match(payCode.code, /^\d{6}$/);
const peniOrder = (await call("POST", "/staff/moda/orders", { headers: ecePos, body: { createKey: key(), lines: [{ productId: "latte", quantity: 2 }, { productId: "simit", quantity: 1 }] } })).json;
const wallet = (await call("POST", `/staff/moda/orders/${peniOrder.id}/peni/check`, { headers: ecePos, body: { code: payCode.code } })).json;
assert.deepEqual([wallet.name, wallet.balancePeni], ["Ayşe Y.", ayseSpendBefore]);
const peniKey = key();
const usedPeni = (await call("POST", `/staff/moda/orders/${peniOrder.id}/peni`, { headers: ecePos, body: { code: payCode.code, peni: 40, payKey: peniKey } })).json;
assert.deepEqual([usedPeni.payment.method, usedPeni.order.status, usedPeni.order.dueKurus], ["peni", "open", 22_500]);
await call("POST", `/staff/moda/orders/${peniOrder.id}/peni`, { headers: ecePos, body: { code: payCode.code, peni: 40, payKey: peniKey } });
assert.equal(await modaBalance(ayse), ayseSpendBefore - 40, "a retried tap takes the peni once");
const rest = (await call("POST", `/staff/moda/orders/${peniOrder.id}/pay`, { headers: ecePos, body: { method: "card", payKey: key() } })).json;
const restPaid = (await call("POST", `/staff/moda/orders/${peniOrder.id}/payments/${rest.payment.id}/confirm`, { headers: ecePos, body: {} })).json.order;
assert.deepEqual([restPaid.status, restPaid.peni.peni, restPaid.claim.peni], ["paid", 40, 11], "only the ₺225 on card earns: 11 peni");

// 5i. Askıda kahve (piece 13): Ece gives a çay from the askı to whoever asks; the same guest
//     leaves a simit on it, paid by card with the rest of the order.
const poolBefore = (await call("GET", "/staff/moda/askida", { headers: ecePos })).json.balancePeni;
const askiOrder = (await call("POST", "/staff/moda/orders", { headers: ecePos, body: { createKey: key(), lines: [{ productId: "cay", quantity: 1 }, { productId: "askida:simit", quantity: 1 }] } })).json;
assert.equal(askiOrder.lines[1].name, "Askıya simit");
const askiKey = key();
const fromAski = (await call("POST", `/staff/moda/orders/${askiOrder.id}/askida`, { headers: ecePos, body: { productId: "cay", quantity: 1, payKey: askiKey } })).json;
await call("POST", `/staff/moda/orders/${askiOrder.id}/askida`, { headers: ecePos, body: { productId: "cay", quantity: 1, payKey: askiKey } });
assert.deepEqual([fromAski.payment.method, fromAski.order.dueKurus, fromAski.order.askida.kurus], ["askida", 2_500, 3_000]);
const locked = await call("POST", `/staff/moda/orders/${askiOrder.id}`, { headers: ecePos, body: { lines: [{ productId: "cay", quantity: 2 }] } });
assert.equal(locked.json.error.code, "ASKIDA_ON_ORDER");
const askiRest = (await call("POST", `/staff/moda/orders/${askiOrder.id}/pay`, { headers: ecePos, body: { method: "card", payKey: key() } })).json;
const askiPaid = (await call("POST", `/staff/moda/orders/${askiOrder.id}/payments/${askiRest.payment.id}/confirm`, { headers: ecePos, body: {} })).json.order;
assert.deepEqual([askiPaid.status, askiPaid.paymentMethod], ["paid", "card"]);
const poolAfter = (await call("GET", "/cafes/moda")).json.askida.balancePeni;
assert.equal(poolAfter, poolBefore - 30 + 25, "one çay off the askı, one simit on it, once each");
step("Askıda kahve at the till: Ece gives a çay from the askı (a retry gives it once) and the order is locked; the guest leaves a simit on it and pays the rest by card");

// 5f. Kasa (piece 9): Ece takes ₺45 out for milk and closes the drawer ₺5 short, with a reason.
await call("POST", "/staff/moda/cash/moves", { headers: ecePos, body: { key: key(), kind: "out", amountKurus: 4_500, reason: "Süt" } });
const beforeClose = (await call("GET", "/staff/moda/cash", { headers: ecePos })).json.open;
assert.equal(beforeClose.totals.expectedKurus, 50_000 + 24_100 - 24_100 - 4_500, "opening + cash sale − cash refund − milk");
const noReason = await call("POST", "/staff/moda/cash/close", { headers: ecePos, body: { key: key(), sessionId: beforeClose.id, countKurus: 45_000 } });
assert.equal(noReason.json.error.code, "DIFFERENCE_REASON_REQUIRED");
const closedDrawer = (await call("POST", "/staff/moda/cash/close", { headers: ecePos, body: { key: key(), sessionId: beforeClose.id, countKurus: 45_000, note: "Bozuk para eksik" } })).json;
assert.deepEqual([closedDrawer.open, closedDrawer.last.closing.differenceKurus], [null, -500]);
await call("POST", `/staff/moda/devices/${till2.device.id}/revoke`, { headers: STAFF });
step("No cash until the drawer is opened; Ece opens it with ₺500 counted by notes, sells 2 latte and a simit (one order despite a retry), starts a card payment and backs out of it, takes 300 TL cash with 59 TL change and a 12-peni code for the customer screen, which Ayşe takes once by QR before Mehmet types it; Leyla voids an unpaid order and refunds the paid one, recorded as a refund payment, which takes Ayşe's peni back; Mehmet types the code of a card sale (a wrong code first); Ayşe pays 40 peni of a ₺265 order with her ödeme kodu and the rest by card; Ece takes ₺45 out for milk and closes the drawer ₺5 short with a reason");

// 5j. The café feed (piece 14): Leyla posts a photo, pinned; Ayşe comments, Leyla hides it, Ayşe
//     deletes another of hers; Ece (barista) can't post.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const upload = await fetch(`${BASE}/api/v1/staff/moda/images`, { method: "POST", headers: { ...STAFF, "content-type": "image/png" }, body: png });
const { url: photoUrl } = await upload.json();
assert.match(photoUrl, /^\/api\/v1\/images\/img_/);
const photo = await fetch(`${BASE}${photoUrl}`);
assert.deepEqual([photo.status, photo.headers.get("content-type"), Buffer.from(await photo.arrayBuffer()).equals(png)], [200, "image/png", true]);
const notAPhoto = await fetch(`${BASE}/api/v1/staff/moda/images`, { method: "POST", headers: { ...STAFF, "content-type": "image/png" }, body: "<svg/>" });
assert.equal((await notAPhoto.json()).error.code, "IMAGE_TYPE");
const postKey = key();
const newPost = { createKey: postKey, body: "Yeni kavurduk: Etiyopya Guji.", imageUrls: [photoUrl], pinned: true };
await call("POST", "/staff/moda/feed", { headers: STAFF, body: newPost });
const staffFeed = (await call("POST", "/staff/moda/feed", { headers: STAFF, body: newPost })).json;
assert.equal(staffFeed.posts.filter((p) => p.body === newPost.body).length, 1, "a retried post posts once");
const postId = `post_${postKey}`;
assert.equal((await call("GET", "/cafes/moda")).json.posts[0].imageUrls[0], photoUrl);
const ecePassword = await staffSignIn("ece@moda.test");
assert.equal((await call("POST", "/staff/moda/feed", { headers: ecePassword, body: { ...newPost, createKey: key() } })).json.error.code, "FORBIDDEN");
await call("POST", `/cafes/moda/posts/${postId}/comments`, { token: ayse, body: { body: "Çekirdek de satıyor musunuz?" } });
await call("POST", `/cafes/moda/posts/${postId}/comments`, { token: ayse, body: { body: "Yanlış yazdım" } });
const seenPost = (await call("GET", "/cafes/moda", { token: ayse })).json.posts.find((p) => p.id === postId);
const [asked, oops] = seenPost.comments;
assert.ok(asked.mine && oops.mine);
assert.equal((await call("POST", `/cafes/moda/posts/${postId}/comments/${oops.id}/delete`, { token: mehmet })).json.error.code, "COMMENT_NOT_FOUND");
await call("POST", `/cafes/moda/posts/${postId}/comments/${oops.id}/delete`, { token: ayse });
const moderated = (await call("POST", `/staff/moda/feed/${postId}/comments/${asked.id}`, { headers: STAFF, body: { hidden: true } })).json;
assert.deepEqual(moderated.posts.find((p) => p.id === postId).comments.map((c) => [c.body, c.hidden]), [["Çekirdek de satıyor musunuz?", true]]);
assert.equal((await call("GET", "/cafes/moda", { token: ayse })).json.posts.find((p) => p.id === postId).comments.length, 0);
await call("POST", `/staff/moda/feed/${postId}/remove`, { headers: STAFF });
assert.ok(!(await call("GET", "/cafes/moda")).json.posts.some((p) => p.id === postId));
step("Leyla posts a photo, pinned (a retry posts once; Ece can't post); Ayşe comments twice and deletes one; Leyla hides the other, then takes the post down");

// 5k. Events (piece 15): Mehmet opens one (a retry opens once), Ayşe joins and reports it; Leyla
//     takes it down and pauses Mehmet, who can then read but not write; Leyla lets him back in
//     and opens a café event of her own.
const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();
const eventKey = key();
const mehmetEvent = { createKey: eventKey, title: "Cumartesi tavla", body: "Tavlamı getiriyorum.", startsAt: inTwoDays, capacity: 4 };
const opened = (await call("POST", "/cafes/moda/events", { token: mehmet, body: mehmetEvent })).json;
await call("POST", "/cafes/moda/events", { token: mehmet, body: mehmetEvent });
assert.equal((await call("GET", "/cafes/moda")).json.posts.filter((p) => p.title === mehmetEvent.title).length, 1, "a retried event opens once");
await call("POST", `/cafes/moda/posts/${opened.postId}/rsvp`, { token: ayse });
const asSeen = (await call("GET", "/cafes/moda", { token: ayse })).json.posts.find((p) => p.id === opened.postId);
assert.deepEqual([asSeen.host.mine, asSeen.rsvpCount, asSeen.rsvpedByMe], [false, 2, true]);
assert.equal((await call("POST", "/cafes/moda/reports", { token: mehmet, body: { targetType: "post", targetId: opened.postId, reason: "spam" } })).json.error.code, "REPORT_OWN");
await call("POST", "/cafes/moda/reports", { token: ayse, body: { targetType: "post", targetId: opened.postId, reason: "spam", note: "Satış yapıyor" } });
const queue = (await call("GET", "/staff/moda/feed", { headers: STAFF })).json.reports;
assert.ok(queue.some((r) => r.targetId === opened.postId && r.notes[0] === "Satış yapıyor"));
const handled = (await call("POST", "/staff/moda/feed/reports", { headers: STAFF, body: { targetType: "post", targetId: opened.postId, action: "remove", pauseAuthor: true } })).json;
assert.ok(!handled.reports.some((r) => r.targetId === opened.postId) && handled.paused.some((m) => m.customerId === "cus_mehmet"));
assert.equal((await call("GET", "/cafes/moda", { token: mehmet })).json.membership.paused, true);
assert.equal((await call("POST", `/cafes/moda/posts/post_1/comments`, { token: mehmet, body: { body: "Merhaba" } })).json.error.code, "MEMBER_PAUSED");
await call("POST", "/staff/moda/feed/members/cus_mehmet", { headers: STAFF, body: { paused: false } });
assert.equal((await call("GET", "/cafes/moda", { token: mehmet })).json.membership.paused, false);
const cafeEvent = { createKey: key(), kind: "event", title: "Latte art atölyesi", body: "", eventStartsAt: inTwoDays, eventCapacity: 8 };
assert.ok((await call("POST", "/staff/moda/feed", { headers: STAFF, body: cafeEvent })).json.posts.some((p) => p.title === cafeEvent.title && p.kind === "event"));
step("Mehmet opens an event (a retry opens once), Ayşe joins and reports it; Leyla takes it down and pauses him, then lets him back; Leyla opens a café event");

// 5l. Stock and recipes (piece 17): Leyla adds oat milk (a retry adds it once) and puts it in a
//     new latte's recipe; Ece sells one by card and the milk goes down; Leyla counts it and
//     records a spill; Bugün lists what's low; Ece can't see Stok.
const oat = { key: key(), name: `Yulaf sütü ${key()}`, kind: "ingredient", unit: "l", startMilli: 3_000, minMilli: 1_000, costKurus: 9_500 };
await call("POST", "/staff/moda/stock/items", { headers: STAFF, body: oat });
const stock = (await call("POST", "/staff/moda/stock/items", { headers: STAFF, body: oat })).json;
const oatItem = stock.items.filter((i) => i.name === oat.name);
assert.equal(oatItem.length, 1, "a retried add adds once");
const oatName = `Yulaflı latte ${key()}`;
const oatLatte = (await call("POST", "/staff/moda/menu/products", { headers: STAFF, body: { name: oatName, categoryId: tiles.categories[0].id, priceKurus: 13_500 } })).json.products.find((p) => p.name === oatName);
const recipes = (await call("POST", `/staff/moda/menu/products/${oatLatte.productId}/recipe`, {
  headers: STAFF,
  body: { mode: "recipe", lines: [{ itemId: "stk_espresso", qtyMilli: 18 }, { itemId: oatItem[0].id, qtyMilli: 200 }] },
})).json;
assert.equal(recipes.recipes.find((r) => r.productId === oatLatte.productId).costKurus, 1_620 + 1_900, "18 g of beans at ₺900/kg and 200 ml at ₺95/L");
// The till from 5d was revoked; Ece signs in on a new one.
const till3 = (await call("POST", "/staff/moda/devices", { headers: STAFF, body: { name: "Bar" } })).json;
const ecePos3 = { "x-peni-staff-token": (await call("POST", "/till/pin", { headers: { "x-peni-till-token": till3.token }, body: { memberId: eceId, pin: "2580" } })).json.token };
const oatSale = (await call("POST", "/staff/moda/orders", { headers: ecePos3, body: { createKey: key(), lines: [{ productId: oatLatte.productId, quantity: 1 }] } })).json;
const oatCard = (await call("POST", `/staff/moda/orders/${oatSale.id}/pay`, { headers: ecePos3, body: { method: "card", payKey: key() } })).json;
await call("POST", `/staff/moda/orders/${oatSale.id}/payments/${oatCard.payment.id}/confirm`, { headers: ecePos3, body: {} });
const oatHistory = (await call("GET", `/staff/moda/stock/items/${oatItem[0].id}`, { headers: STAFF })).json;
assert.deepEqual([oatHistory.item.qtyMilli, oatHistory.moves[0].reason, oatHistory.moves[0].changeMilli], [2_800, "sale", -200]);
const countKey = key();
await call("POST", "/staff/moda/stock/count", { headers: STAFF, body: { key: countKey, counts: [{ itemId: oatItem[0].id, countedMilli: 2_500 }] } });
await call("POST", "/staff/moda/stock/count", { headers: STAFF, body: { key: countKey, counts: [{ itemId: oatItem[0].id, countedMilli: 9_000 }] } });
const afterWaste = (await call("POST", "/staff/moda/stock/waste", { headers: STAFF, body: { key: key(), itemId: oatItem[0].id, qtyMilli: 1_600, why: "spilled" } })).json;
assert.deepEqual(
  [afterWaste.items.find((i) => i.id === oatItem[0].id).qtyMilli, afterWaste.items.find((i) => i.id === oatItem[0].id).level],
  [900, "low"],
  "counted 2.5 L once, then 1.6 L spilled",
);
assert.ok((await call("GET", "/staff/moda", { headers: STAFF })).json.lowStock.some((i) => i.id === oatItem[0].id));
assert.equal((await call("GET", "/staff/moda/stock", { headers: ecePos3 })).json.error.code, "FORBIDDEN");
step("Leyla adds oat milk (once despite a retry) and a latte that uses it; Ece sells one and 200 ml go; Leyla counts 2.5 L (once) and records a 1.6 L spill; Bugün shows it low; Ece can't see Stok");

// 5m. Suppliers and bills (piece 18): Leyla adds a supplier (a retry adds one); Ece, at the
//     till, enters its bill for 6 L of oat milk (once despite a retry), which adds the stock
//     and prices it; Leyla corrects it to 5 L, pays it in cash, and the supplier page shows
//     the price; Ece can't pay a bill.
const supplierKey = key();
const supplierName = `Manav ${key()}`;
await call("POST", "/staff/moda/suppliers", { headers: STAFF, body: { key: supplierKey, name: supplierName, phone: "0532 111 22 33" } });
const manav = (await call("POST", "/staff/moda/suppliers", { headers: STAFF, body: { key: supplierKey, name: supplierName } })).json;
assert.equal((await call("GET", "/staff/moda/suppliers", { headers: STAFF })).json.suppliers.filter((s) => s.name === supplierName).length, 1, "a retried add adds one");
const today = (await call("GET", "/staff/moda/bills", { headers: STAFF })).json.today;
const billInput = { key: key(), supplierId: manav.supplier.id, date: today, lines: [{ itemId: oatItem[0].id, qtyMilli: 6_000, totalKurus: 54_000 }] };
await call("POST", "/staff/moda/bills", { headers: ecePos3, body: billInput });
const oatBill = (await call("POST", "/staff/moda/bills", { headers: ecePos3, body: billInput })).json;
assert.deepEqual([oatBill.state, oatBill.totalKurus, oatBill.lines[0].unitKurus], ["unpaid", 54_000, 9_000]);
let oatNow = (await call("GET", `/staff/moda/stock/items/${oatItem[0].id}`, { headers: STAFF })).json;
assert.deepEqual([oatNow.item.qtyMilli, oatNow.item.costKurus, oatNow.moves[0].reason], [6_900, 9_000, "bill"], "the bill added 6 L once and set ₺90/L");
const corrected = (await call("POST", `/staff/moda/bills/${oatBill.id}`, {
  headers: STAFF,
  body: { version: oatBill.version, supplierId: manav.supplier.id, date: today, lines: [{ itemId: oatItem[0].id, qtyMilli: 5_000, totalKurus: 45_000 }] },
})).json;
assert.equal(corrected.version, 2);
oatNow = (await call("GET", `/staff/moda/stock/items/${oatItem[0].id}`, { headers: STAFF })).json;
assert.deepEqual([oatNow.item.qtyMilli, oatNow.moves[0].changeMilli], [5_900, -1_000], "the correction moved the difference");
assert.equal((await call("POST", `/staff/moda/bills/${oatBill.id}/pay`, { headers: ecePos3, body: { key: key(), method: "cash" } })).json.error.code, "FORBIDDEN");
const owedBefore = (await call("GET", "/staff/moda", { headers: STAFF })).json.billsOwed;
const paidBill = (await call("POST", `/staff/moda/bills/${oatBill.id}/pay`, { headers: STAFF, body: { key: key(), method: "cash" } })).json;
assert.deepEqual([paidBill.state, paidBill.payments.length], ["paid", 1]);
const owedAfter = (await call("GET", "/staff/moda", { headers: STAFF })).json.billsOwed;
assert.deepEqual([owedBefore.count - owedAfter.count, owedBefore.totalKurus - owedAfter.totalKurus], [1, 45_000]);
const manavPage = (await call("GET", `/staff/moda/suppliers/${manav.supplier.id}`, { headers: STAFF })).json;
assert.deepEqual([manavPage.owedKurus, manavPage.prices[0].points[0].unitKurus], [0, 9_000]);
step("Leyla adds a supplier (once despite a retry); Ece enters its bill for 6 L of oat milk at the till (once), which adds stock and sets ₺90/L; Leyla corrects it to 5 L and pays it in cash; Ece can't pay bills");

// 5n. Borçlar (piece 19): Leyla pays a ₺1.000 repair bill in parts: ₺600 with a check (once
//     despite a retry) and ₺400 out of Murat's pocket. Faturalar calls it paid; Borçlar owes
//     the check and Murat instead. Once the check is cashed its payment can't be undone; Murat
//     gets ₺400 back; the card takes a payment. Ece can't see Borçlar.
const debts0 = (await call("GET", "/staff/moda/debts", { headers: STAFF })).json;
const muratMember = debts0.team.find((m) => m.name === "Murat Aksu");
const repair = (await call("POST", "/staff/moda/bills", {
  headers: STAFF,
  body: { key: key(), supplierId: null, date: today, lines: [{ itemId: null, name: "Kahve makinesi bakımı", category: "services", totalKurus: 100_000 }] },
})).json;
const checkPay = { key: key(), method: "check", amountKurus: 60_000, check: { number: `S${key().slice(-6)}`, bankName: "Ziraat Bankası", dueDate: today } };
await call("POST", `/staff/moda/bills/${repair.id}/pay`, { headers: STAFF, body: checkPay });
const halfPaid = (await call("POST", `/staff/moda/bills/${repair.id}/pay`, { headers: STAFF, body: checkPay })).json;
assert.deepEqual([halfPaid.state, halfPaid.paidKurus, halfPaid.payWith.leftKurus], ["unpaid", 60_000, 40_000], "a retried check pays once");
const repaired = (await call("POST", `/staff/moda/bills/${repair.id}/pay`, { headers: STAFF, body: { key: key(), method: "loan", lender: { memberId: muratMember.memberId } } })).json;
assert.deepEqual([repaired.state, repaired.payments.map((p) => p.method)], ["paid", ["check", "loan"]]);
let debts1 = (await call("GET", "/staff/moda/debts", { headers: STAFF })).json;
const repairCheck = debts1.checks.find((c) => c.number === checkPay.check.number);
const muratOwed = (d) => d.lenders.find((l) => l.memberId === muratMember.memberId).owedKurus;
assert.deepEqual([repairCheck.state, repairCheck.billId, muratOwed(debts1) - muratOwed(debts0)], ["due", repair.id, 40_000]);
assert.equal(debts1.totals.totalKurus - debts0.totals.totalKurus, 100_000, "the bill's ₺1.000 is owed in Borçlar instead");
await call("POST", `/staff/moda/debts/checks/${repairCheck.id}`, { headers: STAFF, body: { cashed: true } });
const cashedUndo = await call("POST", `/staff/moda/bills/${repair.id}/payments/${repaired.payments[0].id}/remove`, { headers: STAFF, body: {} });
assert.deepEqual([cashedUndo.status, cashedUndo.json.error.code], [409, "CHECK_CASHED"]);
const muratKey = debts1.lenders.find((l) => l.memberId === muratMember.memberId).key;
debts1 = (await call("POST", "/staff/moda/debts/repayments", { headers: STAFF, body: { key: key(), lender: muratKey, amountKurus: 40_000, method: "cash" } })).json;
assert.equal(muratOwed(debts1), muratOwed(debts0));
const cardBefore = debts1.card.balanceKurus;
debts1 = (await call("POST", "/staff/moda/debts/card/payments", { headers: STAFF, body: { key: key(), amountKurus: 10_000, method: "bank" } })).json;
assert.equal(cardBefore - debts1.card.balanceKurus, 10_000);
assert.equal((await call("GET", "/staff/moda/debts", { headers: ecePos3 })).json.error.code, "FORBIDDEN");
assert.deepEqual((await call("GET", "/staff/moda", { headers: STAFF })).json.debts, debts1.totals);
step("Leyla pays a ₺1.000 repair with a check (once) and Murat's money; Borçlar owes them instead; a cashed check's payment stays; Murat is paid back; the card takes ₺100; Ece can't see Borçlar");

// 5o. Nakit ve banka (piece 20): with the drawer closed, the oat milk bill and Murat's ₺400
//     came out of the reserve, and the cashed check out of the bank. Leyla moves ₺1.000 from
//     the reserve to the bank (once despite a retry) and takes it back; the bank is corrected
//     to its statement. She closes last month, after which a bill dated in it is refused, and
//     reopens it with a reason. Ece can't see the money.
let money = (await call("GET", "/staff/moda/money", { headers: STAFF })).json;
assert.ok(money.started && !money.drawer.open, "the demo café keeps its money in Peni; the drawer was closed in 5f");
const lineFor = (kind, label) => money.lines.find((l) => l.kind === kind && l.label === label);
assert.deepEqual([lineFor("bill", supplierName)?.account, lineFor("bill", supplierName)?.amountKurus], ["reserve", -45_000], "the oat milk bill came out of the reserve");
assert.deepEqual([lineFor("repayment", "Murat Aksu")?.account, lineFor("check", checkPay.check.number)?.account], ["reserve", "bank"]);
const transferIn = { key: key(), kind: "transfer", account: "reserve", to: "bank", amountKurus: 100_000, note: "Smoke" };
await call("POST", "/staff/moda/money/moves", { headers: STAFF, body: transferIn });
const moved = (await call("POST", "/staff/moda/money/moves", { headers: STAFF, body: transferIn })).json;
assert.deepEqual([money.reserveKurus - moved.reserveKurus, moved.bankKurus - money.bankKurus], [100_000, 100_000], "a retried transfer moves once");
money = (await call("POST", `/staff/moda/money/moves/${moved.lines.find((l) => l.kind === "transfer" && l.note === "Smoke").undoId}/remove`, { headers: STAFF, body: {} })).json;
assert.equal(money.bankKurus, moved.bankKurus - 100_000);
const statement = money.bankKurus - 1_250;
money = (await call("POST", "/staff/moda/money/moves", { headers: STAFF, body: { key: key(), kind: "correction", account: "bank", amountKurus: statement, note: "Ekstre" } })).json;
assert.deepEqual([money.bankKurus, money.lines[0].kind, money.lines[0].amountKurus], [statement, "correction", -1_250]);
assert.equal((await call("GET", "/staff/moda/money", { headers: ecePos3 })).json.error.code, "FORBIDDEN");
let months = (await call("GET", "/staff/moda/money/months", { headers: STAFF })).json;
const lastMonth = months.next.month;
months = (await call("POST", "/staff/moda/money/months", { headers: STAFF, body: { month: lastMonth, note: "Smoke" } })).json;
assert.equal(months.closedThrough, `${lastMonth}-${months.closes[0].summary.to.slice(8)}`);
const lateBill = await call("POST", "/staff/moda/bills", {
  headers: STAFF,
  body: { key: key(), supplierId: null, date: `${lastMonth}-15`, lines: [{ itemId: null, name: "Unutulan fiş", category: "other", totalKurus: 5_000 }] },
});
assert.deepEqual([lateBill.status, lateBill.json.error.code], [409, "PERIOD_CLOSED"]);
months = (await call("POST", `/staff/moda/money/months/${months.closes[0].id}/reopen`, { headers: STAFF, body: { reason: "Smoke" } })).json;
assert.deepEqual([months.closedThrough, months.next.month, months.closes[0].reopenReason], [null, lastMonth, "Smoke"]);
step("Cash bills and repayments came out of the reserve and the cashed check out of the bank; Leyla moves ₺1.000 (once) and back, corrects the bank, closes last month (a bill in it is refused) and reopens it; Ece can't see the money");

// 5p. Vardiyalar and Puantaj ve maaş (piece 21): Leyla copies next week into the week after
//     and publishes it; Ece, at the till, sees her own shifts there, and a shift on top of one
//     of hers is refused. Leyla enters the missing days as planned, pays the ₺5.000 left of
//     Hakan's last month by bank (once despite a retry), closes that pay month (its hours are
//     then kept), reopens it and exports it for Excel. Ece sees only her own pay.
let week = (await call("GET", "/staff/moda/shifts", { headers: STAFF })).json;
assert.ok(week.published && week.shifts.length > 0, "this week is planned and published");
const nextWeek = addDays(week.weekStart, 7);
const later = addDays(week.weekStart, 14);
assert.deepEqual((await call("GET", `/staff/moda/shifts?week=${nextWeek}`, { headers: ecePos3 })).json.visible, false, "next week is a draft Ece doesn't see");
week = (await call("POST", "/staff/moda/shifts/copy", { headers: STAFF, body: { week: later } })).json;
assert.equal(week.shifts.length, 15);
week = (await call("POST", "/staff/moda/shifts/publish", { headers: STAFF, body: { week: later, published: true } })).json;
const eceWeek = (await call("GET", `/staff/moda/shifts?week=${later}`, { headers: ecePos3 })).json;
const eceShift = eceWeek.shifts.find((s) => s.mine);
assert.ok(eceWeek.visible && eceShift, "Ece sees her shifts once the week is published");
const extraShift = { key: key(), day: eceShift.day, start: eceShift.start, end: eceShift.end, memberIds: [eceWeek.me] };
const clash = await call("POST", "/staff/moda/shifts", { headers: STAFF, body: extraShift });
assert.deepEqual([clash.status, clash.json.error.code], [409, "SHIFT_OVERLAP"]);
assert.equal((await call("POST", "/staff/moda/shifts", { headers: ecePos3, body: { ...extraShift, start: 0, end: 60 } })).json.error.code, "FORBIDDEN");

let pay = (await call("GET", "/staff/moda/pay", { headers: STAFF })).json;
const missing = pay.people.flatMap((p) => pay.days.flatMap((day, i) => (day < pay.today && p.planned[i] > 0 && p.worked[i] === null ? [{ memberId: p.memberId, day, minutes: p.planned[i] }] : [])));
assert.ok(missing.length > 0 && pay.totals.missingDays === missing.length, "the last days' hours are still to be entered");
pay = (await call("POST", `/staff/moda/pay/hours?month=${pay.month}`, { headers: STAFF, body: { days: missing } })).json;
assert.equal(pay.totals.missingDays, 0);
const payMonth = pay.months[1];
let past = (await call("GET", `/staff/moda/pay?month=${payMonth}`, { headers: STAFF })).json;
const hakanPay = past.people.find((p) => p.name === "Hakan Usta");
assert.equal(hakanPay.leftKurus, 500_000, "₺5.000 of Hakan's last month is still owed");
const bankBefore = (await call("GET", "/staff/moda/money", { headers: STAFF })).json.bankKurus;
const payHakan = { key: key(), memberId: hakanPay.memberId, month: payMonth, amountKurus: 500_000, method: "bank" };
await call("POST", "/staff/moda/pay/payouts", { headers: STAFF, body: payHakan });
past = (await call("POST", "/staff/moda/pay/payouts", { headers: STAFF, body: payHakan })).json;
assert.equal(past.people.find((p) => p.name === "Hakan Usta").leftKurus, 0);
assert.equal((await call("GET", "/staff/moda/money", { headers: STAFF })).json.bankKurus, bankBefore - 500_000, "a retried payout pays once, from the bank");
past = (await call("POST", "/staff/moda/pay/closes", { headers: STAFF, body: { month: payMonth, note: "Smoke" } })).json;
assert.equal(past.close.summary.earnedKurus, past.totals.earnedKurus);
const lockedDay = await call("POST", `/staff/moda/pay/hours?month=${payMonth}`, { headers: STAFF, body: { days: [{ memberId: hakanPay.memberId, day: `${payMonth}-15`, minutes: 60 }] } });
assert.deepEqual([lockedDay.status, lockedDay.json.error.code], [409, "PAY_CLOSED"]);
past = (await call("POST", `/staff/moda/pay/closes/${past.close.id}/reopen`, { headers: STAFF, body: { reason: "Smoke" } })).json;
assert.deepEqual([past.close, past.history[0].reopenReason], [null, "Smoke"]);
const csv = await fetch(`${BASE}/api/v1/staff/moda/pay/export?month=${payMonth}`, { headers: STAFF });
const csvBytes = new Uint8Array(await csv.arrayBuffer());
// The byte order mark tells Excel it's UTF-8, so the Turkish letters come through.
assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
assert.ok(csv.headers.get("content-type").startsWith("text/csv") && new TextDecoder().decode(csvBytes).startsWith("Tarih;Çalışan;"), "the export opens in Excel");
const ecePay = (await call("GET", "/staff/moda/pay", { headers: ecePos3 })).json;
assert.deepEqual([ecePay.own, ecePay.people.map((p) => p.name)], [true, ["Ece Tan"]]);
assert.equal((await call("POST", `/staff/moda/pay/hours?month=${ecePay.month}`, { headers: ecePos3, body: { days: missing.slice(0, 1) } })).json.error.code, "FORBIDDEN");
step("Leyla copies and publishes a week Ece then sees (a clash is refused); the missing days go in as planned; Hakan's last ₺5.000 goes out once by bank; the pay month closes (its hours kept), reopens and exports; Ece sees only her own pay");

// 5q. Bugün and Görevler (piece 22): Leyla's Bugün shows what needs doing (the hours Leyla
//     just filled in no longer among it) and today's lists. Ece, at the till, ticks a task
//     (once despite a retry) but not yesterday's. Leyla makes a list (once despite a retry),
//     changes and removes it, and turns her morning email off and on. The morning email's
//     cron route refuses a call without its secret.
let bugun = (await call("GET", "/staff/moda/today", { headers: STAFF })).json;
const alertTypes = bugun.alerts.map((a) => a.type);
assert.ok(alertTypes.includes("tasksLate") && !alertTypes.includes("hoursMissing"), `Bugün's alerts: ${alertTypes}`);
assert.ok(bugun.tasks.total > 0 && bugun.email.eligible && bugun.email.on);
let tasks = (await call("GET", "/staff/moda/tasks", { headers: ecePos3 })).json;
assert.deepEqual([tasks.canCheck, tasks.canEdit, tasks.week], [true, false, []]);
const openTask = tasks.lists.flatMap((l) => l.items).find((i) => i.status === "open");
const tick = { itemId: openTask.id, day: tasks.day, status: "done" };
await call("POST", "/staff/moda/tasks/check", { headers: ecePos3, body: tick });
tasks = (await call("POST", "/staff/moda/tasks/check", { headers: ecePos3, body: tick })).json;
assert.deepEqual(
  tasks.lists.flatMap((l) => l.items).filter((i) => i.id === openTask.id).map((i) => [i.status, i.by]),
  [["done", "Ece Tan"]],
);
const yesterday = await call("POST", "/staff/moda/tasks/check", { headers: ecePos3, body: { ...tick, day: addDays(tasks.day, -1) } });
assert.deepEqual([yesterday.status, yesterday.json.error.code], [403, "TASK_DAY"]);
const terrace = { key: key(), name: "Teras", assign: "all", items: [{ id: "new:smoke1", title: "Masaları sil", days: [1, 2, 3, 4, 5, 6, 7] }] };
const list = (await call("POST", "/staff/moda/tasks/lists", { headers: STAFF, body: terrace })).json;
await call("POST", "/staff/moda/tasks/lists", { headers: STAFF, body: terrace });
assert.equal((await call("GET", "/staff/moda/tasks/lists", { headers: STAFF })).json.lists.filter((l) => l.name === "Teras").length, 1);
const changed = (await call("POST", `/staff/moda/tasks/lists/${list.id}`, { headers: STAFF, body: { name: "Teras", assign: "barista", items: [...list.items, { id: "new:smoke2", title: "Saksıları sula", days: [2, 5] }] } })).json;
assert.deepEqual([changed.assign, changed.items.map((i) => i.title)], ["barista", ["Masaları sil", "Saksıları sula"]]);
assert.equal((await call("POST", "/staff/moda/tasks/lists", { headers: ecePos3, body: { ...terrace, key: key() } })).json.error.code, "FORBIDDEN");
const lists = (await call("POST", `/staff/moda/tasks/lists/${list.id}/remove`, { headers: STAFF })).json;
assert.ok(!lists.lists.some((l) => l.name === "Teras"));
bugun = (await call("POST", "/staff/moda/today/email", { headers: STAFF, body: { on: false } })).json;
assert.equal(bugun.email.on, false);
bugun = (await call("POST", "/staff/moda/today/email", { headers: STAFF, body: { on: true } })).json;
assert.equal(bugun.email.on, true);
assert.equal((await call("GET", "/cron/daily")).status, 401);
assert.equal((await call("GET", "/cron/daily", { headers: { authorization: "Bearer wrong" } })).status, 401);
step("Bugün lists what needs doing and today's tasks; Ece ticks a task at the till (once), not yesterday's; Leyla makes, changes and removes a list (once) and turns her morning email off and on; the cron route needs its secret");

// 5r. Raporlar (piece 23): this month so far adds up, with weeks of history behind it and
//     today's till sales from this run in it; Bugün's sales strip says the same as the
//     report for today. Ece's till can't open reports, and days to come can't be reported.
const report = (await call("GET", "/staff/moda/reports", { headers: STAFF })).json;
assert.equal(report.totals.profitKurus, report.totals.salesKurus - report.totals.expensesKurus);
assert.ok(report.totals.salesKurus > 0 && report.products.length > 0 && report.months.length >= 2, "this month's report has numbers");
assert.equal(report.paidWith.cashKurus + report.paidWith.cardKurus, report.totals.salesKurus);
const todayReport = (await call("GET", `/staff/moda/reports?from=${report.today}&through=${report.today}`, { headers: STAFF })).json;
assert.equal(todayReport.series.step, "hour");
assert.ok(todayReport.totals.orders > 0, "this run's sales are in today's report");
bugun = (await call("GET", "/staff/moda/today", { headers: STAFF })).json;
assert.equal(bugun.sales.salesKurus, todayReport.totals.salesKurus);
assert.equal((await call("GET", "/staff/moda/reports", { headers: ecePos3 })).json.error.code, "FORBIDDEN");
const future = await call("GET", `/staff/moda/reports?from=${report.today}&through=${addDays(report.today, 1)}`, { headers: STAFF });
assert.deepEqual([future.status, future.json.error.code], [400, "REPORT_RANGE"]);
step("Raporlar adds up for this month, has today's sales from this run (the same as on Bugün), and isn't for the till or for days to come");

// 5s. Taslaklar (piece 24): Murat uploads a receipt; the demo's stand-in reads it in the
//     background into a draft (next to the one the demo starts with). Leyla sees it beside
//     its document, fixes the number and confirms: the bill is added in her name, once.
//     Ece's till can't see drafts; a web page isn't a document.
const MURAT = await staffSignIn("murat@moda.test");
const uploadDoc = async (bytes, type, headers) =>
  fetch(`${BASE}/api/v1/staff/moda/documents?name=fis.pdf`, { method: "POST", headers: { "content-type": type, ...headers }, body: bytes }).then(async (r) => ({ status: r.status, json: await r.json() }));
const receipt = new TextEncoder().encode("%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n");
const uploaded = await uploadDoc(receipt, "application/pdf", MURAT);
assert.equal(uploaded.status, 200);
assert.equal(uploaded.json.documentName, "fis.pdf");
let drafts = null;
for (let i = 0; i < 20; i++) {
  drafts = (await call("GET", "/staff/moda/drafts", { headers: STAFF })).json;
  if (!drafts.reading.some((r) => r.jobId === uploaded.json.jobId && r.state === "reading")) break;
  await new Promise((r) => setTimeout(r, 250));
}
assert.equal(drafts.ai, "demo");
assert.ok(drafts.open.length >= 2, "the demo's draft and this one wait");
const fresh = drafts.open.find((d) => d.document?.name === "fis.pdf");
assert.ok(fresh, "the upload became a draft");
assert.equal(fresh.proposal.supplierId, "sup_seed_ambalaj");
const docRes = await fetch(`${BASE}${fresh.document.url}`, { headers: STAFF });
assert.deepEqual([docRes.status, docRes.headers.get("content-type"), (await docRes.arrayBuffer()).byteLength], [200, "application/pdf", receipt.length]);
const confirmBody = {
  supplierId: fresh.proposal.supplierId,
  number: "A-20512",
  date: fresh.proposal.date,
  lines: fresh.proposal.lines.map((l) => ({ itemId: null, name: l.name, category: l.category, totalKurus: l.totalKurus })),
};
const confirmed = (await call("POST", `/staff/moda/drafts/${fresh.id}/confirm`, { headers: STAFF, body: confirmBody })).json;
assert.deepEqual([confirmed.status, confirmed.decidedBy, confirmed.changed], ["confirmed", "Leyla Kara", ["number"]]);
assert.equal((await call("POST", `/staff/moda/drafts/${fresh.id}/confirm`, { headers: STAFF, body: confirmBody })).json.resultId, confirmed.resultId);
const draftBill = (await call("GET", `/staff/moda/bills/${confirmed.resultId}`, { headers: STAFF })).json;
assert.deepEqual([draftBill.number, draftBill.totalKurus, draftBill.createdBy], ["A-20512", 181_000, "Leyla Kara"]);
const aiLog = (await call("GET", "/staff/moda/drafts/log", { headers: STAFF })).json;
assert.equal(aiLog.events[0].kind, "draft.confirmed");
assert.equal((await call("GET", "/staff/moda/drafts", { headers: ecePos3 })).json.error.code, "FORBIDDEN");
const notDoc = await uploadDoc(new TextEncoder().encode("<html></html>"), "text/html", MURAT);
assert.deepEqual([notDoc.status, notDoc.json.error.code], [415, "DOCUMENT_TYPE"]);
step("Taslaklar: an uploaded receipt is read in the background into a draft, checked beside its document and confirmed once in Leyla's name; not for the till, and only photos and PDFs");

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
