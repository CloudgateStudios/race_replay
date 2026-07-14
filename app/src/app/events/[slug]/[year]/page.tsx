import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Gender } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventFilters } from "./filters";
import { EventFunnel } from "./funnel";
import { SortHeader } from "./sort-header";

const PAGE_SIZE = 50;

interface Props {
  params: Promise<{ slug: string; year: string }>;
  searchParams: Promise<Record<string, string>>;
}

const SORTABLE_COLUMNS: Record<string, object> = {
  rank: { overallRank: "asc" as const },
  name: { name: "asc" as const },
  bib: { bib: "asc" as const },
  finish: { finishTime: "asc" as const },
};

export async function generateMetadata({ params }: Props) {
  const { slug, year } = await params;
  const event = await prisma.event.findFirst({
    where: { year: parseInt(year, 10), race: { slug } },
    include: { race: { select: { name: true } } },
  });
  if (!event) return { title: "Not Found" };
  const athleteStats = await prisma.athlete.groupBy({
    by: ["status"],
    where: { eventId: event.id },
    _count: { id: true },
  });
  const totalAthletes = athleteStats.reduce((sum, g) => sum + g._count.id, 0);
  const finisherCount = athleteStats.find((g) => g.status === "FIN")?._count.id ?? 0;
  const finishPct = totalAthletes > 0 ? ((finisherCount / totalAthletes) * 100).toFixed(1) : "0";
  const title = `${event.race.name} ${year}`;
  const description = `${event.race.name} ${year} results — ${totalAthletes.toLocaleString()} athletes, ${finisherCount.toLocaleString()} finishers (${finishPct}%). See leg-by-leg passing data on Race Replay.`;
  return {
    title,
    description,
    openGraph: { siteName: "Race Replay", title, description },
  };
}

