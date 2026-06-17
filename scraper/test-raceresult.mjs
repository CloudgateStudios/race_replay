#!/usr/bin/env node
/**
 * test-raceresult.mjs
 *
 * Unit tests for the raceresult provider's pure transformation logic.
 * Covers parseTod, resolveSplitKeys, and transformAthletes.
 * No network calls are made.
 *
 * Usage: node scraper/test-raceresult.mjs
 */

import { parseTod, resolveSplitKeys, transformAthletes } from "./providers/raceresult.mjs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅  ${message}`);
    passed++;
  } else {
    console.log(`  ❌  ${message}`);
    failed++;
  }
}

function assertThrows(fn, messageFragment, label) {
  try {
    fn();
    console.log(`  ❌  ${label} (expected throw, got none)`);
    failed++;
  } catch (e) {
    if (messageFragment && !e.message.includes(messageFragment)) {
      console.log(`  ❌  ${label} (wrong error: "${e.message}")`);
      failed++;
    } else {
      console.log(`  ✅  ${label}`);
      passed++;
    }
  }
}

// ─── Fixture data ─────────────────────────────────────────────────────────────
//
// Race: 2025-12-07 (CIM 2025)
//   raceDateMs = new Date("2025-12-07T00:00:00Z").getTime() = 1733529600000
//   raceDateSec = 1733529600
//
// Timing points: START TOD (8:00:00 = 28800s) and FINISH TOD
//
// Athlete 1 — Male finisher, rank 1:   FINISH TOD = 37500 → chip = 8700s (2:25:00)
// Athlete 2 — Female finisher, rank 2: FINISH TOD = 42000 → chip = 13200s (3:40:00)
// Athlete 3 — Male DNF:                FINISH TOD = null

const RACE_DATE_MS = new Date("2025-12-07T00:00:00Z").getTime(); // 1733529600000
const RACE_DATE_SEC = RACE_DATE_MS / 1000;                       // 1733529600

const RECORDS = [
  {
    "Bib": 101,
    "Name": "Adam Runner",
    "Gender": "M",
    "Status": "",
    "Place": "1.",
    "Gender Place": "1.",
    "Division Place": "",
    "Country": "USA",
    "City": "Sacramento",
    "State": "CA",
    "START TOD": 28800,
    "FINISH TOD": 37500,
  },
  {
    "Bib": 202,
    "Name": "Betty Pace",
    "Gender": "F",
    "Status": "",
    "Place": "2.",
    "Gender Place": "1.",
    "Division Place": "",
    "Country": "USA",
    "City": "Davis",
    "State": "CA",
    "START TOD": 28800,
    "FINISH TOD": 42000,
  },
  {
    "Bib": 303,
    "Name": "Carl Drop",
    "Gender": "M",
    "Status": "DNF",
    "Place": null,
    "Gender Place": null,
    "Division Place": "",
    "Country": "USA",
    "City": "Folsom",
    "State": "CA",
    "START TOD": 28800,
    "FINISH TOD": null,
  },
];

// ─── parseTod ─────────────────────────────────────────────────────────────────

console.log("\n═".repeat(60));
console.log("  parseTod");
console.log("═".repeat(60));

assert(parseTod(null) === null,       "null → null");
assert(parseTod("") === null,         "empty string → null");
assert(parseTod(0) === 0,             "0 (float) → 0");
assert(parseTod(28800) === 28800,     "28800 (float) → 28800");
assert(parseTod(3661.5) === 3661.5,   "float with decimal → same float");
assert(parseTod("8:00:00") === 28800, '"8:00:00" → 28800');
assert(parseTod("10:25:00") === 37500,'"10:25:00" → 37500');
assert(parseTod("0:01:30") === 90,    '"0:01:30" → 90');
assert(parseTod("45:30") === 2730,    '"45:30" (MM:SS) → 2730');
assert(parseTod("invalid") === null,  '"invalid" → null');
assert(parseTod("1:x:00") === null,   '"1:x:00" (NaN part) → null');

// ─── resolveSplitKeys ─────────────────────────────────────────────────────────

console.log("\n═".repeat(60));
console.log("  resolveSplitKeys");
console.log("═".repeat(60));

const FULL_RECORD = {
  "Start TOD": 28800,
  "5K TOD": 29920,
  "10K TOD": 31000,
  "Finish TOD": 37500,
};

const resolved = resolveSplitKeys(FULL_RECORD);

