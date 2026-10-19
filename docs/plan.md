# Peni: architecture and work plan

Agreed on 2026-10-17. The D-numbers refer to the product decisions taken while planning. Items marked *(default)* are choices made where nothing was decided yet; each can be changed.

---

## 1. What Peni is

One product, two sides, deployed together:

- **Café side** (replaces Shelby): the till with the customer screen and Ingenico, plus the back office (menu, stock, purchasing, expenses and accounting, staff and payroll, tasks, reports) and an AI assistant for ön muhasebe.
- **Customer side:** sign in with Google, Apple or email, collect and spend peni, gift peni, askıda kahve, the café feed and events.

Shelby Cafe is the pilot. Other cafés join later, so every record belongs to one café.

## 2. Shape

```
 Customer phone (Expo app) ─┐
 Customer browser ──────────┤
 Owner phone (Expo app) ────┤          ┌── OpenAI (extraction, chat, letters)
                            ├─ apps/web (Next.js on Vercel)
 Café PC, main screen ──────┤   pages + /api/v1 + jobs ──── Postgres (Neon)
   (till, back office)      │          └── Vercel Blob (photos, documents)
 Café PC, small screen ─────┘
   (customer display)
          │ same PC
 apps/till-bridge (Windows service) ── serial/TCP ── Ingenico terminal (ÖKC)
```

### Apps
| App | What it is |
|---|---|
| `apps/web` | One Next.js app with four areas: **customer** pages, **café panel** (back office), **kasa** (till screen) and **ekran** (customer display), plus the `/api/v1` API that every client uses. One deploy. |
| `apps/mobile` | Expo app for iOS and Android. Customers use it for everything on their side. Owners get a **café mode**: scan receipts with the camera, confirm AI drafts, see reports and the weekly letter. The till itself stays on the PC. |
| `apps/till-bridge` *(new, later: waits for the Ingenico protocol documents, D24)* | A small program on the café's Windows PC that talks to the Ingenico terminal and keeps an outbound connection to Peni. It replaces running the whole app locally, which is what `shelby-local` does today. |

### Packages
| Package | Responsibility |
|---|---|
| `packages/core` | Business rules with no framework, one folder per module (see §3). Already holds the peni ledger, which stays. |
| `packages/db` | One Prisma schema for everything, migrations, and the stores behind `core`'s interfaces. Every table has `cafeId`. |
| `packages/api` | The HTTP contract: zod schemas, DTOs, typed client, Turkish/English copy. Web and mobile both use it. |
| `packages/ai` *(new)* | OpenAI behind one interface (D23: OpenAI for now, easy to swap later), the document-extraction pipeline, chat tools, and the **draft** model: AI writes drafts, people confirm (D21). |
| `packages/brand` | Design tokens and shared visual pieces. The chart library is chosen in the design step (D17). |

### Key technical choices
- **Customer display:** both screens hang off the same PC, so the till window and the customer-screen window talk through the browser (`BroadcastChannel`). There's nothing to install and no network delay. *(default)*
- **Earning peni:** when an order is paid, the server makes a one-time **claim** with a QR token and a 4-digit code. The customer screen shows both, the customer scans or types it in the app, and peni is credited at the café's rate (D7, D11). Unclaimed claims expire. *(default: end of day)*
- **Spending peni:** the customer shows their member QR in the app, the barista scans it or types the code, and peni pays any part of the bill (D11).
- **Sign-in:** customers use Google, Apple or an email code; staff use an email and password, with a short PIN for baristas at the till. Both work on web and Expo. *(default library: Better Auth; Auth.js as in Shelby is the alternative)*
- **Background work** (reading documents, the weekly letter, alerts): a Postgres job table run by Vercel Cron and a worker route. Nothing extra to host. *(default)*
- **Money is append-only:** peni already uses a double-entry ledger with database guards. Café money (cash, bank, card) follows the same rule, as Shelby's money movements already do.
- **Personal data:** KVKK privacy notice, account deletion, and the standard-contract notice for sending data to OpenAI and other services abroad. All three are needed before launch.

