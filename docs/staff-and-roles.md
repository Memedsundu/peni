# Staff and roles

Plan piece 2. The rules live in `packages/core/src/staff.ts`; this page shows them.

## Roles

Peni keeps Shelby's four roles. Shelby's **admin** is Peni's **owner**.

| Role | Turkish | Who |
|---|---|---|
| Owner | Sahip | Runs the café. Always has every permission; nobody can take one away. |
| Manager | Müdür | Runs the café day to day: money, reports, the assistant. |
| Chef | Şef | Runs the kitchen side: stock, suppliers, recipes, shifts, hours and pay. |
| Barista | Barista | Works the till: orders, the cash drawer, bills, tasks. |

One person has one account and can work at several cafés with a different role at each (Leyla in the demo owns Moda and manages Kuzguncuk).

## What each role may do

Grouped like the café panel. ✓ is the default; each café's owner can switch any of these on or off for a role, except the ones marked 🔒, which stay as shown everywhere (as in Shelby). The owner column is left out because the owner has everything. **With PIN** marks what still works after a PIN sign-in at the till, for anyone whose role has it; everything else needs the password.

| Section | Permission | What it lets them do | Manager | Chef | Barista | With PIN |
|---|---|---|:-:|:-:|:-:|:-:|
| **Bugün** · Today | Sees Today <br>`today.view` | Low stock, bills due, cash differences and today's sales. | ✓ | ✓ | · | · |
| **Satış ekranı** · Till | Takes orders <br>`till.use` | Takes orders and records payments on the till. | ✓ | ✓ | ✓ | ✓ |
|  | Sees past orders <br>`till.history` | Today's and earlier orders. | ✓ | ✓ | ✓ | ✓ |
|  | Voids and refunds <br>`till.correct` | Voids an order or gives the money back. | ✓ | · | · | ✓ |
|  | Deletes orders <br>`till.delete` | Removes an order from the records entirely. A void is usually enough. | · | · | · | · |
| **Menü** · Menu | Edits the menu <br>`menu.edit` | Products, prices and categories. | ✓ | · | · | · |
|  | Edits recipes <br>`menu.recipes` | What goes into each product; stock is used from it. | ✓ | ✓ | · | · |
| **Faturalar** · Bills | Sees bills <br>`bills.view` | Bills and receipts received. | ✓ | ✓ | ✓ | · |
|  | Adds bills <br>`bills.add` | Photographs a receipt or bill and adds it. | ✓ | ✓ | ✓ | ✓ |
|  | Corrects and pays bills 🔒 <br>`bills.manage` | Corrects or deletes a bill, or marks it paid. | ✓ | · | · | · |
| **Tedarikçiler** · Suppliers | Sees suppliers <br>`suppliers.view` | Who you buy from, what you owe, their prices. | ✓ | ✓ | · | · |
|  | Edits suppliers <br>`suppliers.edit` | Adds suppliers and updates their details. | ✓ | ✓ | · | · |
| **Stok** · Stock | Sees stock <br>`stock.view` | Ingredients, counts and what is running low. | ✓ | ✓ | · | · |
|  | Counts and adjusts stock <br>`stock.edit` | Enters counts, records waste and deliveries. | ✓ | ✓ | · | · |
| **Nakit ve banka** · Cash and bank | Opens and closes the drawer <br>`cash.drawer` | The cash count at opening and closing. | ✓ | ✓ | ✓ | ✓ |
|  | Manages cash and bank 🔒 <br>`cash.manage` | Moves money between the drawer, reserve, bank and card. | ✓ | · | · | · |
| **Borçlar** · Debts | Sees debts <br>`debts.view` | Supplier debts, checks and loans. | ✓ | ✓ | · | · |
|  | Edits debts <br>`debts.edit` | Adds checks and debts, records payments. | ✓ | ✓ | · | · |
|  | Manages the credit card 🔒 <br>`debts.card` | Card spending and payments. | ✓ | · | · | · |
| **Vardiyalar** · Shifts | Sees shifts <br>`shifts.view` | Who works when. | ✓ | ✓ | ✓ | ✓ |
|  | Plans shifts <br>`shifts.edit` | Makes and changes the weekly plan. | ✓ | ✓ | · | · |
| **Puantaj ve maaş** · Hours and pay | Sees and corrects hours <br>`pay.hours` | Hours worked, and exporting them. | ✓ | ✓ | · | · |
|  | Records pay <br>`pay.payouts` | What each person was paid. | ✓ | ✓ | · | · |
|  | Closes the month <br>`pay.close` | Closes a pay month, or opens it again. | ✓ | · | · | · |
| **Görevler** · Tasks | Sees and does tasks <br>`tasks.view` | Opening, closing and cleaning checklists. | ✓ | ✓ | ✓ | ✓ |
|  | Edits task lists <br>`tasks.edit` | Makes the lists and chooses who gets them. | ✓ | ✓ | · | · |
| **Peni ve askı** · Peni and askı | Sees peni and askı numbers <br>`peni.view` | Peni given and spent, what is on the askı, members. | ✓ | · | · | · |
|  | Adds cash to the askı <br>`peni.till` | Records it when a guest leaves cash for the askı. | ✓ | ✓ | ✓ | ✓ |
| **Paylaşımlar** · Posts and events | Posts for the café <br>`posts.write` | Adds posts and events to the feed. | ✓ | · | · | · |
|  | Moderates the community <br>`posts.moderate` | Hides comments, handles reports, pauses a member if needed. | ✓ | · | · | · |
| **Raporlar** · Reports | Sees reports 🔒 <br>`reports.view` | Sales, costs and profit. | ✓ | · | · | · |
| **Asistan** · Assistant | Uses the assistant 🔒 <br>`assistant.use` | Asks about the café's numbers and has drafts prepared. | ✓ | · | · | · |
| **Ayarlar** · Settings | Sees the team <br>`team.view` | Who works here and in which role. | ✓ | ✓ | · | · |
|  | Manages the team 🔒 <br>`team.manage` | Adds people, changes their role, removes them. | · | · | · | · |
|  | Edits roles 🔒 <br>`roles.manage` | Changes the permissions on this screen. | · | · | · | · |
|  | Changes café settings <br>`settings.edit` | Café details, peni rate, askı rules. | · | · | · | · |
|  | Manages devices <br>`devices.manage` | The computers running the till and the customer screen. | · | · | · | · |

