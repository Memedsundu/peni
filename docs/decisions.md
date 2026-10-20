# Peni: decisions

Running record of what Mehmet and Claude decide while rethinking the app.
Started 2026-10-17. The existing v0.1 code (github.com/Memedsundu/peni) is a starting point, not a constraint.

## Starting point (v0.1, for reference)
- Two sides: customers (mobile + web) and cafés (web panel + "Kafe modu").
- Customer features: order ahead (pay at till), earn peni (café-specific loyalty, 1 peni = 1 TL), ısmarla (gift peni to a friend), askıda kahve (pay-it-forward), café feed (posts, günün sorusu, peni masası events).
- Optional Shelby POS integration; standalone mode otherwise.
- Stack: pnpm monorepo, Next.js web + API, Expo mobile, Postgres/Prisma, shared core rules package.

## Shelby today (read 2026-10-17 from github.com/Memedsundu/shelby-app, private)
- One Next.js 16 app (App Router), Prisma 7 on Postgres (Neon), NextAuth v5 email/password, Tailwind, deployed on Vercel with crons. npm, not pnpm.
- Already multi-tenant (`Cafe` with users, roles and permissions). About 50 data models.
- Covers: orders at the till, Ingenico POS terminal (card/cash fiscal receipts), products and recipes, stock and inventory, suppliers and purchase receipts, expenses, cash and card accounting, shifts, timesheets, payroll, task lists, alerts, reports, an AI assistant. Turkish and English.
- `shelby-local/`: the café's Windows PC runs a local copy so it can reach the Ingenico terminal on the café network; it uses the same cloud database.
- CI: unit, API and Playwright e2e tests on Postgres 16.
- No customer-facing screen in the code yet (searched for it).

## Decisions
- **D1 (2026-10-17) Audience:** built for cafés and customers equally; both sides matter from the first version.
- **D2 (2026-10-17) Core problem:** neighbourhood community around the café (feed, events, askı). Loyalty and ordering are secondary.
- **D3 (2026-10-17) Launch:** a real pilot with one café first.
- **D4 (2026-10-17) Community features in v1, all three:**
  - **Café feed:** the café admin posts freely, like on Instagram (not just a question of the day).
  - **Events:** no fixed "peni masası" table concept. Either the café admin or a customer can share an event (e.g. "I'll be reading this book here, join if you like"). Others can join.
  - **Askıda kahve:** kept.