assert(resolved.length === 4,                    "finds all 4 matching splits");
assert(resolved[0].key === "Start TOD",          "first key is Start TOD (case-insensitive match)");
assert(resolved[0].legName === null,             "START split has legName null");
assert(resolved[1].key === "5K TOD",             "second key is 5K TOD");
assert(resolved[1].legName === "5K",             "5K split has legName '5K'");
assert(resolved[resolved.length - 1].key === "Finish TOD", "last key is Finish TOD");
assert(resolved[resolved.length - 1].legName === "FINISH",  "FINISH split has legName 'FINISH'");

// Records with null TOD values are excluded
const SPARSE_RECORD = { "Start TOD": 28800, "5K TOD": null, "Finish TOD": 37500 };
const sparseResolved = resolveSplitKeys(SPARSE_RECORD);
assert(sparseResolved.length === 2, "null TOD values excluded from resolved splits");
assert(sparseResolved.every((s) => s.key !== "5K TOD"), "5K TOD (null value) not in result");

// Entirely missing key is excluded
const NO_FINISH = { "Start TOD": 28800, "5K TOD": 29920 };
const noFinishResolved = resolveSplitKeys(NO_FINISH);
assert(noFinishResolved.every((s) => s.legName !== "FINISH"), "missing key not in result");

// ─── transformAthletes ────────────────────────────────────────────────────────

console.log("\n═".repeat(60));
console.log("  transformAthletes");
console.log("═".repeat(60));

const { athletes, legNames, startEpochs } = transformAthletes(RECORDS, RACE_DATE_MS);

// Basic structure
assert(athletes.length === 3,                    "returns all 3 athletes");
assert(legNames.length === 1,                    "one leg (FINISH)");
assert(legNames[0] === "FINISH",                 "leg is named FINISH");

// Finisher fields
const adam = athletes.find((a) => a.bib === "101");
assert(adam !== undefined,                       "athlete 101 present");
assert(adam.name === "Adam Runner",              "name mapped correctly");
assert(adam.gender === "Male",                   "M → Male");
assert(adam.status === "FIN",                    "Status '' → FIN");
assert(adam.overallRank === 1,                   '"1." parsed to rank 1');
assert(adam.genderRank === 1,                    "gender rank parsed");
assert(adam.finishSecs === 8700,                 "chip time = FINISH TOD − START TOD");

// Epoch calculation
assert(startEpochs.has("101"),                   "startEpoch stored in map");
assert(startEpochs.get("101") === RACE_DATE_SEC + 28800, "startEpoch = raceDateSec + startTod");
assert(adam.startEpoch === RACE_DATE_SEC + 28800,"athlete.startEpoch correct");
assert(adam.legEpochs["FINISH"] === RACE_DATE_SEC + 37500, "legEpoch = raceDateSec + splitTod");

// Leg duration
assert(adam.legSecs["FINISH"] === 8700,          "legSecs[FINISH] = round(finishTod − startTod)");

// Female finisher
const betty = athletes.find((a) => a.bib === "202");
assert(betty !== undefined,                      "athlete 202 present");
assert(betty.gender === "Female",                "F → Female");
assert(betty.status === "FIN",                   "finisher status");
assert(betty.finishSecs === 13200,               "betty chip time correct");
assert(betty.city === "Davis, CA",               "city+state joined");

// DNF athlete
const carl = athletes.find((a) => a.bib === "303");
assert(carl !== undefined,                       "athlete 303 present");
assert(carl.status === "DNF",                    'non-empty Status → DNF');
assert(carl.overallRank === null,                "DNF with null Place → overallRank null");
assert(carl.legSecs["FINISH"] === null,          "DNF has null legSecs for missing split");
assert(carl.legEpochs["FINISH"] === null,        "DNF has null legEpochs for missing split");
assert(carl.finishSecs === null,                 "DNF has null finishSecs");

// Category totals (DNFs excluded from counts)
assert(adam.categoryTotals.overall === 2,        "overallTotal counts only finishers");
assert(adam.categoryTotals.gender === 1,         "genderTotal: 1 male finisher");
assert(betty.categoryTotals.gender === 1,        "genderTotal: 1 female finisher");

// Sorted by rank (DNFs last)
assert(athletes[0].bib === "101",                "rank 1 athlete is first");
assert(athletes[1].bib === "202",                "rank 2 athlete is second");
assert(athletes[2].bib === "303",                "DNF is last");

// startEpochs map includes all athletes with a valid startTod
assert(startEpochs.has("303"),                   "DNF startEpoch still recorded (had valid START TOD)");

// Throws when fewer than 2 splits
assertThrows(
  () => transformAthletes([{ "Bib": 1, "Status": "" }], RACE_DATE_MS),
  "Expected at least 2 TOD split keys",
  "throws when no valid split keys found"
);

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("  ✅ All raceresult tests passed\n");
} else {
  console.log("  ❌ Some tests failed\n");
  process.exit(1);
}
