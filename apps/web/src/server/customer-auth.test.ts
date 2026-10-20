import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PeniApp } from "./app";
import { CODES_PER_HOUR, CODE_TRIES, JoseIdTokenVerifier, OutboxEmailSender } from "./customer-auth";

const GOOGLE_WEB = "web.apps.googleusercontent.com";
const APPLE_APP = "app.peni.ios";
const MIN = 60_000;

let keys: { google: CryptoKey; apple: CryptoKey; stranger: CryptoKey };
let jwks: { google: JWK; apple: JWK };
let app: PeniApp;
let outbox: OutboxEmailSender;
let now: Date;
const tick = (ms: number) => {
  now = new Date(now.getTime() + ms);
};
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);

beforeAll(async () => {
  const g = await generateKeyPair("RS256");
  const a = await generateKeyPair("ES256");
  const s = await generateKeyPair("RS256");
  keys = { google: g.privateKey, apple: a.privateKey, stranger: s.privateKey };
  jwks = { google: { ...(await exportJWK(g.publicKey)), kid: "g1", alg: "RS256" }, apple: { ...(await exportJWK(a.publicKey)), kid: "a1", alg: "ES256" } };
});

beforeEach(() => {
  now = new Date("2026-10-16T09:00:00Z");
  outbox = new OutboxEmailSender();
  const verifier = new JoseIdTokenVerifier({
    google: { audiences: [GOOGLE_WEB, "ios.apps.googleusercontent.com"], keys: createLocalJWKSet({ keys: [jwks.google] }) },
    apple: { audiences: [APPLE_APP], keys: createLocalJWKSet({ keys: [jwks.apple] }) },
  });
  app = new PeniApp({ demo: false, bcryptRounds: 4, clock: () => now, auth: { verifier, email: outbox } });
});

/** An ID token as Google or Apple would sign it. Tokens are checked against the real clock, as jose does. */
function idToken(
  provider: "google" | "apple",
  claims: Record<string, unknown>,
  opts: { key?: CryptoKey; aud?: string; iss?: string; expiresIn?: string } = {},
) {
  const alg = provider === "google" && !opts.key ? "RS256" : opts.key === keys.stranger ? "RS256" : provider === "apple" ? "ES256" : "RS256";
  return new SignJWT(claims)
    .setProtectedHeader({ alg, kid: provider === "google" ? "g1" : "a1" })
    .setIssuer(opts.iss ?? (provider === "google" ? "https://accounts.google.com" : "https://appleid.apple.com"))
    .setAudience(opts.aud ?? (provider === "google" ? GOOGLE_WEB : APPLE_APP))
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h")
    .sign(opts.key ?? keys[provider]);
}

describe("email codes", () => {
  it("signs a new person in with the code from the email and asks their name", async () => {
    await app.auth.startEmail("  Ayse@Example.com ");
    const sent = outbox.sent.at(-1)!;
    expect(sent.to).toBe("ayse@example.com");
    expect(sent.subject).toMatch(/^Penny giriş kodun: \d{6}$/);
    const c = outbox.lastCodeFor("ayse@example.com")!;
    expect(await code(app.signInWithEmailCode("ayse@example.com", c === "000000" ? "000001" : "000000"))).toBe("CODE_WRONG");
    const session = await app.signInWithEmailCode("AYSE@example.com", c);
    expect(session.isNew).toBe(true);
    expect(session.customer).toMatchObject({ email: "ayse@example.com", phone: null, displayName: "" });
    expect((await app.customerForToken(session.token))!.id).toBe(session.customer.id);
    expect(await code(app.signInWithEmailCode("ayse@example.com", c))).toBe("CODE_EXPIRED");

    await app.updateProfile((await app.customerForToken(session.token))!, { displayName: "Ayşe Yılmaz" });
    await app.auth.startEmail("ayse@example.com");
    const again = await app.signInWithEmailCode("ayse@example.com", outbox.lastCodeFor("ayse@example.com")!);
    expect(again.customer.id).toBe(session.customer.id);
    expect(again.isNew).toBe(false);
  });

  it("spends a code after five wrong tries, and a new code replaces the old one", async () => {
    await app.auth.startEmail("deniz@example.com");
    const first = outbox.lastCodeFor("deniz@example.com")!;
    const wrong = first === "123456" ? "654321" : "123456";
    for (let i = 1; i < CODE_TRIES; i++) expect(await code(app.signInWithEmailCode("deniz@example.com", wrong))).toBe("CODE_WRONG");
    expect(await code(app.signInWithEmailCode("deniz@example.com", wrong))).toBe("CODE_EXPIRED");
    expect(await code(app.signInWithEmailCode("deniz@example.com", first))).toBe("CODE_EXPIRED");

    await app.auth.startEmail("deniz@example.com");
    const second = outbox.lastCodeFor("deniz@example.com")!;
    await app.auth.startEmail("deniz@example.com");
    const third = outbox.lastCodeFor("deniz@example.com")!;
    if (second !== third) expect(await code(app.signInWithEmailCode("deniz@example.com", second))).toBe("CODE_WRONG");
    expect(await code(app.signInWithEmailCode("deniz@example.com", third))).toBe("ok");
  });

  it("lasts ten minutes and sends at most five an hour", async () => {
    await app.auth.startEmail("can@example.com");
    tick(11 * MIN);
    expect(await code(app.signInWithEmailCode("can@example.com", outbox.lastCodeFor("can@example.com")!))).toBe("CODE_EXPIRED");
    for (let i = 1; i < CODES_PER_HOUR; i++) await app.auth.startEmail("can@example.com");
    expect(await code(app.auth.startEmail("can@example.com"))).toBe("EMAIL_CODE_LIMITED");
    tick(61 * MIN);
    expect(await code(app.auth.startEmail("can@example.com"))).toBe("ok");
  });

  it("is off without an email service", async () => {
    const off = new PeniApp({ demo: false });
    expect(off.auth.providers()).toEqual({ google: false, apple: false, email: false });
    expect(await code(off.auth.startEmail("x@example.com"))).toBe("EMAIL_NOT_CONFIGURED");
    expect(app.auth.providers()).toEqual({ google: true, apple: true, email: true });
  });
});

