import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const races = await prisma.race.findMany({
    where: { name: { contains: "Chattanooga", mode: "insensitive" } },
    include: { events: { include: { _count: { select: { athletes: true } } } } },
  });
  for (const r of races) {
    console.log(`slug="${r.slug}"  id=${r.id}  name="${r.name}"`);
    for (const e of r.events) {
      console.log(`  eventId=${e.id}  year=${e.year}  athletes=${e._count.athletes}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
