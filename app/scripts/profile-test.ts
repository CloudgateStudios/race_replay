/**
 * Prototype script: test athlete profile matching logic against local DB.
 * Run: DATABASE_URL=... npx tsx scripts/profile-test.ts "Name One" "Name Two"
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function lookup(name: string) {
  const results = await prisma.athlete.findMany({
    where: { name: { equals: name, mode: "insensitive" } },
    include: { event: { include: { race: true } } },
    orderBy: { event: { date: "asc" } },
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Athlete: "${name}"`);
  console.log("=".repeat(60));

  if (!results.length) {
    console.log("  No results found.");
    return;
  }

  // Print raw rows
  for (const a of results) {
    console.log(
      `  ${a.event.race.name} ${a.event.year}` +
        `  |  gender=${a.gender}  division=${a.division}` +
        `  |  country=${a.country}  city=${a.city ?? "-"}` +
        `  |  finish=${a.finishTime ?? "DNF"}` +
        `  |  rank=#${a.overallRank ?? "?"} overall`
    );
  }

  // --- Grouping strategy 1: name + gender + country (exact) ---
  const byNameGenderCountry = new Map<string, typeof results>();
  for (const a of results) {
    const key = `${a.gender}|${a.country}`;
    if (!byNameGenderCountry.has(key)) byNameGenderCountry.set(key, []);
    byNameGenderCountry.get(key)!.push(a);
  }

  console.log(`\n  Grouping: name + gender + country`);
  console.log(`  → ${byNameGenderCountry.size} profile group(s)`);
  for (const [key, members] of byNameGenderCountry) {
    const [gender, country] = key.split("|");
    const divisions = [...new Set(members.map((m) => m.division))].join(", ");
    const events = members.map((m) => `${m.event.race.name} ${m.event.year}`).join(", ");
    console.log(`    [${gender} / ${country}]  ${members.length} event(s)`);
    console.log(`      divisions : ${divisions}`);
    console.log(`      events    : ${events}`);
  }

  // --- Grouping strategy 2: name + gender only (looser) ---
  const byNameGender = new Map<string, typeof results>();
  for (const a of results) {
    const key = a.gender;
    if (!byNameGender.has(key)) byNameGender.set(key, []);
    byNameGender.get(key)!.push(a);
  }

  if (byNameGender.size !== byNameGenderCountry.size) {
    console.log(`\n  Grouping: name + gender only (looser)`);
    console.log(`  → ${byNameGender.size} profile group(s)`);
    for (const [gender, members] of byNameGender) {
      const countries = [...new Set(members.map((m) => m.country))].join(", ");
      const divisions = [...new Set(members.map((m) => m.division))].join(", ");
      console.log(`    [${gender}]  ${members.length} event(s)  countries: ${countries}  divisions: ${divisions}`);
    }
  }
}

const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["Thomas Arra", "Eleanor Evins", "Joe Conrad"];

(async () => {
  for (const name of names) {
    await lookup(name);
  }
  await prisma.$disconnect();
})();
