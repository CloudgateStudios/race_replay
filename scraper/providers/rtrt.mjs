/**
 * RTRT.me provider for racereplay.mjs
 *
 * Fetches race data from the RTRT.me timing API. Results are fetched
 * per-timing-point with pagination, cached to disk, then assembled into the
 * normalized athlete format consumed by the shared passing algorithm.
 *
 * Required flags: --appid <id>
 * Optional flags: --points <list>, --concurrency <n>, --fresh
 */

import fs from "fs/promises";
import path from "path";
import { parseTime, cleanLabel } from "../lib/format.mjs";
import { ProgressDisplay } from "../lib/display.mjs";
import { saveSplits, loadSplits, splitFileExists } from "../lib/cache.mjs";

const API = "https://api.rtrt.me";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const PAGE = 20;
const DELAY = 100;

async function rtrtFetch(p) {
  const res = await fetch(`${API}${p}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`RTRT ${p} → HTTP ${res.status}`);
  return res.json();
}

async function register(appid) {
  const data = await rtrtFetch(`/register?appid=${appid}`);
  if (!data.token) throw new Error(`Registration failed: ${JSON.stringify(data)}`);
  return data.token;
}

async function fetchAllPoints(eventId, appid, token) {
  const qs = `appid=${appid}&token=${token}`;
  const allPoints = [];
  let start = 1;

  while (true) {
    const data = await rtrtFetch(`/events/${eventId}/points?${qs}&start=${start}`);
    if (data.error || !data.list?.length) break;
    allPoints.push(...data.list);
    if (data.list.length < PAGE) break;
    start = parseInt(data.info?.last ?? start) + 1;
    await new Promise((r) => setTimeout(r, 100));
  }

  return allPoints.sort((a, b) => parseFloat(a.km || 0) - parseFloat(b.km || 0));
}

async function fetchAllSplitsAtPoint(
  eventId,
  pointName,
  appid,
  tokenRef,
  hintTotal = 0,
  onProgress = () => {}
) {
  const map = new Map();
  let start = 1;
  let retries = 0;
  const estPages = hintTotal > 0 ? Math.ceil(hintTotal / PAGE) : 0;
  const pointStart = Date.now();

  const progress = (page, records) => {
    const elapsed = ((Date.now() - pointStart) / 1000).toFixed(0);
    const pageStr = estPages > 0 ? `page ${page}/${estPages}` : `page ${page}`;
    onProgress(`⏳ ${pageStr}  •  ${records} records  •  ${elapsed}s elapsed`);
  };

  while (true) {
    const qs = `appid=${appid}&token=${tokenRef.value}`;
    const url = `/events/${eventId}/points/${pointName}/splits?${qs}&start=${start}`;

    let data;
    try {
      data = await rtrtFetch(url);
    } catch (networkErr) {
      if (retries < 3) {
        retries++;
        const wait = retries * 5000;
        onProgress(`⚠️  network retry ${retries}/3 in ${wait / 1000}s — ${networkErr.message}`);
        await new Promise((r) => setTimeout(r, wait));
        tokenRef.value = await register(appid);
        continue;
      }
      throw networkErr;
    }

    if (data.error) {
      const type = data.error.type ?? "";
      const msg = data.error.msg ?? "";
      if (
        type === "no_results" ||
        type === "access_denied" ||
        msg.toLowerCase().includes("not found")
      ) {
        return map;
      }
      if (retries < 3) {
        retries++;
        const wait = retries * 5000;
        onProgress(`⚠️  API retry ${retries}/3 in ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
        tokenRef.value = await register(appid);
        continue;
      }
      throw new Error(`Splits fetch at ${pointName} failed: ${msg}`);
    }

    retries = 0;
    if (!data.list?.length) break;
    for (const s of data.list) {
      if (!map.has(String(s.bib))) map.set(String(s.bib), s);
    }
    const page = Math.ceil(start / PAGE);
    progress(page, map.size);
    if (data.list.length < PAGE) break;

    start = parseInt(data.info?.last ?? start) + 1;
    await new Promise((r) => setTimeout(r, DELAY));
  }

  return map;
}

