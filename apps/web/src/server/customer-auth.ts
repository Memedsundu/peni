import {
  normalizeEmail,
  type Customer,
  type IdentityStore,
  type LoginProvider,
} from "@peni/core";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

/**
 * Customer sign-in: plan piece 3, on Peni's own sessions (D27).
 *
 * Google and Apple: the web page or the Expo app gets an ID token from Google or
 * Apple and sends it here; Peni checks its signature, issuer and audience against
 * Google's and Apple's published keys. Email: Peni sends a 6-digit code.
 * Either way the customer gets the same Peni session as before.
 *
 * One person, one customer: a Google or Apple login with a verified email that
 * matches an existing customer joins that customer instead of making a second one.
 */

/** Email codes last this long. */
const CODE_MS = 10 * 60_000;
/** Codes per email per hour. */
export const CODES_PER_HOUR = 5;
/** Wrong tries per code; then it is spent. */
export const CODE_TRIES = 5;

// ─────────────────────────────────────────────── ID tokens

export interface IdTokenClaims {
  /** Google's or Apple's stable user id. */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface IdTokenVerifier {
  /** Whether sign-in with this provider is set up. */
  enabled(provider: "google" | "apple"): boolean;
  verify(provider: "google" | "apple", idToken: string): Promise<IdTokenClaims>;
}

interface ProviderConfig {
  /** Client ids the token may be for: the web client and each app's. Empty turns the provider off. */
  audiences: string[];
  /** Defaults to the provider's published keys. Tests pass local ones. */
  keys?: JWTVerifyGetKey;
}

const ISSUERS = {
  google: ["https://accounts.google.com", "accounts.google.com"],
  apple: ["https://appleid.apple.com"],
};
const KEYS_URL = {
  google: "https://www.googleapis.com/oauth2/v3/certs",
  apple: "https://appleid.apple.com/auth/keys",
};

export class JoseIdTokenVerifier implements IdTokenVerifier {
  private readonly keys: Partial<Record<"google" | "apple", JWTVerifyGetKey>> = {};

  constructor(private readonly config: { google: ProviderConfig; apple: ProviderConfig }) {}

  enabled(provider: "google" | "apple"): boolean {
    return this.config[provider].audiences.length > 0;
  }

  async verify(provider: "google" | "apple", idToken: string): Promise<IdTokenClaims> {
    const { audiences, keys } = this.config[provider];
    if (audiences.length === 0) throw new AppError("PROVIDER_NOT_CONFIGURED", `${provider} sign-in is not set up`, 503);
    const getKey = keys ?? (this.keys[provider] ??= createRemoteJWKSet(new URL(KEYS_URL[provider])));
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, getKey, { issuer: ISSUERS[provider], audience: audiences }));
    } catch {
      throw new AppError("SIGN_IN_FAILED", "Sign-in token was not accepted", 401);
    }
    if (typeof payload.sub !== "string" || !payload.sub) throw new AppError("SIGN_IN_FAILED", "Sign-in token has no user", 401);
    const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : null;
    // Apple sends "true" as a string; Google sends a boolean.
    const verified = payload.email_verified === true || payload.email_verified === "true";
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;
    return { subject: payload.sub, email, emailVerified: !!email && verified, name };
  }
}

// ─────────────────────────────────────────────── email

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Sends through Resend, as Shelby does. */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, ...message }),
    });
    if (!res.ok) {
      console.error("Resend refused an email", res.status, await res.text().catch(() => ""));
      throw new AppError("EMAIL_FAILED", "The email could not be sent", 502);
    }
  }
}

/** Keeps emails instead of sending them: tests, and the demo when no email service is set up. */
export class OutboxEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    if (this.sent.length > 100) this.sent.shift();
  }

  /** The newest code sent to an address. Other emails to it (a gift) are passed over. */
  lastCodeFor(email: string): string | null {
    const m = [...this.sent].reverse().find((x) => x.to === normalizeEmail(email) && x.subject.startsWith(CODE_SUBJECT));
    return m ? (/\b(\d{6})\b/.exec(m.text)?.[1] ?? null) : null;
  }
}

// ─────────────────────────────────────────────── sign-in

export interface CustomerAuthOptions {
  now: () => Date;
  verifier: IdTokenVerifier;
  /** Null when no email service is set up: email sign-in then answers EMAIL_NOT_CONFIGURED. */
  email: EmailSender | null;
}

export class CustomerAuth {
  constructor(
    private readonly identity: IdentityStore,
    private readonly options: CustomerAuthOptions,
  ) {}

  /** Which sign-in buttons to show. */
  providers(): { google: boolean; apple: boolean; email: boolean } {
    return {
      google: this.options.verifier.enabled("google"),
      apple: this.options.verifier.enabled("apple"),
      email: !!this.options.email,
    };
  }

