# Ingenico: what's ready, and what to ask for

Decision N12. D24 said the till takes cash and card by hand until Ingenico's protocol documents arrive. Everything around the device is now built and works end to end with a **practice yazarkasa**. One piece is left: the **Ingenico driver**, the part that turns Penny's jobs into the device's own messages. Only Ingenico's documents can tell us how to write it.

Shelby's `IngenicoECR.ts` isn't reused. It guessed a message format, its own comment says the real protocol has to come from Ingenico, and it never ran against a device.

## How it works

```
Till screen (Chrome on the café PC)  ⇄  Penny (Vercel)  ⇄  Penny Köprü (on the café PC)  ⇄  Ingenico
```

- **Why a program on the PC.** Penny runs in the cloud and can't reach a device inside the café. Penny Köprü reaches out to Penny over the internet, the same way the browser does, so nothing has to be opened on the café's router.
- **A sale.** The barista taps Kart or Nakit. Penny makes a job holding the whole fiscal receipt: each line with its KDV and the device's department number, the till's discount, and pennies or askı. Penny Köprü picks the job up within a second. The device charges the card or takes the cash and prints the receipt. Penny Köprü says what happened, and the till shows "Ödendi" with the receipt number. Each step shows on the till as it happens: "Kartı okutun", "Müşteri şifresini giriyor", "Banka onayı bekleniyor", "Fiş yazdırılıyor".
- **Never twice, never lost.** Penny Köprü writes every job to a diary on the PC's disk before the device sees it, and keeps every answer there until Penny has it. After a power cut it asks the device what happened instead of charging again. Penny never sends a job that has waited more than 90 seconds, so a card payment can't pop up on the device minutes later.
- **When the device goes quiet** mid-payment, the till asks the barista what the device printed: "Ödeme alındı" or "Ödeme alınmadı". If the device later answers differently, Penny keeps that answer beside the job for someone to look at.
- **Backing out** asks the device to stop. The till waits for its answer, because the card may already have gone through.
- **When the yazarkasa isn't answering**, the till works as it does today: payments are taken by hand. The header says so in red. The Cihazlar page counts the day's sales taken by hand, so they can be rung up on the device.

## What's built

- **KDV on every product** (Menü: %10, %1, %20 or %0; %10 unless set) and on every order line. Products moved from Shelby start at %10, because Shelby saved every product's KDV as 0.
- **Cihazlar** (owner, İşletme plan) lists the till computers. For each one:
  - "Yazarkasa bağla" makes a one-time code that works for 15 minutes.
  - Once connected: its status, switching the yazarkasa off, the device's department number for each KDV rate, and whether pennies and askı show as a discount or a payment.
  - "Deneme fişi", "X raporu" and "Z raporu".
  - Removing a computer.
- **Till**:
  - the yazarkasa's status in the header;
  - each step of a payment, as the device goes through it;
  - backing out waits for the device to stop;
  - the "what did it print?" question when the device goes quiet;
  - X and Z reports in the Kasa view, at the end of the day.
- **The Z report from the device** lands in Taslaklar as a Z check beside Penny's own day, using the same screen as a Z report photo. The draft notes that the device sent it.
- **Penny Köprü** (`apps/till-bridge`): one file for Node.js, plus two Windows start files. It comes with the practice yazarkasa and a placeholder for Ingenico. Install steps are in [its README](../apps/till-bridge/README.md).
- **Tests**:
  - Penny's job list against a pretend bridge (13 tests);
  - the receipt builder (7), including that a receipt always adds up to what the device takes;
  - Penny Köprü against a pretend Penny (7), including a power cut mid-payment;
  - the database tables (2).
- **Checked in a browser** on a local copy: connecting with a code, a test slip, a card sale (₺120, fiş 0001), backing out while the device waited for the card, a Z report, and its check in Taslaklar.

## What to ask Ingenico in the application

