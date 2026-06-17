#!/usr/bin/env node
/**
 * test-rtrt.mjs
 *
 * Unit tests for the RTRT provider's pure transformation logic and the
 * shared lib/format.mjs utilities it relies on.
 *
 * Network-dependent code (token registration, split fetching,
 * buildAthleteRecords) is not covered here — those require either a live
 * RTRT connection or filesystem fixtures. See test-raceresult.mjs for the
 * richer provider test suite.
 *
 * Usage: node scraper/test-rtrt.mjs
 */

import { discoverTimingPoints } from "./providers/rtrt.mjs";
import { parseTime, cleanLabel } from "./lib/format.mjs";

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

// ─── parseTime ────────────────────────────────────────────────────────────────

console.log("\n═".repeat(60));
console.log("  parseTime  (lib/format.mjs)");
console.log("═".repeat(60));

assert(parseTime(null) === null,          "null → null");
assert(parseTime("") === null,            "empty string → null");
assert(parseTime("1:00:00") === 3600,     '"1:00:00" → 3600');
assert(parseTime("2:25:00") === 8700,     '"2:25:00" → 8700');
assert(parseTime("0:30:00") === 1800,     '"0:30:00" → 1800');
assert(parseTime("1:23:45.5") === 5025.5, '"1:23:45.5" (decimal) → 5025.5');
assert(parseTime("45:30") === 2730,       '"45:30" (MM:SS) → 2730');
assert(parseTime("1:30") === 90,          '"1:30" (MM:SS) → 90');
assert(parseTime("invalid") === null,     '"invalid" → null');
assert(parseTime("1:x:00") === null,      '"1:x:00" (NaN part) → null');

// ─── cleanLabel ───────────────────────────────────────────────────────────────

console.log("\n═".repeat(60));
console.log("  cleanLabel  (lib/format.mjs)");
console.log("═".repeat(60));

assert(cleanLabel("Run/Finish") === "Run",       '"Run/Finish" → "Run" (takes before /)');
assert(cleanLabel("Bike 56mi | 89km") === "Bike 56mi", '"Bike 56mi | 89km" → "Bike 56mi" (takes before |)');
assert(cleanLabel("FINISH") === "",              '"FINISH" → "" (caller supplies fallback)');
assert(cleanLabel("START") === "",               '"START" → ""');
assert(cleanLabel("Swim Finish") === "Swim",     '"Swim Finish" → "Swim" (strips trailing Finish)');
assert(cleanLabel("T1") === "T1",                '"T1" passes through unchanged');
assert(cleanLabel("Run") === "Run",              '"Run" passes through unchanged');
assert(cleanLabel("") === "",                    'empty string → ""');
assert(cleanLabel(null) === "",                  'null → ""');

// ─── discoverTimingPoints (forced-points path) ────────────────────────────────
//
// When --points is supplied, the function short-circuits before any network
// call, making this path fully unit-testable.

console.log("\n═".repeat(60));
console.log("  discoverTimingPoints  (forcedPoints path)");
console.log("═".repeat(60));

const TRIATHLON_POINTS = ["START", "SWIM", "T1", "BIKE", "T2", "FINISH"];

// discoverTimingPoints is async but the forced path returns immediately
const points = await discoverTimingPoints(
  "IRM-TEST-2025",
  "fake-appid",
  "fake-token",
  TRIATHLON_POINTS
);

assert(points.length === 6,                        "returns one entry per forced point");
assert(points[0].name === "START",                 "first point name is START");
assert(points[0].isStart === true,                 "first point isStart=true");
assert(points[0].isFinish === false,               "first point isFinish=false");
assert(points[5].name === "FINISH",                "last point name is FINISH");
assert(points[5].isFinish === true,                "last point isFinish=true");
assert(points[5].isStart === false,                "last point isStart=false");
assert(points[1].isStart === false,                "intermediate point isStart=false");
assert(points[1].isFinish === false,               "intermediate point isFinish=false");
assert(points[1].legName === "SWIM",               "intermediate point legName matches point name");

// Single-leg edge case (start + finish only)
const twoPoints = await discoverTimingPoints("EVT", "id", "tok", ["START", "FINISH"]);
assert(twoPoints.length === 2,                     "two-point course returns 2 entries");
assert(twoPoints[0].isStart === true,              "first of two is start");
assert(twoPoints[1].isFinish === true,             "last of two is finish");

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("  ✅ All RTRT tests passed\n");
} else {
  console.log("  ❌ Some tests failed\n");
  process.exit(1);
}