export async function discoverTimingPoints(eventId, appid, token, forcedPoints) {
  if (forcedPoints) {
    console.log(`\n📋 Using specified points: ${forcedPoints.join(", ")}`);
    return forcedPoints.map((name, i) => ({
      name,
      label: name,
      legName: name,
      isStart: i === 0,
      isFinish: i === forcedPoints.length - 1,
    }));
  }

  console.log("\n📋 Discovering timing points...");
  const allPoints = await fetchAllPoints(eventId, appid, token);
  console.log(`   Found ${allPoints.length} total timing points`);

  const startPoint = allPoints.find((p) => p.isStart === "1");
  const finishPoint = allPoints.find((p) => p.isFinish === "1");
  if (!startPoint) throw new Error("No START point found for this event");
  if (!finishPoint) throw new Error("No FINISH point found for this event");

  const isTransition = (p) => /^T\d+$/i.test(p.name) || /^T\d+$/i.test(p.label);
  const intermediate = allPoints.filter(
    (p) =>
      p.publish === "1" &&
      p.isStart !== "1" &&
      p.isFinish !== "1" &&
      (p.hide_in_badges !== "1" || isTransition(p))
  );

  console.log(`   START: ${startPoint.name} (${startPoint.label || startPoint.name})`);
  console.log(`   Intermediate: ${intermediate.length} points`);
  for (const p of intermediate) {
    console.log(`     • ${p.name} — "${p.label}" @ ${p.km} km`);
  }
  console.log(`   FINISH: ${finishPoint.name} (${finishPoint.label || finishPoint.name})`);

  const legPoints = [...intermediate, finishPoint];
  return [
    {
      name: startPoint.name,
      label: startPoint.label,
      legName: null,
      isStart: true,
      isFinish: false,
    },
    ...legPoints.map((p, i) => ({
      name: p.name,
      label: p.label,
      legName:
        cleanLabel(p.label || p.name) ||
        (p.isFinish === "1" ? "Finish" : `Leg ${i + 1}`),
      isStart: false,
      isFinish: p.isFinish === "1",
    })),
  ];
}

async function fetchAndCacheSplits(
  eventId,
  pointsToFetch,
  appid,
  outputDir,
  hintTotal,
  { concurrency, fresh }
) {
  const fetchStart = Date.now();
  let completed = 0;

  const toFetch = [];
  for (let i = 0; i < pointsToFetch.length; i++) {
    const pt = pointsToFetch[i];
    const cached = !fresh && (await splitFileExists(outputDir, eventId, pt.name));
    if (cached) {
      console.log(`   [${i + 1}/${pointsToFetch.length}] ${pt.name} — cached ✓`);
    } else {
      toFetch.push({ pt, idx: i });
    }
  }

  if (toFetch.length === 0) {
    console.log("\n   All points cached — skipping fetch.");
    return;
  }

  console.log(`\n   Fetching ${toFetch.length} point(s) with concurrency=${concurrency}...\n`);

  const workerCount = Math.min(concurrency, toFetch.length);
  const tokens = await Promise.all(Array.from({ length: workerCount }, () => register(appid)));
  const tokenRefs = tokens.map((value) => ({ value }));
  const queue = [...toFetch];
  const display = new ProgressDisplay();

  async function runWorker(workerToken) {
    while (queue.length > 0) {
      const { pt, idx } = queue.shift();
      const label = `   [${idx + 1}/${pointsToFetch.length}] ${pt.name.padEnd(8)}`;
      const ptStart = Date.now();
      const lineIdx = display.addLine(`${label} starting...`);

      const map = await fetchAllSplitsAtPoint(
        eventId,
        pt.name,
        appid,
        workerToken,
        hintTotal,
        (status) => display.update(lineIdx, `${label} ${status}`)
      );
      await saveSplits(outputDir, eventId, pt.name, map);

      completed++;
      const ptSecs = ((Date.now() - ptStart) / 1000).toFixed(1);
      const elapsed = ((Date.now() - fetchStart) / 1000).toFixed(0);
      const left = toFetch.length - completed;
      const avgSecs = (Date.now() - fetchStart) / 1000 / completed;
      const etaSecs = Math.round(left * avgSecs);
      const eta = etaSecs > 60 ? `~${Math.round(etaSecs / 60)}m` : `~${etaSecs}s`;
      display.update(
        lineIdx,
        `${label} ✅ ${map.size} records in ${ptSecs}s  •  ${elapsed}s total  •  ${
          left > 0 ? eta + " remaining" : "all done"
        }`
      );
    }
  }

  await Promise.all(tokenRefs.map((tr) => runWorker(tr)));
}