The four peni and community permissions (`peni.*`, `posts.*`) are new; Shelby had no peni or feed. Everything else carries over a Shelby permission, and a café's own Shelby settings move across with `overridesFromShelby`. Where several Shelby switches became one, the Peni switch is on only if all of them were, so nobody gains access at switch-over. Shelby's email checks and alert cron are not staff permissions in Peni.

## Rules that are not switches

- Only an owner can make someone an owner, or change or remove an owner. A café always keeps at least one owner.
- Taking someone off the team ends their access to that café only. Their other cafés and their past records stay.
- The owner can set a new password for someone who forgot theirs, but only if that person works nowhere the owner doesn't also own. This stops one café from taking over another café's staff.
- Adding an email that already has an account puts that account on the team with its own password; the password the owner typed is ignored.

## Sign-in

Email and password everywhere, separate from the customer app's sign-in. See [architecture](architecture.md#auth).

## At the till

1. An owner sets the café's computer up as a till once, signed in with their password (Ayarlar, devices). The computer keeps a device token for a year.
2. Each person sets their own PIN, signed in with their password. A PIN is 4 to 6 digits; runs and repeats such as 1234 or 1111 are refused.
3. On the till, people tap their name and type their PIN. The sign-in lasts a shift (12 hours), works only on that computer and at that café, and opens only the **With PIN** permissions above. "Kilitle" signs them out.

Every 5 wrong PINs in a row pause that PIN for 15 minutes; after 20 the PIN is cleared and its owner sets a new one. A four-digit PIN therefore gets at most 20 guesses. An owner can clear someone's PIN from the team list, and revoking a lost or replaced computer signs out everyone on it at once.
