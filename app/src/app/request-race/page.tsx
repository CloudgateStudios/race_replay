"use client";

import type { Metadata } from "next";
import { useState } from "react";

export default function RequestRacePage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = {
      raceName: (form.elements.namedItem("raceName") as HTMLInputElement).value,
      raceYear: (form.elements.namedItem("raceYear") as HTMLInputElement).value,
raceUrl: (form.elements.namedItem("raceUrl") as HTMLInputElement).value,
      requesterEmail: (form.elements.namedItem("requesterEmail") as HTMLInputElement).value,
      notes: (form.elements.namedItem("notes") as HTMLTextAreaElement).value,
    };

    try {
      const res = await fetch("/api/request-race", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Something went wrong.");
      }
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="mb-4 text-5xl">🏁</div>
        <h1 className="mb-2 text-3xl font-black tracking-tight">Request submitted!</h1>
        <p className="text-muted-foreground">
          Thanks — we&apos;ll look into adding this race and reach out if we have questions.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-10">
        <h1 className="mb-2 text-4xl font-black tracking-tight">Request a Race</h1>
        <p className="text-muted-foreground text-lg">
          Don&apos;t see your race? Let us know and we&apos;ll do our best to add it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="raceName" className="text-sm font-semibold">
            Race name <span className="text-destructive">*</span>
          </label>
          <input
            id="raceName"
            name="raceName"
            type="text"
            required
            placeholder="e.g. IRONMAN World Championship"
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="raceYear" className="text-sm font-semibold">
            Year <span className="text-destructive">*</span>
          </label>
          <input
            id="raceYear"
            name="raceYear"
            type="number"
            required
            min="2000"
            max={new Date().getFullYear() + 1}
            placeholder={String(new Date().getFullYear())}
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>

<div className="flex flex-col gap-1.5">
          <label htmlFor="raceUrl" className="text-sm font-semibold">
            Race website or results link
          </label>
          <input
            id="raceUrl"
            name="raceUrl"
            type="url"
            placeholder="https://..."
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="requesterEmail" className="text-sm font-semibold">
            Your email <span className="text-muted-foreground font-normal">(optional — for follow-up)</span>
          </label>
          <input
            id="requesterEmail"
            name="requesterEmail"
            type="email"
            placeholder="you@example.com"
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-semibold">
            Anything else we should know?
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            placeholder="Year(s) you're interested in, specific distance, etc."
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>

        {status === "error" && (
          <p className="text-destructive text-sm">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={status === "loading"}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {status === "loading" ? "Sending…" : "Submit request"}
        </button>
      </form>
    </div>
  );
}
