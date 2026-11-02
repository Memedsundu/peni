# Penny Köprü

The small program on a café's till computer that connects its yazarkasa to Penny (decision N12, [docs/ingenico.md](../../docs/ingenico.md)). It asks Penny for work, hands each job to the device, and tells Penny what the device did. It only ever calls out to Penny, so nothing has to be opened on the café's router.

## On the café's Windows PC

1. Install **Node.js** (the LTS version) from https://nodejs.org.
2. Make a folder, for example `C:\PennyKopru`, and copy three files into it:
   - `dist/penny-kopru.mjs` (made with `pnpm --filter @peni/till-bridge build`)
   - `windows/Penny Kopru.bat`
   - `windows/Otomatik baslat.bat`
3. In Penny's panel, open **Cihazlar**, find this computer, and tap **Yazarkasa bağla**. A code like `T4NZ-87EJ` appears. It works once, for 15 minutes.
4. Double-click **Penny Kopru.bat** and type the code. It says "Bağlandı: … · …" and starts waiting for work. The Cihazlar page changes to "Bağlı" by itself.
5. Double-click **Otomatik baslat.bat** once, so Penny Köprü starts whenever Windows does.

Leave its window open (it can be minimised). While it runs, cash and card sales on this computer's till go through the yazarkasa. When it isn't running, the till says so in red and payments are taken by hand, as before.

## Commands

```
penny-kopru                    Runs if connected; otherwise asks for the code from the Cihazlar page.
penny-kopru bagla KOD          Connects this computer with the code.
penny-kopru calistir           Waits for work from Penny and passes it to the yazarkasa.
penny-kopru durum              Shows the connection, the yazarkasa, and where its files are.
penny-kopru surucu deneme      Uses the practice yazarkasa (the default).
penny-kopru surucu ingenico --ip 192.168.1.25 --port 7777
                               Uses the Ingenico (works once its driver is written).
--sunucu ADRES                 Penny's address; production unless given.
```

The English words work too: `pair`, `run`, `status`, `driver`.

## Where it keeps things

On Windows, `%APPDATA%\PennyKopru`; elsewhere, `~/.penny-kopru` (`PENNY_KOPRU_HOME` changes it):

- `config.json`: Penny's address and this bridge's token. Removing the computer, or "Yazarkasa bağlantısını kaldır" on the Cihazlar page, stops the token working.
- `journal.jsonl`: every job sent to the device and its answer, until Penny has it. Don't delete it while a payment is in progress.
- `simulator.json` and `receipts/`: the practice yazarkasa's numbers and the slips it "printed".

## The practice yazarkasa

It behaves like a device: it waits for the card, the PIN and the bank, prints slips in the window and in `receipts/`, counts receipt and Z numbers, and adds up the day for the Z report. Nothing it prints is fiscal. Some amounts misbehave on purpose:

- ending in **,13**: the bank says no;
- ending in **,66**: paper out;
- ending in **,99**: it goes quiet for 45 seconds, and the till asks what it printed.

## Writing a driver

A driver is one file in `src/drivers`, implementing `TerminalDriver` (`src/drivers/types.ts`): `status`, `run` and `recover`. Everything else (Penny, the journal, retries, the barista backing out) is the same for every device. `src/drivers/ingenico.ts` lists what the Ingenico one has to do once its documents arrive.

```sh
pnpm --filter @peni/till-bridge test
pnpm --filter @peni/till-bridge start -- calistir --sunucu http://localhost:3010
```
