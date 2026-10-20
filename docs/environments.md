# Environments

Peni runs in three places. A change goes through them in order: your Mac, then staging, then production.

| | Address | Database | What's in it | Updates when |
|---|---|---|---|---|
| **Dev** (your Mac) | `http://localhost:3000` | none: kept in memory | the two demo cafés, fresh on every start | you run `pnpm dev:web` |
| **Staging** | https://peni-staging.vercel.app | Neon `Peni` → `staging` | the two demo cafés, never real data | a pull request is merged into `main` |
| **Production** | Vercel's production address (a custom domain such as peni.app later) | Neon `Peni` → `production` | real cafés and customers | `main` is released to the `production` branch |

Every pull request also gets its own address from Vercel (it posts the link on the pull request). Those use the staging database too.

## Where things live

- **Vercel project `peni`** (team memedsundus-projects), built from `apps/web`, servers in Frankfurt (`fra1`). Vercel's "Production" environment is the `production` branch; every other branch, `main` included, is "Preview", which is staging.
- **Neon project `Peni`** (`winter-brook-49336637`), in Frankfurt (`aws-eu-central-1`), with two branches: `production` and `staging`. They're separate databases with separate passwords. Real data is never copied into staging.
- **Settings** are in Vercel → peni → Settings → Environment Variables. Production has `PENI_DEMO=0`; staging (Preview) has `PENI_DEMO=1`. `DATABASE_URL` is Neon's pooled address, `DIRECT_URL` the direct one that migrations use. The staging demo staff password is `PENI_DEMO_STAFF_PASSWORD` there (staff emails are in `DEMO_STAFF`, `apps/web/src/server/seed.ts`).
- **Database changes** (migrations) run on every Vercel build, before the app is built: a build for staging migrates the staging database, a release migrates production. A migration that fails stops the build, and the version already running stays up.

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
DATABASE_URL=<staging pooled> PENI_DEMO=1 PENI_DEMO_STAFF_PASSWORD=<from Vercel> npx tsx -e 'import("./src/server/runtime.ts").then(async (m) => { await m.getApp(); process.exit(0); })'
```

The demo cafés are written from your Mac rather than on the site's first visit, because the full history takes minutes and a visit would run out of time.

## The phone app

In EAS, the build service for the app (see [launch.md](launch.md)), set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_PUBLIC_URL`:

- **preview** builds: `https://peni-staging.vercel.app`
- **production** builds: production's address

## Still to add (only Mehmet has these)

- **Production address:** a custom domain (peni.app) in Vercel → peni → Settings → Domains, then the same address as `PENI_PUBLIC_URL` in production.
- **Keys**, in production and, if wanted, staging: `RESEND_API_KEY` and `EMAIL_FROM` (email codes; without them staging keeps codes in its outbox and production has email sign-in off), `OPENAI_API_KEY` (the assistant; without it staging uses a stand-in and production has it off), `GOOGLE_CLIENT_IDS` and `APPLE_CLIENT_IDS` (sign-in buttons), and the inbox settings.
- **Neon plan:** the free plan pauses a database after 5 minutes unused, so the first visit after a pause waits about half a second. Fine for staging; move production to a paid plan before switch day.
