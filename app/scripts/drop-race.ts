/**
 * Delete a race and all its associated data by slug.
 * Cascades through: AthleteSegment → Athlete → CategoryResult → Segment → Event → Race
 *
 * Run: DATABASE_URL=... npx tsx scripts/drop-race.ts <slug> [<slug2> ...]
 * Example: DATABASE_URL=... npx tsx scripts/drop-race.ts im-703-chattanooga ironman-chattanooga-70.3
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function dropRace(slug: string) {
  const race = await prisma.race.findUnique({
    where: { slug },
    include: { events: { include: { _count: { select: { athletes: true } } } } },
  });

  if (!race) {
    console.log(`  ✗ No race found with slug "${slug}"`);
    return;
  }

  const totalAthletes = race.events.reduce((sum, e) => sum + e._count.athletes, 0);
  console.log(`  Deleting "${race.name}" (${race.events.length} event(s), ${totalAthletes} athletes)...`);

  // Delete in dependency order
  for (const event of race.events) {
    // 1. AthleteSegments
    const athletes = await prisma.athlete.findMany({ where: { eventId: event.id }, select: { id: true } });
    const athleteIds = athletes.map((a) => a.id);
    await prisma.athleteSegment.deleteMany({ where: { athleteId: { in: athleteIds } } });

    // 2. Athletes
    await prisma.athlete.deleteMany({ where: { eventId: event.id } });

    // 3. CategoryResults
    await prisma.categoryResult.deleteMany({ where: { eventId: event.id } });

    // 4. Segments
    await prisma.segment.deleteMany({ where: { eventId: event.id } });
  }

  // 5. Events
  await prisma.event.deleteMany({ where: { raceId: race.id } });

  // 6. Race
  await prisma.race.delete({ where: { id: race.id } });

  console.log(`  ✓ Deleted "${race.name}"`);
}

async function main() {
  const slugs = process.argv.slice(2);
  if (!slugs.length) {
    console.error("Usage: npx tsx scripts/drop-race.ts <slug> [<slug2> ...]");
    process.exit(1);
  }

  for (const slug of slugs) {
    console.log(`\nProcessing slug: ${slug}`);
    await dropRace(slug);
  }
  console.log("\nDone.");
}

main().finally(() => prisma.$disconnect());
