# Peni & askı — the rules

Everything here is implemented in `packages/core` (`peni-service.ts`, `rules.ts`, `ledger.ts`) and covered by `packages/core/test`. If this document and the tests disagree, the tests are right and this document needs fixing.

## Units

- **Money** is in kuruş (integers): 120,00 TL = `12000`.
- **Peni** is a whole number. At the café that issued it, 1 peni is worth 1 TL.
- Peni is **per café**. A customer's peni at Moda Kahvesi can only be spent at Moda Kahvesi, gifted to Moda members, or left on Moda's askı. Nothing moves between cafés, so cafés never have to settle money with each other.

## The ledger

Every peni movement is one **double-entry transaction**: its entries sum to zero. Nothing is edited or deleted; mistakes are fixed with a reversing transaction.

| Account | What it is | Can go negative? |
|---|---|---|
| `member:<membershipId>` | A customer's wallet at one café | No |
| `askida:<cafeId>` | The café's open askı | No |
| `gift_escrow:<cafeId>` | Gifts sent but not yet accepted | No |
| `issuance:<cafeId>` | Where earned and café-matched peni come from | Yes (shows total issued) |
| `redemption:<cafeId>` | Where spent peni go | Yes |
| `till_donation:<cafeId>` | Askı coffees paid in cash at the till | Yes |

The database enforces these rules even if the application has a bug (`packages/db/prisma/migrations/…_init`):

- UPDATE and DELETE on the ledger are rejected by trigger.
- A transaction that doesn't balance fails at COMMIT.
- A wallet, the askı or the escrow can never go below zero.

Every operation carries an **idempotency key**, so a retried request or a webhook delivered twice is applied once.

| Movement | From → To | Key |
|---|---|---|
| Earn | issuance → member | `earn:<orderId>` |
| Spend on an order | member → redemption | `redeem:<orderId>` |
| Gift sent | member → gift_escrow | `gift:<clientKey>` |
| Gift accepted | gift_escrow → recipient | `gift_resolve:<giftId>` |
| Gift declined / expired | gift_escrow → sender | `gift_resolve:<giftId>` |
| Askı donation | member → askida | `askida_donate:<clientKey>` |
| Café matching | issuance → askida | `askida_match:<donationTxId>` |
| Cash at the till | till_donation → askida | `askida_till:<clientKey>` |
| Taken from the askı | askida → redemption | `askida_claim:<orderId>` |
| Correction | the exact opposite | `reversal:<txId>` |

## Earning

- Earned when an order is **paid at the till**, at the café's rate (`earnRateBps`, default 5 %), and **rounded down** to whole peni.
- It's earned **only on the money actually paid**. The part covered by peni or by the askı earns nothing.
- Blocked members earn nothing.
- Walk-in orders that weren't placed in the app earn too, if the till scans the member's Peni code (`membershipHint` in the Shelby webhook).

## Spending

- The customer chooses how much to use. The server caps it at the smallest of:
  - their balance
  - the eligible items (`redeemableProductIds`, default: all)
  - the café's maximum share of an order (`maxRedeemShareBps`, default 100 %)
- Peni is **reserved when the order is submitted**. If the order is rejected, cancelled or a no-show, the peni goes back to the wallet.
- If the order total reaches 0, Shelby records it as paid with payment method `loyalty` and posts no cash movement (see the Shelby doc).

## Gifts (*ısmarlama*)

- Only to a member of the **same café**, and never to yourself.
- Held in escrow until the recipient **accepts**. Declined, cancelled by the sender, or not accepted within `giftExpiryHours` (24 h) → it returns to the sender.
- Daily limit per sender: `dailyGiftLimitPeni` (200), counted per **local day** in the café's time zone.

## Askıda kahve

The askı is a shared pool owned by no one: a modern *askıda kahve*.

**Filling it**

- **Members** leave peni (`donateToAskida`). They choose whether their name appears on the askı wall (default: no).
- **The till**: a guest pays cash for an askı coffee and staff record it in the panel (`recordTillDonation`). In Shelby this is an ordinary sale; Peni only records the askı credit.
- **The café** can add a matching share on top of member donations (`askidaMatchBps`, e.g. 50 %), up to a monthly cap (`askidaMatchMonthlyCapPeni`).

**Taking from it**

- Only items the café put on the askı (`askidaProductIds`), usually tea, filter coffee or a simit.
- One item per order. The pool pays the item's full price (rounded up to whole peni); the member's own wallet isn't touched.
- Limits:
  - `askidaClaimsPerDay` per member (default 1), per local day
  - an optional minimum membership age (`askidaMinMembershipDays`)
  - blocked members can't take from it
- If the order is rejected or cancelled, the item goes back to the askı and doesn't count against the daily limit.

**Who sees what**

- The askı wall shows donations (with a name only if the donor chose that), till donations, café matching, and "someone took a tea".
- **Takers are never named**: not on the wall, not in the API, not in reports. Staff see an "askı" tag on the order line, because they need it to ring it up.

## Pickups & no-shows

- Stock is deducted in Shelby when the order is paid, so a no-show means the café made the drink for nothing. The barista taps **Gelmedi**, the reserved peni and askı item are released, and the member gets a strike.
- After `noShowStrikeLimit` (2) consecutive no-shows, **pre-ordering turns off** for that member at that café. A collected order resets the count. Staff can switch pre-ordering back on.

## Refunds

When a paid order is refunded at the till:

- Peni spent on it goes back to the wallet.
- An askı item goes back to the askı.
- Earned peni is **taken back as far as the wallet still holds it**. Any shortfall (e.g. the member already gave it away) is written to the reversal's `meta.shortfallPeni` rather than pushing the wallet negative.

## What the café sees

There's no expense line: the ingredients were already expensed when the supplier invoice was paid. Instead, the panel reports for the period:

- peni issued and spent
- askı inflow by source (members, till, café matching)
- askı items given out
- **outstanding peni**: everything issued and not yet spent (wallets + askı + pending gifts). This is what the café still owes in products, and it's the number to watch when setting the earn rate.
