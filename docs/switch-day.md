# Switch day: Shelby to Peni

Plan piece 35. Shelby Cafe moves to Peni in one go, after closing time: Shelby stops taking money, its records move, the totals are checked, and the next morning the café opens on Peni. If a total doesn't match, Peni doesn't open and Shelby carries on as before.

The commands are in `apps/web` (`pnpm --filter @peni/web …`). `shelby-move` is explained in [shelby-move.md](shelby-move.md); what has to be ready before the public opening is in [launch.md](launch.md).

## In the week before

1. **Production Peni.** Its database, Vercel project and `DATABASE_URL`, `DIRECT_URL`, `PENI_DEMO=0` and `CRON_SECRET` are set up already ([environments.md](environments.md)). Still to add in Vercel's production settings: `PENI_PUBLIC_URL`, `RESEND_API_KEY` with `EMAIL_FROM`, and whichever of `OPENAI_API_KEY`, `GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS` and the inbox settings are ready. Deploy, and check `/api/v1/health`.
2. **Rehearse on real data.** Make a Neon branch of Shelby's production database, and a throwaway Peni database. Run:

   ```sh
   SHELBY_DATABASE_URL=<branch> pnpm --filter @peni/web shelby-move --report dry.md
   SHELBY_DATABASE_URL=<branch> DATABASE_URL=<throwaway> pnpm --filter @peni/web shelby-move --write --rehearsal --report rehearsal.md
   ```

   Every total should say ✓. Read "Not moved" and "To look at". Start Peni on the throwaway database and sign in with your Shelby email and password: Bugün, Faturalar, Borçlar, Nakit ve banka, Stok, Vardiyalar, Puantaj and Görevler should read as Shelby does. Repeat with a fresh branch until nothing surprises you.
3. **The team.** Everyone's Shelby email and password work in Peni. Show them the till (`/kasa`) and the panel on the throwaway copy. Each person signs in with their password and sets their own till PIN.
4. **The till computer.** It's set up after the real move, since the café only exists in Peni then: open `/kasa` on it and sign in once as the owner ("Bu bilgisayarı satış ekranı yap"). Card payments are typed in at the till until the Ingenico link exists.

## On the night

After the last customer:

1. **Close Shelby's drawer.** Count it and close it in Shelby (Kasa kapat). The count becomes Peni's drawer.
2. **Freeze Shelby.**

   ```sh
   SHELBY_DATABASE_URL=<production> pnpm --filter @peni/web shelby-freeze --on
   ```

   Shelby's own pause turns on: its database refuses every sale, payment and count, and its pages say a period change is under way. It refuses to freeze while the drawer is open.
3. **Keep a copy.** Make a Neon branch of Shelby's production database named for the day. It's the record of Shelby at the switch.
4. **Move.**

   ```sh
   SHELBY_DATABASE_URL=<production> DATABASE_URL=<Peni production> pnpm --filter @peni/web shelby-move --write --report switch.md
   ```

   It refuses to run while Shelby isn't frozen, and only writes into an empty café.
5. **Check.** The command ends with "Every total matches." and exits 0. Then sign in to Peni's panel as the owner and look at Nakit ve banka (the drawer, the reserve and the bank as Shelby showed them), Borçlar and Puantaj.
6. **Open Peni.** Set up the till computer (open `/kasa`, sign in once as the owner), and leave it on the Kasa screen. Point Shelby's address at Peni if you want old bookmarks to land there.

Shelby stays frozen from then on, as the read-only record of everything before the switch.

## If something doesn't match

- **Before Peni opened:** don't open it. Let Shelby take money again with `shelby-freeze --off`, and the café opens on Shelby in the morning. Make a fresh Peni database (the move only writes into an empty café), fix the cause, rehearse again, and pick another night.
- **After Peni opened:** Peni's records since the switch don't go back to Shelby. Note the difference, correct it in Peni (a bill, a correction in Nakit ve banka, a stock count) and say so in the month's close.

## The morning after

Open the drawer in Peni with the morning count. Bugün shows what's due today, the morning email goes out at 08:00 once `CRON_SECRET` is set, and Gözcü starts reading the money from the switch day on.
