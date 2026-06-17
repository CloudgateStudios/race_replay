import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MapPin, Trophy, Route } from "lucide-react";

export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const race = await prisma.race.findUnique({
    where: { slug },
    include: { _count: { select: { events: true } } },
  });
  if (!race) return { title: "Not Found" };
  const years = race._count.events;
  return {
    title: race.name,
    description: `${race.name} race results — ${years} year${years !== 1 ? "s" : ""} of data on Race Replay.`,
    openGraph: {
      siteName: "Race Replay",
      title: race.name,
      description: `${race.name} race results on Race Replay.`,
    },
  };
}

export default async function RacePage({ params }: Props) {
  const { slug } = await params;

  const race = await prisma.race.findUnique({
    where: { slug },
    include: {
      events: {
        orderBy: { year: "desc" },
        include: {
          _count: { select: { athletes: true } },
          segments: {
            orderBy: { displayOrder: "asc" },
            select: { name: true },
          },
        },
      },
    },
  });

  if (!race) notFound();

  // Skip the year-picker when there's only one year of data
  if (race.events.length === 1) {
    redirect(`/events/${slug}/${race.events[0].year}`);
  }

  const totalEntries = race.events.reduce((sum, e) => sum + e._count.athletes, 0);
  const years = race.events.map((e) => e.year);
  const coverage =
    years.length > 1
      ? `${Math.min(...years)}–${String(Math.max(...years)).slice(2)}`
      : String(years[0]);
  const maxAthletes = Math.max(...race.events.map((e) => e._count.athletes));
  const latestYear = race.events[0]?.year;

  return (
    <div>
      {/* Breadcrumb + header */}
      <div className="mb-8">
        <Link
          href="/races"
          className="text-muted-foreground hover:text-primary text-sm transition-colors"
        >
          ← All races
        </Link>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">{race.name}</h1>

        {/* Race metadata badges */}
        <div className="mt-3 flex flex-wrap gap-2">
          {race.location && (
            <span className="text-muted-foreground border-border inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs">
              <MapPin className="h-3 w-3" />
              {race.location}
            </span>
          )}
          {race.seriesName && (
            <span className="text-muted-foreground border-border inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs">
              <Trophy className="h-3 w-3" />
              {race.seriesName}
            </span>
          )}
          {race.distanceType && (
            <span className="text-muted-foreground border-border inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs">
              <Route className="h-3 w-3" />
              {race.distanceType} mi
            </span>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { value: race.events.length, label: "Years tracked" },
          { value: totalEntries.toLocaleString(), label: "Total entries" },
          { value: coverage, label: "Coverage" },
        ].map(({ value, label }) => (
          <div key={label} className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold tabular-nums">{value}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="bg-card mb-6 rounded-xl border p-5">
        <p className="text-muted-foreground mb-4 text-xs font-medium tracking-wide uppercase">
          Entries by year — click to view results
        </p>
        <div className="flex items-end gap-3" style={{ height: "96px" }}>
          {[...race.events].reverse().map((event) => {
            const heightPct = Math.round((event._count.athletes / maxAthletes) * 100);
            const isLatest = event.year === latestYear;
            return (
              <Link
                key={event.year}
                href={`/events/${slug}/${event.year}`}
                className="group flex flex-1 flex-col items-center gap-1"
                style={{ height: "100%" }}
              >
                <span className="text-muted-foreground text-xs tabular-nums">
                  {event._count.athletes.toLocaleString()}
                </span>
                <div className="flex w-full flex-1 flex-col justify-end">
                  <div
                    className={`w-full rounded-t transition-opacity group-hover:opacity-75 ${isLatest ? "bg-primary" : "bg-primary/60"}`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span
                  className={`text-xs tabular-nums ${isLatest ? "text-foreground font-medium" : "text-muted-foreground"}`}
                >
                  {event.year}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Year table */}
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b text-left">
              <th className="text-muted-foreground px-5 py-3 font-medium">Year</th>
              <th className="text-muted-foreground px-5 py-3 font-medium">Date</th>
              <th className="text-muted-foreground hidden px-5 py-3 text-right font-medium sm:table-cell">
                Finishers
              </th>
              <th className="text-muted-foreground px-5 py-3 text-right font-medium">Entries</th>
              <th className="text-muted-foreground hidden px-5 py-3 font-medium lg:table-cell">
                Legs
              </th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {race.events.map((event, i) => {
              const isLatest = event.year === latestYear;
              return (
                <tr
                  key={event.year}
                  className={`hover:bg-muted/30 border-b transition-colors last:border-0 ${i % 2 !== 0 ? "bg-muted/10" : ""}`}
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/events/${slug}/${event.year}`}
                      className="hover:text-primary inline-flex items-center gap-2 font-medium transition-colors"
                    >
                      {event.year}
                      {isLatest && (
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                          Latest
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="text-muted-foreground px-5 py-3">
                    {new Date(event.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </td>
                  <td className="text-muted-foreground hidden px-5 py-3 text-right tabular-nums sm:table-cell">
                    {event.finisherCount != null ? event.finisherCount.toLocaleString() : "—"}
                  </td>
                  <td className="text-muted-foreground px-5 py-3 text-right tabular-nums">
                    {event._count.athletes.toLocaleString()}
                  </td>
                  <td className="text-muted-foreground hidden px-5 py-3 lg:table-cell">
                    {event.segments.map((s) => s.name).join(" · ")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/events/${slug}/${event.year}`}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={`View ${event.year} results`}
                    >
                      →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