## 3. Modules inside `core`
`identity` (cafés, staff, roles, customers) · `menu` · `till` (orders, discounts, voids, refunds, payments) · `cash` (cash sessions, counts) · `peni` (ledger, claims, spend, gifts) · `askida` · `community` (posts, comments, reactions, events, reports) · `stock` (items, recipes, usage per sale) · `purchasing` (suppliers, purchase receipts) · `accounting` (expenses, payments, checks, debts, credit card, money accounts, periods) · `staff` (shifts, timesheets, payroll) · `tasks` (task lists, alerts) · `reports` · `drafts` (anything AI proposes).

## 4. The small pieces

Each piece is one PR that ends with something you can try. Order follows D19: build everything, then switch once.

### Phase 0 · Ground
1. **Clean the repo.** Remove what v0.1 had that we've dropped (ordering from the app, SMS login, the Shelby adapter) and move every record from memory to Postgres.
2. **Cafés, staff and roles.** Owner, manager, chef and barista (D26); permissions per role, based on Shelby's. Staff sign in with email and password; the barista PIN at the till follows as 2b.
3. **Customer sign-in** with Google, Apple and email, on web and mobile.
4. **Design decisions:** look and feel for the café side, the chart library, and making Shelby's screens friendlier. Done together with Mehmet, before the screens in Phase 1.

### Phase 1 · The till
5. **Menu:** categories, products, prices and active/inactive.
6. **Kasa screen:** take an order, apply discounts, choose cash or card, void and refund.
7. **Customer screen:** the order as it's entered, then the peni QR and code after payment.
8. **Payments, manual for now:** the barista picks cash or card and runs the terminal separately, as Peni can't drive it yet. Payments go through one interface, so the Ingenico bridge plugs in later without changing the till (D24).
9. **Cash sessions:** open and close the register, counts and differences.

### Phase 2 · Peni and community
10. **Earn peni** with the claim QR or code.
11. **Spend peni** at the till with the member QR.
12. **Gift peni** to a friend.
13. **Askıda kahve:** hang a drink with peni or with cash at the till; anyone takes one, with no limit (D8).
14. **Café feed:** owner posts with photos, plus comments and reactions.
15. **Events:** created by the café or a customer, with join, reporting and moderation.
16. **Mobile customer screens** updated for all of the above.

### Phase 3 · Back office (rebuilt Shelby)
17. **Stock and recipes:** ingredients used per sale, low-stock warnings.
18. **Suppliers and purchase receipts.**
19. **Expenses:** payments, checks, debts, credit card.
20. **Money accounts and accounting periods:** register, reserve, bank, period close.
21. **Shifts, timesheets and payroll.**
22. **Task lists and alerts.**
23. **Reports** with the new charts.

### Phase 4 · AI (all 17 ideas, D20)
24. **AI foundation:** OpenAI wrapper, drafts and confirm screen, audit log, document storage, job queue.
25. **Scan receipts and invoices** (A1), lines into stock (A2), duplicate guard (A3).
26. **Forward-to-Peni email inbox** (A4).
27. **Bank and card statements** (A5) and **Z report check** (A6).
28. **Quick entry by text or voice** (A7).
29. **Chat, "Explain this" on reports, and reports on request** (B8, B9).
30. **Weekly letter** (B10) and **month-end package for the mali müşavir** (B11).
31. **Watchers:** price watch (C12), unusual activity (C13), cash-flow forecast (C14), order suggestions (C15), staffing hints (C16).
32. **Community insights** (D17).

### Later · when the Ingenico protocol documents arrive
- **Till bridge + Ingenico:** the till sends card and cash sales to the terminal for fiscal receipts. This piece doesn't block the switch.

### Phase 5 · Switch
33. **Shelby → Peni data move:** a script that copies Shelby Cafe's data (D18), rehearsed on a copy of the database until the numbers match.
34. **Launch readiness:** KVKK texts, account deletion, App Store and Play Store releases, monitoring.
35. **Switch day:** freeze Shelby, run the final move, check the totals, open Peni.

## 5. Not in scope now
- e-Fatura / e-Arşiv connection (D22). The purchasing and accounting modules leave room for it later.
- Ordering from the app (D5).
- A second AI provider (D23). `packages/ai` keeps the provider behind one interface.