- **D5 (2026-10-17) Money in v1:** no ordering from the app. Keep peni (1 peni = 1 TL, accumulated and spendable) and askı. Gifting peni is kept. Details to decide together.
- **D6 (2026-10-17) Platforms:** both web and mobile apps. Shelby already runs on the web today and will eventually be migrated into this app.
- **D7 (2026-10-17) Earning peni:** the customer orders and pays at the counter. The till's small customer-facing screen then shows a QR code for that sale; the customer scans it in the app to claim the peni. Fallback: the screen shows a short random code (e.g. 4577) the customer types in.
- **D8 (2026-10-17) Askı:** anyone can take, no limit, on trust.
- **D9 (2026-10-17) Shelby and the end state:** Shelby is Mehmet's own café management system, used today by Shelby Cafe (Mehmet's café, the pilot). The end state is one app, **Peni**, serving both café owners (the café/till side) and customers. Both sides deploy together, and Shelby is migrated into Peni.
- **D10 (2026-10-17) Cafés:** Shelby Cafe first, then other cafés join, each with its own peni, menu and staff.
- **D11 (2026-10-17) Peni rules:** each café sets its own earning rate; peni can pay any part of a bill.
- **D12 (2026-10-17) Shelby migration:** Mehmet is not fully happy with all of Shelby. Keep only selected parts and **rebuild them on Peni's current code** (not a wholesale move).
- **D13 (2026-10-17) Customer screen:** to be built. Hardware: the café PC has two screens, the main one where the barista enters orders, and a small customer-facing one (not activated yet). The small screen shows the current order together with the QR code (and short code) for earning peni.
- **D14 (2026-10-17) Customer sign-in:** Google, Apple, or any email account (no SMS). Replaces v0.1's phone + SMS login.
- **D15 (2026-10-17) Café side scope:** keep **all** Shelby parts (till, Ingenico, menu, recipes and stock, suppliers and purchase receipts, expenses and accounting, shifts and payroll, tasks and alerts, reports, AI, roles), rebuilt to be more user friendly.
- **D16 (2026-10-17) AI-assisted preliminary accounting (ön muhasebe):** new. Includes document scanning and data extraction; AI helps owners understand reports and can produce reports; anything AI makes better. Ideas proposed in [ai-ideas.md](ai-ideas.md), pending Mehmet's pick.
- **D17 (2026-10-17) Reports and charts:** use a better, cleaner visualisation library than Shelby's Recharts. Choice deferred to the design decisions.
- **D18 (2026-10-17) Data:** all of Shelby Cafe's data for the kept parts moves to Peni (products, history, stock, money).
- **D19 (2026-10-17) Switch-over:** one switch, once all kept parts are rebuilt. Shelby keeps running the café until then.
- **D20 (2026-10-17) AI scope:** all 17 ideas in ai-ideas.md are in scope, not only the suggested first set.
- **D21 (2026-10-17) AI may create records** as drafts the owner confirms. It never pays, deletes or changes money by itself.
- **D22 (2026-10-17) e-Fatura:** not needed for now.
- **D23 (2026-10-17) AI provider:** keep OpenAI for now. **Changed 2026-10-20:** the assistant runs on Claude Haiku 5.5 (`AnthropicModel`, `ANTHROPIC_API_KEY`; `ANTHROPIC_MODEL` overrides), about 2.5× cheaper per input token and 4× per output token than gpt-5-mini ($0.10/$0.50 vs $0.25/$2.00 per million), and OpenAI listed the gpt-5-mini-2025-08-07 snapshot for shutdown on 11 Dec 2026. Claude has no speech to text, so spoken quick entry stays on OpenAI and only works when `OPENAI_API_KEY` is also set. `OpenAiModel` stays as the fallback when only an OpenAI key is set. Structured outputs through the SDK's `zodOutputFormat`, effort medium, thinking left adaptive. Anthropic added to the privacy page's providers and to the KVKK transfers.
- **D24 (2026-10-17) Ingenico:** no protocol documents yet; Mehmet will apply for them later. Until then the till records cash/card manually and the terminal is used on its own. The Ingenico bridge is built once the documents arrive.

## Notes: outside permissions (researched 2026-10-17, not legal advice)
- e-Fatura / e-Arşiv: Peni cannot connect to GİB directly; becoming a GİB "özel entegratör" is a heavy licence. The normal route is an integrator's API (e.g. Sovos, BirFatura): a commercial agreement for Peni, and each café is an e-Fatura user with that integrator (or via the GİB portal).
- Ingenico till: already integrated in Shelby; keep using the same device and protocol.
- KVKK: Peni holds customer and staff personal data, so it needs a privacy notice (aydınlatma metni) and consent where required, possibly VERBİS registration. Sending data to AI or cloud services abroad needs a KVKK transfer basis (e.g. standard contract, notified to the KVKK Authority within 5 business days).
- Apple / Google sign-in and the app stores: a normal developer account each; Apple requires "Sign in with Apple" when other social logins are offered.

