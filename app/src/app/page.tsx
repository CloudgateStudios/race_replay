import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RaceTypeIcon } from "@/components/race-type-icon";

export const dynamic = "force-dynamic";

const getLatestEvents = unstable_cache(
  () =>
    prisma.event.findMany({
      take: 3,
      orderBy: { date: "desc" },
      include: {
        race: true,
        _count: { select: { athletes: true } },
      },
    }),
  ["latest-events"],
  { revalidate: 3600 }
);

export default async function HomePage() {
  const latestEvents = await getLatestEvents();

  return (
    <div>
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      {/*
        Full-bleed section: negative horizontal margins cancel the parent
        padding so the background reaches the viewport edges, while the
        inner padding keeps the text aligned with the rest of the page.
      */}
      <section className="relative -mx-[clamp(1.5rem,5vw,5rem)] mb-20 px-[clamp(1.5rem,5vw,5rem)] pt-12 pb-16">
        {/* Full-width gradient wash — uses fixed positioning to escape max-w container */}
        <div
          aria-hidden
          className="from-primary/10 pointer-events-none fixed inset-x-0 top-0 h-80 bg-gradient-to-b to-transparent"
        />

        <div className="relative max-w-3xl">
          <div className="bg-primary/10 text-primary mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium">
            <TrendingUp className="h-3.5 w-3.5" />
            Leg-by-leg physical passing data
          </div>

          <h1 className="mb-5 text-6xl font-black tracking-tight uppercase sm:text-7xl lg:text-8xl">
            See every pass,
            <br />
            <span className="text-primary">know your race.</span>
          </h1>

          <p className="text-muted-foreground mb-8 max-w-xl text-lg leading-relaxed">
            Race Replay calculates every physical pass that happened on course using per-athlete
            start times so the numbers reflect what actually happened on the road, not just chip
            time rank.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link href="/races" className={buttonVariants({ size: "lg", className: "gap-2" })}>
              Browse all races
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section className="mb-20">
        <h2 className="mb-8 text-2xl font-bold tracking-tight">How it works</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Per-athlete start times",
              body: "For time-trial starts, every athlete has a different start time. Race Replay uses per-athlete epoch timestamps from live tracking data to reconstruct the real on-course order at every checkpoint.",
            },
            {
              step: "02",
              title: "Physical position at each split",
              body: "By adding each athlete's chip split time to their personal start time, we get an absolute clock position at every timing mat — comparable across all athletes regardless of when they started.",
            },
            {
              step: "03",
              title: "Leg-by-leg passing counts",
              body: "Comparing positions before and after each leg reveals exactly who passed whom. The algorithm verifies correctness: every pass gained by one athlete must be a pass lost by another.",
            },
          ].map(({ step, title, body }) => (
            <div key={step} className="bg-card rounded-xl border p-6 shadow-sm">
              <div className="text-primary mb-3 font-mono text-sm font-bold">{step}</div>
              <h3 className="mb-2 font-semibold">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Latest races ────────────────────────────────────────────────────── */}
      {latestEvents.length > 0 && (
        <section>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Latest races</h2>
            <Link
              href="/races"
              className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm font-medium transition-colors"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latestEvents.map((event) => (
              <Link
                key={`${event.race.slug}-${event.year}`}
                href={`/events/${event.race.slug}/${event.year}`}
                className="group bg-card hover:border-primary/50 block rounded-xl border p-6 shadow-sm transition-all hover:shadow-md"
              >
                <div className="mb-3 flex items-start gap-3">
                  <RaceTypeIcon type={event.type} />
                  <div className="min-w-0">
                    <h3 className="group-hover:text-primary truncate leading-snug font-semibold transition-colors">
                      {event.race.name}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {new Date(event.date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {event._count.athletes.toLocaleString()} athletes
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
