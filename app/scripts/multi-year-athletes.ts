/**
 * Find athletes who appear across multiple years of the same race.
 * Run: DATABASE_URL=... npx tsx scripts/multi-year-athletes.ts <race-slug>
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/multi-year-athletes.ts <race-slug>");
    process.exit(1);
  }

  const race = await prisma.race.findUnique({
    where: { slug },
    include: { events: { orderBy: { year: "asc" } } },
  });

  if (!race) {
    console.error(`No race found with slug "${slug}"`);
    process.exit(1);
  }

  const years = race.events.map((e) => e.year);
  console.log(`\nRace: ${race.name}`);
  console.log(`Years in DB: ${years.join(", ")}\n`);

  if (years.length < 2) {
    console.log("Only one year of data — nothing to compare.");
    return;
  }

  // Load all athletes across all events
  const allAthletes = await prisma.athlete.findMany({
    where: { event: { raceId: race.id } },
    include: { event: true },
    orderBy: { event: { year: "asc" } },
  });

  // Group by name+gender+country (our matching key)
  const profiles = new Map<string, typeof allAthletes>();
  for (const a of allAthletes) {
    const key = `${a.name.toLowerCase()}|${a.gender}|${a.country}`;
    if (!profiles.has(key)) profiles.set(key, []);
    profiles.get(key)!.push(a);
  }

  // Keep only those who appear in 2+ distinct years
  const multiYear = [...profiles.entries()]
    .filter(([, members]) => {
      const distinctYears = new Set(members.map((m) => m.event.year));
      return distinctYears.size >= 2;
    })
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Found ${multiYear.length} athletes matching across 2+ years:\n`);

  for (const [, members] of multiYear.slice(0, 30)) {
    const first = members[0];
    const yearSummaries = members.map((m) => {
      const net = ""; // could add net if needed
      return `${m.event.year}: ${m.finishTime ?? "DNF"} (#${m.overallRank ?? "?"} overall, div ${m.division || "n/a"})`;
    });
    console.log(`  ${first.name}  [${first.gender} / ${first.country}]`);
    for (const s of yearSummaries) console.log(`    ${s}`);
  }

  if (multiYear.length > 30) {
    console.log(`\n  ... and ${multiYear.length - 30} more.`);
  }
}

main().finally(() => prisma.$disconnect());