- **D25 (2026-10-17) Architecture and work plan confirmed** as in [plan.md](plan.md), including D24's change.
- **D26 (2026-10-18) Roles:** keep Shelby's chef role. Four roles: owner (Shelby's admin), manager, chef, barista, each starting with Shelby's default access; each café's owner can switch permissions per role except locked ones (money, reports, assistant, team).
- **D27 (2026-10-18) Sign-in library:** no Better Auth. Customers sign in on Peni's own hashed sessions, like staff: Peni checks Google's and Apple's signed ID tokens itself (jose), and email codes go out through Resend, as in Shelby.
- **D28 (2026-10-18) Finding whom to treat:** phone is optional now, so a gift's recipient can be found by phone, by their Peni kodu, or picked from the café's list of members who show their profile. Mehmet chose both code and list.
- **D29 (2026-10-18) Chart library:** ECharts, on the web and natively in the phone app, themed in Peni's look (samples: https://claude.ai/artifact/MN8haUF3jWsWRRyaCYqRjP). Settles D17.
- **D30 (2026-10-18) Product cost and profit:** shown on each product's page in Menü (cost from its recipe and the latest bill prices, profit per sale) and in Raporlar, which ranks products by profit. Shown in one way everywhere, unlike Shelby's Panel vs Reports.

