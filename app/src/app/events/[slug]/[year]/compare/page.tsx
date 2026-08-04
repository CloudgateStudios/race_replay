import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Gender } from "@/generated/prisma/client";
import { formatSeconds, netColor, netLabel } from "@/lib/formatting";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventFilters } from "../filters";
import { first } from "@/lib/search-params";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string; year: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug, year } = await params;
  const sp = await searchParams;
  const a = first(sp.a);
  const b = first(sp.b);
  const race = await prisma.race.findUnique({ where: { slug } });
  if (!race || !a || !b) return { title: "Compare Athletes", robots: { index: false } };
  const title = `Compare · ${race.name} ${year}`;
  return {
    title,
    description: `Side-by-side leg breakdown for bibs ${a} and ${b} at ${race.name} ${year}.`,
    robots: { index: false },
  };
}

export default async function ComparePage({ params, searchParams }: Props) {
  const { slug, year: yearStr } = await params;
  const sp = await searchParams;
  const bibA = first(sp.a);
  const bibB = first(sp.b);
  const q = first(sp.q) ?? "";
  const genderParam = first(sp.gender) ?? "";
  const division = first(sp.division) ?? "";
  const gender = (Object.values(Gender) as string[]).includes(genderParam)
    ? (genderParam as Gender)
    : null;
  const year = parseInt(yearStr, 10);
  if (isNaN(year)) notFound();

  const race = await prisma.race.findUnique({ where: { slug } });
  if (!race) notFound();

  const event = await prisma.event.findUnique({
    where: { raceId_year: { raceId: race.id, year } },
    include: { segments: { orderBy: { displayOrder: "asc" } } },
  });
  if (!event) notFound();

  // If we have both bibs, load them; otherwise show the picker
  const athleteA = bibA
    ? await prisma.athlete.findUnique({
        where: { eventId_bib: { eventId: event.id, bib: bibA } },
        include: {
          segments: { include: { segment: true }, orderBy: { segment: { displayOrder: "asc" } } },
        },
      })
    : null;

  const athleteB = bibB
    ? await prisma.athlete.findUnique({
        where: { eventId_bib: { eventId: event.id, bib: bibB } },
        include: {
          segments: { include: { segment: true }, orderBy: { segment: { displayOrder: "asc" } } },
        },
      })
    : null;

  const backHref = `/events/${slug}/${year}`;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="text-muted-foreground mb-1 text-sm">
        <Link href="/" className="hover:text-primary transition-colors">
          All races
        </Link>
        <span className="mx-1">›</span>
        <Link href={`/events/${slug}`} className="hover:text-primary transition-colors">
          {race.name}
        </Link>
        <span className="mx-1">›</span>
        <Link href={backHref} className="hover:text-primary transition-colors">
          {year}
        </Link>
        <span className="mx-1">›</span>
        <span className="text-foreground">Compare</span>
      </div>

      <div className="mt-3 mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Compare Athletes</h1>
        <p className="text-muted-foreground mt-1">
          {race.name} · {year}
        </p>
      </div>

      {/* Athlete picker — shown when one or both bibs are missing */}
      {(!athleteA || !athleteB) && (
        <AthletePicker
          slug={slug}
          year={year}
          eventId={event.id}
          bibA={bibA}
          bibB={bibB}
          athleteAName={athleteA?.name}
          athleteBName={athleteB?.name}
          q={q}
          gender={gender}
          division={division}
        />
      )}

      {/* Comparison table — shown when both athletes are loaded */}
      {athleteA && athleteB && (
        <ComparisonView slug={slug} year={year} athleteA={athleteA} athleteB={athleteB} />
      )}
    </div>
  );
}

// ── Athlete picker ──────────────────────────────────────────────────────────