  /** Sends a 6-digit code. Answers the same whether or not the email has an account. */
  async startEmail(rawEmail: string): Promise<{ ok: true; expiresInSeconds: number }> {
    if (!this.options.email) throw new AppError("EMAIL_NOT_CONFIGURED", "Email sign-in is not set up", 503);
    const email = normalizeEmail(rawEmail);
    const now = this.options.now();
    if ((await this.identity.countEmailCodes(email, new Date(now.getTime() - 3_600_000))) >= CODES_PER_HOUR) {
      throw new AppError("EMAIL_CODE_LIMITED", "Too many codes; try again later", 429);
    }
    // A new code replaces the one before it.
    const previous = await this.identity.liveEmailCode(email, now);
    if (previous) await this.identity.saveEmailCode({ ...previous, usedAt: now });
    const id = `ec_${randomUUID()}`;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.identity.saveEmailCode({
      id,
      email,
      codeHash: codeHash(id, code),
      createdAt: now,
      expiresAt: new Date(now.getTime() + CODE_MS),
      attempts: 0,
      usedAt: null,
    });
    await this.options.email.send(codeEmail(email, code));
    return { ok: true, expiresInSeconds: CODE_MS / 1000 };
  }

  /** Checks the newest live code. Five wrong tries spend it. */
  async verifyEmail(rawEmail: string, code: string): Promise<{ customer: Customer; isNew: boolean }> {
    const email = normalizeEmail(rawEmail);
    const now = this.options.now();
    const live = await this.identity.liveEmailCode(email, now);
    if (!live || live.attempts >= CODE_TRIES) throw new AppError("CODE_EXPIRED", "Ask for a new code", 400);
    if (!sameHash(live.codeHash, codeHash(live.id, code))) {
      const attempts = live.attempts + 1;
      await this.identity.saveEmailCode({ ...live, attempts, usedAt: attempts >= CODE_TRIES ? now : null });
      throw new AppError(attempts >= CODE_TRIES ? "CODE_EXPIRED" : "CODE_WRONG", "Wrong code", 400);
    }
    await this.identity.saveEmailCode({ ...live, usedAt: now });
    return this.signIn({ provider: "email", subject: email, email, emailVerified: true, name: null });
  }

  /** Google or Apple: `name` is what Apple's sign-in sheet gave the app the first time. */
  async verifyIdToken(
    provider: "google" | "apple",
    idToken: string,
    name?: string,
  ): Promise<{ customer: Customer; isNew: boolean }> {
    const claims = await this.options.verifier.verify(provider, idToken);
    return this.signIn({ provider, ...claims, name: claims.name ?? name?.trim() ?? null });
  }

  private async signIn(login: {
    provider: LoginProvider;
    subject: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
  }): Promise<{ customer: Customer; isNew: boolean }> {
    const email = login.emailVerified ? login.email : null;
    const known = await this.identity.findLogin(login.provider, login.subject);
    let customer = known ? await this.identity.getCustomer(known.customerId) : null;
    if (!customer && email) customer = await this.identity.getCustomerByEmail(email);
    if (!customer) {
      customer = {
        id: `cus_${randomUUID()}`,
        phone: null,
        email,
        displayName: login.name ?? "",
        avatarUrl: null,
        profileVisible: false,
      };
      await this.identity.saveCustomer(customer);
    } else if (!customer.email && email && !(await this.identity.getCustomerByEmail(email))) {
      customer = { ...customer, email };
      await this.identity.saveCustomer(customer);
    }
    if (!known) await this.identity.addLogin({ customerId: customer.id, provider: login.provider, subject: login.subject, email });
    return { customer, isNew: !customer.displayName.trim() };
  }
}

function codeHash(id: string, code: string): string {
  return createHash("sha256").update(`${id}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const CODE_SUBJECT = "Penny giriş kodun";

/** Turkish, sen, short: the code first so it shows in the notification. */
function codeEmail(to: string, code: string): EmailMessage {
  return {
    to,
    subject: `${CODE_SUBJECT}: ${code}`,
    text: `Penny giriş kodun: ${code}\n\nKod 10 dakika geçerli. Bu girişi sen istemediysen bu e-postayı yok sayabilirsin.`,
    html: `<p style="font-family:system-ui,sans-serif;font-size:16px">Penny giriş kodun:</p>
<p style="font-family:system-ui,sans-serif;font-size:32px;font-weight:600;letter-spacing:6px">${code}</p>
<p style="font-family:system-ui,sans-serif;color:#555">Kod 10 dakika geçerli. Bu girişi sen istemediysen bu e-postayı yok sayabilirsin.</p>`,
  };
}
