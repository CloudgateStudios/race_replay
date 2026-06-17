/**
 * raceresult provider for racereplay.mjs
 *
 * Fetches race data from the raceresult.com API, which powers myrace.ai.
 * The API URL is discovered automatically by scraping the myrace.ai results
 * page and extracting the embedded raceresult.com endpoint.
 *
 * All athlete splits arrive in a single API response (no pagination), keyed
 * by bib. Split times are expressed as seconds-since-midnight for the race day,
 * which are converted to Unix epoch timestamps using --race-date.
 *
 * Required flags: --url <myrace.ai results URL>  OR  --api-url <raceresult API URL>
 *                 --race-date <YYYY-MM-DD>
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// Canonical split point labels in course order. Used for human-readable leg
// names — the actual JSON key names may vary in casing (e.g. "Start TOD" vs
// "START TOD") and are matched case-insensitively at runtime.
const CANONICAL_SPLITS = [
  { label: "START", legName: null },
  { label: "5K",    legName: "5K" },
  { label: "10K",   legName: "10K" },
  { label: "15K",   legName: "15K" },
  { label: "20K",   legName: "20K" },
  { label: "HALF",  legName: "HALF" },
  { label: "25K",   legName: "25K" },
  { label: "30K",   legName: "30K" },
  { label: "35K",   legName: "35K" },
  { label: "40K",   legName: "40K" },
  { label: "FINISH",legName: "FINISH" },
];

/**
 * Parses a TOD value that may be a float (seconds since midnight) or an
 * "HH:MM:SS" / "H:MM:SS" string. Returns seconds as a float, or null.
 */
