# Race Replay

Race Replay calculates how many people each athlete physically passes and gets passed by on each leg of a race, then publishes those results on a public website.

It supports any race with per-athlete start and split times, including triathlons, road races, and trail runs. The scraper can pull data from these timing providers:

- [RTRT.me](https://track.rtrt.me) (IRONMAN and many large road races)
- [raceresult.com](https://www.raceresult.com) via [myrace.ai](https://myrace.ai)
- [my.raceresult.com](https://my.raceresult.com) (events hosted directly on raceresult)
- RaceResults 360 (the results widget used by Trinity Timing)

---

## How It Works

Traditional race results only show finish position and chip time. Race Replay answers a different question: **who did you actually race past on course?**

In a time-trial start race, athletes enter one at a time, so raw chip times don't reveal who was physically ahead. Race Replay uses each athlete's own start time from the timing provider to compute each athlete's absolute position at every timing checkpoint, then compares athletes head-to-head to count physical passes.

For each leg and each athlete, Race Replay reports:

- How many athletes they **passed**
- How many athletes **passed them**
- Their **net** (passed minus got passed)

---

## Architecture

```
scraper/             ← Local data pipeline (run on your machine)
  racereplay.mjs     ← Fetch + analyze in one step, writes _passing.csv
  check-legs.mjs     ← Preview RTRT timing points before scraping
  providers/         ← One module per timing provider
  lib/               ← Passing algorithm, formatting, output helpers
  test-*.mjs         ← Unit tests for the algorithm and providers

app/                 ← Next.js web application
  prisma/            ← Database schema and migrations
  scripts/           ← Ingest script, race config, one-off backfill/audit scripts
  src/app/           ← Pages, API routes, and OG images
  src/components/    ← Shared UI components (shadcn/ui in components/ui)
  src/lib/           ← Prisma client, formatting, and search param helpers

docs/PLANNING.md     ← Roadmap, tech debt, and feature ideas
```

Data flows one way: run the pipeline script locally → ingest the CSV → the website reads from the database.

---

## Tech Stack

| Layer     | Technology                           |
| --------- | ------------------------------------ |
| Framework | Next.js 16 (App Router)              |
| Database  | PostgreSQL via Neon (serverless)     |
| ORM       | Prisma 7 with `@prisma/adapter-pg`   |
| UI        | shadcn/ui + Tailwind CSS v4          |
| Fonts     | Barlow + Barlow Condensed            |
| Email     | Nodemailer (Gmail) for race requests |
| Tests     | Vitest                               |
| Hosting   | Vercel                               |
| Local DB  | Docker (PostgreSQL on port 5433)     |

---

## Data Model

```
Race (slug, name, location, country, distanceType, seriesName, website)
  └── Event (year, type, date, finisherCount, totalCount, description)
        ├── Segment (name, displayOrder, isFinish)
        ├── CategoryResult (category, name, total)
        └── Athlete (bib, name, normalizedName, gender, division, country,
                     status, finishTime, finishSeconds, ranks)
              └── AthleteSegment (timeSeconds, epochTime, gained, lost, net)
```

A `Race` groups all years of the same event under one slug. An `Event` is one year of one race. `Segment` is a leg (e.g. Swim, T1, Bike, T2, Run). `AthleteSegment` holds the passing counts for one athlete in one leg. `CategoryResult` stores the athlete total for each category (e.g. each division), written at ingest time. `normalizedName` (lowercased, accents and punctuation stripped) is indexed and used to match the same athlete across years and races.

Enums:

- `EventType`: `TRIATHLON`, `ROAD_RACE`
- `AthleteStatus`: `FIN`, `DNF`, `DSQ`, `DNS`
- `Gender`: `Male`, `Female`, `Open`, `Unknown`

---

## URL Structure

```
/                               → Landing page (hero + how it works + latest races)
/races                          → All races grid (search + sort)
/events/[slug]                  → Year picker (skipped if only one year exists)
/events/[slug]/[year]           → Athlete table (search, filter, sort, paginate)
/events/[slug]/[year]/[bib]     → Athlete detail (leg-by-leg breakdown, race history)
/events/[slug]/[year]/compare   → Head-to-head comparison (?a=<bib>&b=<bib>)
/request-race                   → Form to request a new race
/about                          → About page
/api/request-race               → POST endpoint that emails race requests
```

Most pages also have a generated Open Graph image (`opengraph-image.tsx`) for link previews. `sitemap.xml` and `robots.txt` are generated from `src/app/sitemap.ts` and `src/app/robots.ts`.

---

## Local Development

### Prerequisites

- Node.js 24 (the version used in CI and deploys)
- Docker (for local PostgreSQL)

### Setup

> **Development only.** The credentials below are for local development.
> Never use `postgres` as a password in staging or production — generate strong, unique credentials for any networked environment.

```bash
# 1. Start the local database
docker run -d \
  --name racereplay-db \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 \
  postgres:16

# 2. Install dependencies
cd app
npm install

# 3. Create your local env file
echo 'DATABASE_URL=postgresql://postgres:postgres@localhost:5433/racereplay' > .env.local

# 4. Run migrations and generate the Prisma client
npx prisma migrate deploy
npx prisma generate

# 5. Start the dev server
npm run dev
```

The app runs at `http://localhost:3000`. It shows an empty race list until you ingest data.

### Environment Variables

Put these in `app/.env.local`. Only `DATABASE_URL` is required to run the site locally.

| Variable              | Required | Description                                                                                |
| --------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | Yes      | PostgreSQL connection string                                                               |
| `NEXT_PUBLIC_APP_URL` | No       | Public base URL for metadata, sitemap, and share links (default: `https://racereplay.app`) |
| `GMAIL_USER`          | No       | Gmail account used to send race request emails                                             |
| `GMAIL_APP_PASSWORD`  | No       | Gmail app password for `GMAIL_USER`                                                        |

Without the Gmail variables the site still works, but submitting the **Request a Race** form will fail.

---

## Data Pipeline

The pipeline runs locally and produces a `_passing.csv` file that gets loaded into the database.

### Step 1 — Find the race on its timing provider

Pick the provider with `--provider` (default: `rtrt`). Each provider needs different inputs:

| Provider         | What you need                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `rtrt`           | Event ID from `https://track.rtrt.me/e/<EVENT-ID>` and the tracker app ID (`"appid"` in the page source) |
| `raceresult`     | myrace.ai results page URL (or a direct raceresult.com API URL) and the race date                        |
| `myraceresult`   | my.raceresult.com event URL, the race date, and optionally the contest name                              |
| `raceresults360` | Trinity Timing results URL (`#/race/<raceKey>/<event>/`), the race date, and optionally event numbers    |

RTRT app IDs are not stored in the source code; keep them in your own notes.

### Step 2 — Run the pipeline

```bash
# RTRT (default provider)
node scraper/racereplay.mjs <event-id> --appid <id>

# Other providers
node scraper/racereplay.mjs <slug> --provider <name> --url <url> --race-date <YYYY-MM-DD>
```

The script fetches all timing splits, runs the passing algorithm, and writes `scraper/data/<id-or-slug>_passing.csv`.

See [scraper/README.md](scraper/README.md) for every provider's flags, examples, the `--points` override for RTRT, and timing estimates for large events.

### Step 3 — Ingest into the database

```bash
cd app
npx tsx scripts/ingest.ts ../scraper/data/<EVENT-ID>_passing.csv \
  --slug <slug> \
  --race-name "<Race Name>" \
  --year <YYYY> \
  --event-type <triathlon|road_race> \
  --event-date <YYYY-MM-DD>
```

The ingest script is fully idempotent — running it twice on the same file is safe. Race metadata and segment name mappings are loaded from `app/scripts/races.config.json` when the slug has an entry there. Add `--dry-run` to preview detected columns and legs without writing anything.

To load into the Neon dev database instead of local Docker:

```bash
DATABASE_URL="postgresql://..." npx tsx scripts/ingest.ts ...
```

---

## npm Scripts

Run these from the `app/` directory.

| Script                  | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `npm run dev`           | Start local dev server                  |
| `npm run build`         | Production build                        |
| `npm run start`         | Serve the production build              |
| `npm run lint`          | Lint all files                          |
| `npm run format`        | Format all files                        |
| `npm run format:check`  | Check formatting (used in CI)           |
| `npm test`              | Run Vitest unit tests once (used in CI) |
| `npm run test:watch`    | Run Vitest in watch mode                |
| `npm run test:coverage` | Run tests with a V8 coverage report     |
| `npm run ingest`        | Shortcut for `tsx scripts/ingest.ts`    |

The scraper has no dependencies or `package.json`. Its tests are run directly with Node; see [scraper/README.md](scraper/README.md#unit-tests).

### Maintenance Scripts

`app/scripts/` also contains one-off scripts used to audit and backfill existing data after schema or ingest changes (`audit-*.ts`, `backfill-*.ts`, `cleanup-finish-time-placeholder.ts`, `fix-division-prefix.ts`). Each one is documented in its header comment, is safe to re-run, and targets whatever `DATABASE_URL` is set:

```bash
cd app
npx tsx scripts/backfill-event-counts.ts
DATABASE_URL="postgresql://..." npx tsx scripts/backfill-event-counts.ts
```

---

## Deployment

Two environments are managed via GitHub Actions.

### Dev

Deploys automatically on every push to `main`. Runs Prisma migrations against the Neon `dev` database branch and deploys to Vercel's preview environment.

### Prod

Manual deploy via **Actions → Deploy Prod → Run workflow**. Takes a bare semver version string as input (e.g. `1.2.0`). Checks out that exact tag, runs migrations against the Neon production database, deploys to Vercel production, and creates a GitHub Release.

### Version Increment

Manual via **Actions → Version Increment → Run workflow**. Choose `patch`, `minor`, or `major`. The workflow bumps `package.json`, generates a CHANGELOG entry, formats it, tags the commit with the new version (e.g. `0.3.0`), and pushes directly to `main`.

### Required GitHub Secrets

| Secret              | Description                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | Vercel API token                                                                                  |
| `VERCEL_ORG_ID`     | Vercel organization ID                                                                            |
| `VERCEL_PROJECT_ID` | Vercel project ID                                                                                 |
| `DATABASE_URL_DEV`  | Neon dev branch connection string (set on `dev` environment)                                      |
| `DATABASE_URL_PROD` | Neon prod branch connection string (set on `prod` environment)                                    |
| `ADMIN_TOKEN`       | GitHub PAT with admin access (used by version increment to temporarily disable branch protection) |

---

## CI

Every pull request to `main` runs three checks:

| Check             | What it does                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Validate PR Title | Enforces semantic commit format (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `ci:`, `chore:`, `revert:`)  |
| Validate Spelling | cspell on all `.md`, `.ts`, `.tsx`, `.mjs`, `.css`, `.yaml`, `.yml` files                                     |
| Validate Code     | Prisma generate → Prisma validate → tsc → ESLint → Prettier → depcheck → Vitest → Prisma db push → next build |

The Validate Code job only covers `app/`. Scraper tests are not run in CI — run them locally when changing the scraper.

Dependabot runs weekly and groups dependency updates into bundled PRs.

A Claude Code workflow (`.github/workflows/claude.yml`) runs when an issue gets the `claude` label or a comment mentions `@claude`.

---

## Spelling Dictionaries

Two custom cspell dictionaries live in `.cspell/`:

- `dev_dictionary.txt` — framework and stack terms (Prisma, Neon, shadcn, Tailwind, etc.)
- `triathlon_dictionary.txt` — race and sport terms (triathlon, ironman, bib, DNF, T1, T2, etc.)

To add a new word, put it in whichever file fits and commit.

---

## Adding a New Race

1. For RTRT races, run `node scraper/check-legs.mjs <event-id> --appid <id>` to verify leg structure
2. Run `node scraper/racereplay.mjs <event-id> --appid <id>` (or the equivalent for another provider) to produce a `_passing.csv`
3. Choose a URL slug (e.g. `im-703-chattanooga`) and add it to `app/scripts/races.config.json` with location, country, distance, series, website, and any `segmentNames` mapping
4. Run the ingest script against the target database (try `--dry-run` first)
5. The race appears on the site immediately — no code changes needed
