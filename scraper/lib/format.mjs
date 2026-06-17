/**
 * Parses a time string in "H:MM:SS.sss" or "MM:SS.sss" format into total
 * seconds as a float. Returns null if the string is missing or malformed.
 */
export function parseTime(t) {
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

/**
 * Formats a duration in seconds to "H:MM:SS" (if >= 1 hour) or "M:SS".
 * Returns "--:--:--" for null/undefined input.
 */
export function fmtTimeLong(secs) {
  if (secs == null) return "--:--:--";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Formats an elapsed millisecond count into a human-readable string.
 * e.g. 75000 → "1m 15s", 45000 → "45s"
 */
export function fmtElapsed(ms) {
  const totalSecs = Math.round(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Strips a timing point label down to a clean, CSV-friendly leg name.
 *   "Run/Finish"       → "Run"       (takes the part before "/")
 *   "Bike 56mi | 89km" → "Bike 56mi" (takes the part before "|")
 *   "FINISH" / "START" → ""           (caller supplies a positional fallback)
 */
export function cleanLabel(label) {
  let clean = (label || "").split("/")[0].split("|")[0].trim();
  clean = clean.replace(/\s+finish$/i, "").trim();
  if (/^(finish|start)$/i.test(clean)) return "";
  return clean;
}
