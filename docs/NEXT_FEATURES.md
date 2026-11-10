# Race Replay — Next Features

Larger features that require more design or infrastructure work before
implementation. These go beyond the incremental enhancements already shipped.

---

## 1. Athlete Profile Pages

### What it is
A per-athlete page (`/athletes/[slug]`) that aggregates results across all
races and years for the same person — finish times, leg-by-leg net passes,
division history, and trends over time.

### Why it's hard
Athlete identity across events is fuzzy. The database has no global athlete ID —
each row is scoped to a single event. Two rows named "John Smith" may be the
same person or two different people.

### Matching strategy (validated against local data)

**Primary key: `name + gender + country` (case-insensitive)**

Tested against the full local dataset. Results:
- 456 multi-year athletes found at IM 70.3 Oceanside alone using this key.
- Pro athletes (Blummenfelt, Iden, Kanute, etc.) match perfectly.
- Legitimate division drift (M25-29 → M30-34, M30-34 → MPRO) is handled
  naturally since we don't require division to match.
- Common names with the same gender+country (e.g. "Mark Johnson / Male / US")
  are a real ambiguity — see edge cases below.

**Why not name-only?**
`name + gender + country` dramatically reduces collisions. "Jose Garcia" splits
cleanly into US / MX / PR groups. "Luis Martinez" splits into 5 distinct
country groups. Tested across the top-30 most common names in the DB.

### Edge cases identified

| Case | Example | Handling |
|---|---|---|
| Duplicate ingest | John Leddy has 2 rows for 2025 (one with rank 99999 / blank time) | Within a year, prefer the row with a real finish time; fall back to DNF |
| Same name, same country, different divisions far apart | Mark Johnson M40-44 + M55-59 same year | Likely two real people — surface as ambiguous, don't merge |
| `anonymous` athletes | 5 rows with name "anonymous" | Skip profile pages for blank/anonymous names |
| Gender mis-entry | "Amor Camatcho" appears as both M65-69 and F30-34 same country | country+gender split handles this correctly — two separate profiles |
| Division drift | Scott Catto M25-29 → M30-34 year-over-year | Expected, no action needed |

### Data work needed before building

1. **Slug strategy** — profile URL slug derived from athlete name
   (`kristian-blummenfelt`). Collisions (two people with same name/gender/country)
   need a disambiguation page or a numeric suffix.

2. **Deduplication within a year** — when the same profile key appears more
   than once in a single event (duplicate ingest artifact), the page needs to
   pick the canonical row. Rule: prefer row with a real `finishTime`; if
   multiple have one, that's a genuine same-name collision within the event.

3. **Re-ingest Chattanooga cleanly** — currently ingested twice under two
   different slugs (`im-703-chattanooga` and `ironman-chattanooga-70.3`).
   Both have been dropped from local DB. Needs a canonical source file and
   a single consistent slug before re-ingesting.

4. **Consider a `profile_override` table** — for the edge cases above, a small
   admin table that explicitly links or unlinks athlete rows would let us correct
   mis-matches without touching ingest logic.

### Prototype scripts (already written)

| Script | Purpose |
|---|---|
| `scripts/profile-test.ts` | Look up a name and show how it groups across events |
| `scripts/common-names-test.ts` | Find top common names and flag ambiguous groupings |
| `scripts/multi-year-athletes.ts` | Find all athletes who appear across 2+ years of a race |
| `scripts/drop-race.ts` | Delete a race + all associated data by slug (for re-ingest) |

### What the page would show
- Athlete name, gender, country, division history
- Table of results per event: year, race name, finish time, overall rank, net passes
- Career stats: total races, total net passes, best finish time
- Link to each individual event's athlete detail page

### Not yet designed
- Whether profiles are auto-generated or opt-in claimed by the athlete
- Whether a "claim this profile" / correction flow is needed
- Auth/accounts implications

---

## 2. (Future features here)
