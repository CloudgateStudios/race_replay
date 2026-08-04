import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { loadOgFonts } from "@/lib/og-fonts";
import { OgCard } from "@/lib/og-card";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ slug: string; year: string }>;
}

export default async function Image({ params }: Props) {
  const { slug, year: yearStr } = await params;
  const year = parseInt(yearStr, 10);

  const race = await prisma.race.findUnique({ where: { slug } });
  const event =
    race && !Number.isNaN(year)
      ? await prisma.event.findUnique({
          where: { raceId_year: { raceId: race.id, year } },
        })
      : null;

  const totalAthletes = event ? await prisma.athlete.count({ where: { eventId: event.id } }) : 0;
  const finisherCount = event
    ? await prisma.athlete.count({ where: { eventId: event.id, status: "FIN" } })
    : 0;
  const finishPct = totalAthletes > 0 ? ((finisherCount / totalAthletes) * 100).toFixed(1) : "0.0";

  const eventDate = event
    ? new Date(event.date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

  const fonts = await loadOgFonts();

  return new ImageResponse(
    <OgCard
      eyebrow={eventDate}
      title={race?.name ?? "Race Replay"}
      subtitle={yearStr}
      stats={[
        { label: "Athletes", value: totalAthletes.toLocaleString() },
        {
          label: "Finishers",
          value: `${finisherCount.toLocaleString()} · ${finishPct}%`,
          color: "#f97316",
        },
      ]}
    />,
    { width: 1200, height: 630, fonts }
  );
}
