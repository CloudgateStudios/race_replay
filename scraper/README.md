# Race Replay — Scraper

Standalone scripts to fetch race data from timing providers, inspect timing
point structure, and run the leg-by-leg physical passing algorithm.

Run these locally before ingesting data into the database.

---

## Structure

```
scraper/
  racereplay.mjs        ← entry point; dispatches to a provider via --provider
  check-legs.mjs        ← preview RTRT timing points before scraping
  test-algorithm.mjs    ← unit tests for the passing algorithm
  lib/
    algorithm.mjs       ← FenwickTree, passing algorithm, normalizeAthletes
    cache.mjs           ← split file read/write helpers (RTRT only)
    display.mjs         ← ProgressDisplay
    format.mjs          ← parseTime, fmtTimeLong, fmtElapsed, cleanLabel
    output.mjs          ← printReport, buildOutputCSV
  providers/
    rtrt.mjs            ← RTRT.me (existing races)
    raceresult.mjs      ← raceresult.com / myrace.ai
  data/                 ← output CSVs and cached split JSON files
```

---

## Typical workflow

### RTRT races (track.rtrt.me)

#### Step 1 — Find the event ID and app ID

1. Go to **https://track.rtrt.me** and find the race
2. The URL will be `https://track.rtrt.me/e/<EVENT-ID>` — the last segment is the event ID
3. View page source (`Cmd+U`) and search for `"appid"` to find the app ID

#### Step 2 — Check the legs before scraping

Always run `check-legs.mjs` first to confirm the timing point structure matches
what you expect. This is especially important for older events that may have
extra intermediate checkpoints that need to be collapsed.

```bash
node scraper/check-legs.mjs <event-id> --appid <id>
```

Output shows every timing point — its raw name, label, cleaned leg name, and km
position — and which will be used vs. excluded. The **Final leg names** line at
the bottom is what gets stored in the database.

**Canonical legs for IRONMAN triathlons:** `Swim, T1, Bike, T2, Run`

If you see extra intermediate run splits (e.g. `Run 1.7mi, Run 14.8mi`) that
means the event has additional published checkpoints. Use the `--points` flag
in the next step to force only the canonical checkpoints.

#### Step 3 — Run the scraper

```bash
node scraper/racereplay.mjs <event-id> --appid <id> [options]
```

Examples:

```bash
# Standard run
node scraper/racereplay.mjs IRM-ARIZONA-2025 --appid <id>

# Force canonical checkpoints (use when check-legs shows extra splits)
node scraper/racereplay.mjs IRM-ARIZONA-2025 --appid <id> --points START,SWIM,T1,BIKE,T2,FINISH

# Re-fetch everything, ignoring cached split files
node scraper/racereplay.mjs IRM-ARIZONA-2025 --appid <id> --fresh
```

**RTRT flags:**

```
--appid <id>          RTRT tracker app ID. Required.
--points A,B,C        Force specific timing points — use to collapse extra splits
--concurrency <n>     Parallel point fetches (default: 4)
--fresh               Ignore cached split files and re-fetch everything
```

Split data is cached to `scraper/data/` as `<EVENT-ID>_splits_<POINT>.json`,
making a run resumable if interrupted.

**Timing:** ~300ms/page + 5s between timing points. A 24K-athlete event with
3 timing points takes ~18 minutes.

---

### raceresult races (myrace.ai)

No event ID or app ID needed — just the myrace.ai results page URL and the
race date. All splits arrive in a single API call; no caching is used.

```bash
node scraper/racereplay.mjs <slug> --provider raceresult \
  --url https://myrace.ai/races/<slug>/results \
  --race-date <YYYY-MM-DD>
```

Examples:

```bash
# Auto-discover the API URL from the myrace.ai page
node scraper/racereplay.mjs cim-2025 --provider raceresult \
  --url https://myrace.ai/races/cim-2025/results \
  --race-date 2025-12-07

# Skip discovery and use a direct raceresult.com API URL
node scraper/racereplay.mjs cim-2025 --provider raceresult \
  --api-url https://api.raceresult.com/374113/IMU05T607SLSY3BXCUM067VWT8HGBEHA \
  --race-date 2025-12-07
```

**raceresult flags:**

```
--url <url>           myrace.ai results page — API endpoint is discovered automatically
--api-url <url>       Direct raceresult.com API URL (skips page discovery)
--race-date <date>    Race date as YYYY-MM-DD. Required. Converts time-of-day
                      split values to Unix epoch timestamps.
```

---

### Shared flags (both providers)

```
--output-dir <dir>    Write output here (default: scraper/data/)
--verify              After the O(n log n) algorithm, also run the O(n²)
                      reference and diff the results
```

**Output:** `scraper/data/<slug>_passing.csv`

---

### Step 4 — Ingest into the database

