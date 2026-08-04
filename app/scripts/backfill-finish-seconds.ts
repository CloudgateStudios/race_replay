#!/usr/bin/env tsx
/**
 * backfill-finish-seconds.ts
 *
 * Recomputes finishSeconds on all Athlete rows as the sum of timeSeconds
 * across ALL of the athlete's AthleteSegment rows — including the finish
 * leg, matching how ingest.ts computes the value (every leg, including the
 * final run/finish leg, is part of the race clock).
 *
 * An earlier version of this script excluded the isFinish segment, so any
 * athlete backfilled by it has finishSeconds short by their entire final
 * leg. This version recomputes every athlete and only writes rows whose
 * stored value differs, so it corrects those rows and is safe to re-run.
 *
 * Athletes with a missing leg time (DNF/DNS) get finishSeconds = null.
 *
 * Usage (run from the app/ directory):
 *   npx tsx scripts/backfill-finish-seconds.ts
 *
 * Against production:
 *   DATABASE_URL=<prod-url> npx tsx scripts/backfill-finish-seconds.ts
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const athletes = await prisma.athlete.findMany({
    select: { id: true, finishSeconds: true },
  });

  console.log(`Checking ${athletes.length} athletes.`);

  let updated = 0;
  let unchanged = 0;
  const BATCH = 500;

  for (let i = 0; i < athletes.length; i += BATCH) {
    const batch = athletes.slice(i, i + BATCH);
    const ids = batch.map((a) => a.id);

    // Fetch segments for this batch separately to avoid deep nesting
    const segments = await prisma.athleteSegment.findMany({
      where: { athleteId: { in: ids } },
      select: { athleteId: true, timeSeconds: true },
    });

    // Group timeSeconds by athleteId
    const timesByAthlete = new Map<number, (number | null)[]>();
    for (const s of segments) {
      const existing = timesByAthlete.get(s.athleteId) ?? [];
      existing.push(s.timeSeconds);
      timesByAthlete.set(s.athleteId, existing);
    }

    await Promise.all(
      batch.map((athlete) => {
        const times = timesByAthlete.get(athlete.id) ?? [];
        // Null when there are no segments or any leg time is missing —
        // a partial sum would understate the athlete's race time.
        const finishSeconds =
          times.length === 0 || times.some((t) => t === null)
            ? null
            : Math.round(times.reduce((sum, t) => sum! + t!, 0)!);

        if (finishSeconds === athlete.finishSeconds) {
          unchanged++;
          return Promise.resolve();
        }
        updated++;
        return prisma.athlete.update({
          where: { id: athlete.id },
          data: { finishSeconds },
        });
      })
    );

    process.stdout.write(`  ${i + batch.length}/${athletes.length} processed\r`);
  }

  console.log(`\nDone. ${updated} updated, ${unchanged} already correct.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
