#!/usr/bin/env tsx
/**
 * cleanup-finish-time-placeholder.ts
 *
 * One-off script to null out the "--:--:--" placeholder that older ingests
 * stored in Athlete.finishTime / Athlete.waveTime for DNF/DNS rows. The
 * scraper writes that placeholder into the CSV for missing times, and
 * ingest.ts previously stored it verbatim — so the UI's `finishTime ?? "—"`
 * fallbacks never fired and the value polluted string sorts.
 *
 * Safe to re-run — it only touches rows that still hold the placeholder.
 *
 * Usage (run from the app/ directory):
 *   npx tsx scripts/cleanup-finish-time-placeholder.ts
 *
 * Against production:
 *   DATABASE_URL=<prod-url> npx tsx scripts/cleanup-finish-time-placeholder.ts
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

const PLACEHOLDER = "--:--:--";

async function main() {
  const [finishTimes, waveTimes] = await Promise.all([
    prisma.athlete.updateMany({
      where: { finishTime: PLACEHOLDER },
      data: { finishTime: null },
    }),
    prisma.athlete.updateMany({
      where: { waveTime: PLACEHOLDER },
      data: { waveTime: null },
    }),
  ]);

  console.log(
    `Done. Nulled ${finishTimes.count} finishTime and ${waveTimes.count} waveTime placeholder(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
