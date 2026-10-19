# Architecture

This page describes the code as it is today. Where Peni is going (the till, the back office, AI, the customer screen) is in [the plan](plan.md).

## Shape

```
 iOS/Android ─┐ apps/mobile (Expo)
              │        │  @peni/api client
 Browser ─────┤ apps/web (Next.js) ── /api/v1 ──▶ PeniApp (src/server/app.ts)
                                                   │
                                     @peni/core: PeniService, Ledger, rules
                                                   │
                                     stores: Postgres via @peni/db, or in memory
```

- **One backend.** The web app's `/api/v1` serves the web pages and the mobile app, through the same `@peni/api` client, so they can't drift apart.
- **`@peni/core` has no framework.** Its rules run the same way in tests, in route handlers and in background jobs.
- **Storage sits behind interfaces.** `LedgerStore`, `PeniDirectory`, `IdentityStore`, `CommunityStore` and `MenuStore` each have an in-memory version (tests, a quick local demo) and a Postgres version in `@peni/db`. The web app uses Postgres whenever `DATABASE_URL` is set (`apps/web/src/server/runtime.ts`).
- **One transaction.** The Postgres stores share the ledger's open transaction (`createPrismaStores`), so a peni operation and the records it writes, such as a gift, commit or roll back together.

## Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `@peni/core` | Peni rules, the ledger, memberships, gifts, askı, member codes, and the store interfaces for cafés, customers, the feed and the menu | — |
| `@peni/db` | Prisma schema, migrations with ledger guards, and a Postgres store for each interface | core |
| `@peni/api` | Request schemas (zod), response DTOs, typed fetch client, Turkish error copy | zod |
| `@peni/brand` | Turkish text and number helpers (formatting, names, dates) | — |
| `@peni/web` | HTTP API, application layer, a placeholder home page | core, db, api, brand |
| `@peni/mobile` | A placeholder app until the new screens are built | api |

The mobile app never imports core rules: anything that decides money or peni runs on the server.

## Concurrency

Every peni operation runs inside `ledger.atomically(...)`:

- **In memory:** a promise chain.
- **In Postgres:** one database transaction holding an advisory lock.

So a balance check and the write that follows can't interleave. The database's CHECK constraint is a second line of defence. `packages/db/test` sends five parallel spends of the same 50 peni, and exactly one succeeds.

The advisory lock is global today, which is fine for a handful of cafés. Once there are many, pass a café ID to `atomically` and lock per café.

## Auth

- **Customers:** Google, Apple, or a 6-digit code sent by email (plan piece 3, on Peni's own sessions, no auth library: D27). For Google and Apple the web page or the Expo app gets an ID token from the provider and posts it to `POST /api/v1/auth/google` or `/auth/apple`; Peni checks its signature, issuer and audience against the provider's published keys (`GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS`: the web and app client ids, comma-separated). Email: `POST /api/v1/auth/email/start` sends the code through Resend (`RESEND_API_KEY`, `EMAIL_FROM`), `POST /auth/email/verify` checks it. Codes last 10 minutes, are stored only as hashes, die after 5 wrong tries, and one address gets at most 5 an hour. A Google or Apple login whose verified email matches an existing customer joins that customer, so one person stays one customer; an unverified email never links. `GET /api/v1/auth/providers` says which buttons to show. Every way in ends in the same session: a random token stored only as a SHA-256 hash, lasting 90 days, revoked on sign-out; web keeps it in the httpOnly `peni_session` cookie, other clients send it as a bearer token. `isNew` on the session means the customer has no name yet, so the app asks for one. In demo mode `POST /api/v1/auth/demo` still signs in as a seeded customer, and when no email service is set up, codes stay in an outbox that `GET /api/v1/auth/demo/outbox?email=` reads.
- **Staff:** email and password (`POST /api/v1/staff-session`), hashed with bcrypt as in Shelby so Shelby's passwords move across unchanged. A staff session is separate from a customer session, lasts 14 days, and is stored only as a SHA-256 hash; the web panel keeps it in the httpOnly `peni_staff` cookie, the Expo app sends it as `x-peni-staff-token`. Ten wrong passwords for one email pause sign-in for 15 minutes. Changing a password, or the owner resetting it, signs the account out everywhere else. At the till, an owner registers the computer once (`POST /api/v1/staff/:slug/devices`; its token lives in the httpOnly `peni_till` cookie or `x-peni-till-token`). People then sign in on it with a PIN (`POST /api/v1/till/pin`): the session lasts 12 hours, is tied to that café and computer, dies when the computer is revoked, and carries only the till's permissions. Anything else answers 403 `NEEDS_PASSWORD`. See [staff and roles](staff-and-roles.md#at-the-till).
- **Roles:** one account can work at several cafés with a role at each: owner, manager, chef or barista ([staff and roles](staff-and-roles.md)). Every café route calls `app.staff.at(token, slug, permission)`, which answers 401 (not signed in), 403 `NOT_STAFF` (not on this café's team) or 403 `FORBIDDEN` (the role lacks the permission).
