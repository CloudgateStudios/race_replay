#!/usr/bin/env node
/**
 * test-algorithm.mjs
 *
 * Verifies the passing algorithm against hand-crafted datasets with known
 * expected results. Covers gun-start, mass-start wave, and mixed wave scenarios.
 *
 * Usage: node scraper/test-algorithm.mjs
 */

import { computePassingDataFast, computePassingData } from "./lib/algorithm.mjs";

const LEGS = ["SWIM", "T1", "BIKE", "T2", "RUN"];

/**
 * Build a test athlete with cumPositions pre-computed from leg seconds.
 * Mirrors what normalizeAthletes() produces.
 */
function mkAthlete({ bib, waveOffset = 0, swim, t1, bike, t2, run }) {
  const legSecs = { SWIM: swim, T1: t1, BIKE: bike, T2: t2, RUN: run };
  const cumPositions = {};
  let cumChip = 0;
  for (const leg of LEGS) {
    const v = legSecs[leg];
    if (v != null && cumChip !== null) {
      cumChip += v;
      cumPositions[leg] = waveOffset + cumChip;
    } else {
      cumChip = null;
      cumPositions[leg] = null;
    }
  }
  return { bib, waveOffset, legSecs, cumPositions };
}

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

function checkInvariant(label, passingMap, legNames) {
  for (const leg of legNames) {
    let g = 0,
      l = 0;
    for (const d of passingMap.values()) {
      g += d[leg].gained;
      l += d[leg].lost;
    }
    assert(g === l, `${label} invariant ${leg}: gained(${g}) === lost(${l})`);
  }
}

// ─── Section 1: Gun-start (no wave data) ─────────────────────────────────────
//
// 5 athletes, all waveOffset=0 (default), hasWaveData=false.
//
// Swim times (fastest→slowest): A(1200) B(1260) C(1320) D(1380) E(1440)
// T1 times: A(300) B(60) C(60) D(60) E(60)  — A has a terrible T1
// Cumulative after T1: A=1500 B=1320 C=1380 D=1440 E=1500
// After T1 ranks: B=1 C=2 D=3 A=4 E=5  (tie A/E at 1500, bib "A" < "E")
//
// Bike times: A(3600) B(3540) C(3480) D(3420) E(3360) — E fastest on bike
// Cumulative after bike: A=5100 B=4860 C=4860 D=4860 E=4860
// After bike ranks: B=1 C=2 D=3 E=4 A=5  (B/C/D/E tied at 4860, bib order)

console.log("\n═".repeat(60));
console.log("  Section 1: Gun-start (no wave data)");
console.log("═".repeat(60));

const gunAthletes = [
  mkAthlete({ bib: "A", swim: 1200, t1: 300, bike: 3600, t2: 120, run: 2700 }),
  mkAthlete({ bib: "B", swim: 1260, t1: 60,  bike: 3540, t2: 120, run: 2760 }),
  mkAthlete({ bib: "C", swim: 1320, t1: 60,  bike: 3480, t2: 120, run: 2820 }),
  mkAthlete({ bib: "D", swim: 1380, t1: 60,  bike: 3420, t2: 120, run: 2880 }),
  mkAthlete({ bib: "E", swim: 1440, t1: 60,  bike: 3360, t2: 120, run: 2880 }),
];

const gunMap = computePassingDataFast(gunAthletes, LEGS, false);

console.log("\n[1.1] Invariant: sum(gained) === sum(lost) per leg");
checkInvariant("gun-start", gunMap, LEGS);

console.log("\n[1.2] Swim leg (all start equal → gun-start formula)");
assert(gunMap.get("A").SWIM.gained === 4, "A gained 4 during swim (rank 1)");
assert(gunMap.get("A").SWIM.lost   === 0, "A lost 0 during swim");
assert(gunMap.get("E").SWIM.gained === 0, "E gained 0 during swim (rank 5)");
assert(gunMap.get("E").SWIM.lost   === 4, "E lost 4 during swim");

console.log("\n[1.3] T1 leg (A has 300s T1 vs 60s for others)");
assert(gunMap.get("A").T1.lost   === 3, "A lost 3 in T1 (B, C, D pass)");
assert(gunMap.get("A").T1.gained === 0, "A gained 0 in T1");
assert(gunMap.get("B").T1.gained === 1, "B gained 1 in T1 (passed A)");

console.log("\n[1.4] Bike leg (E fastest → gains on A)");
assert(gunMap.get("A").BIKE.lost   >= 1, "A lost at least 1 on bike");
assert(gunMap.get("E").BIKE.gained >= 1, "E gained at least 1 on bike");

