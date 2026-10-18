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

- **Customers (demo only):** `POST /api/v1/auth/demo` signs in as a seeded customer and sets a random session token, stored only as a SHA-256 hash. Sessions last 90 days; signing out revokes them. Web keeps it in an httpOnly cookie; other clients send it as a bearer token. Google, Apple and email sign-in replace this in plan piece 3.
- **Staff:** email and password (`POST /api/v1/staff-session`), hashed with bcrypt as in Shelby so Shelby's passwords move across unchanged. A staff session is separate from a customer session, lasts 14 days, and is stored only as a SHA-256 hash; the web panel keeps it in the httpOnly `peni_staff` cookie, the Expo app sends it as `x-peni-staff-token`. Ten wrong passwords for one email pause sign-in for 15 minutes. Changing a password, or the owner resetting it, signs the account out everywhere else. At the till, an owner registers the computer once (`POST /api/v1/staff/:slug/devices`; its token lives in the httpOnly `peni_till` cookie or `x-peni-till-token`). People then sign in on it with a PIN (`POST /api/v1/till/pin`): the session lasts 12 hours, is tied to that café and computer, dies when the computer is revoked, and carries only the till's permissions. Anything else answers 403 `NEEDS_PASSWORD`. See [staff and roles](staff-and-roles.md#at-the-till).
- **Roles:** one account can work at several cafés with a role at each: owner, manager, chef or barista ([staff and roles](staff-and-roles.md)). Every café route calls `app.staff.at(token, slug, permission)`, which answers 401 (not signed in), 403 `NOT_STAFF` (not on this café's team) or 403 `FORBIDDEN` (the role lacks the permission).
