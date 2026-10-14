import {
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
} from "satellite.js";

/**
 * CelesTrak GP OMM elements use mean motion (rev/day) and UTC EPOCH.
 * This object intentionally accepts numeric OR string values because
 * upstream CelesTrak, archived mirrors and third-party TLE convertors vary.
 */
export type Sgp4OmmRecord = {
  NORAD_CAT_ID?: string | number;
  EPOCH?: string;
  MEAN_MOTION?: number | string;
  ECCENTRICITY?: number | string;
  INCLINATION?: number | string;
  RA_OF_ASC_NODE?: number | string;
  ARG_OF_PERICENTER?: number | string;
  MEAN_ANOMALY?: number | string;
  BSTAR?: number | string;
  MEAN_MOTION_DOT?: number | string;
  MEAN_MOTION_DDOT?: number | string;
};

const HOUR_MS = 3_600_000;
const MAX_FUTURE_EPOCH_HOURS = 6;

/** TLE/OMM age is NOT the last HTTP fetch time or response generatedAt. */
export function orbitalElementQuality(
  record: Sgp4OmmRecord,
  now: Date,
): { epoch: Date; ageHours: number; maxAgeHours: number } | null {
  const raw = record.EPOCH?.trim();
  const n = Number(record.MEAN_MOTION);
  if (!raw || !Number.isFinite(n) || n <= 0 || n >= 19.0) return null;
  // CelesTrak commonly has microsecond fractions without the UTC suffix.
  const iso = /(?:Z|[+-]\d\d:\d\d)$/i.test(raw) ? raw : raw + "Z";
  const epoch = new Date(iso);
  if (!Number.isFinite(epoch.getTime()) || !Number.isFinite(now.getTime())) return null;
  const ageHours = (now.getTime() - epoch.getTime()) / HOUR_MS;
  // LEO has much shorter propagation validity, especially drag-sensitive
  // constellations. MEO/GEO can tolerate older GP records, but never forever.
  const maxAgeHours = n >= 6 ? 72 : n >= 2 ? 168 : 336;
  if (ageHours < -MAX_FUTURE_EPOCH_HOURS || ageHours > maxAgeHours) return null;
  return { epoch, ageHours, maxAgeHours };
}

export function prepareSgp4Omm(
  record: Sgp4OmmRecord,
  now: Date,
): { satrec: ReturnType<typeof json2satrec>; epoch: Date; ageHours: number } | null {
  const quality = orbitalElementQuality(record, now);
  if (!quality) return null;
  const required = [
    record.MEAN_MOTION, record.ECCENTRICITY, record.INCLINATION,
    record.RA_OF_ASC_NODE, record.ARG_OF_PERICENTER, record.MEAN_ANOMALY,
  ];
  if (required.some(v => v == null || !Number.isFinite(Number(v)))) return null;
  const e = Number(record.ECCENTRICITY);
  const inclination = Number(record.INCLINATION);
  if (e < 0 || e >= 1 || inclination < 0 || inclination > 180) return null;
  const catalogId = Number(record.NORAD_CAT_ID);
  if (!Number.isInteger(catalogId) || catalogId <= 0) return null;
  const bstar = record.BSTAR == null ? 0 : Number(record.BSTAR);
  const ndot = record.MEAN_MOTION_DOT == null ? 0 : Number(record.MEAN_MOTION_DOT);
  const nddot = record.MEAN_MOTION_DDOT == null ? 0 : Number(record.MEAN_MOTION_DDOT);
  if (![bstar, ndot, nddot].every(Number.isFinite)) return null;
  try {
    const omm = {
      CCSDS_OMM_VERS: "3.0",
      NORAD_CAT_ID: catalogId,
      EPOCH: quality.epoch.toISOString(),
      MEAN_MOTION: Number(record.MEAN_MOTION),
      ECCENTRICITY: e,
      INCLINATION: inclination,
      RA_OF_ASC_NODE: Number(record.RA_OF_ASC_NODE),
      ARG_OF_PERICENTER: Number(record.ARG_OF_PERICENTER),
      MEAN_ANOMALY: Number(record.MEAN_ANOMALY),
      BSTAR: bstar,
      MEAN_MOTION_DOT: ndot,
      MEAN_MOTION_DDOT: nddot,
    // satellite.js declares the full CCSDS OMM schema; CelesTrak GP JSON
    // legitimately omits optional headers. Every orbital field required by
    // SGP4 is explicitly validated and normalized above.
    } as unknown as Parameters<typeof json2satrec>[0];
    const satrec = json2satrec(omm);
    if (!satrec || satrec.error !== 0) return null;
    return { satrec, epoch: quality.epoch, ageHours: quality.ageHours };
  } catch {
    return null;
  }
}

export function sgp4GeodeticPosition(
  prepared: NonNullable<ReturnType<typeof prepareSgp4Omm>>,
  at: Date,
): { latitude: number; longitude: number; altitude: number; velocity: number; epoch: Date } | null {
  if (!Number.isFinite(at.getTime())) return null;
  try {
    const result = propagate(prepared.satrec, at);
    if (!result?.position || !result.velocity || prepared.satrec.error !== 0) return null;
    const pos = result.position;
    const vel = result.velocity;
    const geo = eciToGeodetic(pos, gstime(at));
    const latitude = geo.latitude * 180 / Math.PI;
    const longitude = geo.longitude * 180 / Math.PI;
    const altitude = geo.height;
    const velocity = Math.hypot(vel.x, vel.y, vel.z);
    // SGP4 can return nonsense for old decayed objects without an error.
    if (![latitude, longitude, altitude, velocity].every(Number.isFinite) ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180 ||
        altitude < 100 || altitude > 100_000 ||
        velocity <= 0 || velocity > 20) return null;
    return { latitude, longitude, altitude, velocity, epoch: prepared.epoch };
  } catch {
    return null;
  }
}