console.log("\n[1.5] Fast algorithm matches reference O(n²) — gun-start");
const gunRef = computePassingData(gunAthletes, LEGS, false);
let gunMismatch = 0;
for (const a of gunAthletes) {
  for (const leg of LEGS) {
    const f = gunMap.get(a.bib)[leg];
    const r = gunRef.get(a.bib)[leg];
    if (f.gained !== r.gained || f.lost !== r.lost) {
      console.log(`    MISMATCH bib=${a.bib} ${leg}: fast=${f.gained}/${f.lost} ref=${r.gained}/${r.lost}`);
      gunMismatch++;
    }
  }
}
assert(gunMismatch === 0, "Fast and reference agree on all legs (gun-start)");

// ─── Section 2: DNF athlete ───────────────────────────────────────────────────
console.log("\n[2] DNF athlete excluded from legs after drop");
const dnfAthlete = mkAthlete({ bib: "F", swim: 1280, t1: 600, bike: null, t2: null, run: null });
const dnfAthletes = [...gunAthletes, dnfAthlete];
const dnfMap = computePassingDataFast(dnfAthletes, LEGS, false);
const fDnf = dnfMap.get("F");
assert(fDnf.SWIM.lost   === 2, "F lost 2 in swim (A and B faster)");
assert(fDnf.SWIM.gained === 3, "F gained 3 in swim (passed C, D, E)");
assert(fDnf.T1.lost     === 3, "F lost 3 in T1 (C, D, E pass him)");
assert(fDnf.BIKE.gained === 0 && fDnf.BIKE.lost === 0, "F has zero bike passing (excluded after DNF)");
assert(fDnf.T2.gained   === 0 && fDnf.T2.lost   === 0, "F has zero T2 passing (excluded after DNF)");
assert(fDnf.RUN.gained  === 0 && fDnf.RUN.lost  === 0, "F has zero run passing (excluded after DNF)");

// ─── Section 3: Mass-start wave (single wave, all same waveOffset) ────────────
//
// 4 athletes, all waveOffset=0, hasWaveData=true.
// Correct behavior: identical to gun-start since they all started simultaneously.

console.log("\n═".repeat(60));
console.log("  Section 3: Mass-start (all same waveOffset, hasWaveData=true)");
console.log("═".repeat(60));

const massAthletes = [
  mkAthlete({ bib: "P1", waveOffset: 0, swim: 200, t1: null, bike: null, t2: null, run: null }),
  mkAthlete({ bib: "P2", waveOffset: 0, swim: 400, t1: null, bike: null, t2: null, run: null }),
  mkAthlete({ bib: "P3", waveOffset: 0, swim: 600, t1: null, bike: null, t2: null, run: null }),
  mkAthlete({ bib: "P4", waveOffset: 0, swim: 800, t1: null, bike: null, t2: null, run: null }),
];

const massMap = computePassingDataFast(massAthletes, ["SWIM"], true);

console.log("\n[3.1] Invariant");
checkInvariant("mass-start", massMap, ["SWIM"]);

console.log("\n[3.2] Gun-start semantics within the single wave");
assert(massMap.get("P1").SWIM.gained === 3, "P1 (fastest) gained 3");
assert(massMap.get("P1").SWIM.lost   === 0, "P1 lost 0");
assert(massMap.get("P4").SWIM.gained === 0, "P4 (slowest) gained 0");
assert(massMap.get("P4").SWIM.lost   === 3, "P4 lost 3");
assert(massMap.get("P2").SWIM.gained === 2, "P2 gained 2");
assert(massMap.get("P2").SWIM.lost   === 1, "P2 lost 1");

console.log("\n[3.3] Fast algorithm matches reference — mass-start");
const massRef = computePassingData(massAthletes, ["SWIM"], true);
let massMismatch = 0;
for (const a of massAthletes) {
  const f = massMap.get(a.bib).SWIM;
  const r = massRef.get(a.bib).SWIM;
  if (f.gained !== r.gained || f.lost !== r.lost) {
    console.log(`    MISMATCH bib=${a.bib}: fast=${f.gained}/${f.lost} ref=${r.gained}/${r.lost}`);
    massMismatch++;
  }
}
assert(massMismatch === 0, "Fast and reference agree (mass-start)");

// ─── Section 4: Mixed waves — mass-start Pros + wave-start AGs ───────────────
//
// Scenario: 2 Pros (waveOffset=0), 2 AGs (waveOffset=300).
//
// cumPositions[SWIM]:
//   Pro2: 0 + 300 = 300   (fastest swimmer in race)
//   AG1:  300 + 100 = 400 (fast AG, overtakes Pro1)
//   Pro1: 0 + 600 = 600
//   AG2:  300 + 600 = 900 (slow AG)
//
// Expected within-wave:
//   Pro group: Pro2 rank1→ G=1/L=0; Pro1 rank2→ G=0/L=1
//   AG  group: AG1  rank1→ G=1/L=0; AG2  rank2→ G=0/L=1
//
// Expected cross-wave:
//   AG1 (cumPos=400) overtook Pro1 (cumPos=600) → AG1.gained+1, Pro1.lost+1
//   No other cross-wave passes
//
// Final: Pro2 G=1/L=0  Pro1 G=0/L=2  AG1 G=2/L=0  AG2 G=0/L=1
// Invariant: gained=3, lost=3 ✓