async function buildAthleteRecords(eventId, pointsToFetch, outputDir) {
  const startPointName = pointsToFetch.find((p) => p.isStart)?.name;
  const legPointDefs = pointsToFetch.filter((p) => !p.isStart);

  console.log("\n   Loading split files...");
  const allSplits = new Map();
  for (const pt of pointsToFetch) {
    allSplits.set(pt.name, await loadSplits(outputDir, eventId, pt.name));
  }

  const startSplits = allSplits.get(startPointName);
  const finishPtDef = legPointDefs.find((p) => p.isFinish);
  const finishSplits = allSplits.get(finishPtDef?.name);

  const allBibs = new Set([...startSplits.keys(), ...finishSplits.keys()]);
  console.log(`   Total athletes found: ${allBibs.size}`);

  const athletes = [];
  const startEpochs = new Map();

  for (const bib of allBibs) {
    const startSplit = startSplits.get(bib);
    const finishSplit = finishSplits.get(bib);
    const profile = finishSplit ?? startSplit;
    if (!profile) continue;

    const legSecs = {};
    let prevCumSecs = 0;
    for (const legPt of legPointDefs) {
      const split = allSplits.get(legPt.name)?.get(bib);
      const cumSecs = parseTime(split?.netTime);
      if (cumSecs != null && prevCumSecs !== null) {
        legSecs[legPt.legName] = Math.max(0, Math.round(cumSecs - prevCumSecs));
        prevCumSecs = cumSecs;
      } else {
        legSecs[legPt.legName] = null;
        prevCumSecs = null;
      }
    }

    const finishCumSecs = parseTime(finishSplit?.netTime);
    const results = finishSplit?.results ?? {};
    const overallRank = results["course"]?.p ?? results["overall"]?.p ?? null;
    const genderRank = results["course-sex"]?.p ?? results["gender"]?.p ?? null;
    const divisionRank = results["course-sex-division"]?.p ?? results["agegroup"]?.p ?? null;
    const gender = profile.sex === "M" ? "Male" : profile.sex === "F" ? "Female" : "";
    const startEpoch = startSplit?.epochTime ? parseFloat(startSplit.epochTime) : null;

    if (startEpoch != null) startEpochs.set(bib, startEpoch);

    const legEpochs = {};
    for (const legPt of legPointDefs) {
      const split = allSplits.get(legPt.name)?.get(bib);
      legEpochs[legPt.legName] = split?.epochTime ? parseFloat(split.epochTime) : null;
    }

    const categoryTotals = {
      overall:
        results["course"]?.t != null ? parseInt(results["course"].t, 10) : null,
      gender:
        results["course-sex"]?.t != null ? parseInt(results["course-sex"].t, 10) : null,
      division:
        results["course-sex-division"]?.t != null
          ? parseInt(results["course-sex-division"].t, 10)
          : null,
    };

    athletes.push({
      bib,
      name: profile.name ?? "",
      gender,
      country: profile.country_iso?.toUpperCase() ?? profile.country ?? "",
      city: profile.city ?? "",
      team: profile.team ?? "",
      division: profile.division ?? "",
      status: finishSplit ? "FIN" : "DNF",
      overallRank: overallRank != null ? parseInt(overallRank, 10) : null,
      genderRank: genderRank != null ? parseInt(genderRank, 10) : null,
      divisionRank: divisionRank != null ? parseInt(divisionRank, 10) : null,
      finishSecs: finishCumSecs ?? null,
      waveTime: finishSplit?.waveTime ?? null,
      legSecs,
      legEpochs,
      categoryTotals,
      startEpoch,
      waveOffset: null,
      cumPositions: {},
    });
  }

  const hasRtrtRanks = athletes.some((a) => a.overallRank != null);
  if (!hasRtrtRanks) {
    console.log("   No RTRT rank data found — computing ranks from finish times.");
    const finishers = athletes
      .filter((a) => a.status === "FIN" && a.finishSecs != null)
      .sort(
        (a, b) =>
          a.finishSecs - b.finishSecs ||
          String(a.bib).localeCompare(String(b.bib))
      );

    finishers.forEach((a, i) => { a.overallRank = i + 1; });

    const byGender = new Map();
    for (const a of finishers) {
      if (!byGender.has(a.gender)) byGender.set(a.gender, []);
      byGender.get(a.gender).push(a);
    }
    for (const group of byGender.values()) {
      group.forEach((a, i) => { a.genderRank = i + 1; });
    }

    const byDivision = new Map();
    for (const a of finishers) {
      const key = a.division || "__none__";
      if (!byDivision.has(key)) byDivision.set(key, []);
      byDivision.get(key).push(a);
    }
    for (const [key, group] of byDivision.entries()) {
      if (key === "__none__") continue;
      group.forEach((a, i) => { a.divisionRank = i + 1; });
    }
  }

  athletes.sort((a, b) => (a.overallRank ?? 99999) - (b.overallRank ?? 99999));

  const finisherCount = athletes.filter((a) => a.status === "FIN").length;
  const dnfCount = athletes.filter((a) => a.status === "DNF").length;
  console.log(`   Finishers: ${finisherCount} | DNFs: ${dnfCount}`);

  return { athletes, startEpochs };
}

