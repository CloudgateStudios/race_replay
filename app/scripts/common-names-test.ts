/**
 * Test: find common names in the DB and check if name+gender+country
 * would produce false cross-person groupings.
 *
 * Run: DATABASE_URL=... npx tsx scripts/common-names-test.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Step 1: find the most common names across all events
  const topNames = await prisma.athlete.groupBy({
    by: ["name"],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
    orderBy: { _count: { id: "desc" } },
    take: 30,
  });

  console.log("Top 30 names appearing in multiple rows:\n");
  for (const r of topNames) {
    process.stdout.write(`  ${String(r._count.id).padStart(3)}x  ${r.name}\n`);
  }

  // Step 2: for each of those names, check how many distinct
  // gender+country combos exist — more than 1 means potential ambiguity
  console.log("\n\nAmbiguity check (name+gender+country groups > 1):\n");

  let clean = 0;
  let ambiguous = 0;

  for (const { name } of topNames) {
    const rows = await prisma.athlete.findMany({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { gender: true, country: true, division: true, eventId: true },
    });

    // Unique event IDs — are all rows from the same event? (de-dup issue vs real multi-person)
    const uniqueEvents = new Set(rows.map((r) => r.eventId));
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.gender}|${r.country}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    if (groups.size > 1) {
      ambiguous++;
      console.log(`  ⚠️  "${name}"  →  ${groups.size} groups:`);
      for (const [key, members] of groups) {
        const [gender, country] = key.split("|");
        const divisions = [...new Set(members.map((m) => m.division))].join(", ") || "(none)";
        console.log(`       [${gender} / ${country}]  ${members.length} row(s)  divisions: ${divisions}`);
      }
    } else if (uniqueEvents.size < rows.length) {
      // Single group but duplicate event rows — the Chattanooga problem
      console.log(`  🔁  "${name}"  →  1 group but ${rows.length} rows across ${uniqueEvents.size} unique events (possible duplicate ingest)`);
    } else {
      clean++;
    }
  }

  console.log(`\n${clean} clean  |  ${ambiguous} ambiguous`);
}

main().finally(() => prisma.$disconnect());