```bash
cd app
npx tsx scripts/ingest.ts ../scraper/data/<slug>_passing.csv \
  --slug <slug> \
  --race-name "<Race Name>" \
  --year <YYYY> \
  --event-type <triathlon|road_race> \
  --event-date <YYYY-MM-DD>
```

Race metadata (location, country, distanceType, seriesName, website) and
segment name normalization (`FINISH → Run`) are loaded automatically from
`app/scripts/races.config.json` when the slug is recognized.

Add `--dry-run` to validate columns and preview segment names without writing:

```bash
npx tsx scripts/ingest.ts ../scraper/data/<slug>_passing.csv \
  --dry-run --slug <slug>
```

---

## Segment name normalization

The scraper outputs timing point names as column headers (e.g. `FINISH Time`).
The ingest script renames these to canonical names before storing them.

Current mapping for IRONMAN events (defined in `app/scripts/races.config.json`):

| CSV column | Stored as |
|------------|-----------|
| SWIM       | Swim      |
| T1         | T1        |
| BIKE       | Bike      |
| T2         | T2        |
| FINISH     | Run       |

This ensures all years of the same race use consistent segment names even when
a provider adds or removes intermediate checkpoints year to year.

---

## Known events

### RTRT provider

| Race                     | Year | Event ID                   | Notes                                          |
| ------------------------ | ---- | -------------------------- | ---------------------------------------------- |
| IM Wisconsin             | 2022 | IRM-WISCONSIN-2022         | Use `--points START,SWIM,T1,BIKE,T2,FINISH`    |
| IM Wisconsin             | 2023 | IRM-WISCONSIN-2023         |                                                |
| IM Wisconsin             | 2024 | IRM-WISCONSIN-2024         |                                                |
| IM 70.3 Chattanooga      | 2026 | IRM-CHATTANOOGA703-2026    |                                                |
| IM 70.3 Oceanside        | 2025 | IRM-OCEANSIDE703-2025      |                                                |
| IM 70.3 Oceanside        | 2026 | IRM-OCEANSIDE703-2026      |                                                |
| BofA Shamrock Shuffle    | 2026 | BASS2026                   | Uses a different app ID                        |

### raceresult provider

| Race                     | Year | myrace.ai slug | Race date  |
| ------------------------ | ---- | -------------- | ---------- |
| California International | 2024 | cim-2024       | 2024-12-08 |
| California International | 2025 | cim-2025       | 2025-12-07 |

---

## Unit tests

```bash
node scraper/test-algorithm.mjs
```

Runs assertions on a hand-crafted dataset including DNF handling. Run before
trusting output from a new race.

---

## How physical passing works

In a time-trial (TT) start race, athletes enter one at a time. A "physical
pass" requires knowing who was actually ahead on course — which requires each
athlete's individual start time.

Race Replay uses per-athlete start epoch times to compute the absolute clock
time each athlete was at every checkpoint. Comparing two athletes' absolute
checkpoint times directly answers "who was physically ahead?"

**Key identity:**

```
epochTime[any_point] = startEpoch + chipSplitSeconds
```

**Swim leg:** Uses `startEpoch` as the "before" position and
`startEpoch + swimSecs` as the "after" — the same before→after comparison
used by every other leg.

For raceresult races, time-of-day split values (either `HH:MM:SS` strings or
float seconds-since-midnight) are converted to Unix epoch using `--race-date`.

---

## Verified results

### 2025 California International Marathon (cim-2025)

8,815 athletes · 10 legs · all invariants pass ✅

### 2024 California International Marathon (cim-2024)

8,369 athletes · 10 legs · all invariants pass ✅

### 2026 Bank of America Shamrock Shuffle (BASS2026)

24,216 athletes · 24,152 finishers · 64 DNFs · 2 legs (5K, Finish)

- 5K: gained = lost = 8,805,358 ✅
- Finish: gained = lost = 7,864,006 ✅

### 2026 IM 70.3 Oceanside (IRM-OCEANSIDE703-2026)

3,171 athletes · 2,973 finishers · 198 DNFs · 3,170 RTRT start times matched

All 5 leg invariants pass.

### 2025 IM 70.3 Oceanside

2,962 athletes · 2,540 finishers · 196 DNFs · 2,564 RTRT start times matched

All 5 leg invariants pass.

### 2025 IM 70.3 Rockford

2,071 athletes · 1,821 finishers · 249 DNFs · 2,004 RTRT start times matched

All 5 leg invariants pass. Cross-checked Tom Arra (bib 361, overall 751st):

| Leg             | Reference | Algorithm | Delta    |
| --------------- | --------- | --------- | -------- |
| Swim passed     | 70        | 76        | +6       |
| Swim got passed | 12        | 11        | -1       |
| Bike passed     | 140       | 137       | -3       |
| Bike got passed | 65        | 66        | +1       |
| Run passed      | 19        | 19        | ✅ exact |
| Run got passed  | 196       | 184       | -12      |

Remaining delta explained by ~67 athletes present in one dataset but not the
other (97% match rate).
