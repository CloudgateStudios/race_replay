"use client";

import { useState } from "react";

interface Props {
  athleteName?: string;
  raceName?: string;
  year?: number;
  netPasses?: number;
  finishTime?: string | null;
}

export function ShareButton({ athleteName, raceName, year, netPasses, finishTime }: Props) {
  const [copied, setCopied] = useState(false);

  const shareText = buildShareText({ athleteName, raceName, year, netPasses, finishTime });

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: athleteName, text: shareText, url });
        return;
      } catch {
        // User cancelled — fall through to clipboard
      }
    }
    const copyValue = shareText ? `${shareText}\n${url}` : url;
    await navigator.clipboard.writeText(copyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleShare}
      className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
    >
      {copied ? (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5 text-green-500"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-green-500">Copied!</span>
        </>
      ) : (
        "Share"
      )}
    </button>
  );
}

function buildShareText({ athleteName, raceName, year, netPasses, finishTime }: Props): string {
  if (!athleteName || !raceName || !year) return "";

  const passLine =
    netPasses != null && netPasses > 0
      ? `I passed ${netPasses} people on course`
      : netPasses != null && netPasses < 0
        ? `I got passed ${Math.abs(netPasses)} times on course`
        : "Check out my race data";

  const timePart = finishTime ? ` in ${finishTime}` : "";

  return `${passLine} at ${raceName} ${year}${timePart} 🏊🚴🏃 #RaceReplay`;
}
