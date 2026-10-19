# Moving Shelby into Peni

Plan piece 33. One command reads a café from Shelby's database, writes it into Peni and checks the totals on both sides. Shelby is only read, in one read-only transaction, so every table comes from the same moment.

## Running it

```sh
# Dry run: reads Shelby, moves into memory, checks. Writes nothing anywhere.
SHELBY_DATABASE_URL="postgres://…" pnpm --filter @peni/web shelby-move --report move.md

# The move: into Peni's database.
SHELBY_DATABASE_URL="postgres://…" DATABASE_URL="postgres://…" pnpm --filter @peni/web shelby-move --write --report move.md
```

- `--cafe <id>`: the Shelby café, when Shelby has more than one (it lists them).
- `--slug <slug>`: the Peni café's address, `shelby` by default (`/kafe/shelby`). Its id is `cafe_<slug>`.
- `--all`: also the previous owner's records (see below).
- `--now <ISO time>`: the moment of the move, for rehearsals.
- `--rehearsal`: lets `--write` run while Shelby isn't frozen. Only for a copy; the real move refuses to run until `shelby-freeze --on` (see [switch-day.md](switch-day.md)).
- It exits with 1 when a total doesn't match, and 2 on an error.

It only writes into an empty café, so a rehearsal goes into a fresh database (or a Neon branch) each time and the real move runs once. Staff whose email already has a Peni account keep that account and join the café.

## Rehearsing

1. Make a Neon branch of Shelby's production database (or a copy), and a fresh Peni database with `pnpm --filter @peni/db migrate:deploy`.
2. Run the dry run, then `--write --rehearsal` into the fresh database.
3. Read the report: every total should say ✓, and "Not moved" and "To look at" should hold no surprises.
4. Start Peni on that database and sign in with a Shelby email and password.

The rehearsal for this piece used Shelby's demo data plus rows for the money, a Kasa session, a loan, the credit card, tasks and an older period: every total matched, and the pages read right.

## What becomes what

| Shelby | Peni |
|---|---|
| Users | Team. Same email and password (bcrypt is the same); admin becomes owner. |
| Role permissions | Not moved: each role starts with Peni's defaults, to review in Ayarlar → Ekip. |
| Categories, products | Menü. Inactive products stay, unavailable. |
| Stock items | Stok, in kg, l or adet (g and ml are converted; pcs, slice and anything else are adet). Today's amounts are counted in as the start; below zero starts at zero. |
| Product ingredients | Recipes. A product sold straight from stock ("direct") is a recipe of one. |
| Orders paid, voided, refunded | Orders and till payments, numbered per day. Shelby's total is kept even when a line was lost to a deleted product. Pending orders were never paid and stay. |
| Expenses, deliveries | Bills, with a delivery's lines as stock lines. Shelby's weekly wage bills are left out: Peni keeps that pay as hours and payouts. |
| Expense payments | Bill payments: cash, card, bank, check, the café's card (credit) or a loan. Older bills marked paid without a payment get one on their own date. |
| Checks | Checks, cashed or not. |
| Borrowed money, repayments | Loans and repayments, per lender. |
| Credit card | Card settings and payments. |
| Money accounts | Nakit ve banka starts on the day of the move with Shelby's balances: the safe is the reserve. The drawer is the last Kasa count. |
| Kasa sessions | Kasa sessions with their counts. |
| Shift blocks (and the old shift templates) | Shifts, by day. Approved weeks are published. |
| Timesheets | Days worked: each week's hours go on the days the person was on the plan, in proportion, or on the Monday. A pay rate from each week the rate changed. |
| Payroll payouts | Payouts, in the month of the week's last worked day. |
| Task lists and tasks | Görevler. Shelby picks the role per task and Peni per list, so a list with tasks for two roles becomes two lists. Done and skipped tasks keep their record. |

Not moved, and said so in the report: each stock change and money movement (Peni starts from today's amounts), AI conversations, alerts, closed pay months (close them again in Puantaj ve maaş), and bill photos and PDFs, which sit in Shelby's private file store and need its `BLOB_READ_WRITE_TOKEN` to copy.

## The previous owner's records

Shelby's open accounting period starts on 25 June 2026; what came before belongs to the previous owner and is hidden in Shelby too. The move starts from there by default. `--all` moves everything; the totals check then covers everything as well.

## The totals check

The check works the numbers out from Shelby's records the way Shelby means them, without going through the mapping, and from what Peni holds after the move:

- orders paid, voided and refunded;
- sales less refunds per month, and by cash and card;
- bills per month, and what's still owed on them;
- checks not cashed, loans per lender, the credit card;
- the drawer, the reserve and the bank now;
- each stock item now;
- pay earned and paid out per person (Peni pays per day to the kuruş, Shelby per week, so a few kuruş of rounding are allowed and marked);
- how many people, menu items, suppliers, stock items and bills.
