# Architecture

## Shape

```
              ┌─────────────── Peni ───────────────┐
 iOS/Android ─┤ apps/mobile (Expo)                  │
              │        │  @peni/api client          │
 Browser ─────┤ apps/web (Next.js) ── /api/v1 ──────┤──▶ Postgres (Neon)
              │        │                            │
              │   PeniApp (application layer)       │
              │        │                            │
              │   @peni/core: PeniService, Ledger,  │
              │   fulfillment, PosAdapter           │
              └────────┬───────────────────────────┘
                       │ PosAdapter
          ┌────────────┴─────────────┐
   StandalonePosAdapter        ShelbyPosAdapter ──HTTP──▶ Shelby partner API
   (menu in Peni,                     ◀──signed webhook── Shelby (order.paid / refunded / cancelled)
    staff mark paid)
```

- **One backend.** The web app's `/api/v1` serves the web pages *and* the mobile app. The web customer pages call the same API through the same `@peni/api` client the phone uses, so the two can't drift apart.
- **`@peni/core` has no framework.** Its peni rules run the same way in tests, in Next.js route handlers, in a background job, or anywhere else. It depends on nothing beyond Node.
- **Storage sits behind interfaces.** `LedgerStore` and `PeniDirectory` each have an in-memory version (tests, demo) and a Postgres version (`@peni/db`).

## Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `@peni/core` | Peni rules, ledger, order state machine, POS adapter interface, Shelby adapter and webhook signing | — |
| `@peni/db` | Prisma schema, migrations with ledger guards, `PrismaLedgerStore`, `PrismaDirectory` | core |
| `@peni/api` | Request schemas (zod), response DTOs, typed fetch client, Turkish error copy | zod |
| `@peni/web` | HTTP API, customer web, café panel, application layer (`src/server/app.ts`) | core, api |
| `@peni/mobile` | Customer app and café mode | api |

The mobile app depends only on `@peni/api`. It never imports core rules: anything that decides money or peni runs on the server.

## An order, end to end

1. **Customer** sends `POST /api/v1/orders` with lines, peni to use, an optional askı item, and an idempotency key.
2. **PeniApp** does the following, in order:
   - checks membership, pre-order permission and the café's open state (via the POS)
   - prices the lines from the **café's menu**, never from the client
   - claims the askı item, then reserves peni
   - creates the pending order in the POS
   - if any step fails, it releases everything already reserved
3. **Barista** works the board: Kabul et → Hazır. The customer is notified at each step; push notifications are on the roadmap, and screens poll until then.
4. **Payment at the till:**
   - **Shelby café:** Shelby sends a signed `order.paid` webhook. Peni closes the order and the customer earns peni on the amount actually paid.
   - **Standalone café:** the barista taps "Ödendi, teslim edildi" in Peni, with the same result.
5. **If it goes wrong:**
   - Rejected or cancelled orders release the peni and the askı item.
   - A no-show releases them too and adds a strike.
   - A refund reverses everything, as described in [the rules](peni-and-askida.md#refunds).

## Concurrency

Every peni operation runs inside `ledger.atomically(...)`:

- **In memory:** a promise chain.
- **In Postgres:** one database transaction holding an advisory lock.

So a balance check and the write that follows can't interleave. The database's CHECK constraint is a second line of defence. `packages/db/test` sends five parallel spends of the same 50 peni, and exactly one succeeds.

The advisory lock is global today, which is fine for a handful of cafés. Once there are many, pass a café ID to `atomically` and lock per café.

## Auth

- **Customers:** phone number + 6-digit SMS code → a random bearer token, stored only as a SHA-256 hash.
  - Mobile keeps the token in the Keychain/Keystore (`expo-secure-store`).
  - Web keeps it in an httpOnly cookie.
  - Five wrong attempts burn the code.
- **Staff (v0.1):** a shared staff key (`PENI_DEMO_STAFF_KEY`). Replace it before any real café uses Peni: see the roadmap, step 2.

## Deploy (planned)

| Piece | Where |
|---|---|
| Web + API | Vercel (same setup as Shelby) |
| Database | Neon Postgres, `pnpm --filter @peni/db migrate:deploy` |
| Mobile | EAS Build → TestFlight / Play internal testing → stores |
| SMS | A Turkish SMS provider (Netgsm, İleti Merkezi, …) behind a small interface |
| Push | Expo push service |
