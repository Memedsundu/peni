# Environments

Peni runs in three places. A change goes through them in order: your Mac, then staging, then production.

| | Address | Database | What's in it | Updates when |
|---|---|---|---|---|
| **Dev** (your Mac) | `http://localhost:3000` | none: kept in memory | the two demo cafés, fresh on every start | you run `pnpm dev:web` |
| **Staging** | https://peni-staging.vercel.app | Neon `Peni` → `staging` | the two demo cafés, never real data | a pull request is merged into `main` |
| **Production** | Vercel's production address (a custom domain such as peni.app later) | Neon `Peni` → `production` | real cafés and customers | `main` is released to the `production` branch |

Every pull request also gets its own address from Vercel (it posts the link on the pull request). Those use the staging database too.

Every pull request into `main`, and `main` after each merge, also runs the **Tests** check on GitHub (`.github/workflows/test.yml`, about 3 minutes): it checks the code types, runs all the unit tests, and runs the 28 database tests against a fresh, empty Postgres that sorts text the way Neon does. It never touches staging or production. A red check means don't merge yet.

## Where things live

- **Vercel project `peni`** (team memedsundus-projects), built from `apps/web`, servers in Frankfurt (`fra1`). Vercel's "Production" environment is the `production` branch; every other branch, `main` included, is "Preview", which is staging.
- **Neon project `Peni`** (`winter-brook-49336637`), in Frankfurt (`aws-eu-central-1`), with two branches: `production` and `staging`. They're separate databases with separate passwords. Real data is never copied into staging.
- **Settings** are in Vercel → peni → Settings → Environment Variables. Production has `PENI_DEMO=0`; staging (Preview) has `PENI_DEMO=1`. `DATABASE_URL` is Neon's pooled address, `DIRECT_URL` the direct one that migrations use. The staging demo staff password is `PENI_DEMO_STAFF_PASSWORD` there; Vercel keeps it as sensitive, so it can't be read back, and the copy to sign in with is in `.env.staging` on Mehmet's Mac (never committed). Staff emails are in `DEMO_STAFF`, `apps/web/src/server/seed.ts`: `leyla@moda.test` owns Moda.
- **Database changes** (migrations) run before the app is built, only on the builds of `main` (staging's database) and `production` (production's). A pull request's own test build doesn't migrate: its migrations reach staging when it's merged, so until then a feature that needs a new table won't work on that test address. A migration that fails stops the build, and the version already running stays up.
- **A merged migration never changes.** Prisma doesn't re-run a migration it has already applied, so editing one only changes fresh databases and leaves staging and production behind (this happened once: `20261030000000_supplier_matches` repairs it). GitHub's test run fails a pull request that changes or deletes a migration that's already in `main`; add a new one instead.

## Releasing to production

When staging looks right:

```sh
git fetch origin
git push origin origin/main:production
```

That moves `production` up to `main` (it only moves forward, so nothing on production is ever lost), and Vercel builds and opens it. To go back, Vercel → peni → Deployments → the previous production deployment → "Instant Rollback". The database isn't rolled back, so a release with a migration is checked on staging first.

## Starting staging afresh

The demo history is dated from the day it was made, so after some weeks staging looks old. To make it new, empty the staging database and write the demo again, from `apps/web` with staging's addresses (Neon → Peni → staging → Connect). Don't use Neon's "Reset from parent": staging's parent is production, so once Peni has real customers it would copy them into staging.

```sh
DATABASE_URL=<staging direct> pnpm --filter @peni/db exec prisma migrate reset --force
DATABASE_URL=<staging pooled> PENI_DEMO=1 PENI_DEMO_STAFF_PASSWORD=<from .env.staging> npx tsx -e 'import("./src/server/runtime.ts").then(async (m) => { await m.getApp(); process.exit(0); })'
```

The demo cafés are written from your Mac rather than on the site's first visit, because the full history takes minutes and a visit would run out of time.

## Changing a café's plan

Until there's online payment, plans are set by hand (decision N11), from `apps/web` with the database's pooled address:

```sh
DATABASE_URL=<pooled> pnpm --filter @peni/web set-plan                    # every café and its plan
DATABASE_URL=<pooled> pnpm --filter @peni/web set-plan moda isletme       # moda pays for İşletme
DATABASE_URL=<pooled> pnpm --filter @peni/web set-plan moda --trial       # two weeks of everything from now
DATABASE_URL=<pooled> pnpm --filter @peni/web set-plan moda --end-trial   # ends a running trial
```

Plans are `topluluk` (free), `penny` (₺490 a month) and `isletme` (₺1,490 a month). Moving a café down hides pages and stops pennies for its customers; nothing is deleted, and moving it up brings everything back. The Plan page's "write to us" button emails `PENI_CONTACT_EMAIL`.

## The phone app

The app is **Penny**, store id **`app.penny`** (iOS bundle id and Android package; it can't change after the first upload). Which server each build talks to is set in `apps/mobile/eas.json`, so a phone never falls back to `localhost`:

- **preview** builds (for testing on phones): `https://peni-staging.vercel.app`
- **production** builds (the stores): `https://peni-taupe.vercel.app`, to be changed to the custom domain once there is one (both addresses in the production profile).

## Still to add (only Mehmet has these)

- **Production address:** a custom domain (peni.app) in Vercel → peni → Settings → Domains, then the same address as `PENI_PUBLIC_URL` in production.
- **Keys**, in production and, if wanted, staging: `RESEND_API_KEY` and `EMAIL_FROM` (email codes; without them staging keeps codes in its outbox and production has email sign-in off), `ANTHROPIC_API_KEY` (the assistant, on Claude Haiku 5.5; without it staging uses a stand-in and production has it off), `OPENAI_API_KEY` only if spoken quick entry is wanted (Claude can't turn speech into text), `GOOGLE_CLIENT_IDS` and `APPLE_CLIENT_IDS` (sign-in buttons), and the inbox settings.
- **Neon plan:** the free plan pauses a database after 5 minutes unused, so the first visit after a pause waits about half a second. Fine for staging; move production to a paid plan before switch day.