async function AthletePicker({
  slug,
  year,
  eventId,
  bibA,
  bibB,
  athleteAName,
  athleteBName,
  q,
  gender,
  division,
}: {
  slug: string;
  year: number;
  eventId: number;
  bibA?: string;
  bibB?: string;
  athleteAName?: string;
  athleteBName?: string;
  q: string;
  gender: Gender | null;
  division: string;
}) {
  const [athletes, genders, divisions] = await Promise.all([
    prisma.athlete.findMany({
      where: {
        eventId,
        status: "FIN",
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { bib: { contains: q, mode: "insensitive" } },
          ],
        }),
        ...(gender !== null && { gender }),
        ...(division && { division }),
      },
      orderBy: { overallRank: "asc" },
      take: 100,
      select: { bib: true, name: true, division: true, overallRank: true, finishTime: true },
    }),
    prisma.athlete
      .findMany({
        where: { eventId },
        distinct: ["gender"],
        select: { gender: true },
        orderBy: { gender: "asc" },
      })
      .then((r) => r.map((a) => a.gender).filter(Boolean)),
    prisma.athlete
      .findMany({
        where: { eventId, division: { not: "" } },
        distinct: ["division"],
        select: { division: true },
        orderBy: { division: "asc" },
      })
      .then((r) => r.map((a) => a.division).filter(Boolean)),
  ]);

  return (
    <div className="space-y-6">
      {/* Status chips */}
      <div className="flex flex-wrap gap-3">
        <SlotChip label="Athlete A" bib={bibA} name={athleteAName} color="blue" />
        <SlotChip label="Athlete B" bib={bibB} name={athleteBName} color="orange" />
      </div>

      {/* Filters — reuses the same EventFilters component as the results page */}
      <EventFilters genders={genders} divisions={divisions} />

      {/* Instructions */}
      <p className="text-muted-foreground text-sm">
        {!bibA && !bibB
          ? "Select two athletes to compare. Click a row to set Athlete A, then click another for Athlete B."
          : !bibB
            ? "Now select Athlete B."
            : "Now select Athlete A."}{" "}
        <span className="tabular-nums">
          {athletes.length === 100
            ? "Showing first 100 results — use filters to narrow down."
            : `${athletes.length} athlete${athletes.length !== 1 ? "s" : ""} shown.`}
        </span>
      </p>

      {/* Athlete list */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Rank</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Bib</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Finish Time</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {athletes.map((a) => {
              const isA = a.bib === bibA;
              const isB = a.bib === bibB;
              // Build the href for clicking this row: an already-selected
              // athlete keeps both slots; otherwise fill the empty A slot
              // first, then B (replacing B when both are already set).
              let nextA = bibA;
              let nextB = bibB;
              if (!isA && !isB) {
                if (!bibA) nextA = a.bib;
                else nextB = a.bib;
              }
              const nextParams = new URLSearchParams();
              if (nextA) nextParams.set("a", nextA);
              if (nextB) nextParams.set("b", nextB);
              const href = `/events/${slug}/${year}/compare?${nextParams.toString()}`;

              return (
                <TableRow
                  key={a.bib}
                  className={
                    isA
                      ? "bg-blue-500/10"
                      : isB
                        ? "bg-orange-500/10"
                        : "hover:bg-muted/50 cursor-pointer"
                  }
                >
                  <TableCell className="text-muted-foreground tabular-nums">
                    #{a.overallRank?.toLocaleString() ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={href} className="hover:text-primary block transition-colors">
                      {a.name}
                      {isA && <span className="ml-2 text-xs font-bold text-blue-500">A</span>}
                      {isB && <span className="ml-2 text-xs font-bold text-orange-500">B</span>}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.bib}</TableCell>
                  <TableCell>
                    {a.division && <Badge variant="secondary">{a.division}</Badge>}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{a.finishTime ?? "—"}</TableCell>
                  <TableCell>
                    {!isA && !isB && (
                      <Link
                        href={href}
                        className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                      >
                        {!bibA ? "Set as A →" : !bibB ? "Set as B →" : "Swap B →"}
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SlotChip({
  label,
  bib,
  name,
  color,
}: {
  label: string;
  bib?: string;
  name?: string;
  color: "blue" | "orange";
}) {
  const colorClass =
    color === "blue"
      ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
      : "border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-400";
  return (
    <div className={`rounded-lg border px-4 py-2 text-sm font-medium ${colorClass}`}>
      <span className="font-bold">{label}:</span>{" "}
      {bib ? `${name ?? "Unknown"} (Bib ${bib})` : <span className="opacity-50">not selected</span>}
    </div>
  );
}

// ── Comparison view ─────────────────────────────────────────────────────────

function ComparisonView({
  slug,
  year,
  athleteA,
  athleteB,
}: {
  slug: string;
  year: number;
  athleteA: Awaited<ReturnType<typeof prisma.athlete.findUnique>> & {
    segments: {
      segment: { name: string; displayOrder: number };
      timeSeconds: number | null;
      gained: number | null;
      lost: number | null;
      net: number | null;
    }[];
  };
  athleteB: Awaited<ReturnType<typeof prisma.athlete.findUnique>> & {
    segments: {
      segment: { name: string; displayOrder: number };
      timeSeconds: number | null;
      gained: number | null;
      lost: number | null;
      net: number | null;
    }[];
  };
}) {
  if (!athleteA || !athleteB) return null;

  const netA = athleteA.segments.reduce((s, seg) => s + (seg.net ?? 0), 0);
  const netB = athleteB.segments.reduce((s, seg) => s + (seg.net ?? 0), 0);

  // Total race time from segment seconds (null if any segment is missing)
  const totalSecondsA = athleteA.segments.every((s) => s.timeSeconds != null)
    ? athleteA.segments.reduce((s, seg) => s + (seg.timeSeconds ?? 0), 0)
    : null;
  const totalSecondsB = athleteB.segments.every((s) => s.timeSeconds != null)
    ? athleteB.segments.reduce((s, seg) => s + (seg.timeSeconds ?? 0), 0)
    : null;
  const totalDelta =
    totalSecondsA != null && totalSecondsB != null ? totalSecondsA - totalSecondsB : null;

  // Build segment rows aligned by segment name
  const segNames = athleteA.segments.map((s) => s.segment.name);

  const segMapA = new Map(athleteA.segments.map((s) => [s.segment.name, s]));
  const segMapB = new Map(athleteB.segments.map((s) => [s.segment.name, s]));

  return (
    <div className="space-y-8">
      {/* Header cards */}
      <div className="grid grid-cols-2 gap-4">
        <AthleteCard athlete={athleteA} net={netA} color="blue" slug={slug} year={year} />
        <AthleteCard athlete={athleteB} net={netB} color="orange" slug={slug} year={year} />
      </div>

      {/* Leg-by-leg breakdown */}
      <div>
        <h2 className="mb-3 text-xl font-semibold">Leg-by-Leg Breakdown</h2>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Leg</TableHead>
                <TableHead className="text-right text-blue-500">
                  {athleteA.name.split(" ")[0]} Time
                </TableHead>
                <TableHead className="text-right text-orange-500">
                  {athleteB.name.split(" ")[0]} Time
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">Δ Time</TableHead>
                <TableHead className="hidden text-center text-blue-500 sm:table-cell">
                  A Net
                </TableHead>
                <TableHead className="hidden text-center text-orange-500 sm:table-cell">
                  B Net
                </TableHead>
                <TableHead className="text-center">Winner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segNames.map((name) => {
                const sA = segMapA.get(name);
                const sB = segMapB.get(name);
                const tA = sA?.timeSeconds ?? null;
                const tB = sB?.timeSeconds ?? null;
                const delta = tA != null && tB != null ? tA - tB : null;
                const winner = delta == null ? null : delta < 0 ? "A" : delta > 0 ? "B" : "tie";

                return (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell
                      className={`text-right font-mono tabular-nums ${winner === "A" ? "font-bold text-blue-500" : ""}`}
                    >
                      {formatSeconds(tA)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono tabular-nums ${winner === "B" ? "font-bold text-orange-500" : ""}`}
                    >
                      {formatSeconds(tB)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono text-sm tabular-nums sm:table-cell">
                      {delta == null ? (
                        "—"
                      ) : delta === 0 ? (
                        "even"
                      ) : delta < 0 ? (
                        <span className="text-blue-500">A +{formatSeconds(Math.abs(delta))}</span>
                      ) : (
                        <span className="text-orange-500">B +{formatSeconds(Math.abs(delta))}</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`hidden text-center font-medium tabular-nums sm:table-cell ${netColor(sA?.net ?? null)}`}
                    >
                      {netLabel(sA?.net ?? null)}
                    </TableCell>
                    <TableCell
                      className={`hidden text-center font-medium tabular-nums sm:table-cell ${netColor(sB?.net ?? null)}`}
                    >
                      {netLabel(sB?.net ?? null)}
                    </TableCell>
                    <TableCell className="text-center">
                      {winner === "A" && <span className="font-bold text-blue-500">A</span>}
                      {winner === "B" && <span className="font-bold text-orange-500">B</span>}
                      {winner === "tie" && (
                        <span className="text-muted-foreground text-sm">tie</span>
                      )}
                      {winner === null && "—"}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals row */}
              <TableRow className="bg-muted/30 border-t-2 font-bold">
                <TableCell>Overall</TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${netA >= netB ? "text-blue-500" : ""}`}
                >
                  {athleteA.finishTime ?? "—"}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${netB > netA ? "text-orange-500" : ""}`}
                >
                  {athleteB.finishTime ?? "—"}
                </TableCell>
                <TableCell className="hidden text-right font-mono text-sm tabular-nums sm:table-cell">
                  {totalDelta == null ? (
                    "—"
                  ) : totalDelta === 0 ? (
                    "even"
                  ) : totalDelta < 0 ? (
                    <span className="text-blue-500">A +{formatSeconds(Math.abs(totalDelta))}</span>
                  ) : (
                    <span className="text-orange-500">
                      B +{formatSeconds(Math.abs(totalDelta))}
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={`hidden text-center tabular-nums sm:table-cell ${netColor(netA)}`}
                >
                  {netLabel(netA)}
                </TableCell>
                <TableCell
                  className={`hidden text-center tabular-nums sm:table-cell ${netColor(netB)}`}
                >
                  {netLabel(netB)}
                </TableCell>
                <TableCell className="text-center">
                  {netA > netB ? (
                    <span className="text-blue-500">A</span>
                  ) : netB > netA ? (
                    <span className="text-orange-500">B</span>
                  ) : (
                    <span className="text-muted-foreground text-sm">tie</span>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/events/${slug}/${year}/compare?a=${athleteB.bib}&b=${athleteA.bib}`}
          className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          ⇄ Swap A and B
        </Link>
        <Link
          href={`/events/${slug}/${year}/compare?a=${athleteA.bib}`}
          className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Change Athlete B
        </Link>
        <Link
          href={`/events/${slug}/${year}/compare`}
          className="text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Start over
        </Link>
      </div>
    </div>
  );
}

function AthleteCard({
  athlete,
  net,
  color,
  slug,
  year,
}: {
  athlete: NonNullable<Awaited<ReturnType<typeof prisma.athlete.findUnique>>>;
  net: number;
  color: "blue" | "orange";
  slug: string;
  year: number;
}) {
  const border = color === "blue" ? "border-blue-500/40" : "border-orange-500/40";
  const label = color === "blue" ? "A" : "B";
  const labelColor = color === "blue" ? "text-blue-500" : "text-orange-500";
  const labelBg = color === "blue" ? "bg-blue-500/10" : "bg-orange-500/10";

  return (
    <div className={`bg-card rounded-xl border-2 p-5 shadow-sm ${border}`}>
      <div className="mb-3 flex items-start justify-between">
        <span className={`rounded-md px-2 py-0.5 text-xs font-black ${labelBg} ${labelColor}`}>
          {label}
        </span>
        <Link
          href={`/events/${slug}/${year}/${athlete.bib}`}
          className="text-muted-foreground hover:text-foreground text-xs transition-colors"
        >
          View detail →
        </Link>
      </div>
      <h3 className="text-xl leading-tight font-bold">{athlete.name}</h3>
      <div className="mt-1 flex flex-wrap gap-1">
        {athlete.division && <Badge variant="secondary">{athlete.division}</Badge>}
        {athlete.country && <Badge variant="outline">{athlete.country}</Badge>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat
          label="Rank"
          value={athlete.overallRank ? `#${athlete.overallRank.toLocaleString()}` : "—"}
        />
        <Stat label="Net" value={netLabel(net)} color={netColor(net)} />
        <div className="col-span-2">
          <Stat label="Finish" value={athlete.finishTime ?? "—"} mono />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold tabular-nums ${mono ? "font-mono" : ""} ${color ?? ""}`}
      >
        {value}
      </p>
    </div>
  );
}
