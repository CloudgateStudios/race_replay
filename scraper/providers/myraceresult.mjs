/**
 * myraceresult provider for racereplay.mjs
 *
 * Fetches race data from my.raceresult.com, which hosts races directly on
 * the raceresult platform (as opposed to the myrace.ai wrapper used by the
 * raceresult provider). The two sites use different APIs:
 *   - my.raceresult.com  → per-event REST API (this provider)
 *   - myrace.ai          → api.raceresult.com bulk JSON (raceresult provider)
 *
 * Discovery flow:
 *   1. GET /<id>/results/config  — returns auth key, contest list, details tab
 *   2. GET /<id>/results/list    — all athletes with split durations
 *   3. GET /<id>/<detailsTab>/view?pid=<id>  — per-athlete TOD timestamps
 *      (needed for epoch times; fetched in parallel with --concurrency workers)
 *
 * Required flags: --url <my.raceresult.com URL>
 *                 --race-date <YYYY-MM-DD>
 * Optional flags: --contest <ShowAs name>  (e.g. "Sprint", "Duathlon")
 *                 --concurrency <n>        (default: 20)
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const BASE = "https://my.raceresult.com";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseEventId(url) {
  const m = url.match(/my\.raceresult\.com\/(\d+)/);
  if (!m) throw new Error(`Could not parse event ID from URL: ${url}`);
  return m[1];
}

/**
 * Parses an "HH:MM:SS" or "MM:SS" time-of-day string into seconds since midnight.
 * Accepts numeric seconds directly (passthrough). Returns null on failure.
 */
