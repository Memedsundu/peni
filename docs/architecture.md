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
- **Staff:** a shared staff key (`PENI_DEMO_STAFF_KEY`). Roles per café replace it in plan piece 2.