function parseTod(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const parts = String(v).split(":").map(Number);
  if (parts.some(isNaN) || parts.length < 2) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

/**
 * Resolves which actual JSON keys in a record correspond to the canonical split
 * labels, matching case-insensitively (e.g. "Start TOD" matches "START TOD").
 * Returns an ordered array of { legName, key } for each split that is present.
 */
function resolveSplitKeys(record) {
  const lowerKeys = Object.fromEntries(
    Object.keys(record).map((k) => [k.toLowerCase(), k])
  );
  const resolved = [];
  for (const { label, legName } of CANONICAL_SPLITS) {
    const needle = `${label.toLowerCase()} tod`;
    const actualKey = lowerKeys[needle];
    if (actualKey !== undefined && parseTod(record[actualKey]) != null) {
      resolved.push({ legName, key: actualKey });
    }
  }
  return resolved;
}

/**
 * Scrapes the myrace.ai results page and extracts the first raceresult.com
 * API URL embedded in the HTML. Returns null if none is found.
 */
async function discoverApiUrl(myRaceUrl) {
  console.log(`\n🔍 Discovering raceresult API URL from: ${myRaceUrl}`);
  const res = await fetch(myRaceUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Failed to fetch myrace.ai page: HTTP ${res.status}`);
  const html = await res.text();

  // The page embeds raceresult API URLs as string literals in the JS bundle
  const match = html.match(/https:\/\/api\.raceresult\.com\/[^"\\]+/);
  if (!match) throw new Error("Could not find a raceresult.com API URL in the page source");

  console.log(`   Found API URL: ${match[0]}`);
  return match[0];
}

/**
 * Fetches all athlete records from the raceresult.com API.
 * Returns the raw JSON array.
 */
async function fetchRaceResultData(apiUrl) {
  console.log(`\n⬇️  Fetching race data from raceresult.com...`);
  const res = await fetch(apiUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`raceresult API → HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Unexpected response format from raceresult API");
  console.log(`   Received ${data.length} athlete records`);
  return data;
}

/**
 * Converts raceresult records into the normalized athlete format expected by
 * the shared passing algorithm.
 *
 * @param {object[]} records     - Raw raceresult JSON records
 * @param {number}   raceDateMs  - Milliseconds since Unix epoch for race date midnight UTC
 * @returns {{ athletes: object[], legNames: string[], startEpochs: Map }}
 */
function transformAthletes(records, raceDateMs) {
  const athletes = [];
  const startEpochs = new Map();
  const raceDateSec = raceDateMs / 1000;

  // Resolve which JSON keys are present and map them to canonical leg names
  const firstRecord = records[0] ?? {};
  const resolvedSplits = resolveSplitKeys(firstRecord);
  if (resolvedSplits.length < 2) {
    throw new Error(
      `Expected at least 2 TOD split keys in the data; found: ${resolvedSplits.map((s) => s.key).join(", ")}`
    );
  }

  console.log(`   Splits detected: ${resolvedSplits.map((s) => s.key).join(", ")}`);

  // The start is the first resolved split (legName === null); everything after is a leg
  const startSplit = resolvedSplits[0];
  const legSplits = resolvedSplits.slice(1); // each has { legName, key }
  const activeLegNames = legSplits.map((s) => s.legName);

  // Collect category totals (finishers per gender/division) for the report
  const genderTotals = new Map();
  const divisionTotals = new Map();
  for (const r of records) {
    if (r.Status !== "" && r.Status !== 0) continue; // skip DNFs
    const g = r.Gender === "M" ? "Male" : r.Gender === "F" ? "Female" : r.Gender;
    if (g) genderTotals.set(g, (genderTotals.get(g) ?? 0) + 1);
    if (r["Division Place"]) {
      const div = r["Division Place"].replace(/\s+Podium$/, "").trim();
      if (div) divisionTotals.set(div, (divisionTotals.get(div) ?? 0) + 1);
    }
  }
  const overallTotal = records.filter((r) => r.Status === "" || r.Status === 0).length;

  for (const r of records) {
    const bib = String(r.Bib);
    const isDnf = r.Status !== "" && r.Status !== 0;
    const gender = r.Gender === "M" ? "Male" : r.Gender === "F" ? "Female" : r.Gender ?? "";

    // TOD values may be floats (seconds since midnight) or "HH:MM:SS" strings
    const startTod = parseTod(r[startSplit.key]);
    const startEpoch = startTod != null ? raceDateSec + startTod : null;
    if (startEpoch != null) startEpochs.set(bib, startEpoch);

    // Compute per-leg duration in whole seconds from consecutive TOD values
    const legSecs = {};
    const legEpochs = {};
    let prevTod = startTod;
    for (const { legName, key } of legSplits) {
      const todCurr = parseTod(r[key]);
      if (todCurr != null && prevTod != null) {
        legSecs[legName] = Math.max(0, Math.round(todCurr - prevTod));
        legEpochs[legName] = raceDateSec + todCurr;
        prevTod = todCurr;
      } else {
        legSecs[legName] = null;
        legEpochs[legName] = null;
        prevTod = null;
      }
    }

    // Finish time = finish TOD - start TOD (chip time)
    const finishTod = parseTod(r[legSplits[legSplits.length - 1]?.key]);
    const finishSecs =
      finishTod != null && startTod != null
        ? Math.round(finishTod - startTod)
        : null;

    // Parse "H:MM:SS" or "M:SS" finish time string when TOD values are strings
    const finishTimeStr = r["Time"] ?? r["Chip Time"] ?? null;
    const finishSecsFallback = finishTimeStr
      ? (() => {
          const parts = finishTimeStr.split(":").map(Number);
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          if (parts.length === 2) return parts[0] * 60 + parts[1];
          return null;
        })()
      : null;

    const divisionStr = (r["Division Place"] ?? "").replace(/\s+Podium$/, "").trim();

    // Overall / gender / division rank: raceresult supplies "Place" as "1." etc.
    const parseRank = (v) => {
      if (v == null) return null;
      const n = parseInt(String(v).replace(/\.$/, ""), 10);
      return isNaN(n) ? null : n;
    };

    athletes.push({
      bib,
      name: r.Name ?? "",
      gender,
      country: r.Country ?? "",
      city: [r.City, r.State].filter(Boolean).join(", "),
      team: "",
      division: divisionStr,
      status: isDnf ? "DNF" : "FIN",
      overallRank: parseRank(r.Place ?? r["Place (Do Not Use)"]),
      genderRank: parseRank(r["Gender Place"] ?? r["Gender Pl (DO NOT USE)"]),
      divisionRank: parseRank(r["Division Place"] ?? r["Division Pl (DO NOT USE)"]),
      finishSecs: finishSecs ?? finishSecsFallback,
      waveTime: null,
      legSecs,
      legEpochs,
      categoryTotals: {
        overall: overallTotal,
        gender: genderTotals.get(gender) ?? null,
        division: divisionTotals.get(divisionStr) || null,
      },
      startEpoch,
      waveOffset: null,
      cumPositions: {},
    });
  }

  // Sort by overall rank (DNFs last)
  athletes.sort((a, b) => (a.overallRank ?? 99999) - (b.overallRank ?? 99999));

  const finisherCount = athletes.filter((a) => a.status === "FIN").length;
  const dnfCount = athletes.filter((a) => a.status === "DNF").length;
  console.log(`   Finishers: ${finisherCount} | DNFs: ${dnfCount}`);

  return { athletes, legNames: activeLegNames, startEpochs };
}

/**
 * Main entry point for the raceresult provider.
 *
 * @param {string}   eventId    - Used only for the output filename
 * @param {object}   opts
 * @param {string}   [opts.url]       - myrace.ai results page URL (for auto-discovery)
 * @param {string}   [opts.apiUrl]    - Direct raceresult.com API URL (skips discovery)
 * @param {string}   opts.raceDate    - Race date as YYYY-MM-DD (required)
 * @returns {Promise<{ athletes: object[], legNames: string[], startEpochs: Map }>}
 */
export async function fetchRaceData(eventId, opts) {
  const { url, apiUrl: explicitApiUrl, raceDate } = opts;

  if (!raceDate) throw new Error("--race-date <YYYY-MM-DD> is required for the raceresult provider");
  if (!url && !explicitApiUrl) throw new Error("--url or --api-url is required for the raceresult provider");

  const raceDateMs = new Date(`${raceDate}T00:00:00Z`).getTime();
  if (isNaN(raceDateMs)) throw new Error(`Invalid --race-date: ${raceDate}`);

  const apiUrl = explicitApiUrl ?? (await discoverApiUrl(url));
  const records = await fetchRaceResultData(apiUrl);
  return transformAthletes(records, raceDateMs);
}
