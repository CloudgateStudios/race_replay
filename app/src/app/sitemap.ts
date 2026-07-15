import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://racereplay.app";

// robots.ts advertises this sitemap, so it must exist. Race and event pages
// are included; athlete pages are not — a single big-city event can exceed
// the 50k-URL sitemap limit on its own, and athlete pages are discoverable
// from the event results pages anyway.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const races = await prisma.race.findMany({
    select: {
      slug: true,
      events: { select: { year: true, date: true }, orderBy: { year: "desc" } },
    },
  });

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/races`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/request-race`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const racePages: MetadataRoute.Sitemap = races.map((race) => ({
    url: `${BASE_URL}/events/${race.slug}`,
    lastModified: race.events[0]?.date,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const eventPages: MetadataRoute.Sitemap = races.flatMap((race) =>
    race.events.map((event) => ({
      url: `${BASE_URL}/events/${race.slug}/${event.year}`,
      lastModified: event.date,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }))
  );

  return [...staticPages, ...racePages, ...eventPages];
}
