# Race Replay

Race Replay calculates how many people each athlete physically passes and gets passed by on each leg of a race, then publishes those results on a public website.

It supports any race with per-athlete timing data from RTRT.me, including triathlons, road races, and trail runs.

---

## How It Works

Traditional race results only show finish position and chip time. Race Replay answers a different question: **who did you actually race past on course?**

In a time-trial start race, athletes enter one at a time, so raw chip times don't reveal who was physically ahead. Race Replay uses per-athlete start epoch times from RTRT.me to compute each athlete's absolute position at every timing checkpoint, then compares athletes head-to-head to count physical passes.

For each leg and each athlete, Race Replay reports:

- How many athletes they **passed**
- How many athletes **passed them**
- Their **net** (passed minus got passed)

---

## Architecture

```
scraper/             ← Local data pipeline (run on your machine)
  racereplay.mjs     ← Fetch + analyze in one step, writes _passing.csv
  check-legs.mjs     ← Preview timing points before scraping
  test-algorithm.mjs ← Unit tests for the passing algorithm

app/                 ← Next.js web application
  prisma/            ← Database schema and migrations
  scripts/           ← Ingest script (load _passing.csv into the database)
  src/app/           ← Pages and UI components
```

Data flows one way: run the pipeline script locally → ingest the CSV → the website reads from the database.

---

## Tech Stack

| Layer     | Technology                         |
| --------- | ---------------------------------- |
| Framework | Next.js 16 (App Router)            |
| Database  | PostgreSQL via Neon (serverless)   |
| ORM       | Prisma 7 with `@prisma/adapter-pg` |
| UI        | shadcn/ui + Tailwind CSS v4        |
| Fonts     | Barlow + Barlow Condensed          |
| Hosting   | Vercel                             |
| Local DB  | Docker (PostgreSQL on port 5433)   |

---

## Data Model

```
Race (slug, name)
  └── Event (year, type, date)
        ├── Segment (name, displayOrder)
        └── Athlete (bib, name, gender, division, ranks)
              └── AthleteSegment (timeSeconds, gained, lost, net)
```

A `Race` groups all years of the same event under one slug. An `Event` is one year of one race. `Segment` is a leg (e.g. Swim, T1, Bike, T2, Run). `AthleteSegment` holds the passing counts for one athlete in one leg.

Supported event types: `TRIATHLON`, `ROAD_RACE`.

---

## URL Structure

```
/                               → Landing page (hero + how it works + latest races)
/races                          → All races grid
/events/[slug]                  → Year picker (skipped if only one year exists)
/events/[slug]/[year]           → Athlete table (search, filter, sort, paginate)
/events/[slug]/[year]/[bib]     → Athlete detail (leg-by-leg breakdown)
```

---

## Local Development

### Prerequisites

- Node.js 20+
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

# 4. Run migrations
npx prisma migrate deploy

# 5. Start the dev server
npm run dev
```

The app runs at `http://localhost:3000`. It shows an empty race list until you ingest data.

---

## Data Pipeline

The pipeline runs locally and produces a `_passing.csv` file that gets loaded into the database.

### Step 1 — Find the RTRT event ID

Go to [track.rtrt.me](https://track.rtrt.me) and find the race. The URL will be:

```
https://track.rtrt.me/e/<EVENT-ID>
```

You also need the app ID for that race's RTRT tracker — view page source and search for `"appid"`. App IDs are not stored in the source code; keep them in your own notes.

### Step 2 — Run the pipeline

```bash
node scraper/racereplay.mjs <event-id> --appid <id>
```

The script fetches all timing splits from RTRT.me, runs the passing algorithm, and writes `scraper/data/<EVENT-ID>_passing.csv` directly — no intermediate files.

See [scraper/README.md](scraper/README.md) for full details including the `--points` override flag and timing estimates for large events.

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

The ingest script is fully idempotent — running it twice on the same file is safe.

To load into the Neon dev database instead of local Docker:

```bash
DATABASE_URL="postgresql://..." npx tsx scripts/ingest.ts ...
```

---

## npm Scripts

Run these from the `app/` directory.

| Script                 | Purpose                       |
| ---------------------- | ----------------------------- |
| `npm run dev`          | Start local dev server        |
| `npm run build`        | Production build              |
| `npm run lint`         | Lint all files                |
| `npm run format`       | Format all files              |
| `npm run format:check` | Check formatting (used in CI) |

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

| Check             | What it does                                                      |
| ----------------- | ----------------------------------------------------------------- |
| Validate PR Title | Enforces semantic commit format (`feat:`, `fix:`, `ci:`, etc.)    |
| Validate Spelling | cspell on all `.ts`, `.tsx`, `.css`, `.md`, `.yaml` files         |
| Validate Code     | Prisma validate → tsc → ESLint → Prettier → depcheck → next build |

Dependabot runs weekly and groups dependency updates into bundled PRs.

---

## Spelling Dictionaries

Two custom cspell dictionaries live in `.cspell/`:

- `dev_dictionary.txt` — framework and stack terms (Prisma, Neon, shadcn, Tailwind, etc.)
- `triathlon_dictionary.txt` — race and sport terms (triathlon, ironman, bib, DNF, T1, T2, etc.)

To add a new word, put it in whichever file fits and commit.

---

## Adding a New Race

1. Run `node scraper/check-legs.mjs <event-id>` to verify leg structure
2. Run `node scraper/racereplay.mjs <event-id>` to produce a `_passing.csv`
3. Choose a URL slug (e.g. `im-703-chattanooga`) and add it to `app/scripts/races.config.json`
4. Run the ingest script against the target database
5. The race appears on the site immediately — no code changes needed
