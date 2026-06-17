import { fmtTimeLong, fmtElapsed } from "./format.mjs";

function pad(str, len) {
  return String(str).padEnd(len, " ").slice(0, len);
}

function rpad(str, len) {
  return String(str).padStart(len, " ").slice(-len);
}

/**
 * Prints a summary and the per-leg invariant check (sum gained === sum lost).
 */
export function printReport(athletes, passingMap, legNames, hasWaveData, elapsedMs, providerLabel = "") {
  const finishers = athletes.filter((a) => a.status === "FIN" && a.finishSecs != null);
  const dnfs = athletes.filter((a) => a.status === "DNF");

  const modeLabel = hasWaveData
    ? "✅ Physical passing — start time offsets applied"
    : "⚠️  Chip time only — no start time data";

  console.log("\n" + "═".repeat(70));
  console.log("  RACEREPLAY — Passing Analysis" + (providerLabel ? `  [${providerLabel}]` : ""));
  console.log("═".repeat(70));
  console.log(`  Athletes:  ${athletes.length}`);
  console.log(`  Finishers: ${finishers.length}`);
  console.log(`  DNFs:      ${dnfs.length}`);
  console.log(`  Legs:      ${legNames.join(", ")}`);
  console.log(`  Mode:      ${modeLabel}`);
  console.log(`  Elapsed:   ${fmtElapsed(elapsedMs)}`);
  console.log("═".repeat(70));

  console.log("\n📐 INVARIANT CHECK  (sum of gained must equal sum of lost per leg)");
  console.log("─".repeat(50));

  let invariantOk = true;
  for (const leg of legNames) {
    let totalGained = 0;
    let totalLost = 0;
    for (const data of passingMap.values()) {
      totalGained += data[leg].gained;
      totalLost += data[leg].lost;
    }
    const ok = totalGained === totalLost;
    if (!ok) invariantOk = false;
    const icon = ok ? "✅" : "❌";
    console.log(
      `  ${icon}  ${pad(leg.toUpperCase(), 8)}  gained=${rpad(totalGained, 7)}  lost=${rpad(totalLost, 7)}  ${ok ? "MATCH" : "MISMATCH ← BUG"}`
    );
  }
  console.log(`\n  Overall invariant: ${invariantOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log("\n" + "═".repeat(70) + "\n");
}

/**
 * Builds the full passing CSV as a string.
 */
export function buildOutputCSV(athletes, passingMap, legNames) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const headers = [
    "Bib",
    "Name",
    "Gender",
    "Country",
    "City",
    "Team",
    "Division",
    "Status",
    "Overall Rank",
    "Gender Rank",
    "Division Rank",
    "Overall Finish Time",
    "Wave Finish Time",
    ...legNames.map((l) => `${l} Time`),
    ...legNames.map((l) => `${l} EpochTime`),
    "Wave Offset (Seconds)",
    ...legNames.flatMap((l) => [`${l} Gained`, `${l} Lost`, `${l} Net`]),
    "Overall Net",
    "Overall Category Total",
    "Gender Category Total",
    "Division Category Total",
  ];

  const rows = athletes.map((a) => {
    const d = passingMap.get(a.bib);
    const overallNet = d
      ? legNames.reduce((sum, l) => sum + d[l].gained - d[l].lost, 0)
      : 0;

    const row = [
      a.bib,
      a.name,
      a.gender,
      a.country,
      a.city ?? "",
      a.team ?? "",
      a.division,
      a.status,
      a.overallRank ?? "",
      a.genderRank ?? "",
      a.divisionRank ?? "",
      fmtTimeLong(a.finishSecs),
      a.waveTime ?? "",
      ...legNames.map((l) => fmtTimeLong(a.legSecs[l])),
      ...legNames.map((l) => a.legEpochs?.[l] ?? ""),
      a.waveOffset ?? 0,
    ];

    if (d) {
      for (const leg of legNames) {
        const net = d[leg].gained - d[leg].lost;
        row.push(d[leg].gained, d[leg].lost, net);
      }
      row.push(overallNet);
    } else {
      for (let i = 0; i < legNames.length * 3 + 1; i++) row.push("");
    }

    row.push(
      a.categoryTotals?.overall ?? "",
      a.categoryTotals?.gender ?? "",
      a.categoryTotals?.division ?? ""
    );

    return row.map(esc).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
