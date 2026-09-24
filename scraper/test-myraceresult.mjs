#!/usr/bin/env node
/**
 * test-myraceresult.mjs
 *
 * Unit tests for the myraceresult provider's pure transformation logic.
 * Covers parseTod and transformAthletes. No network calls are made.
 *
 * Usage: node scraper/test-myraceresult.mjs
 */

import { parseTod, transformAthletes } from "./providers/myraceresult.mjs";

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

// ─── Fixture data ─────────────────────────────────────────────────────────────
//
// Modeled on the 2025 Naperville Sprint Triathlon (event 353495), bib 188.
// The detail view has 8 splits but only 5 legs — "InTran" and "Announcer" are
// extra timing mats that are not leg boundaries, so Legs[i] does NOT end at
// Splits[i+1].
//
// Race date 2025-08-03 → raceDateSec = 1754179200
// Start TOD 07:00:14 = 25214s
//   Swim        05:17 = 317  → ends 25531
//   Transition1 01:35 = 95   → ends 25626
//   Bike        29:07 = 1747 → ends 27373
//   Transition2 00:54 = 54   → ends 27427
//   Run         18:46 = 1126 → ends 28553  (finish TOD 07:55:53 = 28553)

const RACE_DATE_MS = new Date("2025-08-03T00:00:00Z").getTime();
const RACE_DATE_SEC = RACE_DATE_MS / 1000;

const DATA_FIELDS = [
  "BIB",
  "ID",
  "WithStatus([OverallRank.p])",
  'if([TeamName]<>"";CorrectSpelling([TeamName]);CorrectSpelling([FLNAME]))',
  "CorrectSpelling([CITY])",
  "STATE2",
  "AGEONDEC31",
  "GenderMF",
  'if([category]<>"";[category];if([teamtype]<>"";[teamtype];[AGEGROUP.NAME]))',
  "WithStatus(switch([AgeGroupRank]>0;[AgeGroupRank];[CategoryRank]>0;[CategoryRank]))",
  "Swim",
  "Transition1",
  "Bike",
  "Transition2",
  "Run",
  "TIME",
];

const listData = {
  DataFields: DATA_FIELDS,
  data: [
    ["188", "1001", "1.", "Test Athlete", "Naperville", "IL", "30", "M", "M30-34", "1/40",
      "05:17", "01:35", "29:07", "00:54", "18:46", "55:39"],
    ["200", "1002", "DNF", "Missed Mat", "Aurora", "IL", "40", "F", "F40-44", "DNF",
      "06:00", "02:00", "", "", "", ""],
  ],
};

const split = (Name, TOD, Exists = true, RG = null) => ({ Name, TOD, Exists, RG });
const leg = (Name, Time, Exists = true) => ({ Name, Time, Exists });

const detailMap = new Map([
  ["1001", {
    Splits: [
      split("Start", "07:00:14"),
      split("Swim Exit", "07:05:31"),
      split("InTran", "07:05:54"),
      split("T1", "07:07:06"),
      split("Bike", "07:36:13"),
      split("T2", "07:37:06"),
      split("Announcer", "07:55:44"),
      split("Finish", "07:55:53", true, 1),
    ],
    Legs: [
      leg("Swim", "05:17"),
      leg("Transition1", "01:35"),
      leg("Bike", "29:07"),
      leg("Transition2", "00:54"),
      leg("Run", "18:46"),
    ],
  }],
  ["1002", {
    Splits: [
      split("Start", "07:10:00"),
      split("Swim Exit", "07:16:00"),
      split("InTran", "07:16:30"),
      split("T1", "07:18:00"),
      split("Bike", "", false),
      split("T2", "", false),
      split("Announcer", "", false),
      split("Finish", "", false),
    ],
    Legs: [
      leg("Swim", "06:00"),
      leg("Transition1", "02:00"),
      leg("Bike", "", false),
      leg("Transition2", "", false),
      leg("Run", "", false),
    ],
  }],
]);

// ─── parseTod ─────────────────────────────────────────────────────────────────

console.log("\nparseTod");
assert(parseTod("07:00:14") === 25214, "HH:MM:SS → seconds since midnight");
assert(parseTod("05:17") === 317, "MM:SS → seconds");
assert(parseTod(42) === 42, "numeric passthrough");
assert(parseTod("") === null, "empty string → null");
assert(parseTod("--:--") === null, "placeholder → null");

// ─── transformAthletes ────────────────────────────────────────────────────────

console.log("\ntransformAthletes");
const origLog = console.log;
console.log = () => {};
const { athletes, legNames, startEpochs } = transformAthletes(listData, detailMap, RACE_DATE_MS);
console.log = origLog;

assert(
  legNames.join(",") === "Swim,Transition1,Bike,Transition2,Run",
  "leg names come from detail view Legs"
);

const a = athletes.find((x) => x.bib === "188");
assert(a.status === "FIN" && a.overallRank === 1, "finisher parsed with rank 1");
assert(a.startEpoch === RACE_DATE_SEC + 25214, "start epoch from Start split TOD");
assert(startEpochs.get("188") === a.startEpoch, "startEpochs map keyed by bib");

// Regression: extra timing mats must not shift legs onto the wrong splits
assert(a.legSecs.Swim === 317, "Swim = 5:17");
assert(a.legSecs.Transition1 === 95, "Transition1 = 1:35 (not InTran's 0:23)");
assert(a.legSecs.Bike === 1747, "Bike = 29:07 (not T1's 1:12)");
assert(a.legSecs.Transition2 === 54, "Transition2 = 0:54");
assert(a.legSecs.Run === 1126, "Run = 18:46 (not 0:53)");

const legSum = legNames.reduce((s, l) => s + a.legSecs[l], 0);
assert(legSum === a.finishSecs, "leg durations sum to finish time");
assert(a.finishSecs === 3339, "finish = 55:39");

assert(a.legEpochs.Bike === RACE_DATE_SEC + 27373, "Bike end epoch = start + swim + T1 + bike");
assert(a.legEpochs.Run === RACE_DATE_SEC + 28553, "Run end epoch equals finish TOD");

const d = athletes.find((x) => x.bib === "200");
assert(d.status === "DNF" && d.overallRank === null, "DNF parsed with null rank");
assert(d.legSecs.Transition1 === 120, "DNF keeps legs completed before the missed mat");
assert(d.legSecs.Bike === null && d.legEpochs.Run === null, "legs after a missing leg are null");

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
