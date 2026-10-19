import { OpenAiModel } from "@peni/ai";
import { createPrismaClient, createPrismaStores } from "@peni/db";
import { PeniApp, inMemoryStores } from "./app";
import { JoseIdTokenVerifier, OutboxEmailSender, ResendEmailSender, type EmailSender } from "./customer-auth";
import { seed } from "./seed";

const globalForPeni = globalThis as unknown as { peniApp?: Promise<PeniApp>; peniOutbox?: OutboxEmailSender };

/**
 * One app instance per server process (kept across dev hot reloads).
 *
 * With DATABASE_URL set, every record lives in Postgres; without it, in memory.
 * In demo mode (PENI_DEMO, on unless "0") an empty database gets the demo cafés
 * and their history once; an in-memory app gets them on every start.
 *
 * Customer sign-in reads GOOGLE_CLIENT_IDS and APPLE_CLIENT_IDS (comma-separated:
 * the web client and each app's) and RESEND_API_KEY with EMAIL_FROM. Without
 * Resend, the demo keeps sign-in emails in an outbox instead of sending them.
 * PENI_PUBLIC_URL is the site's address for links in emails (gift emails need it).
 * OPENAI_API_KEY turns the assistant on (OPENAI_MODEL picks the model, gpt-5-mini by
 * default); without it the demo uses a stand-in that doesn't read, and anything else
 * runs with the assistant off.
 */
export function getApp(): Promise<PeniApp> {
  globalForPeni.peniApp ??= (async () => {
    const demo = process.env.PENI_DEMO !== "0";
    const url = process.env.DATABASE_URL;
    const stores = url ? createPrismaStores(createPrismaClient(url)) : inMemoryStores();
    const app = new PeniApp(
      { demo, auth: { verifier: verifierFromEnv(), email: emailFromEnv(demo) }, publicUrl: process.env.PENI_PUBLIC_URL || undefined, ai: aiFromEnv() },
      stores,
    );
    if (demo && (await app.identity.listCafes()).length === 0) await seed(app);
    return app;
  })();
  return globalForPeni.peniApp;
}

/** The demo's outbox, when sign-in emails are kept instead of sent. */
export function demoOutbox(): OutboxEmailSender | null {
  return globalForPeni.peniOutbox ?? null;
}

/** Left out (undefined) when there's no key, so the app picks the demo's stand-in or turns the assistant off. */
function aiFromEnv() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey ? { model: new OpenAiModel({ apiKey, model: process.env.OPENAI_MODEL?.trim() || undefined }), mode: "on" as const } : undefined;
}

function verifierFromEnv(): JoseIdTokenVerifier {
  const list = (name: string) => (process.env[name] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return new JoseIdTokenVerifier({ google: { audiences: list("GOOGLE_CLIENT_IDS") }, apple: { audiences: list("APPLE_CLIENT_IDS") } });
}

function emailFromEnv(demo: boolean): EmailSender | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (key && from) return new ResendEmailSender(key, from);
  if (!demo) return null;
  globalForPeni.peniOutbox ??= new OutboxEmailSender();
  return globalForPeni.peniOutbox;
}
