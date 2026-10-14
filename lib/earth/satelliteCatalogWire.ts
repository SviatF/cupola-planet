/**
 * CUPOLA satellite bulk wire v1. Positional records eliminate repeating
 * object keys, empty per-object tracks and identical motion timestamps.
 * No coordinate rounding: all SGP4 doubles survive JSON unchanged.
 * The public /api/satellites JSON contract remains the default.
 */
export const SATELLITE_WIRE_FORMAT = "compact-v1" as const;
const CATEGORIES = ["STATION", "WEATHER", "EARTH OBSERVATION", "STARLINK", "OTHER"] as const;
export type SatelliteWirePoint = {
  id: string;
  name: string;
  category: typeof CATEGORIES[number];
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  epoch: string | null;
  source: "CelesTrak" | "WhereTheISS";
  motionTarget: { latitude: number; longitude: number; altitude: number; timestamp: string } | null;
  track: { latitude: number; longitude: number; altitude: number; timestamp: string }[];
};

export function encodeSatelliteRows(satellites: readonly SatelliteWirePoint[]) {
  return satellites.map(s => [
    s.id, s.name, CATEGORIES.indexOf(s.category),
    s.latitude, s.longitude, s.altitude, s.velocity, s.epoch,
    s.motionTarget?.latitude ?? null,
    s.motionTarget?.longitude ?? null,
    s.motionTarget?.altitude ?? null,
    s.source === "WhereTheISS" ? 1 : 0,
  ]);
}

export function decodeSatelliteRows(rows: unknown, targetTimestamp: string): SatelliteWirePoint[] {
  if (!Array.isArray(rows)) return [];
  const timestampValid = Number.isFinite(Date.parse(targetTimestamp));
  return rows.flatMap((row): SatelliteWirePoint[] => {
    if (!Array.isArray(row) || row.length !== 12 ||
        typeof row[0] !== "string" || typeof row[1] !== "string" ||
        !Number.isInteger(row[2]) || row[2] < 0 || row[2] >= CATEGORIES.length ||
        ![row[3], row[4], row[5], row[6]].every(v => typeof v === "number" && Number.isFinite(v)) ||
        (row[7] !== null && typeof row[7] !== "string") ||
        (row[11] !== 0 && row[11] !== 1)) return [];
    const hasTarget = [row[8], row[9], row[10]].every(v => typeof v === "number" && Number.isFinite(v));
    const allNull = row[8] === null && row[9] === null && row[10] === null;
    if (!hasTarget && !allNull) return [];
    return [{
      id: row[0], name: row[1], category: CATEGORIES[row[2]],
      latitude: row[3], longitude: row[4], altitude: row[5], velocity: row[6],
      epoch: row[7], source: row[11] === 1 ? "WhereTheISS" : "CelesTrak",
      motionTarget: hasTarget && timestampValid ? {
        latitude: row[8], longitude: row[9], altitude: row[10], timestamp: targetTimestamp,
      } : null,
      track: [],
    }];
  });
}