export function parseTod(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const parts = String(v).split(":").map(Number);
  if (parts.some(isNaN) || parts.length < 2) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function mapGender(v) {
  switch ((v ?? "").trim().toUpperCase()) {
    case "M": return "Male";
    case "F": return "Female";
    default:  return "Open"; // "A" = relay/team, blank = unknown
  }
}

function parseRank(s) {
  if (!s) return null;
  const n = parseInt(String(s).replace(/\.$/, ""), 10);
  return isNaN(n) ? null : n;
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function fetchConfig(eventId) {
  const url = `${BASE}/${eventId}/results/config`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Config fetch failed: HTTP ${res.status} for ${url}`);
  const data = await res.json();
  if (data.error) throw new Error(`Config error: ${data.error}`);
  return data;
}

async function fetchResultsList(eventId, key, listName) {
  const params = new URLSearchParams({ key, listname: listName, page: "results" });
  const url = `${BASE}/${eventId}/results/list?${params}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Results list fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Results list error: ${data.error}`);
  return data;
}

async function fetchDetailView(eventId, detailsTab, key, pid) {
  const params = new URLSearchParams({ key, pid });
  const url = `${BASE}/${eventId}/${detailsTab}/view?${params}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.Data?.SplitsAndLegs ?? null;
  } catch {
    return null;
  }
}

// ─── Transform ────────────────────────────────────────────────────────────────

/**
 * Merges the results list with per-athlete detail views into the normalized
 * athlete format expected by the passing algorithm.
 *
 * @param {object}          listData    - Response from results/list endpoint
 * @param {Map<string, ?>}  detailMap   - pid → SplitsAndLegs from details/view
 * @param {number}          raceDateMs  - Race date as ms since epoch (UTC midnight)
 */
export function transformAthletes(listData, detailMap, raceDateMs) {
  const { data: rows, DataFields: fields } = listData;
  const raceDateSec = raceDateMs / 1000;

  // Locate field indices by name prefix (the DataFields use raceresult formula expressions)
  function fieldIdx(prefix) {
    const f = fields.find((f) => f.startsWith(prefix));
    return f !== undefined ? fields.indexOf(f) : -1;
  }

  const bibIdx      = fields.indexOf("BIB");
  const idIdx       = fields.indexOf("ID");
  const rankIdx     = fieldIdx("WithStatus([OverallRank");
  const nameIdx     = fieldIdx("if([TeamName]");
  const cityIdx     = fieldIdx("CorrectSpelling([CITY]");
  const stateIdx    = fields.indexOf("STATE2");
  const genderIdx   = fields.indexOf("GenderMF");
  const divIdx      = fieldIdx("if([category]");
  const divRankIdx  = fieldIdx("WithStatus(switch");
  const timeIdx     = fields.indexOf("TIME");

  // Determine canonical leg names from the first athlete that has detail data
  let legNames = null;
  for (const [, sl] of detailMap) {
    if (sl?.Legs?.length) {
      legNames = sl.Legs.map((l) => l.Name);
      break;
    }
  }
  if (!legNames) {
    // Fall back to split duration field names from the list (everything between ID and TIME)
    const skipFields = new Set(["BIB", "ID", "STATE2", "AGEONDEC31", "GenderMF", "TIME"]);
    legNames = fields.filter((f) => {
      if (skipFields.has(f)) return false;
      if (f.startsWith("if(") || f.startsWith("With") || f.startsWith("Correct")) return false;
      return true;
    });
  }

  // Pre-scan finishers for category totals
  const genderTotals   = new Map();
  const divisionTotals = new Map();
  let overallTotal = 0;

  for (const row of rows) {
    const rankStr = row[rankIdx] ?? "";
    const isDnf   = !rankStr || isNaN(parseInt(String(rankStr).replace(/\.$/, ""), 10));
    if (isDnf) continue;
    overallTotal++;
    const gender   = mapGender(row[genderIdx]);
    const division = (row[divIdx] ?? "").trim();
    if (gender)   genderTotals.set(gender, (genderTotals.get(gender) ?? 0) + 1);
    if (division) divisionTotals.set(division, (divisionTotals.get(division) ?? 0) + 1);
  }

  const athletes    = [];
  const startEpochs = new Map();

  for (const row of rows) {
    const bib     = String(row[bibIdx] ?? "");
    const pid     = String(row[idIdx]  ?? "");
    const rankStr = String(row[rankIdx] ?? "");
    const isDnf   = !rankStr || isNaN(parseInt(rankStr.replace(/\.$/, ""), 10));
    const gender  = mapGender(row[genderIdx]);

    const name     = (row[nameIdx]  ?? "").trim();
    const cityBase = (row[cityIdx]  ?? "").trim();
    const state    = (row[stateIdx] ?? "").trim();
    const city     = state ? `${cityBase}, ${state}` : cityBase;
    const division = (row[divIdx]   ?? "").trim();
    const finishStr = (row[timeIdx]  ?? "").trim() || null;

    const overallRank = isDnf ? null : parseRank(rankStr);

    // Division rank: "1/18" or "1." → 1
    const divRankStr  = String(row[divRankIdx] ?? "").replace(/DNF|DNS/gi, "").trim();
    const divRankMatch = divRankStr.match(/^(\d+)/);
    const divisionRank = divRankMatch ? parseInt(divRankMatch[1], 10) : null;

    // TOD data from participant detail view
    const sl     = detailMap.get(pid);
    const splits = sl?.Splits ?? [];
    const legs   = sl?.Legs   ?? [];

    // Gender rank from the finish split's RG field
    const finishSplit = splits.findLast?.((s) => s.Name === "Finish" && s.Exists) ??
                        splits[splits.length - 1];
    const genderRank = finishSplit?.RG ?? null;

    // Start epoch: first split's TOD
    const startSplit = splits[0];
    const startTod   = startSplit?.Exists ? parseTod(startSplit.TOD) : null;
    const startEpoch = startTod != null ? raceDateSec + startTod : null;
    if (startEpoch != null) startEpochs.set(bib, startEpoch);

    // Per-leg epoch times and durations
    // Splits array: [Start, CheckpointA, CheckpointB, ..., Finish]
    // Legs array:   [LegA, LegB, ..., LegN]  (Legs[i] ends at Splits[i+1])
    const legSecs   = {};
    const legEpochs = {};
    let   prevTod   = startTod;

    for (let i = 0; i < legNames.length; i++) {
      const legName  = legNames[i];
      const endSplit = splits[i + 1] ?? null;
      const tod      = endSplit?.Exists ? parseTod(endSplit.TOD) : null;

      if (tod != null && prevTod != null) {
        legEpochs[legName] = raceDateSec + tod;
        legSecs[legName]   = Math.max(0, Math.round(tod - prevTod));
        prevTod = tod;
      } else {
        legEpochs[legName] = null;
        legSecs[legName]   = null;
        prevTod = null;
      }
    }

    // Finish time in seconds (chip time = finish TOD - start TOD)
    const finishTodVal = finishSplit?.Exists ? parseTod(finishSplit.TOD) : null;
    const finishSecsFromTod = finishTodVal != null && startTod != null
      ? Math.round(finishTodVal - startTod)
      : null;
    const finishSecsFromStr = parseTod(finishStr);
    const finishSecs = finishSecsFromTod ?? finishSecsFromStr;

    athletes.push({
      bib,
      name,
      gender,
      country: "",
      city,
      team: "",
      division,
      status: isDnf ? "DNF" : "FIN",
      overallRank,
      genderRank: genderRank != null ? Number(genderRank) : null,
      divisionRank,
      finishSecs,
      waveTime: null,
      legSecs,
      legEpochs,
      categoryTotals: {
        overall:  overallTotal,
        gender:   genderTotals.get(gender)   ?? null,
        division: divisionTotals.get(division) ?? null,
      },
      startEpoch,
      waveOffset:   null,
      cumPositions: {},
    });
  }

  athletes.sort((a, b) => (a.overallRank ?? 99999) - (b.overallRank ?? 99999));

  const finisherCount = athletes.filter((a) => a.status === "FIN").length;
  const dnfCount      = athletes.filter((a) => a.status === "DNF").length;
  console.log(`   Finishers: ${finisherCount} | DNFs: ${dnfCount}`);

  return { athletes, legNames, startEpochs };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Main entry point for the myraceresult provider.
 *
 * @param {string} eventId       - Used only for the output filename
 * @param {object} opts
 * @param {string} opts.url      - my.raceresult.com URL
 * @param {string} opts.raceDate - Race date YYYY-MM-DD
 * @param {string} [opts.contest] - Contest ShowAs name (e.g. "Sprint"). Defaults to first list.
 * @param {number} [opts.concurrency] - Parallel detail-view fetches (default: 20)
 */
export async function fetchRaceData(eventId, opts) {
  const { url, raceDate, contest: contestName, concurrency = 20 } = opts;

  if (!url)      throw new Error("--url is required for the myraceresult provider");
  if (!raceDate) throw new Error("--race-date <YYYY-MM-DD> is required for the myraceresult provider");

  const parsedId  = parseEventId(url);
  const raceDateMs = new Date(`${raceDate}T00:00:00Z`).getTime();
  if (isNaN(raceDateMs)) throw new Error(`Invalid --race-date: ${raceDate}`);

  // 1. Config: get auth key, contest list, details tab name
  console.log(`\n🔍 Fetching config for event ${parsedId}...`);
  const config      = await fetchConfig(parsedId);
  const { key, eventname, TabConfig: tabConfig } = config;
  const detailsTab  = tabConfig?.StandardDetails ?? "details0";
  const lists       = tabConfig?.Lists ?? [];

  console.log(`   Event: ${eventname}`);
  if (!lists.length) throw new Error("No result lists found in event config");
  console.log(`   Available contests: ${lists.map((l) => l.ShowAs).join(", ")}`);

  // 2. Select list/contest
  let selectedList;
  if (contestName) {
    selectedList = lists.find((l) => l.ShowAs.toLowerCase() === contestName.toLowerCase());
    if (!selectedList) {
      throw new Error(
        `Contest "${contestName}" not found. Available: ${lists.map((l) => l.ShowAs).join(", ")}`
      );
    }
  } else {
    selectedList = lists[0];
    console.log(`   No --contest given, defaulting to: ${selectedList.ShowAs}`);
  }
  console.log(`   List: ${selectedList.Name}`);

  // 3. Fetch all athletes from the results list
  console.log(`\n⬇️  Fetching ${selectedList.ShowAs} results...`);
  const listData = await fetchResultsList(parsedId, key, selectedList.Name);
  const rows     = listData.data ?? [];
  const fields   = listData.DataFields ?? [];
  console.log(`   ${rows.length} athletes loaded`);

  if (!rows.length) throw new Error("No athletes returned from results list");

  const idIdx     = fields.indexOf("ID");
  const athleteIds = rows.map((row) => String(row[idIdx]));

  // 4. Batch-fetch participant detail views for TOD timestamps
  console.log(`\n⬇️  Fetching split timestamps (${concurrency} concurrent)...`);
  const detailMap = new Map();
  let fetched = 0;
  const fetchStart = Date.now();
  const queue = [...athleteIds];

  async function worker() {
    while (queue.length > 0) {
      const pid = queue.shift();
      if (!pid) break;
      const sl = await fetchDetailView(parsedId, detailsTab, key, pid);
      if (sl) detailMap.set(pid, sl);
      fetched++;
      if (fetched % 50 === 0 || fetched === athleteIds.length) {
        const elapsed = ((Date.now() - fetchStart) / 1000).toFixed(1);
        const rate    = (fetched / ((Date.now() - fetchStart) / 1000)).toFixed(0);
        process.stdout.write(`   ${fetched}/${athleteIds.length}  ${rate}/s  ${elapsed}s\r`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, athleteIds.length) }, worker)
  );

  const elapsed = ((Date.now() - fetchStart) / 1000).toFixed(1);
  console.log(`   Done: ${detailMap.size}/${athleteIds.length} athletes fetched in ${elapsed}s`);

  // 5. Transform into the format expected by the passing algorithm
  return transformAthletes(listData, detailMap, raceDateMs);
}