export default async function EventPage({ params, searchParams }: Props) {
  const { slug, year: yearStr } = await params;
  const sp = await searchParams;

  const year = parseInt(yearStr, 10);
  if (isNaN(year)) notFound();

  const q = sp.q?.trim() ?? "";
  const genderParam = sp.gender ?? "";
  const gender = (Object.values(Gender) as string[]).includes(genderParam)
    ? (genderParam as Gender)
    : null;
  const division = sp.division ?? "";
  const sort = sp.sort ?? "rank";
  const dir = (sp.dir ?? "asc") as "asc" | "desc";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));

  const event = await prisma.event.findFirst({
    where: { year, race: { slug } },
    include: {
      race: { select: { id: true, name: true, slug: true } },
      segments: { orderBy: { displayOrder: "asc" } },
    },
  });
  if (!event) notFound();

  const race = event.race;

  // Build where clause
  const where = {
    eventId: event.id,
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { bib: { contains: q, mode: "insensitive" as const } },
      ],
    }),
    ...(gender !== null && { gender }),
    ...(division && { division }),
  };

  // Determine sort order
  const orderBy = SORTABLE_COLUMNS[sort] ?? { overallRank: "asc" as const };
  const orderByWithDir = Object.fromEntries(Object.entries(orderBy).map(([k]) => [k, dir]));

  // Single groupBy replaces N individual count queries for each segment
  const segmentCountsRaw = await prisma.athleteSegment.groupBy({
    by: ["segmentId"],
    where: { segmentId: { in: event.segments.map((s) => s.id) }, timeSeconds: { not: null } },
    _count: { id: true },
  });
  const segmentCounts = event.segments.map((seg) => ({
    segmentId: seg.id,
    name: seg.name,
    isFinish: seg.isFinish,
    count: segmentCountsRaw.find((r) => r.segmentId === seg.id)?._count.id ?? 0,
  }));

  // Single groupBy replaces two separate athlete count queries
  const athleteStatsByStatus = await prisma.athlete.groupBy({
    by: ["status"],
    where: { eventId: event.id },
    _count: { id: true },
  });
  const totalAthletes = athleteStatsByStatus.reduce((sum, g) => sum + g._count.id, 0);
  const finisherCount = athleteStatsByStatus.find((g) => g.status === "FIN")?._count.id ?? 0;

  const [total, athletes, genders, divisions] = await Promise.all([
    prisma.athlete.count({ where }),
    prisma.athlete.findMany({
      where,
      orderBy: orderByWithDir,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        segments: {
          include: { segment: true },
          orderBy: { segment: { displayOrder: "asc" } },
        },
      },
    }),
    prisma.athlete
      .findMany({
        where: { eventId: event.id },
        distinct: ["gender"],
        select: { gender: true },
        orderBy: { gender: "asc" },
      })
      .then((r) => r.map((a) => a.gender).filter(Boolean)),
    prisma.athlete
      .findMany({
        where: { eventId: event.id },
        distinct: ["division"],
        select: { division: true },
        orderBy: { division: "asc" },
      })
      .then((r) => r.map((a) => a.division).filter(Boolean)),
  ]);

  const hasDivisions = divisions.some((d) => d && d.trim() !== "");
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function pageUrl(p: number) {
    const params = new URLSearchParams(sp);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://racereplay.app";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${race.name} ${year}`,
    startDate: event.date.toISOString().slice(0, 10),
    url: `${BASE_URL}/events/${slug}/${year}`,
    organizer: { "@type": "Organization", name: race.name },
    competitor: { "@type": "Person", name: `${totalAthletes.toLocaleString()} athletes` },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        // JSON.stringify does not escape "<", so a value containing "</script>"
        // would break out of this block — escape it for any data source.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      {/* Breadcrumb */}
      <div className="mb-1">
        <Link
          href="/races"
          className="text-muted-foreground hover:text-primary text-sm transition-colors"
        >
          All races
        </Link>
        <span className="text-muted-foreground mx-1 text-sm">›</span>
        <Link
          href={`/events/${slug}`}
          className="text-muted-foreground hover:text-primary text-sm transition-colors"
        >
          {race.name}
        </Link>
      </div>

      <h1 className="mb-1 text-3xl font-bold tracking-tight">
        {race.name} <span className="text-muted-foreground font-normal">{year}</span>
      </h1>

      {/* Event type badge */}
      <div className="mb-4">
        <Badge variant="secondary">{event.type === "TRIATHLON" ? "Triathlon" : "Road Race"}</Badge>
      </div>

      {/* Athlete funnel */}
      <EventFunnel
        totalAthletes={totalAthletes}
        finisherCount={finisherCount}
        segmentCounts={segmentCounts}
      />

      <Suspense>
        <EventFilters genders={genders} divisions={divisions} />
      </Suspense>

      {/* Results count + "Find me" CTA when exactly one match */}
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          {total.toLocaleString()} result{total !== 1 ? "s" : ""}
          {page > 1 ? ` — page ${page} of ${totalPages}` : ""}
        </p>
        {q && total === 1 && athletes[0] && (
          <Link
            href={`/events/${slug}/${year}/${athletes[0].bib}`}
            className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors"
          >
            View {athletes[0].name} →
          </Link>
        )}
      </div>

      {/* Table: on mobile shows Rank, Name (+ status badge inline), Overall Net only.
          Secondary columns (Bib, Division, Status, Finish, per-segment nets) are
          hidden on small screens and revealed at sm breakpoint.
          A right-edge fade hints at horizontal scroll on mobile. */}
      <div className="relative">
        {/* Fade hint for horizontal overflow on mobile */}
        <div className="from-background pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-8 bg-gradient-to-l to-transparent sm:hidden" />
        <div className="overflow-x-auto rounded-md border">
          <Table className="table-fixed sm:table-auto">
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 sm:w-auto">
                  <SortHeader column="rank" label="Rank" currentSort={sort} currentDir={dir} />
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <SortHeader column="bib" label="Bib" currentSort={sort} currentDir={dir} />
                </TableHead>
                <TableHead className="w-auto">
                  <SortHeader column="name" label="Name" currentSort={sort} currentDir={dir} />
                </TableHead>
                {hasDivisions && <TableHead className="hidden sm:table-cell">Division</TableHead>}
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden sm:table-cell">
                  <SortHeader column="finish" label="Finish" currentSort={sort} currentDir={dir} />
                </TableHead>
                {event.segments.map((seg) => (
                  <TableHead key={`${seg.id}-net`} className="hidden text-center sm:table-cell">
                    {seg.name} Net
                  </TableHead>
                ))}
                <TableHead className="w-24 text-center sm:w-auto">Overall Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {athletes.map((athlete) => {
                const overallNet = athlete.segments.reduce((sum, s) => sum + (s.net ?? 0), 0);
                return (
                  <TableRow key={athlete.id} className="hover:bg-muted/50">
                    <TableCell className="tabular-nums">{athlete.overallRank ?? "—"}</TableCell>
                    <TableCell className="hidden font-mono text-sm tabular-nums sm:table-cell">
                      {athlete.bib}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/events/${slug}/${year}/${athlete.bib}`}
                        className="font-medium hover:underline"
                      >
                        {athlete.name}
                      </Link>
                      {/* Status badge shown inline on mobile only */}
                      {athlete.status !== "FIN" && (
                        <Badge variant="outline" className="ml-2 text-xs sm:hidden">
                          {athlete.status}
                        </Badge>
                      )}
                    </TableCell>
                    {hasDivisions && (
                      <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                        {athlete.division || "—"}
                      </TableCell>
                    )}
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={athlete.status === "FIN" ? "secondary" : "outline"}>
                        {athlete.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden font-mono text-sm tabular-nums sm:table-cell">
                      {athlete.finishTime ?? "—"}
                    </TableCell>
                    {event.segments.map((seg) => {
                      const s = athlete.segments.find((as) => as.segmentId === seg.id);
                      return (
                        <TableCell
                          key={`${athlete.id}-${seg.id}-net`}
                          className={`hidden text-center font-medium tabular-nums sm:table-cell ${(s?.net ?? 0) > 0 ? "text-green-600" : (s?.net ?? 0) < 0 ? "text-red-500" : ""}`}
                        >
                          {s?.net != null ? (s.net > 0 ? `+${s.net}` : s.net) : "—"}
                        </TableCell>
                      );
                    })}
                    <TableCell
                      className={`text-center font-bold tabular-nums ${overallNet > 0 ? "text-green-600" : overallNet < 0 ? "text-red-500" : ""}`}
                    >
                      {overallNet > 0 ? `+${overallNet}` : overallNet}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="hover:bg-muted rounded border px-3 py-1 text-sm"
            >
              ← Prev
            </Link>
          )}
          <span className="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="hover:bg-muted rounded border px-3 py-1 text-sm"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
