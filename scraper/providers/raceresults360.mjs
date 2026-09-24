/**
 * raceresults360 provider for racereplay.mjs
 *
 * Fetches race data from RaceResults 360 (api.v2.raceresults360.com), the
 * results widget embedded by timing companies such as Trinity Timing
 * (trinitytiming.com/results/#/race/<raceKey>/<event>/).
 *
 * The API is scoped per timing-company account: requests need an
 * `x-api-key: rr360-api-key-account-<account>` header (the widget builds this
 * from its `account-id` attribute) and an Origin the account has whitelisted,
 * i.e. the timing company's own site.
 *
 * Discovery flow:
 *   1. GET /v2/race/<raceKey>                        — event list + timing mappings
 *   2. GET /v2/race/<raceKey>/<event>/results?start=N — 30 athletes per page,
 *      each with leg durations and per-leg time-of-day (TOD) values
 *
 * Multiple events (e.g. Individuals + Relays) can be merged into one output so
 * a race matches how other providers group a contest. Overall and gender
 * ranks are recomputed across the merged set.
 *
 * Required flags: --url <results URL containing #/race/<raceKey>/...>
 *                 --race-date <YYYY-MM-DD>
 * Optional flags: --account <id>   (default: trinitytiming)
 *                 --origin <url>   (default: https://<account>.com)
 *                 --events 1,2     (default: event in the URL, else 1)
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const BASE = "https://api.v2.raceresults360.com/v2/race";
const PAGE_SIZE = 30;

// Output leg name → [duration field, TOD field]. Names match the other
// providers' triathlon output so races.config.json segmentNames apply.
const TRI_LEGS = [
  ["Swim",        "SWIM", "SWIM_TOD"],
  ["Transition1", "T1",   "T1_TOD"],
  ["Bike",        "BIKE", "BIKE_TOD"],
  ["Transition2", "T2",   "T2_TOD"],
  ["Run",         "RUN",  "FIN_TOD"],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function parseRaceUrl(url) {
  const m = url.match(/#\/race\/([A-Za-z0-9]+)(?:\/(\d+))?/);
  if (!m) throw new Error(`Could not parse race key from URL: ${url}`);
  return { raceKey: m[1], event: m[2] ?? null };
}

/** Parses "H:MM:SS" / "MM:SS" into seconds. Returns null on failure. */
export function parseClock(v) {
  if (v == null || v === "") return null;
  const parts = String(v).trim().split(":").map(Number);
  if (parts.some(isNaN) || parts.length < 2) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function mapGender(sex, isRelay) {
  if (isRelay) return "Open";
  switch ((sex ?? "").trim().toUpperCase()) {
    case "M": return "Male";
    case "F": return "Female";
    default:  return "Open";
  }
}

const RELAY_DIVS = { "T COED": "Mixed Relay", "T FEM": "Female Relay", "T MALE": "Male Relay" };

/** "M 30-34" → "Male 30-34", "T COED" → "Mixed Relay"; others unchanged. */
export function normalizeDivision(div) {
  const d = (div ?? "").trim();
  if (RELAY_DIVS[d]) return RELAY_DIVS[d];
  const m = d.match(/^([MF]) (.+)$/);
  if (m) return `${m[1] === "M" ? "Male" : "Female"} ${m[2]}`;
  return d;
}

function athleteName(r, isRelay) {
  if (isRelay && r["TEAM NAME"]) return r["TEAM NAME"].trim();
  return `${r["FIRST NAME"] ?? ""} ${r["LAST NAME"] ?? ""}`.trim();
}

// ─── API calls ────────────────────────────────────────────────────────────────

function headers(account, origin) {
  return {
    "User-Agent": UA,
    "x-api-key": `rr360-api-key-account-${account}`,
    Origin: origin,
    Referer: `${origin}/`,
  };
}

async function getJson(url, reqHeaders) {
  const res = await fetch(url, { headers: reqHeaders });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error || data?.message) {
    const msg = data?.error?.err ?? data?.message ?? `HTTP ${res.status}`;
    throw new Error(`${msg} (${url})`);
  }
  return data;
}

async function fetchEventResults(raceKey, event, reqHeaders) {
  const rows = [];
  let total = Infinity;
  for (let start = 0; start < total; start += PAGE_SIZE) {
    const data = await getJson(`${BASE}/${raceKey}/${event}/results?start=${start}`, reqHeaders);
    total = data.total ?? 0;
    rows.push(...(data.results ?? []));
    process.stdout.write(`   event ${event}: ${rows.length}/${total}\r`);
    if (!data.results?.length) break;
  }
  console.log(`   event ${event}: ${rows.length}/${total} athletes`);
  return rows;
}

// ─── Transform ────────────────────────────────────────────────────────────────

/**
 * Converts raw RaceResults 360 rows into the normalized athlete format
 * expected by the passing algorithm.
 *
 * Only the fields listed here are read — the API also returns contact
 * details (e.g. email) which must never reach the output.
 *
 * @param {Array<{row: object, isRelay: boolean}>} entries
 * @param {number} raceDateMs - Race date as ms since epoch (UTC midnight)
 */
