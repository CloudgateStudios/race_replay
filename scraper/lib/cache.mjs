import fs from "fs/promises";
import path from "path";

/** Returns the canonical path for a point's split cache file. */
export function splitFilePath(outputDir, eventId, ptName) {
  return path.join(outputDir, `${eventId}_splits_${ptName}.json`);
}

/**
 * Serializes a split Map to disk atomically: writes to a .tmp file first,
 * then renames to the final path so a crashed mid-write never leaves a corrupt
 * cache file.
 *
 * @param {Map<string, object>} map - bib → split record
 */
export async function saveSplits(outputDir, eventId, ptName, map) {
  const tmp = splitFilePath(outputDir, eventId, ptName) + ".tmp";
  const final = splitFilePath(outputDir, eventId, ptName);
  const arr = [...map.entries()].map(([bib, rec]) => ({ bib, ...rec }));
  await fs.writeFile(tmp, JSON.stringify(arr));
  await fs.rename(tmp, final);
}

/**
 * Loads a split cache file from disk and returns it as a bib → record Map.
 */
export async function loadSplits(outputDir, eventId, ptName) {
  const raw = await fs.readFile(
    splitFilePath(outputDir, eventId, ptName),
    "utf8"
  );
  const arr = JSON.parse(raw);
  const map = new Map();
  for (const rec of arr) {
    const { bib, ...rest } = rec;
    map.set(String(bib), rest);
  }
  return map;
}

/** Returns true if a complete (non-.tmp) split cache file exists for the point. */
export async function splitFileExists(outputDir, eventId, ptName) {
  try {
    await fs.access(splitFilePath(outputDir, eventId, ptName));
    return true;
  } catch {
    return false;
  }
}
