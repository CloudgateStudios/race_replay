import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SearchInput } from "./search-input";

const getRaces = unstable_cache(
  () =>
    prisma.race.findMany({
      include: {
        events: {
          orderBy: { year: "desc" },
          select: {
            year: true,
            type: true,
            _count: { select: { athletes: true } },
          },
        },
      },
    }),
  ["all-races"],
  { revalidate: 3600 }
);

export const metadata: Metadata = {
  title: "All Races",
  description:
    "Browse every race tracked by Race Replay — leg-by-leg passing data for triathlons and road races.",
  openGraph: {
    siteName: "Race Replay",
    title: "All Races — Race Replay",
    description: "Browse every race tracked by Race Replay.",
  },
};

type SortKey = "name" | "type" | "years" | "athletes";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  col,
  current,
  dir,
  className,
}: {
  label: string;
  col: SortKey;
  current: SortKey;
  dir: SortDir;
  className?: string;
}) {
  const isActive = current === col;
  const nextDir = isActive && dir === "asc" ? "desc" : "asc";
  return (
    <th className={`px-6 py-3 font-semibold ${className ?? ""}`}>
      <Link
        href={`?sort=${col}&dir=${nextDir}`}
        className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
      >
        {label}
        <span className="text-xs">
          {isActive ? dir === "asc" ? "↑" : "↓" : <span className="opacity-30">↕</span>}
        </span>
      </Link>
    </th>
  );
}

export default async function RacesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; q?: string }>;
}) {
  const { sort, dir, q } = await searchParams;
  const sortKey: SortKey = (
    ["name", "type", "years", "athletes"].includes(sort ?? "") ? sort : "name"
  ) as SortKey;
  const sortDir: SortDir = dir === "desc" ? "desc" : "asc";

  const races = await getRaces();

  const rows = races.map((race) => ({
    slug: race.slug,
    name: race.name,
    type: race.events[0]?.type ?? "TRIATHLON",
    years: race.events.map((e) => e.year),
    latestYear: race.events[0]?.year ?? 0,
    totalAthletes: race.events.reduce((sum, e) => sum + e._count.athletes, 0),
  }));

  const query = q?.toLowerCase().trim() ?? "";
  const filtered = query ? rows.filter((r) => r.name.toLowerCase().includes(query)) : rows;

  filtered.sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name);
    else if (sortKey === "type") cmp = a.type.localeCompare(b.type);
    else if (sortKey === "years") cmp = a.latestYear - b.latestYear;
    else if (sortKey === "athletes") cmp = a.totalAthletes - b.totalAthletes;
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div>
      <div className="mb-10">
        <h1 className="mb-2 text-4xl font-black tracking-tight">All Races</h1>
        <p className="text-muted-foreground text-lg">
          Browse every race in the Race Replay database.
        </p>
      </div>

      <div className="mb-6">
        <SearchInput defaultValue={q ?? ""} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground">No races found.</p>
      ) : (
        <div className="mx-2 overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground border-b text-left">
                <SortHeader label="Race" col="name" current={sortKey} dir={sortDir} />
                <SortHeader
                  label="Type"
                  col="type"
                  current={sortKey}
                  dir={sortDir}
                  className="hidden sm:table-cell"
                />
                <SortHeader label="Years" col="years" current={sortKey} dir={sortDir} />
                <SortHeader
                  label="Entries"
                  col="athletes"
                  current={sortKey}
                  dir={sortDir}
                  className="text-right"
                />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={row.slug}
                  className={`hover:bg-muted/30 border-b transition-colors last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                >
                  <td className="px-6 py-3">
                    <Link
                      href={`/events/${row.slug}`}
                      className="hover:text-primary font-medium transition-colors"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="text-muted-foreground hidden px-6 py-3 sm:table-cell">
                    {row.type === "TRIATHLON" ? "Triathlon" : "Road Race"}
                  </td>
                  <td className="text-muted-foreground px-6 py-3 tabular-nums">
                    {row.years.join(", ")}
                  </td>
                  <td className="text-muted-foreground px-6 py-3 text-right tabular-nums">
                    {row.totalAthletes.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
