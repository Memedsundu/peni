# Shelby integration

Shelby is the café's back office: till, stock, expenses, payroll, reports. Peni is the customer-facing product. They're separate codebases, and this document is the contract between them.

> **Source note.** What this document says about Shelby's internals comes from the Shelby customer-app design doc (`docs/engineering/musteri-uygulamasi-tasarim.md` in `shelby-app`, 17 Sept 2026). It was written without access to Shelby's code from this repository. Check the file and function names below against Shelby before building.

## Principle: an app order is an ordinary Shelby order

Peni creates the order in Shelby as a normal `Order` with `status = "pending"` and `OrderItem` rows, plus a few extra fields. When the guest pays, the cashier runs the existing `POST /api/payment` flow unchanged:

- stock is deducted
- the cash ledger is posted (`postOrderSale`)
- COGS and the accounting period are handled as today

**No money or stock logic changes in Shelby.** What's new is:

1. a small partner API Peni calls
2. a webhook Shelby sends to Peni
3. two kinds of discount on an order: peni and askı

## 1. Partner API (Shelby implements, Peni calls)

Base: `{SHELBY_BASE_URL}/api/partner/peni/v1`. Auth: `Authorization: Bearer {SHELBY_SERVICE_TOKEN}`.

This is server to server only. It's the first route in Shelby that doesn't use the browser cookie (`getCafeId()`), so it needs its own token check and rate limit.

| Method & path | Returns | Notes |
|---|---|---|
| `GET /cafes/{cafeId}/menu` | `{ items: MenuItem[] }` | `productId` = Shelby product id. `priceKurus` is an integer. `available=false` for items out of stock |
| `GET /cafes/{cafeId}/status` | `{ acceptingOrders: boolean }` | `true` only when a `CashSession` is open. Cash can't be taken with the drawer closed (`requireOpenDrawer`), so the app shouldn't take orders either |
| `POST /cafes/{cafeId}/orders` | `{ posOrderId, orderNumber }` | Body: `PendingOrderInput` (below). Creates `Order(status="pending")` + `OrderItem`s. **Idempotent on `peniOrderId`** |
| `POST /orders/{posOrderId}/cancel` | `{}` | Body: `{ reason }`. Cancels a pending order. Never touches a paid one |

```ts
// packages/core/src/pos/adapter.ts
interface PendingOrderInput {
  cafeId: string;              // Shelby café id
  peniOrderId: string;         // store on the Order; echo back in webhooks
  customerDisplayName: string;
  lines: { productId: string; quantity: number; unitPriceKurus: number; note?: string | null }[];
  customerNote: string | null;
  peniDiscountKurus: number;   // paid with the customer's peni
  askidaKurus: number;         // paid by the café's askı
  channel: "peni";
}
```

### What Shelby stores on `Order`

| Field | Purpose |
|---|---|
| `channel` (`"till" \| "peni"`) | Reports can split app orders from till orders |
| `peniOrderId` (unique, nullable) | Link back to Peni; idempotency |
| `loyaltyRedeemedAmount` (Decimal) | Peni discount. Lowers the amount due at the till |
| `askidaAmount` (Decimal) | Askı discount. Lowers the amount due at the till |

### When the total reaches 0

If peni and/or askı cover the whole order, it's paid with no cash. The order becomes `paid`, stock is deducted and COGS is computed as normal, **but no `MoneyMovement` is posted**: a zero-amount cash movement would only clutter the ledger. `paymentMethod = "loyalty"`.

This adds a third value to `ORDER_PAYMENT_METHODS` (`src/lib/orders.ts`, today `["cash", "card"]`). Before shipping, review the reports, `postOrderSale` and the refund flow for this value one by one.

## 2. Webhook (Shelby sends, Peni receives)

`POST {PENI_BASE_URL}/api/v1/integrations/shelby/webhook`

**Signature.** Header: `x-shelby-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with SHELBY_WEBHOOK_SECRET>`.

- Peni rejects a bad signature and anything older than 5 minutes.
- Reference implementations: `signShelbyWebhook` / `verifyShelbyWebhook` in `packages/core/src/pos/shelby.ts`.

```ts
type PosEvent =
  | { type: "order.paid"; posOrderId: string; peniOrderId: string | null;
      membershipHint: { membershipId: string } | null;   // walk-in: the member's scanned Peni code
      paidTotalKurus: number; paidAt: string }
  | { type: "order.refunded";  posOrderId: string; peniOrderId: string | null; refundedAt: string }
  | { type: "order.cancelled"; posOrderId: string; peniOrderId: string | null; cancelledAt: string };
```

- **Send it after the payment transaction commits** (outbox table + retry), never from inside the transaction.
- `paidTotalKurus` is **what the guest actually paid**: total minus peni minus askı. Peni earns on this.
- Peni processes every event idempotently, so retries are safe. Retry with backoff until you get a 2xx.
- **Walk-in orders:** when the cashier scans a member's Peni code at the till, send `order.paid` with `membershipHint` and `peniOrderId: null`. The member earns peni on a normal till order too. (Not phone digits: those aren't unique.)

## 3. Askı coffees paid in cash at the till

A guest pays for a "coffee on the askı". In Shelby, that's an ordinary sale of an "Askıda kahve" product, booked as revenue. Then:

- **v0.1:** staff record the askı credit in the Peni panel, as "Askıya ekle".
- **Later:** Shelby sends `askida.till_donation { cafeId, peni, posOrderId }` after the sale, so nobody has to enter it twice.

**Open accounting question.** This is cash received now for a product given later, to someone else. Ask the accountant whether it should be deferred revenue (see roadmap: legal and money).

## 4. Barista screen

Shelby's design planned an `/admin/app-orders` "Gelen Siparişler" screen. With Peni, that board lives in **Peni**:
- web: `/kafe/{slug}`
- phone: the "Kafe modu" tab

Shelby only needs to show app orders in its pending list, so the cashier can take payment. Optionally, it can link out to the Peni panel.

## 5. Linking a café

| Peni `Cafe` | Shelby `Cafe` |
|---|---|
| `posKind = "shelby"` | — |
| `shelbyCafeId` | `Cafe.id` |

The token and webhook secret are generated once per Peni installation and stored as environment variables on both sides: `SHELBY_*` in Peni, and `PENI_*` in Shelby.

## Shelby work, in order

1. `Order.channel`, `peniOrderId`, `loyaltyRedeemedAmount`, `askidaAmount` (migration)
2. Partner API auth (service token) + rate limit
3. `GET menu`, `GET status`, `POST orders`, `POST cancel`
4. Payment flow: subtract the peni and askı amounts from the amount due; `paymentMethod = "loyalty"` when the total is 0
5. Outbox + webhook sender for `order.paid` / `order.refunded` / `order.cancelled`
6. App orders visible in the till's pending list
7. *(later)* Scan the Peni code at the till for walk-ins; `askida.till_donation` event