1. **The device.** Which model is at Shelby Cafe, and its software version? Does one device both print the receipt and charge cards (a Yeni Nesil ÖKC with the bank's POS inside), or are they two?
2. **How a PC program connects.** Over the café's network (TCP/IP, which address and port), a USB or serial cable, or a Windows library (DLL)? Is it GİB's GMP-3 external system integration ("harici sistem / ECR entegrasyonu")?
3. **What Penny needs to be allowed to connect.** The documents, a test device or test mode, and any approval or certification Penny Köprü needs before it runs in a real café. Is there a cost or contract, and how long does it take?
4. **Pairing.** How a computer is paired with the device (eşleşme), and whether that has to be redone after a restart or an update.
5. **Receipt lines.** Are items sent by department or by product code (PLU)? How long can an item's name be? Can each line have its own discount, and the whole receipt a discount on its subtotal?
6. **Payment types.** Which exist (nakit, kredi kartı, yemek kartı, puan, hediye çeki, diğer), and can one receipt take more than one: pennies plus card, say?
7. **Card payments.** Does the device handle the bank itself, and with which banks? What comes back: approval code, RRN, last four digits? Can a payment be cancelled from the PC while the device waits for the card?
8. **Refunds and voids.** A refund (iade) and a same-day void (iptal) from the PC: how, and what the device needs from the original sale.
9. **After a power cut or a dropped connection.** Can the PC ask the device for its last transactions, so a payment is never taken twice?
10. **Reports.** X and Z reports from the PC, with the Z report's numbers (totals, cash, card, KDV) in the answer.
11. **Errors.** The list of error codes and what each means (paper out, not paired, busy).

## What to ask the mali müşavir

- **Pennies.** Penny prints them as a discount on the receipt, since they're the café's own loyalty. Is that right, or should they print as a payment ("puan")?
- **The askı.** The guest who hangs a coffee pays real money, and that sale is printed on their receipt then. When the coffee is given out, Penny prints it as a 100% discount, so it isn't counted as takings twice. Is that right?
- **Cash left for the askı** with no product (Kasa's "Askıya nakit"): should it get a receipt when it's left?
- **KDV.** %10 for food and drink served at the café. Does anything Shelby Cafe sells take another rate?

## When the documents arrive

1. Write the Ingenico driver, `apps/till-bridge/src/drivers/ingenico.ts`. The file lists what each part must do. Nothing else in Penny changes.
2. Try every case on the test device: approved, declined, paper out, backing out, a power cut mid-payment, a refund, X, Z.
3. Switch refunds on in the driver, so they go through the device too. Until then a refund is done on the device by hand, as today.
4. Pilot at Shelby Cafe on one computer, and check the Z report against Penny in Taslaklar every day for the first weeks.

## Trying it now

On your Mac, with the local database:

1. Open the panel's Cihazlar page and tap "Yazarkasa bağla".
2. From the project folder, connect and start Penny Köprü with that code:

   ```sh
   pnpm --filter @peni/till-bridge build
   node apps/till-bridge/dist/penny-kopru.mjs bagla KOD --sunucu http://localhost:3010
   node apps/till-bridge/dist/penny-kopru.mjs calistir --sunucu http://localhost:3010
   ```

3. Take a payment at `/kasa`. The practice yazarkasa prints its slips in that window, and keeps them in its own folder (`penny-kopru durum` shows where).

On staging it's the same, with `--sunucu https://peni-staging.vercel.app`, once this is merged.

The practice yazarkasa misbehaves on purpose for some amounts. A discount on the till gets you there:

- an amount ending in **,13**: the bank says no;
- ending in **,66**: paper out;
- ending in **,99**: the device goes quiet, and the till asks what it printed.

**Running cost:** while Penny Köprü runs it checks in with Penny about every 20 seconds, and waits up to 20 seconds each time for work. That keeps the database from pausing, which matters only on Neon's free plan. Production moves to the paid plan before switch day anyway.
