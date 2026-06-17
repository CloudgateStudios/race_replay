#!/usr/bin/env node
/**
 * racereplay.mjs
 *
 * Fetches race split data from a timing provider and runs the leg-by-leg
 * physical passing algorithm, producing a _passing.csv ready for ingestion.
 *
 * Usage:
 *   node scraper/racereplay.mjs <event-id> [options]
 *
 * Provider selection:
 *   --provider <name>     Timing data source. Default: rtrt
 *                         Supported: rtrt, raceresult
 *
 * ── rtrt provider ────────────────────────────────────────────────────────────
 *   Fetches from RTRT.me. Split data is fetched per-timing-point and cached
 *   to disk, making the run resumable if interrupted.
 *
 *   --appid <id>          RTRT app ID (required). Find it in the page source
 *                         at track.rtrt.me/e/<event-id> (search "appid").
 *   --points <list>       Comma-separated timing point names, in order.
 *                         Overrides auto-discovery.
 *                         Example: --points START,SWIM,T1,BIKE,T2,FINISH
 *   --concurrency <n>     Timing points to fetch in parallel (default: 4).
 *   --fresh               Ignore cached split files and re-fetch everything.
 *
 * ── raceresult provider ───────────────────────────────────────────────────────
 *   Fetches from raceresult.com (the backend used by myrace.ai). All splits
 *   arrive in a single API call — no caching needed.
 *
 *   --url <url>           myrace.ai results page URL. The API endpoint is
 *                         discovered automatically from the page source.
 *   --api-url <url>       Direct raceresult.com API URL (skips discovery).
 *   --race-date <date>    Race date as YYYY-MM-DD (required). Used to convert
 *                         time-of-day split values to Unix epoch timestamps.
 *
 * ── shared options ────────────────────────────────────────────────────────────
 *   --output-dir <dir>    Directory for output files (default: scraper/data/).
 *   --verify              After the fast O(n log n) algorithm, also run the
 *                         O(n²) reference and diff the results.
 *
 * Examples:
 *   # RTRT (existing races)
 *   node scraper/racereplay.mjs IRM-ARIZONA-2025 --appid <id>
 *   node scraper/racereplay.mjs IRM-ARIZONA-2025 --appid <id> --fresh
 *
 *   # raceresult / myrace.ai
 *   node scraper/racereplay.mjs cim-2025 --provider raceresult \
 *     --url https://myrace.ai/races/cim-2025/results \
 *     --race-date 2025-12-07
 *
 *   # raceresult with a direct API URL (no page scrape)
 *   node scraper/racereplay.mjs cim-2025 --provider raceresult \
 *     --api-url https://api.raceresult.com/374113/IMU05T607SLSY3BXCUM067VWT8HGBEHA \
 *     --race-date 2025-12-07
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { runPassingAnalysis } from "./lib/algorithm.mjs";
import { printReport, buildOutputCSV } from "./lib/output.mjs";
import { fmtElapsed } from "./lib/format.mjs";

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}
function has(name) {
  return args.includes(name);
}

const eventId = args.find((a) => !a.startsWith("--"));
const provider = flag("--provider") ?? "rtrt";
const outputDir = flag("--output-dir") ?? path.join(__dirname, "data");
const verifyMode = has("--verify");

// rtrt-specific
const appid = flag("--appid");
const forcedPointsRaw = flag("--points");
const forcedPoints = forcedPointsRaw ? forcedPointsRaw.split(",").map((p) => p.trim()) : null;
const concurrency = flag("--concurrency") ? parseInt(flag("--concurrency"), 10) : 4;
const fresh = has("--fresh");

// raceresult-specific
const myRaceUrl = flag("--url");
const apiUrl = flag("--api-url");
const raceDate = flag("--race-date");

// ─── Usage ────────────────────────────────────────────────────────────────────

if (!eventId) {
  console.error(`\
Usage: node scraper/racereplay.mjs <event-id> [options]

  --provider <name>     rtrt (default) | raceresult

RTRT options:
  --appid <id>          Required for rtrt provider.
  --points <list>       Override timing point auto-discovery.
  --concurrency <n>     Parallel point fetches (default: 4).
  --fresh               Re-fetch all split data.

raceresult options:
  --url <url>           myrace.ai results page (auto-discovers API URL).
  --api-url <url>       Direct raceresult.com API URL.
  --race-date <date>    Race date YYYY-MM-DD (required).

Shared options:
  --output-dir <dir>    Output directory (default: scraper/data/).
  --verify              Diff fast vs O(n²) reference algorithm.

Examples:
  node scraper/racereplay.mjs IRM-ARIZONA-2025 --appid <id>
  node scraper/racereplay.mjs cim-2025 --provider raceresult \\
    --url https://myrace.ai/races/cim-2025/results --race-date 2025-12-07
`);
  process.exit(1);
}

// ─── Provider validation ──────────────────────────────────────────────────────

const SUPPORTED_PROVIDERS = ["rtrt", "raceresult"];
if (!SUPPORTED_PROVIDERS.includes(provider)) {
  console.error(`Unknown provider: "${provider}". Supported: ${SUPPORTED_PROVIDERS.join(", ")}`);
  process.exit(1);
}

if (provider === "rtrt" && !appid) {
  console.error(`Error: --appid is required for the rtrt provider.\n`);
  process.exit(1);
}

if (provider === "raceresult" && !myRaceUrl && !apiUrl) {
  console.error(`Error: --url or --api-url is required for the raceresult provider.\n`);
  process.exit(1);
}

if (provider === "raceresult" && !raceDate) {
  console.error(`Error: --race-date <YYYY-MM-DD> is required for the raceresult provider.\n`);
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const runStart = Date.now();

  try {
    await fs.mkdir(outputDir, { recursive: true });

    // Dynamically import the selected provider
    const { fetchRaceData } = await import(`./providers/${provider}.mjs`);

    const { athletes, legNames, startEpochs } = await fetchRaceData(eventId, {
      // rtrt
      appid,
      forcedPoints,
      concurrency,
      fresh,
      // raceresult
      url: myRaceUrl,
      apiUrl,
      raceDate,
      // shared
      outputDir,
    });

    console.log("\n⚙️  Running passing analysis...");
    const { normalizedAthletes, passingMap, hasWaveData } = runPassingAnalysis(
      athletes,
      legNames,
      startEpochs,
      verifyMode
    );

    printReport(
      normalizedAthletes,
      passingMap,
      legNames,
      hasWaveData,
      Date.now() - runStart,
      provider
    );

    const outputFile = path.join(outputDir, `${eventId}_passing.csv`);
    await fs.writeFile(outputFile, buildOutputCSV(normalizedAthletes, passingMap, legNames));
    console.log(`📄 Passing data written to: ${outputFile}`);

    console.log(`
Next step:
  cd app
  npx tsx scripts/ingest.ts ../${path.relative(path.join(__dirname, ".."), outputFile)} \\
    --slug <slug> \\
    --race-name "<Race Name>" \\
    --year <YYYY> \\
    --event-type <triathlon|road_race> \\
    --event-date <YYYY-MM-DD>
`);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    if (process.env.DEBUG) {
      console.error(err.stack);
      if (err.cause) console.error("Cause:", err.cause);
    }
    process.exit(1);
  }
})();