console.log("\n═".repeat(60));
console.log("  Section 4: Mixed waves (mass-start Pros + wave-start AGs)");
console.log("═".repeat(60));

const mixedAthletes = [
  mkAthlete({ bib: "Pro1", waveOffset: 0,   swim: 600, t1: null, bike: null, t2: null, run: null }),
  mkAthlete({ bib: "Pro2", waveOffset: 0,   swim: 300, t1: null, bike: null, t2: null, run: null }),
  mkAthlete({ bib: "AG1",  waveOffset: 300, swim: 100, t1: null, bike: null, t2: null, run: null }),
  mkAthlete({ bib: "AG2",  waveOffset: 300, swim: 600, t1: null, bike: null, t2: null, run: null }),
];

const mixedMap = computePassingDataFast(mixedAthletes, ["SWIM"], true);

console.log("\n[4.1] Invariant");
checkInvariant("mixed-wave", mixedMap, ["SWIM"]);

console.log("\n[4.2] Within-Pro-wave gun-start");
assert(
  mixedMap.get("Pro2").SWIM.gained === 1 && mixedMap.get("Pro2").SWIM.lost === 0,
  "Pro2 (fastest Pro) G=1/L=0"
);
assert(
  mixedMap.get("Pro1").SWIM.gained === 0 && mixedMap.get("Pro1").SWIM.lost === 2,
  "Pro1 (slow Pro, passed by Pro2 + AG1) G=0/L=2"
);

console.log("\n[4.3] Cross-wave pass: AG1 overtakes Pro1");
assert(mixedMap.get("AG1").SWIM.gained === 2, "AG1 G=2 (beat AG2 within-wave + overtook Pro1 cross-wave)");
assert(mixedMap.get("AG1").SWIM.lost   === 0, "AG1 L=0 (Pro2 was already ahead, not a pass)");

console.log("\n[4.4] AG2 sees no cross-wave gains");
assert(mixedMap.get("AG2").SWIM.gained === 0, "AG2 gained 0");
assert(mixedMap.get("AG2").SWIM.lost   === 1, "AG2 lost 1 (to AG1 within-wave)");

console.log("\n[4.5] Fast algorithm matches reference — mixed waves");
const mixedRef = computePassingData(mixedAthletes, ["SWIM"], true);
let mixedMismatch = 0;
for (const a of mixedAthletes) {
  const f = mixedMap.get(a.bib).SWIM;
  const r = mixedRef.get(a.bib).SWIM;
  if (f.gained !== r.gained || f.lost !== r.lost) {
    console.log(`    MISMATCH bib=${a.bib}: fast=${f.gained}/${f.lost} ref=${r.gained}/${r.lost}`);
    mixedMismatch++;
  }
}
assert(mixedMismatch === 0, "Fast and reference agree (mixed waves)");

// ─── Section 5: Regression — bib string-sort tiebreaker bug ─────────────────
//
// Before this fix, buildRankMap used String.localeCompare on bibs as a tiebreaker
// for same-waveOffset athletes. In string sort "9" > "66" > "60" > "1", so
// single-digit bibs were placed LAST in a mass-start group, corrupting swim counts.
//
// Test: bibs "1", "7", "66", all waveOffset=0.
// Swim times: bib7=fastest, bib66=middle, bib1=slowest.
// Correct (gun-start): each gained/lost based only on final swim rank.
// Buggy behavior: bib7 would be placed last before swim → inflated gained count.

console.log("\n═".repeat(60));
console.log("  Section 5: Regression — bib string-sort tiebreaker bug");
console.log("═".repeat(60));

const bibAthletes = [
  mkAthlete({ bib: "1",  waveOffset: 0, swim: 3000, t1: null, bike: null, t2: null, run: null }),
  mkAthlete({ bib: "66", waveOffset: 0, swim: 2000, t1: null, bike: null, t2: null, run: null }),
  mkAthlete({ bib: "7",  waveOffset: 0, swim: 1000, t1: null, bike: null, t2: null, run: null }),
];

const bibMap = computePassingDataFast(bibAthletes, ["SWIM"], true);

console.log("\n[5.1] Bib 7 (fastest swimmer) wins within the wave");
assert(bibMap.get("7").SWIM.gained  === 2, "bib7 gained 2 (fastest: passes both others)");
assert(bibMap.get("7").SWIM.lost    === 0, "bib7 lost 0");
assert(bibMap.get("1").SWIM.gained  === 0, "bib1 gained 0 (slowest swimmer)");
assert(bibMap.get("1").SWIM.lost    === 2, "bib1 lost 2");
assert(bibMap.get("66").SWIM.gained === 1, "bib66 gained 1 (middle)");
assert(bibMap.get("66").SWIM.lost   === 1, "bib66 lost 1 (middle)");

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("  ✅ All tests passed\n");
} else {
  console.log("  ❌ Some tests failed\n");
  process.exit(1);
}