/**
 * Main entry point for the RTRT provider.
 *
 * @param {string}   eventId
 * @param {object}   opts
 * @param {string}   opts.appid
 * @param {string}   opts.outputDir
 * @param {string[]|null} opts.forcedPoints
 * @param {number}   opts.concurrency
 * @param {boolean}  opts.fresh
 * @returns {Promise<{ athletes: object[], legNames: string[], startEpochs: Map }>}
 */
export async function fetchRaceData(eventId, opts) {
  const { appid, outputDir, forcedPoints, concurrency, fresh } = opts;

  if (!appid) throw new Error("--appid is required for the rtrt provider");

  console.log("🔑 Registering with RTRT.me...");
  const tokenRef = { value: await register(appid) };

  const event = await rtrtFetch(
    `/events/${eventId}?appid=${appid}&token=${tokenRef.value}`
  );
  if (event.error) throw new Error(`Event not found: ${event.error.msg}`);
  console.log(`\n📍 Event: ${event.desc} (${event.date})`);
  console.log(`   Location: ${event.loc?.desc ?? "unknown"}`);
  console.log(`   Finishers reported: ${event.finishers ?? "unknown"}`);

  const pointsToFetch = await discoverTimingPoints(
    eventId,
    appid,
    tokenRef.value,
    forcedPoints
  );
  const legPointDefs = pointsToFetch.filter((p) => !p.isStart);
  const legNames = legPointDefs.map((p) => p.legName);
  console.log(`\n   Legs to compute: ${legNames.join(" → ")}`);

  const hintTotal = event.finishers ? parseInt(event.finishers, 10) : 0;
  await fetchAndCacheSplits(eventId, pointsToFetch, appid, outputDir, hintTotal, {
    concurrency,
    fresh,
  });

  const { athletes, startEpochs } = await buildAthleteRecords(
    eventId,
    pointsToFetch,
    outputDir
  );

  return { athletes, legNames, startEpochs };
}
