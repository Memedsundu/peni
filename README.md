# Peni

> 17. yüzyılda kahvehane, sınıf farkı gözetmeksizin herkesin bir masaya oturup fikir alışverişi yapabildiği "peni üniversitesi"ydi. **Peni** bu geleneği telefonuna taşır: her kafe, mahallesinin küçük kamusal alanı; her müşteri, o alanın eşit bir katılımcısı.

Peni is one product with two sides:

| Side | Who | Where |
|---|---|---|
| **Customer** | Neighbours, regulars, students | iOS + Android app, and the web |
| **Café** | Owners and baristas | Web café panel, plus "Kafe modu" in the mobile app |

What customers do:

- **Order ahead.** Pay at the till as usual. The app moves no money.
- **Earn peni.** Each café sets its own rate (e.g. 5 %). At that café, 1 peni = 1 TL.
- **Treat a friend.** *Ismarla* sends peni to another member of the same café. It's held in escrow until they accept, and returns to the sender after 24 h if they don't.
- **Askıda kahve.** Leave peni on the café's open *askı*. Anyone who needs it can take a tea or coffee from there, once a day, and their name is never shown. Cash left at the till for an askı coffee goes into the same askı, and the café can add a matching share on top.
- **Sit at the table.** Each café has a feed: posts from the café, the *Günün sorusu* (question of the day), and *Peni masası* events (a topic, a time, a big table). Members comment, react and RSVP.

Peni stands on its own. A café that already runs **[Shelby](docs/shelby-integration.md)** for its till, stock and accounting can connect it, so app orders arrive as ordinary Shelby orders. A café without Shelby uses Peni's standalone mode and marks orders paid in the Peni panel.

## Repository

```
apps/
  web/       Next.js 16 — customer web, café panel, and the HTTP API (/api/v1) used by every client
  mobile/    Expo SDK 58 (iOS + Android) — customer app with a café mode for baristas
packages/
  core/      Domain logic, no framework: peni ledger, gifts, askı, order lifecycle, POS adapters
  db/        Prisma 7 schema + migrations (Postgres/Neon), Postgres ledger store
  api/       HTTP contract shared by web and mobile: zod schemas, DTOs, typed client, Turkish copy
docs/        Vision, rules, architecture, Shelby contract, roadmap
```

## Run it

Needs Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev:web            # http://localhost:3000, demo data, nothing to configure
```

- Go to **/giris** and tap a demo neighbour (Ayşe has peni, Deniz is new). Or sign in with any `+90…` number: in demo mode the SMS code is shown on screen.
- The café panel is at **/kafe/moda**, staff key `demo-staff`.
- Demo data lives in memory and resets when the server restarts.

Mobile:

```bash
cp apps/mobile/.env.example apps/mobile/.env   # point EXPO_PUBLIC_API_URL at the web server
pnpm dev:mobile                                 # Expo; press i / a, or scan with Expo Go
```

## Checks

```bash
pnpm test                 # core rules (39), web app layer (6), db integration (skipped without a DB)
pnpm typecheck
pnpm --filter @peni/web build

# Ledger against real Postgres (applies migrations, never wipes data):
TEST_DATABASE_URL=postgresql://… pnpm --filter @peni/db test

# End-to-end over HTTP against a running server:
pnpm --filter @peni/web start & node apps/web/scripts/smoke.mjs
```

## Where things stand (v0.1)

| Area | State |
|---|---|
| Peni rules: earn, spend, gifts, askı, matching, refunds, no-shows, reports | **Done, tested** (`packages/core`) |
| Ledger on Postgres: append-only, balanced and non-negative, enforced by the database | **Done, tested on Postgres 16** (`packages/db`) |
| Web: customer pages, café panel, `/api/v1` | **Done, end-to-end tested.** Records are in memory for now |
| Mobile: cafés, café page with askı/menu/feed, ordering, order status, wallet, gifts, café mode | **Typechecks and bundles for iOS and Android.** Not yet run on a device |
| Shelby connection | Peni side done (adapter + signed webhook). The Shelby side is still to build ([contract](docs/shelby-integration.md)) |
| SMS login, push notifications, Postgres for all records, store release | [Roadmap](docs/roadmap.md) |

Read next: [vision](docs/vision.md) · [peni & askı rules](docs/peni-and-askida.md) · [architecture](docs/architecture.md) · [Shelby integration](docs/shelby-integration.md) · [roadmap](docs/roadmap.md)