export function transformAthletes(entries, raceDateMs) {
  const raceDateSec = raceDateMs / 1000;
  const legNames = TRI_LEGS.map(([name]) => name);

  // TODs are wall-clock strings; if a later TOD is earlier than the start
  // (12h clock rollover), push it forward 12h.
  const todAfter = (tod, ref) => {
    if (tod == null || ref == null) return tod;
    while (tod < ref) tod += 12 * 3600;
    return tod;
  };

  const athletes = [];
  const startEpochs = new Map();

  for (const { row: r, isRelay } of entries) {
    const bib = String(r["NO."] ?? "").trim();
    const gender = mapGender(r.SEX, isRelay);
    const division = normalizeDivision(r.DIV);
    const city = [r.CITY, r.STATE].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");

    const startTod = parseClock(r.WAVE_START);
    const startEpoch = startTod != null ? raceDateSec + startTod : null;
    if (startEpoch != null) startEpochs.set(bib, startEpoch);

    const legSecs = {};
    const legEpochs = {};
    let prevTod = startTod;
    for (const [name, durField, todField] of TRI_LEGS) {
      const secs = parseClock(r[durField]);
      let tod = todAfter(parseClock(r[todField]), prevTod);
      // Fall back to accumulating durations when a TOD is missing
      if (tod == null && secs != null && prevTod != null) tod = prevTod + secs;
      legSecs[name] = secs != null ? Math.max(0, Math.round(secs)) : null;
      legEpochs[name] = tod != null && prevTod != null ? raceDateSec + tod : null;
      prevTod = legEpochs[name] != null ? tod : null;
    }

    const finishSecs = parseClock(r.FINALTM);
    const dq = (r.DQ ?? "").trim();
    const finished = !dq && finishSecs != null && finishSecs > 0 && legEpochs.Run != null;

    athletes.push({
      bib,
      name: athleteName(r, isRelay),
      gender,
      country: "",
      city,
      team: isRelay ? "" : (r["TEAM NAME"] ?? "").trim(),
      division,
      status: finished ? "FIN" : (dq ? "DQ" : "DNF"),
      overallRank: null,
      genderRank: null,
      divisionRank: finished ? parseInt(r.DIVP, 10) || null : null,
      finishSecs: finished ? finishSecs : null,
      waveTime: null,
      legSecs,
      legEpochs,
      categoryTotals: {},
      startEpoch,
      waveOffset: null,
      cumPositions: {},
    });
  }

  // Recompute overall / gender ranks and category totals across the merged set
  const finishers = athletes
    .filter((a) => a.status === "FIN")
    .sort((a, b) => a.finishSecs - b.finishSecs);
  const genderTotals = new Map();
  const divisionTotals = new Map();
  const genderSeen = new Map();
  finishers.forEach((a, i) => {
    a.overallRank = i + 1;
    genderSeen.set(a.gender, (genderSeen.get(a.gender) ?? 0) + 1);
    a.genderRank = genderSeen.get(a.gender);
    divisionTotals.set(a.division, (divisionTotals.get(a.division) ?? 0) + 1);
  });
  for (const [g, n] of genderSeen) genderTotals.set(g, n);
  for (const a of athletes) {
    a.categoryTotals = {
      overall: finishers.length,
      gender: genderTotals.get(a.gender) ?? null,
      division: divisionTotals.get(a.division) ?? null,
    };
  }

  athletes.sort((a, b) => (a.overallRank ?? 99999) - (b.overallRank ?? 99999));

  const dnfCount = athletes.length - finishers.length;
  console.log(`   Finishers: ${finishers.length} | DNF/DQ: ${dnfCount}`);

  return { athletes, legNames, startEpochs };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * @param {string} eventId        - Used only for the output filename
 * @param {object} opts
 * @param {string} opts.url       - Results URL containing #/race/<raceKey>
 * @param {string} opts.raceDate  - Race date YYYY-MM-DD
 * @param {string} [opts.account] - RR360 account id (default: trinitytiming)
 * @param {string} [opts.origin]  - Whitelisted origin (default: https://<account>.com)
 * @param {string} [opts.events]  - Comma-separated event numbers to merge
 */
export async function fetchRaceData(eventId, opts) {
  const { url, raceDate } = opts;
  if (!url)      throw new Error("--url is required for the raceresults360 provider");
  if (!raceDate) throw new Error("--race-date <YYYY-MM-DD> is required for the raceresults360 provider");

  const account = opts.account ?? "trinitytiming";
  const origin = opts.origin ?? `https://${account}.com`;
  const reqHeaders = headers(account, origin);

  const raceDateMs = new Date(`${raceDate}T00:00:00Z`).getTime();
  if (isNaN(raceDateMs)) throw new Error(`Invalid --race-date: ${raceDate}`);

  const { raceKey, event: urlEvent } = parseRaceUrl(url);

  console.log(`\n🔍 Fetching race ${raceKey}...`);
  const race = await getJson(`${BASE}/${raceKey}`, reqHeaders);
  console.log(`   Race: ${race.name} (${race.event_date})`);
  if (race.event_date && race.event_date !== raceDate) {
    console.warn(`   ⚠️  --race-date ${raceDate} differs from API event_date ${race.event_date}`);
  }

  const events = (opts.events ?? urlEvent ?? "1").split(",").map((e) => e.trim()).filter(Boolean);
  const available = Object.keys(race.event_metadata ?? {});
  for (const e of events) {
    if (available.length && !available.includes(e)) {
      throw new Error(`Event ${e} not found. Available: ${available.join(", ")}`);
    }
  }

  console.log(`\n⬇️  Fetching results for event(s) ${events.join(", ")}...`);
  const entries = [];
  for (const e of events) {
    const divs = race.event_metadata?.[e]?.divisions ?? [];
    const isRelay = divs.some((d) => d in RELAY_DIVS);
    const rows = await fetchEventResults(raceKey, e, reqHeaders);
    for (const row of rows) entries.push({ row, isRelay });
  }
  if (!entries.length) throw new Error("No athletes returned");

  return transformAthletes(entries, raceDateMs);
}
