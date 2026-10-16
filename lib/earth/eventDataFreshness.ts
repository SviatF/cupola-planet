/**
 * Event freshness is determined only from the ORIGINAL observation/advisory
 * timestamp. A successful API request / updatedAt is not an observation.
 * Source timestamps may be ISO, UTC string, RFC 2822, or ArcGIS epoch ms.
 */
export type EarthEventStatus = "near-live" | "recent-report" | "forecast" | "stale" | "unknown";

export function earthSourceTime(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let ms: number;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    ms = raw < 1e11 ? raw * 1000 : raw;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d{10,13}$/.test(s)) {
      const n = Number(s);
      ms = s.length === 10 ? n * 1000 : n;
    } else {
      const cleaned = s.replace(/\s+UTC$/i, "Z")
        .replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d(?::\d\d)?)$/, "$1T$2Z");
      ms = Date.parse(cleaned);
    }
  } else return null;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function sourceAgeMinutes(utc: string | null, now = Date.now()): number | null {
  if (!utc) return null;
  const ms = Date.parse(utc);
  if (!Number.isFinite(ms) || ms > now + 5 * 60_000 || ms < 0) return null;
  return Math.max(0, Math.round((now - ms) / 60_000));
}

export function isCurrentSource(
  utc: string | null, maxAgeMinutes: number, now = Date.now(),
): boolean {
  const age = sourceAgeMinutes(utc, now);
  return age !== null && age <= maxAgeMinutes;
}

/** An update may contain zero active events; zero is not a network error. */
export function summarizeEventSource(
  utc: string | null, maxAgeMinutes: number, now = Date.now(),
): {observationAgeMinutes: number | null; sourceFresh: boolean} {
  const observationAgeMinutes = sourceAgeMinutes(utc, now);
  return {observationAgeMinutes, sourceFresh:
    observationAgeMinutes !== null && observationAgeMinutes <= maxAgeMinutes};
}
