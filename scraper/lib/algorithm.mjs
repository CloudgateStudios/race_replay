/**
 * Ranks athletes by a time-getter function. Athletes for whom the getter
 * returns null are excluded. Rank 1 = fastest (lowest value).
 *
 * Bib is used as a secondary sort key for determinism across runs.
 */
export function buildRankMap(athletes, getTime) {
  const eligible = athletes.filter((a) => getTime(a) != null);
  const sorted = [...eligible].sort((a, b) => {
    const diff = getTime(a) - getTime(b);
    return diff !== 0 ? diff : String(a.bib).localeCompare(String(b.bib));
  });
  const map = new Map();
  sorted.forEach((a, i) => map.set(a.bib, i + 1));
  return map;
}

/**
 * Prepares athletes for the passing algorithm by assigning wave offsets and
 * computing cumulative position at each leg checkpoint.
 *
 * @param {object[]}                athletes
 * @param {string[]}                legNames
 * @param {Map<string, number>|null} startEpochs - bib → Unix epoch start time, or null
 * @returns {{ athletes: object[], hasWaveData: boolean }}
 */
export function normalizeAthletes(athletes, legNames, startEpochs) {
  if (startEpochs) {
    const epochs = athletes.map((a) => a.startEpoch).filter((e) => e != null);
    const minEpoch = epochs.length ? Math.min(...epochs) : 0;
    for (const a of athletes) {
      if (a.startEpoch != null) {
        a.waveOffset = Math.round((a.startEpoch - minEpoch) * 1000) / 1000;
      }
    }
  }

  const offsetsByDiv = new Map();
  for (const a of athletes) {
    if (a.waveOffset == null) continue;
    if (!offsetsByDiv.has(a.division)) offsetsByDiv.set(a.division, []);
    offsetsByDiv.get(a.division).push(a.waveOffset);
  }

  const medianOffset = (arr) => {
    if (!arr?.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  };

  for (const a of athletes) {
    if (a.waveOffset != null) continue;
    const divOffsets = offsetsByDiv.get(a.division);
    a.waveOffset = divOffsets?.length ? medianOffset(divOffsets) : 0;
  }

  for (const a of athletes) {
    let cumChip = 0;
    for (const leg of legNames) {
      const v = a.legSecs[leg];
      if (v != null && cumChip !== null) {
        cumChip += v;
        a.cumPositions[leg] = a.waveOffset + cumChip;
      } else {
        cumChip = null;
        a.cumPositions[leg] = null;
      }
    }
  }

  const hasWaveData =
    (startEpochs && startEpochs.size > 0) ||
    athletes.some((a) => a.waveOffset != null && a.waveOffset !== 0);

  return { athletes, hasWaveData };
}

/** Standard 1-based Fenwick Tree for O(n log n) rank-inversion counting. */
class FenwickTree {
  constructor(size) {
    this._t = new Int32Array(size + 1);
    this._n = size;
  }
  update(i, delta = 1) {
    for (; i <= this._n; i += i & -i) this._t[i] += delta;
  }
  query(i) {
    let s = 0;
    for (; i > 0; i -= i & -i) s += this._t[i];
    return s;
  }
  reset() {
    this._t.fill(0);
  }
}

/**
 * Computes leg-by-leg passing counts for every athlete in O(n log n) per leg.
 *
 * A "pass" is defined physically: athlete x gained a position on y during a leg
 * if y was ranked ahead of x at the start of the leg but behind x at the end.
 *
 * @param {object[]} athletes
 * @param {string[]} legNames
 * @param {boolean}  [hasWaveData=false]
 * @returns {Map<string, object>} bib → { [legName]: { gained, lost } }
 */
export function computePassingDataFast(athletes, legNames, hasWaveData = false) {
  const legs = legNames.map((name, i) => ({
    name,
    getBefore:
      i === 0
        ? hasWaveData
          ? (a) => a.waveOffset
          : null
        : (a) => a.cumPositions[legNames[i - 1]],
    getAfter: (a) => a.cumPositions[name],
  }));

  const results = new Map();
  for (const a of athletes) {
    const entry = {};
    for (const leg of legNames) entry[leg] = { gained: 0, lost: 0 };
    results.set(a.bib, entry);
  }

  for (const leg of legs) {
    const afterMap = buildRankMap(athletes, leg.getAfter);
    let eligible = athletes.filter((a) => afterMap.has(a.bib));
    const isGunStart = leg.name === legNames[0] && !hasWaveData;

    if (isGunStart) {
      for (const x of eligible) {
        const xAfter = afterMap.get(x.bib);
        const legData = results.get(x.bib)[leg.name];
        legData.gained = eligible.length - xAfter;
        legData.lost = xAfter - 1;
      }
      continue;
    }

    // ── Wave start, leg 1: gun-start within each wave + cross-wave Fenwick ──────
    // Athletes in the same wave all start simultaneously, so any relative ordering
    // at the first checkpoint is a pass. Athletes from different waves are compared
    // by absolute clock position (waveOffset + chip time = cumPositions).
    if (hasWaveData && leg.name === legNames[0]) {
      const byWave = new Map();
      for (const a of eligible) {
        const w = a.waveOffset;
        if (!byWave.has(w)) byWave.set(w, []);
        byWave.get(w).push(a);
      }

      // Step 1: within each wave, apply gun-start formula
      for (const [, waveAthletes] of byWave) {
        const waveAfterMap = buildRankMap(waveAthletes, leg.getAfter);
        for (const x of waveAthletes) {
          const xAfter = waveAfterMap.get(x.bib);
          if (xAfter == null) continue;
          const wn = waveAfterMap.size;
          results.get(x.bib)[leg.name].gained += wn - xAfter;
          results.get(x.bib)[leg.name].lost += xAfter - 1;
        }
      }

      // Step 2: count cross-wave passes using a Fenwick tree indexed by wave order
      if (byWave.size > 1) {
        const sortedWaves = [...byWave.keys()].sort((a, b) => a - b);
        const W = sortedWaves.length;
        const waveIndex = new Map(sortedWaves.map((w, i) => [w, i + 1]));
        // prefixTotal[i] = eligible athletes in waves 0..i-1 (1-indexed)
        const prefixTotal = [0];
        for (const w of sortedWaves)
          prefixTotal.push(prefixTotal[prefixTotal.length - 1] + byWave.get(w).length);

        const sortedByCum = [...eligible].sort(
          (a, b) =>
            leg.getAfter(a) - leg.getAfter(b) ||
            String(a.bib).localeCompare(String(b.bib))
        );
        const crossFenwick = new FenwickTree(W);
        for (const x of sortedByCum) {
          const wi = waveIndex.get(x.waveOffset);
          // Later-wave athletes already in tree arrived before x → x lost to them
          results.get(x.bib)[leg.name].lost += crossFenwick.query(W) - crossFenwick.query(wi);
          // Earlier-wave athletes not yet in tree → x arrived before them → x gained
          results.get(x.bib)[leg.name].gained += prefixTotal[wi - 1] - crossFenwick.query(wi - 1);
          crossFenwick.update(wi, 1);
        }
      }

      continue;
    }

    const beforeMap = buildRankMap(athletes, leg.getBefore);
    eligible = eligible.filter((a) => beforeMap.has(a.bib));
    if (eligible.length === 0) continue;

    const n = eligible.length;
    const tree = new FenwickTree(n);

    const localBefore = new Map(
      [...eligible]
        .sort((a, b) => beforeMap.get(a.bib) - beforeMap.get(b.bib))
        .map((a, i) => [a.bib, i + 1])
    );

    for (const x of [...eligible].sort(
      (a, b) => afterMap.get(b.bib) - afterMap.get(a.bib)
    )) {
      const xBefore = localBefore.get(x.bib);
      results.get(x.bib)[leg.name].gained =
        xBefore > 1 ? tree.query(xBefore - 1) : 0;
      tree.update(xBefore);
    }

    tree.reset();
    let inserted = 0;
    for (const x of [...eligible].sort(
      (a, b) => afterMap.get(a.bib) - afterMap.get(b.bib)
    )) {
      const xBefore = localBefore.get(x.bib);
      results.get(x.bib)[leg.name].lost = inserted - tree.query(xBefore);
      tree.update(xBefore);
      inserted++;
    }
  }

  return results;
}

/**
 * Reference O(n²) passing algorithm — kept solely for use with --verify.
 * Do not use on large events.
 */
export function computePassingData(athletes, legNames, hasWaveData = false) {
  const legs = legNames.map((name, i) => ({
    name,
    getBefore:
      i === 0
        ? hasWaveData
          ? (a) => a.waveOffset
          : null
        : (a) => a.cumPositions[legNames[i - 1]],
    getAfter: (a) => a.cumPositions[name],
  }));

  const results = new Map();
  for (const a of athletes) {
    const entry = {};
    for (const leg of legNames) entry[leg] = { gained: 0, lost: 0 };
    results.set(a.bib, entry);
  }

  for (const leg of legs) {
    const afterMap = buildRankMap(athletes, leg.getAfter);
    const eligible = athletes.filter((a) => afterMap.has(a.bib));
    const isGunStart = leg.name === legNames[0] && !hasWaveData;

    let beforeMap;
    if (isGunStart) {
      beforeMap = new Map(eligible.map((a) => [a.bib, 1]));
    } else {
      beforeMap = buildRankMap(athletes, leg.getBefore);
      eligible.splice(
        0,
        eligible.length,
        ...eligible.filter((a) => beforeMap.has(a.bib))
      );
    }

    for (const x of eligible) {
      const xBefore = beforeMap.get(x.bib);
      const xAfter = afterMap.get(x.bib);
      const legData = results.get(x.bib)[leg.name];

      for (const y of eligible) {
        if (y.bib === x.bib) continue;
        const yBefore = beforeMap.get(y.bib);
        const yAfter = afterMap.get(y.bib);
        if (yBefore == null || yAfter == null) continue;

        if (isGunStart) {
          if (yAfter > xAfter) legData.gained++;
          else if (yAfter < xAfter) legData.lost++;
        } else if (hasWaveData && leg.name === legNames[0] && x.waveOffset === y.waveOffset) {
          // Same wave on leg 1: both started simultaneously, so any ordering = pass
          if (yAfter > xAfter) legData.gained++;
          else if (yAfter < xAfter) legData.lost++;
        } else {
          if (yBefore < xBefore && yAfter > xAfter) legData.gained++;
          else if (yBefore > xBefore && yAfter < xAfter) legData.lost++;
        }
      }
    }
  }

  return results;
}

/**
 * Normalizes athletes, runs the fast passing algorithm, and optionally verifies
 * against the O(n²) reference implementation.
 *
 * @param {object[]}             athletes
 * @param {string[]}             legNames
 * @param {Map<string, number>}  startEpochs  - bib → epoch; pass empty Map if unavailable
 * @param {boolean}              verifyMode
 * @returns {{ normalizedAthletes: object[], passingMap: Map, hasWaveData: boolean }}
 */
export function runPassingAnalysis(athletes, legNames, startEpochs, verifyMode) {
  const hasEpochs = startEpochs.size > 0;
  const { athletes: normalizedAthletes, hasWaveData } = normalizeAthletes(
    athletes,
    legNames,
    hasEpochs ? startEpochs : null
  );

  const modeMsg = hasEpochs
    ? `Start times matched to ${startEpochs.size}/${athletes.length} athletes — physical passing mode active.`
    : "No per-athlete start times — using chip time comparisons only.";
  console.log(`   ${modeMsg}`);

  const passingMap = computePassingDataFast(normalizedAthletes, legNames, hasWaveData);

  if (verifyMode) {
    console.log("\n🔍 --verify: running O(n²) reference algorithm to diff results...");
    const refMap = computePassingData(normalizedAthletes, legNames, hasWaveData);
    let mismatches = 0;

    for (const a of normalizedAthletes) {
      const fast = passingMap.get(a.bib);
      const ref = refMap.get(a.bib);
      if (!fast || !ref) continue;
      for (const leg of legNames) {
        if (fast[leg].gained !== ref[leg].gained || fast[leg].lost !== ref[leg].lost) {
          if (mismatches === 0)
            console.log("   BIB       LEG      FAST gained/lost  REF gained/lost");
          console.log(
            `   ${String(a.bib).padEnd(9)} ${leg.padEnd(8)} ` +
              `fast=${fast[leg].gained}/${fast[leg].lost}  ref=${ref[leg].gained}/${ref[leg].lost}`
          );
          if (++mismatches >= 20) {
            console.log("   ... (truncated at 20 mismatches)");
            break;
          }
        }
      }
      if (mismatches >= 20) break;
    }

    if (mismatches === 0) {
      console.log("   ✅ PASS — fast and reference algorithms produce identical results.");
    } else {
      console.log(`\n   ❌ FAIL — ${mismatches} mismatch(es) found. Results written using fast algorithm.`);
    }
  }

  return { normalizedAthletes, passingMap, hasWaveData };
}