describe("Google and Apple", () => {
  it("signs in with a Google ID token and finds the same person next time", async () => {
    const token = await idToken("google", { sub: "g-111", email: "Mehmet@Gmail.com", email_verified: true, name: "Mehmet Kaya" });
    const first = await app.signInWithIdToken("google", token);
    expect(first.isNew).toBe(false);
    expect(first.customer).toMatchObject({ email: "mehmet@gmail.com", displayName: "Mehmet Kaya" });
    const again = await app.signInWithIdToken("google", await idToken("google", { sub: "g-111" }, { aud: "ios.apps.googleusercontent.com" }));
    expect(again.customer.id).toBe(first.customer.id);
  });

  it("refuses tokens for another app, from another issuer, expired or signed by someone else", async () => {
    const claims = { sub: "g-222", email: "x@gmail.com", email_verified: true };
    expect(await code(app.signInWithIdToken("google", await idToken("google", claims, { aud: "someone-else" })))).toBe("SIGN_IN_FAILED");
    expect(await code(app.signInWithIdToken("google", await idToken("google", claims, { iss: "https://evil.example" })))).toBe("SIGN_IN_FAILED");
    expect(await code(app.signInWithIdToken("google", await idToken("google", claims, { expiresIn: "-1m" })))).toBe("SIGN_IN_FAILED");
    expect(await code(app.signInWithIdToken("google", await idToken("google", claims, { key: keys.stranger })))).toBe("SIGN_IN_FAILED");
    expect(await code(app.signInWithIdToken("apple", await idToken("google", claims)))).toBe("SIGN_IN_FAILED");
    expect(await code(app.signInWithIdToken("google", "not.a.token-at-all"))).toBe("SIGN_IN_FAILED");
  });

  it("joins a Google login to the customer with the same verified email, never an unverified one", async () => {
    await app.auth.startEmail("zeynep@gmail.com");
    const byEmail = await app.signInWithEmailCode("zeynep@gmail.com", outbox.lastCodeFor("zeynep@gmail.com")!);
    const byGoogle = await app.signInWithIdToken("google", await idToken("google", { sub: "g-333", email: "zeynep@gmail.com", email_verified: true }));
    expect(byGoogle.customer.id).toBe(byEmail.customer.id);
    expect((await app.identity.loginsOf(byEmail.customer.id)).map((l) => l.provider)).toEqual(["email", "google"]);

    const unverified = await app.signInWithIdToken("google", await idToken("google", { sub: "g-444", email: "zeynep@gmail.com", email_verified: false }));
    expect(unverified.customer.id).not.toBe(byEmail.customer.id);
    expect(unverified.customer.email).toBeNull();
  });

  it("signs in with Apple, taking the name the app passes on the first time", async () => {
    const token = await idToken("apple", { sub: "000123.abc", email: "x7k2@privaterelay.appleid.com", email_verified: "true" });
    const session = await app.signInWithIdToken("apple", token, "Elif Şahin");
    expect(session.customer).toMatchObject({ displayName: "Elif Şahin", email: "x7k2@privaterelay.appleid.com" });
    expect(session.isNew).toBe(false);
    const noName = await app.signInWithIdToken("apple", await idToken("apple", { sub: "000999.def" }));
    expect(noName.isNew).toBe(true);
  });

  it("is off until its client ids are set", async () => {
    const off = new PeniApp({ demo: false });
    expect(await code(off.signInWithIdToken("google", await idToken("google", { sub: "g-1" })))).toBe("PROVIDER_NOT_CONFIGURED");
  });
});
