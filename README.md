# Peni

> 17. yüzyılda kahvehane, sınıf farkı gözetmeksizin herkesin bir masaya oturup fikir alışverişi yapabildiği "peni üniversitesi"ydi. **Peni** bu geleneği telefonuna taşır: her kafe, mahallesinin küçük kamusal alanı; her müşteri, o alanın eşit bir katılımcısı.

Peni is one product with two sides, deployed together:

| Side | Who | What |
|---|---|---|
| **Café** | Owners and baristas | The till with a small customer-facing screen, and the back office: menu, stock, purchasing, accounting, staff, reports, and an AI assistant for ön muhasebe |
| **Customer** | Neighbours and regulars | Collect and spend peni (1 peni = 1 TL at that café), gift peni, askıda kahve, the café feed and events. iOS, Android and the web |

The café side replaces Shelby, the system Shelby Cafe runs on today. The full plan, in 35 small pieces, is in [docs/plan.md](docs/plan.md).

## Where things stand

The code is being rebuilt piece by piece. Today it holds:

| Area | State |
|---|---|
| Peni rules: earn, spend, gifts, askı, matching, refunds, reports | **Done, tested** (`packages/core`) |
| Ledger on Postgres: append-only, balanced and non-negative, enforced by the database | **Done, tested on Postgres 16** (`packages/db`) |
| `/api/v1` for wallets, gifts, askı, the café feed and the staff report | **Done, end-to-end tested** on Postgres and in memory |
| Staff sign-in, the team, and roles (owner, manager, chef, barista) with per-café permissions | **Done, end-to-end tested** ([staff and roles](docs/staff-and-roles.md)) |
| Customer sign-in with Google, Apple or an email code | **Done, end-to-end tested** (email; Google and Apple need their client ids) |
| Menü: categories, products, prices, on/off, removing and bringing back, order; edited by roles with "menu.edit" | **Done, end-to-end tested** (API; screens come with the new design) |
| Satış ekranı at `/kasa`: set a computer up as a till, PIN sign-in, tabs and photo tiles, line and order discounts, cash with change or card, Satışlar with void, refund and delete | **Done, end-to-end tested** (API, and the screen in a browser, Turkish and English, light and dark) |
| Müşteri ekranı at `/kasa/ekran`: the order as it's entered, then thanks with the peni QR and 4-digit code; idle, the café, its posts and events, and how to get Peni | **Done, tested in a browser** (claiming the peni in the app is piece 10) |
| Payments: every sale and refund goes through one terminal interface and leaves a record, declined and cancelled tries included. Manual for now (D24): cash counts at once, a card when the barista taps that the terminal approved it. A terminal that answers itself (the Ingenico through the till bridge) plugs in without changing the till | **Done, tested** (manual in a browser; a terminal that answers itself with a stand-in in tests; the bridge waits for the protocol documents) |
| Kasa: open the drawer with a count (by notes and coins or one total), put cash in or take it out with a reason, close it with a count. A count that doesn't match what should be there needs a reason; cash can't be taken while the drawer is closed. One drawer per café, shared by every till | **Done, tested** (in a browser, in memory and on Postgres) |
| Earning peni: the customer screen's QR opens `/p/<token>`, or the customer types its 4-digit code at `/p`. They sign in by email if needed, join the café, and the peni go to their wallet once; anyone else is told it's taken. Wrong codes are limited to 10 an hour. A refund closes an untaken code or takes the peni back. Codes close at the end of the café's day | **Done, tested** (in a browser, in memory and on Postgres; Google and Apple buttons on the web come with the customer sign-in screens) |
| Spending peni: the customer opens their ödeme kodu at `/harca` (6 digits and a QR, new every 5 minutes). At the till "Peniyle öde" opens the wallet from the code; the barista checks the name and takes as many peni as the café's rules allow, and the rest is paid by cash or card. One wallet per order; the order is locked until the peni are given back. Refunds and voids return peni and money each their own way, and only the money part earns peni | **Done, tested** (in a browser, in memory and on Postgres) |
| Other web and mobile screens | **Placeholders.** The new design replaces the v0.1 screens |

## Repository

```
apps/
  web/       Next.js 16: the HTTP API (/api/v1) used by every client, and the web pages
  mobile/    Expo SDK 58 (iOS + Android)
packages/
  core/      Domain logic, no framework: peni ledger, gifts, askı, member codes, menu, orders, payments, cash
  db/        Prisma 7 schema + migrations (Postgres/Neon), Postgres ledger store
  api/       HTTP contract shared by web and mobile: zod schemas, DTOs, typed client, Turkish copy
  brand/     Turkish text and number helpers
docs/        Plan, architecture, peni & askı rules, vision
```

## Run it

Needs Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev:web            # http://localhost:3000, demo data in memory, nothing to configure
```

To keep data in Postgres, set `DATABASE_URL` in `apps/web/.env` and apply the migrations once with `DATABASE_URL=… pnpm --filter @peni/db migrate:deploy`. An empty database gets the demo cafés on first start.

The API runs with demo data: sign in with `POST /api/v1/auth/demo` and `{"customerId": "cus_ayse"}`. Staff sign in with `POST /api/v1/staff-session` and `{"email": "leyla@moda.test", "password": "demo-staff"}` (Leyla owns Moda; Murat, Hakan and Ece are its manager, chef and barista). Ece's till PIN is 2580 once an owner has set a computer up as a till: open http://localhost:3000/kasa and sign in there as Leyla once. "Müşteri ekranı" in the till's header opens the customer screen in a second window, for the small monitor facing the customer (make it full screen there). After a sale, the QR there opens the claim page on a phone; `/p` takes the 4-digit code instead. Email sign-in works in the demo without an email service: `POST /api/v1/auth/email/start` with any address, then read the code from `GET /api/v1/auth/demo/outbox?email=…`.

## Checks

```bash
pnpm test
pnpm typecheck
pnpm --filter @peni/web build

# Postgres stores against a real database (applies migrations, never wipes data):
TEST_DATABASE_URL=postgresql://… pnpm --filter @peni/db test

# End-to-end over HTTP against a running server:
pnpm --filter @peni/web start & node apps/web/scripts/smoke.mjs
```

Read next: [plan](docs/plan.md) · [architecture](docs/architecture.md) · [staff and roles](docs/staff-and-roles.md) · [peni & askı rules](docs/peni-and-askida.md) · [vision](docs/vision.md)
