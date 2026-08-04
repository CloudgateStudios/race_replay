import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { loadOgFonts } from "@/lib/og-fonts";
import { OgCard } from "@/lib/og-card";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ slug: string; year: string; bib: string }>;
}

export default async function Image({ params }: Props) {
  const { slug, year: yearStr, bib } = await params;
  const year = parseInt(yearStr, 10);

  const race = await prisma.race.findUnique({ where: { slug } });
  const event =
    race && !Number.isNaN(year)
      ? await prisma.event.findUnique({
          where: { raceId_year: { raceId: race.id, year } },
        })
      : null;
  const athlete = event
    ? await prisma.athlete.findUnique({
        where: { eventId_bib: { eventId: event.id, bib } },
        include: { segments: true },
      })
    : null;

  const status = athlete?.status ?? "FIN";
  const isDNF = status !== "FIN";
  const division = athlete?.division ?? "";
  const totalNet = athlete?.segments.reduce((sum, s) => sum + (s.net ?? 0), 0) ?? 0;
  const netLabel = totalNet > 0 ? `+${totalNet}` : String(totalNet);
  const netColor = totalNet > 0 ? "#22c55e" : totalNet < 0 ? "#ef4444" : "#ffffff";

  const stats = isDNF
    ? [{ label: "Status", value: status, color: "#ef4444" }]
    : [
        ...(athlete?.finishTime ? [{ label: "Finish Time", value: athlete.finishTime }] : []),
        { label: "Overall Net", value: netLabel, color: netColor },
      ];

  const fonts = await loadOgFonts();

  return new ImageResponse(
    <OgCard
      eyebrow={`${race?.name ?? ""} · ${yearStr} · Bib ${bib}`}
      title={athlete?.name ?? bib}
      label={division || undefined}
      stats={stats}
    />,
    { width: 1200, height: 630, fonts }
  );
}
