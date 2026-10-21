# Launch readiness

Plan piece 34. What is built, and what only the owner can do before Peni opens to the public.

## Built

- **Welcome page** at `/`: the headline, what Peni is, the cafés on Peni, "Kafen mi var?" with the panel link, and the store buttons once `NEXT_PUBLIC_APP_STORE_URL` and `NEXT_PUBLIC_PLAY_STORE_URL` are set.
- **Gizlilik** at `/gizlilik` (KVKK aydınlatma metni and privacy notice) and **Kullanım koşulları** at `/kosullar`, in Turkish and English (`?lang=en`). The text is in `apps/web/src/app/legal/text.ts`.
- **Hesabım** at `/hesap`: sign in with an email code, see your peni at each café, download your data as JSON, delete your account. This is also the account deletion link the Play Store asks for.
- **In the app**, under Ben: "Verilerimi indir" (opens Hesabım), "Hesabımı sil" (in the app itself, as Apple asks), and the privacy and terms pages.
- **Deleting an account** wipes the name, email, phone, photo, sign-ins, devices and email codes, signs the person out everywhere, frees their place at events still to come and takes down events they opened that haven't happened. Peni history stays in the cafés' books as "Silinmiş üye". The same email can sign up again as a new person.
- **Health check** at `/api/v1/health`: 200 with `{ ok: true, database: "ok" }`, or 503 when the database doesn't answer.
- **Store builds**: `apps/mobile/eas.json` (preview and production profiles, version numbers kept by EAS), `ITSAppUsesNonExemptEncryption: false`, an iOS privacy manifest, Android with the camera permission only.

## KVKK: before opening

1. **Company details.** Set `PENI_LEGAL_NAME` (the company's title), `PENI_LEGAL_ADDRESS` and `PENI_CONTACT_EMAIL` in Vercel. The privacy and terms pages show them as the data controller and the address for requests; without them they say "Peni" and point to the in-app tools.
2. **A lawyer reads the two texts.** They are written in plain words from what the code does, and haven't been reviewed.
3. **Transfers abroad (KVKK m. 9).** Vercel, Neon, Resend, Anthropic and OpenAI are US companies (Peni's servers and database are in Frankfurt, which is still abroad for KVKK). Since the 2024 change the usual basis is the Board's standard contract signed with each provider, notified to the Board within five working days. Explicit consent is the other route. Decide which, and sign or collect it, before real customers sign up.
4. **VERBİS.** Check whether the company must register (it depends on staff count and yearly turnover, or on processing special categories, which Peni doesn't).
5. **Cafés as controllers.** Each café keeps its own staff, sales and bill records in Peni; a short data processing agreement with each café (Peni processes on the café's behalf) belongs in the café sign-up.

## App Store and Google Play

Owner's steps:

1. Apple Developer Program and Google Play Console accounts in the company's name.
2. `npx eas login`, then in `apps/mobile`: `npx eas init` (creates and links the Expo project `penny`). The server addresses for preview and production builds are already in `apps/mobile/eas.json`; update production's when the custom domain arrives.
3. Google and Apple sign-in, for the store id `app.penny`: the iOS, Android (with the app's signing fingerprint from EAS) and web client ids into `GOOGLE_CLIENT_IDS` on the server and the `EXPO_PUBLIC_GOOGLE_*` values for the app; `APPLE_CLIENT_IDS=app.penny` on the server. Then try Google sign-in on a real phone: returning from Google to the app may need one more setting once the real ids exist.
4. `npx eas build --profile production --platform all`, then `npx eas submit`.
5. In App Store Connect and Play Console: the listing below, the screenshots, the privacy answers below, the privacy URL `/gizlilik`, the deletion URL `/hesap`, and a demo account for the reviewers (an email they can receive codes at, or a test café).

Listing (Turkish first):

- **Name:** Penny
- **Subtitle:** Mahalle kafende penny biriktir / Collect pennies at your local café
- **Description (TR):** Kahveni aldığın kafede penny biriktir, harca, bir arkadaşına ısmarla, askıya bırak. Kasadaki QR'ı okut, penny hesabına geçsin; bir sonraki siparişte ödeme kodunu göster. Kafenin akışını takip et, masasına otur, etkinliklerine katıl. 1 penny, o kafede 1 TL değerindedir.
- **Description (EN):** Collect pennies at the café you buy your coffee from, spend them, treat a friend, leave some on the askı. Scan the QR at the till and the pennies are yours; show your payment code next time. Follow the café's feed, pull up a chair at its table, join its events. 1 penny is worth ₺1 at that café.
- **Category:** Food & Drink (Lifestyle second)

Privacy answers (App Store "nutrition label" and Play "data safety"): collected and linked to the person, not used for tracking, not sold: name, email address, phone number (optional), user content (posts, comments), purchase history (peni earned and spent at cafés), device id (push token). Data is encrypted in transit; people can delete their account in the app and at `/hesap`.

## Monitoring

- **Uptime:** point an uptime monitor (Better Stack, UptimeRobot or Vercel's) at `/api/v1/health` every minute, alerting by email or phone after two failures.
- **Errors:** unexpected errors are written to the server log (`console.error`) with their stack; Vercel keeps them under the project's Logs. Turn on a log drain or Vercel's error alerts to be told.
- **The morning job:** Vercel Cron calls `/api/v1/cron/daily` at 05:00 UTC (08:00 in Istanbul) with `CRON_SECRET`; Vercel shows each run under Cron Jobs. A missed morning shows as no Bugün email.
- **Database:** Neon's console shows connections and storage; turn on its point-in-time restore before switch day.
