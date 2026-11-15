# Moving Shelby into Peni

Plan piece 33. One command reads a café from Shelby's database, writes it into Peni and checks the totals on both sides. Shelby is only read, in one read-only transaction, so every table comes from the same moment. Penny is written in one transaction too: a move that fails part way leaves Penny as it was.

## Running it

```sh
# Dry run: reads Shelby, moves into memory, checks. Writes nothing anywhere.
SHELBY_DATABASE_URL="postgres://…" pnpm --filter @peni/web shelby-move --report move.md

# The move: into Peni's database.
SHELBY_DATABASE_URL="postgres://…" DATABASE_URL="postgres://…" pnpm --filter @peni/web shelby-move --write --report move.md
```

- `--cafe <id>`: the Shelby café, when Shelby has more than one (it lists them). Shelby's database has two: **Shelby Sokak** (`cmm9b62yt000004l252c4nooo`), the real café, and an almost empty "shelby sokak" (`cmw7itv4g000004gz8199i0gm`: one person, five menu categories, nothing else).
- `--slug <slug>`: the Peni café's address, `shelby` by default (`/kafe/shelby`). Its id is `cafe_<slug>`.
- `--all`: also the previous owner's records (see below).
- `--now <ISO time>`: the moment of the move, for rehearsals.
- `--rehearsal`: lets `--write` run while Shelby isn't frozen. Only for a copy; the real move refuses to run until `shelby-freeze --on` (see [switch-day.md](switch-day.md)).
- `--replace`: when Penny already has the café, delete it and everything in it, then move again (see "The preview copy" below). Without it, the move only writes into an empty café.
- `--discard-penny-records`: with `--replace`, go ahead even when people made records in Penny's copy. Without it, `--replace` refuses and lists them.
- It exits with 1 when a total doesn't match, and 2 on an error (a refusal included).

Staff whose email already has a Peni account keep that account and join the café.

## Rehearsing

1. Make a Neon branch of Shelby's production database (or a copy), and a fresh Peni database with `pnpm --filter @peni/db migrate:deploy`.
2. Run the dry run, then `--write --rehearsal` into the fresh database.
3. Read the report: every total should say ✓, and "Not moved" and "To look at" should hold no surprises.
4. Start Peni on that database and sign in with a Shelby email and password.

The rehearsal for this piece used Shelby's demo data plus rows for the money, a Kasa session, a loan, the credit card, tasks and an older period: every total matched, and the pages read right.

On 15 November 2026 it ran on Shelby Sokak's real data, read straight from Shelby's production database (read only): a dry run, a move into a fresh local database, and `--replace` into the same database. All three ended "Every total matches." with 14 people, 93 menu items, 37 stock items, 8 suppliers, 164 bills and 10,556 orders; after `--replace` every table held exactly as many rows as after the first move. The move sent the database about 2,700 commands in one transaction and took 30 to 40 seconds on this Mac, most of it reading Shelby; over the internet to Neon each command waits for the answer, so count on a minute or two more.

## The preview copy

Shelby Cafe can be in Penny's production database while the café still works on Shelby: a **preview copy**, for looking around and showing the team. It is one way: Shelby is only read, and nothing goes back. To bring it up to date, move again with `--replace`:

```sh
SHELBY_DATABASE_URL="<Shelby production>" DATABASE_URL="<Penny production>" \
  pnpm --filter @peni/web shelby-move --cafe cmm9b62yt000004l252c4nooo --write --rehearsal --replace --report ~/shelby-preview.md
```

The same command makes the first copy (there is nothing to replace yet) and every refresh. `--rehearsal` is needed because Shelby isn't frozen; the report holds real business data, so keep it out of the repo.

What a refresh does, in one transaction (if anything fails, the copy stays as it was):

- **Deletes the café and everything in it**: orders, payments, bills, stock, shifts, hours, tasks, the team's places in the café, customers who joined it, posts, till computers, and the café's settings and page.
- **Staff accounts**: an account whose only café was this one is deleted with it and made again from Shelby, with Shelby's name, email and password as they are now. An account that also works at another café is kept as it is and joins the café again.
- **Moves Shelby again**, as it is at that moment, and checks the totals.

**Anything entered in Penny for that café is lost at the next refresh.** A till PIN set in Penny, a password changed in Penny, a product's price or KDV changed in Penny: all go back to Shelby's (or to nothing, for a PIN). So that work done in Penny isn't lost without anyone noticing, `--replace` first looks for records made in Penny and refuses with a list of them, like this:

```
Penny's Shelby Sokak (shelby) has records that weren't moved from Shelby:
  - till orders: 1
  - till payments and refunds: 1
Replacing the café would delete them. Add --discard-penny-records to delete them anyway.
```

