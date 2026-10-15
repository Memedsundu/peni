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
  return json.token;
}

const step = (name) => console.log(`✓ ${name}`);

// 1. Deniz is new and has no peni. Today she takes a tea from the askı.
const deniz = await signIn("+905320000003");
let cafe = (await call("GET", "/cafes/moda", { token: deniz })).json;
assert.equal(cafe.membership.balancePeni, 0);
const askiBefore = cafe.askida.balancePeni;
assert.ok(cafe.askida.itemsAvailable > 0);
step(`Deniz signs in by phone; the askı holds ${askiBefore} peni`);

let order = (
  await call("POST", "/orders", {
    token: deniz,
    body: { cafeSlug: "moda", lines: [{ productId: "cay", quantity: 1 }, { productId: "simit", quantity: 1 }], askidaProductId: "cay", idempotencyKey: key() },
  })
).json;
assert.equal(order.askidaKurus, 3000);
assert.equal(order.dueKurus, 2500, "Deniz pays only for the simit");
step(`Deniz orders tea from the askı + a simit; pays ${order.dueKurus / 100} TL at the till`);

const second = await call("POST", "/orders", {
  token: deniz,
  body: { cafeSlug: "moda", lines: [{ productId: "cay", quantity: 1 }], askidaProductId: "cay", idempotencyKey: key() },
});
assert.equal(second.json.error.code, "ASKIDA_LIMIT");
step("A second askı tea the same day is refused (ASKIDA_LIMIT)");

// 2. The barista works the order through.
const forbidden = await call("GET", "/staff/moda");
assert.equal(forbidden.status, 403);
for (const action of ["accept", "ready", "collect"]) {
  order = (await call("POST", `/staff/moda/orders/${order.id}`, { headers: STAFF, body: { action } })).json;
}
assert.equal(order.status, "collected");
cafe = (await call("GET", "/cafes/moda", { token: deniz })).json;
assert.equal(cafe.membership.balancePeni, 1, "5 % of the 25 TL she paid");
assert.equal(cafe.askida.wall[0].type, "claim");
assert.ok(!JSON.stringify(cafe.askida.wall).includes("Deniz"), "takers are never named");
step("Barista accepts → ready → paid; Deniz earns 1 peni; the wall says someone took a tea, not who");

// 3. Ayşe treats Mehmet, then leaves coffee on the askı.
const ayse = await signIn("+905320000001");
const mehmet = await signIn("+905320000002");
const gift = (await call("POST", "/gifts", { token: ayse, body: { cafeSlug: "moda", toPhone: "+905320000002", peni: 30, message: "Afiyet olsun", idempotencyKey: key() } })).json;
assert.equal(gift.status, "pending");
const accepted = (await call("POST", `/gifts/${gift.id}/accept`, { token: mehmet })).json;
assert.equal(accepted.status, "accepted");
step("Ayşe sends Mehmet 30 peni; Mehmet accepts");

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
step("Mehmet spends 40 peni on a latte; the barista rejects it; the 40 peni come back");

// 5. Pausing app orders.
await call("POST", "/staff/moda/pause", { headers: STAFF, body: { paused: true } });
const paused = await call("POST", "/orders", { token: mehmet, body: { cafeSlug: "moda", lines: [{ productId: "cay", quantity: 1 }], idempotencyKey: key() } });
assert.equal(paused.json.error.code, "ORDERING_CLOSED");
await call("POST", "/staff/moda/pause", { headers: STAFF, body: { paused: false } });
step("Paused café refuses app orders");

// 6. The café report adds up.
const dash = (await call("GET", "/staff/moda", { headers: STAFF })).json;
const wallets = (await Promise.all([ayse, mehmet, deniz].map((t) => call("GET", "/me/wallet", { token: t })))).map(
  (r) => r.json.cafes.find((c) => c.cafeSlug === "moda").balancePeni,
);
assert.equal(dash.report.outstandingPeni, wallets.reduce((a, b) => a + b, 0) + dash.askida.balancePeni);
step(`Report: ${dash.report.outstandingPeni} peni outstanding = wallets ${wallets.join(" + ")} + askı ${dash.askida.balancePeni}`);

console.log("\nAll smoke checks passed.");
