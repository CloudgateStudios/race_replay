#!/usr/bin/env tsx
/**
 * fix-division-prefix.ts
 *
 * One-off script to repair division data from raceresult ingests that stored
 * the raw "Division Place" field as the division name — e.g. "1. M20-24"
 * instead of "M20-24" (the leading number is the athlete's place, and the
 * provider now strips it at scrape time).
 *
 * Two repairs:
 *   1. Athlete.division: strips the "N. " prefix.
 *   2. CategoryResult: deletes category="division" rows whose name carries the
 *      prefix. Their totals were counted per unique "N. div" string (almost
 *      always 1), so they are meaningless and cannot be repaired in place.
 *      A future re-ingest from a corrected CSV recreates them properly.
 *
 * Safe to re-run — it only touches rows that still match the prefix pattern.
 *
 * Usage (run from the app/ directory):
 *   npx tsx scripts/fix-division-prefix.ts
 *
 * Against production:
 *   DATABASE_URL=<prod-url> npx tsx scripts/fix-division-prefix.ts
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

const PREFIX_RE = /^\d+\.\s*/;

async function main() {
  const athletes = await prisma.athlete.findMany({
    where: { division: { contains: "." } },
    select: { id: true, division: true },
  });
  const affected = athletes.filter((a) => PREFIX_RE.test(a.division));
  console.log(`Athletes with a place-prefixed division: ${affected.length}`);

  const BATCH = 500;
  for (let i = 0; i < affected.length; i += BATCH) {
    const batch = affected.slice(i, i + BATCH);
    await Promise.all(
      batch.map((a) =>
        prisma.athlete.update({
          where: { id: a.id },
          data: { division: a.division.replace(PREFIX_RE, "").trim() },
        })
      )
    );
    process.stdout.write(`  ${Math.min(i + BATCH, affected.length)}/${affected.length} updated\r`);
  }
  if (affected.length > 0) console.log();

  const categoryResults = await prisma.categoryResult.findMany({
    where: { category: "division", name: { contains: "." } },
    select: { id: true, name: true },
  });
  const staleIds = categoryResults.filter((c) => PREFIX_RE.test(c.name)).map((c) => c.id);
  if (staleIds.length > 0) {
    await prisma.categoryResult.deleteMany({ where: { id: { in: staleIds } } });
  }
  console.log(`Deleted ${staleIds.length} place-prefixed division CategoryResult row(s).`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