Add `--discard-penny-records` to delete them anyway. What it can see: every record the move writes has an id starting with `shelby_`, and Penny's own never do. So it finds anything **added** in Penny: till orders and payments, Kasa sessions and cash in or out, bills and bill payments, suppliers, checks, loans and repayments, card payments, Nakit ve banka movements, month closes, menu items and categories, stock items and every stock change (counts, waste, sales), people added to the team, role permission changes, till computers, shifts, pay rates, payouts and pay closes, task lists and tasks, posts, customers who joined, gifts, yazarkasa bridges and peni movements. Where a moved record keeps when it last changed, it also finds **changes** made after the move: bills changed or voided, shifts, days worked, task lists and tasks ticked.

What it can't see: changes to moved records that keep no time of change. A menu item's price, name or KDV, a stock item's name or minimum, a supplier's details, a person's role, PIN or password, the café's settings and page. Those are lost at a refresh without a warning.

**Pennies and the askı are off in the copy.** The peni ledger is append-only: the database refuses to delete any of it. If anyone earned or spent a penny, gave to the askı or sent a gift at the copy, the café could never be replaced again, not even with `--discard-penny-records`, and switch night couldn't replace it either. So a move with `--rehearsal` (and its dry run) saves the café with pennies and the askı switched off, and the report says "Pennies and the askı are off in this copy". With them off, nothing at the copy reaches the ledger: a paid till order gives no penny code, an ödeme kodu pays nothing, the penny screen answers "Bu kafede penny şu an kapalı", "Askıya nakit", "Askıdan ver" and "Askıya bırak" are refused, and customers can't take a code, send a gift or give to the askı. No screen in Penny switches them back on today (only the demo's sample data and this move write them); don't switch them on in the database for the copy, for the reason above. The real move on switch night, without `--rehearsal`, saves them on.

**The team can try Penny at the copy**, the panel and the till: sign in with their Shelby email and password, open the drawer, sell. A sale on a day that already has orders from Shelby takes the next number after Shelby's last one that day. Everything they enter is a record made in Penny: the next refresh lists it and needs `--discard-penny-records` to go ahead, which deletes it. That's expected for practice sales; read the list before adding the flag.

## When Shelby's drawer is open

The real move needs Shelby's drawer closed (the freeze refuses otherwise), and Penny's drawer starts at the closing count. A preview copy is taken while the café works, so the drawer is often open: Penny opens the same Kasa session, with its opening count, the sales since, and every other cash Shelby put in or took out of the drawer since it opened (a transfer to the bank, a bill paid from the drawer) as the session's cash in and out. So the drawer reads as in Shelby.

## What becomes what

| Shelby | Peni |
|---|---|
| Users | Team. Same email and password (bcrypt is the same); admin becomes owner. |
| Role permissions | Not moved: each role starts with Peni's defaults, to review in Ayarlar → Ekip. |
| Categories, products | Menü. Inactive products stay, unavailable. |
| Stock items | Stok, in kg, l or adet (g and ml are converted; pcs, slice and anything else are adet). Today's amounts are counted in as the start; below zero starts at zero, and above Penny's most (1,000,000) starts at the most. Shelby Sokak has two items at 9,999,992 and 9,999,996 adet, a stand-in for "plenty". |
| Product ingredients | Recipes. A product sold straight from stock ("direct") is a recipe of one. |
| Orders paid, voided, refunded | Orders and till payments, numbered per day; each day's counter is left at its last number, so Penny's till carries on after it. Shelby's total is kept even when a line was lost to a deleted product. Pending orders were never paid and stay. |
| Expenses, deliveries | Bills, with a delivery's lines as stock lines. Shelby's weekly wage bills are left out: Peni keeps that pay as hours and payouts. |
| Expense payments | Bill payments: cash, card, bank, check, the café's card (credit) or a loan. Older bills marked paid without a payment get one on their own date. |
| Checks | Checks, cashed or not. |
| Borrowed money, repayments | Loans and repayments, per lender. |
| Credit card | Card settings and payments. |
| Money accounts | Nakit ve banka starts on the day of the move with Shelby's balances: the safe is the reserve. The drawer is the last Kasa count. |
| Kasa sessions | Kasa sessions with their counts. A drawer still open in Shelby also gets the cash put in or taken out since it opened. |
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
- each stock item now (below zero as zero and above Penny's most as the most, as moved);
- pay earned and paid out per person (Peni pays per day to the kuruş, Shelby per week, so a few kuruş of rounding are allowed and marked);
- how many people, menu items, suppliers, stock items and bills.