## Overnight build defaults (2026-10-18/19)
Mehmet asked for pieces 30 to 35 to be built and merged without questions. These are the defaults Claude picked; each can be changed later.
- **N1 Weekly letter (piece 30, B10):** about last Monday to Sunday; started by the morning cron on Monday from 08:00 (or later that week if missed) and when someone opens Mektup. Needs reports.view. Written from the owner's view of the numbers: sales against the week before and the four before, products that sold most differently, prices on the week's bills that moved 3% or more with what they did to product margins, spending and its biggest bills, what is open on Bugün. 2 to 4 points and one thing to do; each point keeps only the refs it was given. No letter for a week with no sales. A failed week isn't retried. Emailed to people with reports.view, following the morning email's on/off switch.
- **N2 Accountant package (piece 30, B11):** a button on Ay kapanışı (owner and manager: cash.manage + bills.view) for any of the last 12 months (server allows 36). One ZIP: OKU.txt, an Excel file (Özet, Faturalar with KDV per rate, KDV bought/sold, Satışlar by day with Z report and difference), documents under faturalar/<kind>/, z-raporlari/, ekstreler/. Voided bills left out. Sales KDV only from scanned Z reports. Streamed, no AI step, not emailed to the accountant.
- **N3 Gözcü (piece 31, C12–C16):** plain calculations, no AI call. Page needs reports.view; forecast also cash.manage + debts.view, orders stock.view, staffing shifts.view. Prices: last 30 days' bills, moves of 3%+, suggested menu price only when a product's margin fell 2+ points, rounded up to ₺5 (₺1 under ₺50). Unusual: drawer count off ₺50+ in 7 days; a person's voids+refunds ≥3 this week and ≥2× their weekly usual over the 4 weeks before; a bill ≥2× the supplier's median (needs 3 earlier bills); same supplier and total within 10 days. 'Gördüm' hides a finding for everyone. Forecast 30 days: today's money + weekday's usual sales (last 4 weeks) − everyday buying (last 28 days of ingredient/supply/service/other lines ÷ 28) − Borçlar on due day (late/undated today, undated loans listed apart) − last rent/utilities bill again a month on − pay on the 5th of next month; Bugün warns red when below zero within 14 days. Orders: items running out within 7 days, ordered to last 10 days in whole units, grouped by supplier on latest bill, message to copy/WhatsApp, never sent by Peni. Staffing: next week's plan vs 4 weeks of orders; busy ≥1.6× usual and ≥8 orders/person-hour, quiet ≤0.4× with 2+ people, nobody planned with 4+ orders.
- **N4 Müdavimler (piece 32, D17 idea 17):** new panel page Müdavimler (reports.view), no AI needed; the assistant gets a read-only 'community' look. A visit = a day a member earned or spent peni or took from the askı (customers without the app aren't seen). Month vs the same days of last month; regular = 4+ visit days in the month; 'came back' = last month's visitors seen this month. 'What brings people back': spent peni / got a treat / took from askı / gave to askı / came to an event vs everyone else, from the first such day in the 90 days ending 30 days ago, came again within 30 days (so both sides had the full window). Events: going, came that day, came again within 14 days, first visits that day, orders vs same weekday's 4-week average. Counts only, never names; groups under 3 show no share. Demo server seeds four months of extra Moda neighbours (seed option `history`).
- **N5 Shelby move (piece 33):** one command (`pnpm --filter @peni/web shelby-move`, docs/shelby-move.md): dry run by default, `--write` into Peni, and a totals check that recomputes Shelby's side from its raw records. Only into an empty café, so rehearsals use a fresh database and the real move runs once. Starts from Shelby's open accounting period (25 June 2026); the previous owner's records stay in Shelby unless `--all`. Pending orders and Shelby's weekly wage bills aren't moved (wages come from timesheets and payouts). Week hours are spread over the person's planned days. Money starts on move day with Shelby's balances (safe = reserve, drawer = last Kasa count). Role permissions, stock/money history, AI chats, alerts and closed pay months aren't moved; bill files need Shelby's Blob token. Peni café slug `shelby`.
- **N6 Launch readiness (piece 34):** web home `/` is the welcome page (headline, cafés on Peni, 'Kafen mi var?' with the panel link, store buttons once NEXT_PUBLIC_APP_STORE_URL / NEXT_PUBLIC_PLAY_STORE_URL are set). Gizlilik `/gizlilik` and Kullanım koşulları `/kosullar`, TR/EN, controller from PENI_LEGAL_NAME / PENI_LEGAL_ADDRESS / PENI_CONTACT_EMAIL; not lawyer-reviewed. Hesabım `/hesap` (also the Play deletion URL) and the app's Ben tab: download data (JSON) and delete account. Deleting wipes name, email, phone, photo, sign-ins, devices and email codes, signs out everywhere, frees RSVPs to upcoming events and takes down upcoming events they host; peni history stays as 'Silinmiş üye'; peni balance is given up; same email can start afresh. Monitoring: `/api/v1/health` (DB check) for an uptime monitor, Vercel logs for errors. Store builds via EAS (`apps/mobile/eas.json`, versions kept remotely). Steps only Mehmet can do are in docs/launch.md.
- **N7 Switch day (piece 35):** runbook in docs/switch-day.md. Freeze uses Shelby's own pause (`Cafe.financialWritesPaused`, its DB triggers refuse every money write): `pnpm --filter @peni/web shelby-freeze --on`, refused while Shelby's drawer is open; `--off` undoes it. The real `shelby-move --write` refuses while Shelby isn't frozen; `--rehearsal` lets a copy run unfrozen. Order on the night: close drawer, freeze, Neon branch of Shelby as the record, move, check totals, open Peni. Shelby stays frozen afterwards as the read-only record. A mismatch before Peni opens means `--off` and Shelby carries on; after Peni opens, corrections go in Peni. The till PC is set up after the move. Claude never ran the freeze against Shelby's production: only Mehmet does, on the night.
- **N8 Environments (2026-10-20):** three: dev (Mac, in memory), staging (https://peni-staging.vercel.app, Neon `staging`, demo cafés only, open to anyone with the link so the phone preview build can reach it) and production (Neon `production`, `PENI_DEMO=0`). One Vercel project `peni` from `apps/web`; its production branch is `production`, so `main` is staging and a release is `git push origin origin/main:production`. Vercel functions and Neon in Frankfurt (fra1 / aws-eu-central-1), nearer Turkey than US East. Migrations run in the Vercel build (`DIRECT_URL`, the unpooled address). Staging's demo data is written from the Mac, not on first visit. Runbook: docs/environments.md.
- **N9 Penny (2026-10-20):** the app and its coin are called Penny / penny in everything people read (Mehmet's call; the PENNY supermarket mark was raised, a TÜRKPATENT search is his to do). Turkish keeps the word unchanged with endings after an apostrophe (penny'yi, Penny'yle, penny'n); English names the app Penny and the coin pennies (1 penny; penny code, penny rate). Stored values (payment method "peni", permission and theme keys), code names, the bundle id app.peni, the URL scheme and peni.app addresses stay as they are. The coin will carry a goat (Kaldi's goats; sketches A, B, C).

## Design (UI/UX)
_Started 2026-10-17._ Existing reference: v0.1's "İlan" design system in the peni repo (`docs/design-system.md`): warm paper, press-black ink, copper peni coin, turquoise askı, vişne for events, Turkish *sen* copy.
- **DS1 (2026-10-17) Customer side:** start fresh with a new visual direction ("İlan" is not kept).
- **DS2 (2026-10-17) Café side:** start fresh with a new direction too.
- **DS3 (2026-10-17) Shelby's main UX problem:** many features, but it's hard to see how they connect and what each is for. The redesign must make the connections and purpose visible.
- **DS4 (2026-10-17) Feeling:** clean and minimal, lots of white space, few colours. References: Sweetgreen ordering, Dropbox, Blue Bottle, Apple, Verve (see [design.md](design.md)).
- **DS5 (2026-10-17) Café side navigation:** organised around the café's day, but classified better, with names that leave no room for confusion. Proposal in design.md, pending confirmation.
- **DS6 (2026-10-17) Explaining hard parts:** an ⓘ icon showing an explanation on hover, plus the option to ask the AI.
- **DS7 (2026-10-17) Navigation confirmed** as in design.md, except the "Para" group needs a different name.
- **DS8 (2026-10-17) Photos are central:** product and café photos on the menu, the till and the customer app.
- **DS9 (2026-10-17) Languages:** Turkish and English at launch.
- **DS10 (2026-10-17) "Para" renamed to "Finans"** (Nakit ve banka, Borçlar).
- **DS11 (2026-10-17) Colour:** Peni itself is black and white. A green like Verve's is the third colour, used only when needed. Each café picks its own colour for its customer pages. (Verve's site didn't expose its green; the exact value will be matched in the mockups.)
- **DS12 (2026-10-17) Dark mode** on both sides; light is the default.
- **DS13 (2026-10-17) Type:** a sans serif for the interface, plus an elegant serif for big headlines (like Blue Bottle).
- **DS14 (2026-10-17) Customer app opens to** "my cafés", with the peni balance at each.
- **DS15 (2026-10-17)** More questions before mockups; next topic is the welcome page.
- **DS16 (2026-10-17) Welcome page:** both the app's first screen and the public website, with the same message.
- **DS17 (2026-10-17) Audience:** customers and café owners, with two clear paths.
- **DS18 (2026-10-17) Message:** one story headline (the coffeehouse as a "penny university", everyone equal at one table), then three short practical points with photos. Draft copy in design.md.
- **DS19 (2026-10-17) Photos:** placeholders for now, replaced with real photos later.
- **DS20 (2026-10-17) Café owners apply** and Mehmet approves them during the pilot (no self sign-up yet).
- **DS21 (2026-10-17) Welcome headline (for now):** "Sokağının kahvesi, şimdi cebinde." (Your street's café, now in your pocket.) Other options stay in design.md.
- **DS22 (2026-10-17) Till input:** touch first, and it must also work with a mouse.
- **DS23 (2026-10-17) Till layout:** product photo tiles on the left with category tabs above; the current order and the pay button on the right.
- **DS24 (2026-10-17) Customer screen when idle:** rotates slowly between the café's photos, posts and events, and "Peni'yi indir" with a download QR.
- **DS25 (2026-10-17) Customer café page:** one scroll: café photo and name, my peni balance, drinks waiting on the askı, then the feed of posts and events.
- **DS26 (2026-10-17) AI on the café side:** a panel that slides in from the right on any screen and knows what you're looking at, plus a "Sor" box at the top for questions and search.
- **DS27 (2026-10-17) Next:** mockups of welcome, customer home, café page, Satış ekranı, customer screen, Bugün.

- **DS28 (2026-10-17) Mockups v1 approved** as they are (https://claude.ai/artifact/FszgwfwLxd2qxQKQMYjNi9): look, layout and flows.

## Open questions
