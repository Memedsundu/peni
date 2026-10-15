# Roadmap

Built by one person, part time. Each step ends with something a real café can use.

## 0 · Foundation (this repository, v0.1) ✓

- Peni rules (earning, spending, gifts, askı, matching, refunds, no-shows, reports), with tests
- Postgres ledger with database-level guards, tested on Postgres 16
- Web: customer pages, café panel, `/api/v1`, end-to-end smoke test
- Mobile: all customer screens and café mode. Typechecks and bundles for iOS and Android
- Shelby adapter and signed webhook on the Peni side

## 1 · Real data

- [ ] Move the remaining records (cafés, customers, sessions, orders, posts) from memory to Postgres (`@peni/db` already has the schema), and wire `PrismaLedgerStore` + `PrismaDirectory` into `PeniApp`
- [ ] Seed script for local development
- [ ] Deploy web + API to Vercel, database on Neon

## 2 · Real people can sign in

- [ ] SMS provider for codes (Netgsm or İleti Merkezi). Rate-limit per phone number and per IP
- [ ] Staff accounts and roles (owner, manager, barista) replacing the shared staff key. For Shelby cafés, sign in through Shelby
- [ ] Account deletion (stores and KVKK both require it)

## 3 · One café, live

Moda first: one café, its regulars, two weeks.

- [ ] Push notifications (Expo): order accepted, ready, rejected; gift received
- [ ] Shelby side of the integration ([contract](shelby-integration.md), steps 1–6)
- [ ] TestFlight + Play internal testing with the café's staff and ten regulars
- [ ] Measure: share of app opens that go to ordering vs. the feed (see [vision](vision.md))

## 4 · The table

- [ ] Café posts editor in the panel: post, question of the day, Peni masası event with capacity
- [ ] Reports and moderation: three reports auto-hide a comment, staff review queue
- [ ] Badges derived from activity: *Sabahçı* (mostly before 09:00), *Müdavim* (50+ orders), *Cömert* (left 10+ things on the askı or treated others)
- [ ] Peni code (QR) in the app, for walk-in orders at the till

## 5 · More cafés

- [ ] Self-serve café onboarding in standalone mode (menu editor)
- [ ] Monthly subscription billing for cafés
- [ ] Per-café ledger lock (see [architecture](architecture.md#concurrency))
- [ ] App Store / Google Play release

## Open questions — answer before step 3

1. **Is peni a payment instrument? (legal)** Peni can be gifted between people and pooled on the askı. Under Law No. 6493 (payment services and electronic money), transferable stored value can be regulated. Today's design keeps peni a café-specific loyalty reward: it can't be bought for money, it can't be cashed out, and it never leaves the café. Get a lawyer to confirm this stays outside e-money rules.
2. **Cash at the till for the askı (accounting).** Is it revenue on the day, or deferred until the coffee is handed out? Ask the accountant.
3. **KVKK.** Who is the data controller: Peni, the café, or both jointly? It needs to be written into the contract with each café. Peni stores phone number, name, photo, orders and comments.
4. **App Store review.** Ordering ahead with payment at the till, a loyalty programme and community features are all normal categories. Check the store guidelines on user-generated content: Peni has reporting and blocking, and needs a published contact for moderation.
5. **Expiry.** Should unspent peni expire (e.g. after 12 months without a visit)? The ledger supports it (`expire` would be one more transaction kind). It's a product and legal decision.
