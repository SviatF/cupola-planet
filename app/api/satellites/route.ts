import { NextResponse } from "next/server";
import { encodeSatelliteRows, SATELLITE_WIRE_FORMAT } from "@/lib/earth/satelliteCatalogWire";
import { orbitalElementQuality, prepareSgp4Omm, sgp4GeodeticPosition, type Sgp4OmmRecord } from "@/lib/earth/satelliteSgp4";

export const revalidate = 30;

type OmmRecord = Sgp4OmmRecord & {
  OBJECT_NAME?: string;
  OBJECT_ID?: string;
};

type SatelliteTrackPoint = {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: string;
};

type SatellitePoint = {
  id: string;
  name: string;
  category: "STATION" | "WEATHER" | "EARTH OBSERVATION" | "STARLINK" | "OTHER";
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  epoch: string | null;
  source: "CelesTrak" | "WhereTheISS";
  motionTarget: {
    latitude: number;
    longitude: number;
    altitude: number;
    timestamp: string;
  } | null;
  track: SatelliteTrackPoint[];
};

const GP_BASE = "https://celestrak.org/NORAD/elements/gp.php";

type CatalogRecord = {
  record: OmmRecord;
  category: SatellitePoint["category"];
};

let lastGoodCatalogRecords: CatalogRecord[] = [];
let lastGoodCatalogAt = 0;
const LAST_GOOD_MAX_AGE_MS = 30 * 60 * 1000;
const EDGE_CATALOG_FRESH_MS = 6 * 60 * 60 * 1000;
const EDGE_CATALOG_STALE_MS = 36 * 60 * 60 * 1000;
const EDGE_CACHE_NAME = "cupola-orbital-catalog";
const EDGE_CACHE_PATH = "/__cupola_cache/satellite-orbital-catalog-v1";

type EdgeCatalogPayload = {
  savedAt: number;
  records: CatalogRecord[];
};

async function readEdgeCatalog(request: Request): Promise<EdgeCatalogPayload | null> {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(EDGE_CACHE_NAME);
    const cacheUrl = new URL(EDGE_CACHE_PATH, request.url).toString();
    const response = await cache.match(new Request(cacheUrl));
    if (!response) return null;

    const payload = await response.json() as EdgeCatalogPayload;
    if (
      !payload ||
      !Number.isFinite(Number(payload.savedAt)) ||
      !Array.isArray(payload.records) ||
      payload.records.length < 100
    ) return null;

    return payload;
  } catch {
    return null;
  }
}

async function writeEdgeCatalog(request: Request, records: CatalogRecord[]) {
  try {
    if (typeof caches === "undefined" || records.length < 100) return;
    const cache = await caches.open(EDGE_CACHE_NAME);
    const payload: EdgeCatalogPayload = {
      savedAt: Date.now(),
      records: records.slice(0, 20000),
    };

    const cacheUrl = new URL(EDGE_CACHE_PATH, request.url).toString();

    await cache.put(
      new Request(cacheUrl),
      new Response(JSON.stringify(payload), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=129600",
        },
      }),
    );
  } catch {}
}

function propagate(
  record: OmmRecord,
  at: Date,
  category: SatellitePoint["category"],
  includeTrack = false,
): SatellitePoint | null {
  // One SGP4 initialization per catalog object, then reuse it for
  // current state, 3-minute motion target and any selected ground track.
  const prepared = prepareSgp4Omm(record, at);
  if (!prepared) return null;
  const position = sgp4GeodeticPosition(prepared, at);
  if (!position) return null;
  const { latitude, longitude, altitude, velocity, epoch } = position;

  const id = String(record.NORAD_CAT_ID ?? record.OBJECT_ID ?? record.OBJECT_NAME ?? "");
  const name = String(record.OBJECT_NAME ?? "SATELLITE");

  const motionTargetDate = new Date(at.getTime() + 180 * 1000);
  const motionSample = sgp4GeodeticPosition(prepared, motionTargetDate);
  const motionTarget = motionSample ? {
    latitude: motionSample.latitude,
    longitude: motionSample.longitude,
    altitude: motionSample.altitude,
    timestamp: motionTargetDate.toISOString(),
  } : null;

  const meanMotion = Number(record.MEAN_MOTION);
  const orbitalPeriodMinutes =
    Number.isFinite(meanMotion) && meanMotion > 0
      ? Math.min(1440, Math.max(70, 1440 / meanMotion))
      : 100;

  const track = includeTrack
    ? Array.from({ length: 97 }, (_, index) => {
        const phase = index / 96 - 0.5;
        const offsetMinutes = phase * orbitalPeriodMinutes;
        const sampleDate = new Date(at.getTime() + offsetMinutes * 60000);
        const sample = sgp4GeodeticPosition(prepared, sampleDate);
        return sample ? {
          latitude: sample.latitude,
          longitude: sample.longitude,
          altitude: sample.altitude,
          timestamp: sampleDate.toISOString(),
        } : null;
      }).filter((point): point is SatelliteTrackPoint => point !== null)
    : [];

  return {
    id,
    name,
    category,
    latitude,
    longitude,
    altitude,
    velocity,
    epoch: epoch.toISOString(),
    source: "CelesTrak",
    motionTarget,
    track,
  };
}

async function fetchGpGroup(group: string) {
  const url = GP_BASE + "?GROUP=" + encodeURIComponent(group) + "&FORMAT=JSON";
  const response = await fetch(url, {
    next: { revalidate: 300 },
    headers: { Accept: "application/json", "User-Agent": "CUPOLA-Earth-Viewer/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return [] as OmmRecord[];
  const payload = await response.json();
  return Array.isArray(payload) ? payload as OmmRecord[] : [];
}

const SATVISOR_ACTIVE_JSON =
  "https://raw.githubusercontent.com/satvisorcom/satvisor-data/master/celestrak/json/active.json";

async function fetchMirrorActiveCatalog(limit = 1000): Promise<CatalogRecord[]> {
  try {
    const response = await fetch(SATVISOR_ACTIVE_JSON, {
      next: { revalidate: 2 * 60 * 60 },
      headers: {
        Accept: "application/json",
        "User-Agent": "CUPOLA-Earth-Viewer/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const payload = await response.json();
    if (!Array.isArray(payload)) return [];

    const records = payload as OmmRecord[];

    return records
      .filter((record) => record && typeof record === "object")
      .map((record) => ({
        record,
        category: classifyTleName(String(record.OBJECT_NAME ?? "")),
      }))
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function fetchActiveGpCatalog(limit = 1000): Promise<CatalogRecord[]> {
  try {
    const records = await fetchGpGroup("ACTIVE");
    if (!records.length) return [];

    return records
      .slice(0, Math.max(limit * 2, limit))
      .map((record) => ({
        record,
        category: classifyTleName(String(record.OBJECT_NAME ?? "")),
      }))
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function fetchGpCat(catnr: string | number) {
  const url = GP_BASE + "?CATNR=" + encodeURIComponent(String(catnr)) + "&FORMAT=JSON";
  const response = await fetch(url, {
    next: { revalidate: 300 },
    headers: { Accept: "application/json", "User-Agent": "CUPOLA-Earth-Viewer/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return Array.isArray(payload) && payload.length ? payload[0] as OmmRecord : null;
}

const FALLBACK_CATALOG: Array<{
  catnr: number;
  name: string;
  category: SatellitePoint["category"];
}> = [
  { catnr: 25544, name: "ISS (ZARYA)", category: "STATION" },
  { catnr: 43013, name: "NOAA 20", category: "WEATHER" },
  { catnr: 54234, name: "NOAA 21", category: "WEATHER" },
  { catnr: 51850, name: "GOES 18", category: "WEATHER" },
  { catnr: 40697, name: "SENTINEL-2A", category: "EARTH OBSERVATION" },
  { catnr: 42063, name: "SENTINEL-2B", category: "EARTH OBSERVATION" },
  { catnr: 41335, name: "SENTINEL-3A", category: "EARTH OBSERVATION" },
  { catnr: 43437, name: "SENTINEL-3B", category: "EARTH OBSERVATION" },
  { catnr: 39084, name: "LANDSAT 8", category: "EARTH OBSERVATION" },
  { catnr: 49260, name: "LANDSAT 9", category: "EARTH OBSERVATION" },
  { catnr: 25994, name: "TERRA", category: "EARTH OBSERVATION" },
  { catnr: 27424, name: "AQUA", category: "EARTH OBSERVATION" },
];

async function fetchCuratedFallback(): Promise<Array<{
  record: OmmRecord;
  category: SatellitePoint["category"];
}>> {
  const results = await Promise.allSettled(
    FALLBACK_CATALOG.map(async ({ catnr, category }) => ({
      record: await fetchGpCat(catnr),
      category,
    })),
  );

  const resolved: Array<{
    record: OmmRecord;
    category: SatellitePoint["category"];
  }> = [];

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { record, category } = result.value;
    if (!record) continue;
    resolved.push({ record, category });
  }

  return resolved;
}


type TleApiRecord = {
  satelliteId?: number | string;
  name?: string;
  date?: string;
  line1?: string;
  line2?: string;
};

function tleEpochToIso(line1: string) {
  const raw = line1.slice(18, 32).trim();
  if (raw.length < 5) return null;

  const yy = Number(raw.slice(0, 2));
  const dayOfYear = Number(raw.slice(2));
  if (!Number.isFinite(yy) || !Number.isFinite(dayOfYear)) return null;

  const year = yy >= 57 ? 1900 + yy : 2000 + yy;
  const start = Date.UTC(year, 0, 1);
  const date = new Date(start + (dayOfYear - 1) * 86400000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function tleRecordToOmm(record: TleApiRecord): OmmRecord | null {
  const line1 = typeof record.line1 === "string" ? record.line1 : "";
  const line2 = typeof record.line2 === "string" ? record.line2 : "";
  if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) return null;

  const parts = line2.trim().split(/\s+/);
  if (parts.length < 8) return null;

  const inclination = Number(parts[2]);
  const raan = Number(parts[3]);
  const eccentricity = Number("0." + parts[4].replace(/[^0-9]/g, ""));
  const argPerigee = Number(parts[5]);
  const meanAnomaly = Number(parts[6]);
  const meanMotion = Number(parts[7]);
  const epoch = tleEpochToIso(line1);

  if (
    !epoch ||
    ![inclination, raan, eccentricity, argPerigee, meanAnomaly, meanMotion].every(Number.isFinite)
  ) return null;

  // The drag term from the official TLE is essential to reliable SGP4;
  // ignoring it (as in the old two-body fallback) shifts low-orbit tracks.
  const bstarRaw = line1.slice(53, 61).trim();
  const bstarParts = /^([+-]?)(\d{5})([+-])(\d)$/.exec(bstarRaw);
  const bstar = bstarParts
    ? (bstarParts[1] === "-" ? -1 : 1) *
      Number("0." + bstarParts[2]) *
      Math.pow(10, Number((bstarParts[3] === "-" ? "-" : "") + bstarParts[4]))
    : 0;
  return {
    OBJECT_NAME: typeof record.name === "string" ? record.name : "SATELLITE",
    NORAD_CAT_ID: record.satelliteId ?? line1.slice(2, 7).trim(),
    EPOCH: epoch,
    BSTAR: bstar,
    MEAN_MOTION_DOT: Number(line1.slice(33, 43)) || 0,
    MEAN_MOTION_DDOT: 0,
    MEAN_MOTION: meanMotion,
    ECCENTRICITY: eccentricity,
    INCLINATION: inclination,
    RA_OF_ASC_NODE: raan,
    ARG_OF_PERICENTER: argPerigee,
    MEAN_ANOMALY: meanAnomaly,
  };
}

function extractTleApiMembers(payload: unknown): TleApiRecord[] {
  if (Array.isArray(payload)) return payload as TleApiRecord[];
  if (!payload || typeof payload !== "object") return [];

  const object = payload as Record<string, unknown>;
  const candidates = [
    object.member,
    object["hydra:member"],
    object.items,
    object.results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as TleApiRecord[];
  }

  return [];
}

async function fetchTleApiSearch(
  search: string,
  targetCount: number,
  category: SatellitePoint["category"],
) {
  const pageSize = 100;
  const maxPages = Math.max(1, Math.ceil(targetCount / pageSize));
  const pageNumbers = Array.from({ length: maxPages }, (_, index) => index + 1);
  const collected: Array<{
    record: OmmRecord;
    category: SatellitePoint["category"];
  }> = [];

  // Fetch small batches in parallel so a 1000-object catalog does not require
  // dozens of sequential upstream round trips inside the Worker.
  for (let offset = 0; offset < pageNumbers.length; offset += 5) {
    const batch = pageNumbers.slice(offset, offset + 5);

    const results = await Promise.allSettled(
      batch.map(async (page) => {
        const url =
          "https://tle.ivanstanojevic.me/api/tle?search=" +
          encodeURIComponent(search) +
          "&page=" +
          page +
          "&page-size=" +
          pageSize;

        const response = await fetch(url, {
          next: { revalidate: 300 },
          headers: {
            Accept: "application/ld+json, application/json",
            "User-Agent": "CUPOLA-Earth-Viewer/1.0",
          },
          signal: AbortSignal.timeout(12000),
        });

        if (!response.ok) return [] as TleApiRecord[];
        const payload = await response.json();
        return extractTleApiMembers(payload);
      }),
    );

    let batchHadData = false;

    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value.length) continue;
      batchHadData = true;

      const parsed = result.value
        .map(tleRecordToOmm)
        .filter((record): record is OmmRecord => Boolean(record))
        .map((record) => ({ record, category }));

      collected.push(...parsed);
    }

    if (!batchHadData || collected.length >= targetCount) break;
  }

  return collected.slice(0, targetCount);
}

function catalogRecordId(record: OmmRecord) {
  return String(record.NORAD_CAT_ID ?? record.OBJECT_ID ?? record.OBJECT_NAME ?? "");
}

// Each response reports actual SGP4 computation cost and validation losses.
// Deduplicate BEFORE propagating to avoid expensive redundant SGP4 calls.
function buildSatelliteSnapshot(items: CatalogRecord[], at: Date) {
  const started = performance.now();
  const seen = new Set<string>();
  const satellites: SatellitePoint[] = [];
  let examinedRecords = 0;
  let invalidRecords = 0;
  let duplicateRecords = 0;
  for (const { record, category } of items) {
    if (satellites.length >= 20000) break;
    examinedRecords++;
    const id = catalogRecordId(record);
    if (!id) { invalidRecords++; continue; }
    if (seen.has(id)) { duplicateRecords++; continue; }
    const point = propagate(record, at, category, false);
    if (!point) { invalidRecords++; continue; }
    seen.add(id);
    satellites.push(point);
  }
  // Edge runtimes can freeze performance.now() during synchronous CPU work.
  // Zero milliseconds is not a defensible 16k-orbit timing measurement.
  const elapsed = performance.now() - started;
  const clockAvailable = Number.isFinite(elapsed) && elapsed >= 1;
  return {
    satellites,
    stats: {
      catalogRecords: items.length,
      examinedRecords,
      invalidRecords,
      duplicateRecords,
      sgp4ComputeMs: clockAvailable ? Math.round(elapsed) : null,
      sgp4TimingStatus: clockAvailable ? "measured" : "worker-clock-unavailable",
    },
  };
}

function classifyTleName(name: string): SatellitePoint["category"] {
  const upper = name.toUpperCase();
  if (/ISS|TIANHE|CSS|SPACE STATION/.test(upper)) return "STATION";
  if (/NOAA|GOES|METEOR|METOP|HIMAWARI|METEOSAT|FENGYUN|JPSS/.test(upper)) return "WEATHER";
  if (/SENTINEL|LANDSAT|TERRA|AQUA|SUOMI|ICESAT|EARTHCARE|RADARSAT/.test(upper)) return "EARTH OBSERVATION";
  if (/STARLINK/.test(upper)) return "STARLINK";
  return "OTHER";
}

async function fetchTleApiCatalog(targetCount: number) {
  const pageSize = 100;
  const maxPages = Math.ceil(targetCount / pageSize);
  const pageNumbers = Array.from({ length: maxPages }, (_, index) => index + 1);
  const collected: Array<{
    record: OmmRecord;
    category: SatellitePoint["category"];
  }> = [];

  for (let offset = 0; offset < pageNumbers.length; offset += 6) {
    const batch = pageNumbers.slice(offset, offset + 6);
    const results = await Promise.allSettled(
      batch.map(async (page) => {
        const response = await fetch(
          "https://tle.ivanstanojevic.me/api/tle?page=" + page + "&page-size=" + pageSize,
          {
            next: { revalidate: 300 },
            headers: {
              Accept: "application/ld+json, application/json",
              "User-Agent": "CUPOLA-Earth-Viewer/1.0",
            },
            signal: AbortSignal.timeout(12000),
          },
        );

        if (!response.ok) return [] as TleApiRecord[];
        const payload = await response.json();
        return extractTleApiMembers(payload);
      }),
    );

    let hadData = false;
    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value.length) continue;
      hadData = true;

      for (const member of result.value) {
        const record = tleRecordToOmm(member);
        if (!record) continue;
        collected.push({
          record,
          category: classifyTleName(String(record.OBJECT_NAME ?? "")),
        });
        if (collected.length >= targetCount) break;
      }

      if (collected.length >= targetCount) break;
    }

    if (!hadData || collected.length >= targetCount) break;
  }

  return collected.slice(0, targetCount);
}

async function fetchTleApiFallback() {
  const results = await Promise.allSettled([
    fetchTleApiSearch("STARLINK", 760, "STARLINK"),
    fetchTleApiSearch("NOAA", 70, "WEATHER"),
    fetchTleApiSearch("GOES", 40, "WEATHER"),
    fetchTleApiSearch("METEOR", 30, "WEATHER"),
    fetchTleApiSearch("SENTINEL", 80, "EARTH OBSERVATION"),
    fetchTleApiSearch("LANDSAT", 30, "EARTH OBSERVATION"),
    fetchTleApiSearch("TERRA", 8, "EARTH OBSERVATION"),
    fetchTleApiSearch("AQUA", 8, "EARTH OBSERVATION"),
    fetchTleApiSearch("ISS", 8, "STATION"),
  ]);

  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
}

async function fetchWhereTheIssFallback(): Promise<SatellitePoint[]> {
  const now = new Date();

  const results = await Promise.allSettled(
    FALLBACK_CATALOG.map(async ({ catnr, name, category }) => {
      const response = await fetch("https://api.wheretheiss.at/v1/satellites/" + catnr, {
        next: { revalidate: 30 },
        headers: {
          Accept: "application/json",
          "User-Agent": "CUPOLA-Earth-Viewer/1.0",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;
      const data = await response.json();

      const latitude = Number(data?.latitude);
      const longitude = Number(data?.longitude);
      const altitude = Number(data?.altitude);
      const velocityRaw = Number(data?.velocity);
      const velocity = Number.isFinite(velocityRaw) ? velocityRaw / 3600 : NaN;

      if (![latitude, longitude, altitude, velocity].every(Number.isFinite)) return null;

      return {
        id: String(catnr),
        name: typeof data?.name === "string" && data.name.trim() ? data.name : name,
        category,
        latitude,
        longitude,
        altitude,
        velocity,
        epoch: null,
        source: "WhereTheISS",
        motionTarget: null,
        track: [],
      } satisfies SatellitePoint;
    }),
  );

  return results.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value) return [];
    return [result.value];
  });
}


function pickWeather(records: OmmRecord[]) {
  const priority = [
    /GOES[- ]?1[89]/i,
    /NOAA[- ]?2[01]/i,
    /METEOSAT/i,
    /HIMAWARI/i,
    /METOP/i,
    /FENGYUN/i,
  ];

  const picked: OmmRecord[] = [];
  for (const pattern of priority) {
    for (const record of records) {
      const name = String(record.OBJECT_NAME ?? "");
      if (pattern.test(name) && !picked.includes(record)) picked.push(record);
      if (picked.length >= 36) return picked;
    }
  }
  return picked.length ? picked.slice(0, 36) : records.slice(0, 36);
}

function pickEarthObservation(records: OmmRecord[]) {
  const priority = [
    /SENTINEL/i,
    /LANDSAT/i,
    /TERRA/i,
    /AQUA/i,
    /SUOMI/i,
    /ICESAT/i,
  ];

  const picked: OmmRecord[] = [];
  for (const pattern of priority) {
    for (const record of records) {
      const name = String(record.OBJECT_NAME ?? "");
      if (pattern.test(name) && !picked.includes(record)) picked.push(record);
      if (picked.length >= 56) return picked;
    }
  }
  return picked.length ? picked.slice(0, 56) : records.slice(0, 56);
}

const VERIFIED_OMM_RELEASE = "https://github.com/SviatF/cupola-planet/releases/download/cupola-omm-v1/";
const RELEASE_MANIFEST_SCHEMA = "cupola-omm-manifest/v1";
const RELEASE_CATALOG_SCHEMA = "cupola-omm-catalog/v1";

// Cold Cloudflare edges use this immutable, checksum-verified public snapshot
// when direct CelesTrak requests are temporarily inaccessible. Epoch freshness
// is checked AGAIN at use time; publishing a fresh JSON is not a live orbit.
type VerifiedReleaseSnapshot = {
  records: CatalogRecord[];
  sourceAgeMinutes: number | null;
  publisherExpired: boolean;
};
const EMPTY_VERIFIED_RELEASE: VerifiedReleaseSnapshot = {
  records: [], sourceAgeMinutes: null, publisherExpired: false,
};

// The 4h publisher refresh target is not an orbital epoch limit. Allow
// bounded 24h grace for SHA-256 verified snapshots during CelesTrak 403,
// while independently validating each orbital epoch (including LEO <=72h).
async function fetchVerifiedReleaseCatalog(now: Date): Promise<VerifiedReleaseSnapshot> {
  try {
    const manifestResponse = await fetch(VERIFIED_OMM_RELEASE + "latest.json", {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!manifestResponse.ok) return EMPTY_VERIFIED_RELEASE;
    const manifest = await manifestResponse.json() as {
      schema?: string; catalogFile?: string; sha256?: string;
      expiresAt?: string; generatedAt?: string; count?: number;
    };
    const publisherExpiry = Date.parse(manifest.expiresAt ?? "");
    const generatedAt = Date.parse(manifest.generatedAt ?? "");
    const maxValidatedAgeMs = 24 * 60 * 60 * 1000;
    if (manifest.schema !== RELEASE_MANIFEST_SCHEMA ||
        !/^catalog-[0-9]{14}\.json$/.test(manifest.catalogFile ?? "") ||
        !/^[a-f0-9]{64}$/.test(manifest.sha256 ?? "") ||
        !Number.isFinite(publisherExpiry) ||
        !Number.isFinite(generatedAt) ||
        generatedAt > now.getTime() + 5 * 60 * 1000 ||
        publisherExpiry <= generatedAt ||
        now.getTime() >= generatedAt + maxValidatedAgeMs ||
        Number(manifest.count) < 10000 || Number(manifest.count) > 20000)
      return EMPTY_VERIFIED_RELEASE;

    const catalogResponse = await fetch(VERIFIED_OMM_RELEASE + manifest.catalogFile, {
      signal: AbortSignal.timeout(18000),
      headers: { Accept: "application/json" },
    });
    if (!catalogResponse.ok) return EMPTY_VERIFIED_RELEASE;
    const body = await catalogResponse.arrayBuffer();
    if (body.byteLength > 10_000_000 || body.byteLength < 100_000) return EMPTY_VERIFIED_RELEASE;
    const digest = await crypto.subtle.digest("SHA-256", body);
    const hex = Array.from(new Uint8Array(digest),
      byte => byte.toString(16).padStart(2, "0")).join("");
    if (hex !== manifest.sha256) return EMPTY_VERIFIED_RELEASE;
    const payload = JSON.parse(new TextDecoder().decode(body)) as {
      schema?: string; count?: number; records?: OmmRecord[];
    };
    if (payload.schema !== RELEASE_CATALOG_SCHEMA ||
        payload.count !== manifest.count ||
        !Array.isArray(payload.records) ||
        payload.records.length !== manifest.count) return EMPTY_VERIFIED_RELEASE;
    const unique = new Set<string>();
    const accepted: CatalogRecord[] = [];
    for (const record of payload.records) {
      if (orbitalElementQuality(record, now) === null) continue;
      const id = catalogRecordId(record);
      if (!id || unique.has(id)) continue;
      unique.add(id);
      accepted.push({ record,
        category: classifyTleName(String(record.OBJECT_NAME ?? "")) });
    }
    if (accepted.length < 10000) return EMPTY_VERIFIED_RELEASE;
    return {
      records: accepted.slice(0, 20000),
      sourceAgeMinutes: Math.round((now.getTime() - generatedAt) / 60000),
      publisherExpired: now.getTime() >= publisherExpiry,
    };
  } catch {
    return EMPTY_VERIFIED_RELEASE;
  }
}

// Compact wire is opt-in, only for full bulk snapshots. Selected-track and
// failure shapes remain untouched for older clients and external consumers.
function satelliteJson(request: Request, payload: {
  satellites?: SatellitePoint[]; generatedAt?: string; [key: string]: unknown;
}, init?: ResponseInit) {
  const compact = new URL(request.url).searchParams.get("format") === "compact";
  if (!compact || !Array.isArray(payload.satellites) || payload.satellites.length < 100 ||
      typeof payload.generatedAt !== "string") {
    return NextResponse.json(payload, init);
  }
  return NextResponse.json({
    ...payload,
    wireFormat: SATELLITE_WIRE_FORMAT,
    motionTargetTimestamp: new Date(Date.parse(payload.generatedAt) + 180_000).toISOString(),
    satellites: encodeSatelliteRows(payload.satellites),
  }, init);
}

export async function GET(request: Request) {
  const now = new Date();

  try {
    const edgeCatalog = await readEdgeCatalog(request);
    const edgeAge = edgeCatalog ? Date.now() - edgeCatalog.savedAt : Number.POSITIVE_INFINITY;
    const trackId = new URL(request.url).searchParams.get("track");

    if (trackId) {
      const edgeMatch = edgeCatalog?.records.find(({ record }) => catalogRecordId(record) === trackId);
      let satellite = edgeMatch ? propagate(edgeMatch.record, now, edgeMatch.category, true) : null;

      // Track must resolve even when the bulk catalog came directly from
      // CelesTrak rather than the third-party mirror or this edge's cache.
      // A stale edge record must never pin Follow to an expired orbit.
      if (!satellite && /^\d{1,8}$/.test(trackId)) {
        const official = await fetchGpCat(trackId);
        if (official) {
          satellite = propagate(
            official, now, classifyTleName(String(official.OBJECT_NAME ?? "")), true,
          );
        }
      }
      if (!satellite) {
        const mirror = await fetchMirrorActiveCatalog(20000);
        const match = mirror.find(({ record }) => catalogRecordId(record) === trackId);
        if (match) satellite = propagate(match.record, now, match.category, true);
      }
      if (!satellite) {
        return satelliteJson(request,{ satellite: null }, { status: 404 });
      }
      return satelliteJson(request,
        { satellite, generatedAt: now.toISOString() },
        { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=15" } },
      );
    }

    // Fast path: reuse orbital elements from Cloudflare edge storage and
    // propagate them to the current time. Coordinates stay live even though
    // the upstream TLE/OMM payload is refreshed only every few hours.
    if (edgeCatalog && edgeAge <= EDGE_CATALOG_FRESH_MS) {
      const edgeBuild = buildSatelliteSnapshot(edgeCatalog.records, now);
      const satellites = edgeBuild.satellites;
      if (satellites.length >= 100) {
        return satelliteJson(request,
          {
            satellites,
            count: satellites.length,
            source: "Edge-cached orbital elements",
            generatedAt: now.toISOString(),
            feedHealth: {
              runtimeFallback: "edge-cache",
              edgeCache: satellites.length,
              edgeAgeMinutes: Math.round(edgeAge / 60000),
              orbitModel: "SGP4",
              orbitEpochPolicy: "LEO<=72h; MEO<=7d; GEO<=14d",
              ...edgeBuild.stats,
            },
            categories: {
              stations: satellites.filter((item) => item.category === "STATION").length,
              weather: satellites.filter((item) => item.category === "WEATHER").length,
              earthObservation: satellites.filter((item) => item.category === "EARTH OBSERVATION").length,
              starlink: satellites.filter((item) => item.category === "STARLINK").length,
              other: satellites.filter((item) => item.category === "OTHER").length,
            },
          },
          {
            headers: {
              "Cache-Control": "public, s-maxage=25, stale-while-revalidate=15",
            },
          },
        );
      }
    }

    // Cold-edge fast path: the independent 2-hour publisher already fetched
    // authoritative CelesTrak GP data and SHA-256 verified its complete OMM
    // snapshot. Use it before starting a redundant live CelesTrak round-trip.
    // Every record is epoch-checked AGAIN by fetchVerifiedReleaseCatalog(now),
    // then propagated with SGP4 at response time. This is not telemetry.
    //
    // Never trust a missing, expired or partial publisher result: fall back to
    // live official ACTIVE OMM, and only then try the less reliable mirror.
    const verifiedSnapshot = await fetchVerifiedReleaseCatalog(now);
    const verifiedRelease = verifiedSnapshot.records;
    const official = verifiedRelease.length >= 100
      ? [] : (await fetchActiveGpCatalog(20000)).filter(({ record }) =>
          orbitalElementQuality(record, now) !== null,
        );
    const mirrorCatalogAll = verifiedRelease.length >= 100 || official.length >= 100
      ? [] : await fetchMirrorActiveCatalog(20000);
    const mirrorCatalog = mirrorCatalogAll.filter(({ record }) =>
      orbitalElementQuality(record, now) !== null,
    );
    const activeCatalog = verifiedRelease.length >= 100 ? verifiedRelease :
      official.length >= 100 ? official : mirrorCatalog;

    // Avoid four optional upstream timeouts once a complete catalog exists.
    const groupResults = activeCatalog.length >= 100
      ? [] as PromiseSettledResult<OmmRecord[]>[]
      : await Promise.allSettled([
          fetchGpGroup("STATIONS"),
          fetchGpGroup("WEATHER"),
          fetchGpGroup("RESOURCE"),
          fetchGpGroup("STARLINK"),
        ]);

    const stations = groupResults[0]?.status === "fulfilled" ? groupResults[0].value : [];
    const weather = groupResults[1]?.status === "fulfilled" ? groupResults[1].value : [];
    const resources = groupResults[2]?.status === "fulfilled" ? groupResults[2].value : [];
    const starlink = groupResults[3]?.status === "fulfilled" ? groupResults[3].value.slice(0, 140) : [];

    // Cache only after the resulting SGP4 positions pass validation.
    // Otherwise we write the same 5 MB orbit payload twice.

    let selected: CatalogRecord[] = activeCatalog.length >= 100
      ? activeCatalog
      : [
          ...stations.slice(0, 8).map((record) => ({ record, category: "STATION" as const })),
          ...pickWeather(weather).map((record) => ({ record, category: "WEATHER" as const })),
          ...pickEarthObservation(resources).map((record) => ({ record, category: "EARTH OBSERVATION" as const })),
          ...starlink.map((record) => ({ record, category: "STARLINK" as const })),
        ];

    if (!selected.length && lastGoodCatalogRecords.length) {
      const cacheAge = Date.now() - lastGoodCatalogAt;
      if (cacheAge <= LAST_GOOD_MAX_AGE_MS) {
        selected = lastGoodCatalogRecords;
      }
    }

    if (
      selected.length < 100 &&
      edgeCatalog &&
      edgeAge <= EDGE_CATALOG_STALE_MS &&
      edgeCatalog.records.length >= 100
    ) {
      selected = edgeCatalog.records;
    }

    if (!selected.length) {
      selected = (await fetchCuratedFallback()).map(({ record, category }) => ({ record, category }));
    }

    const buildSatellites = (items: CatalogRecord[]) => buildSatelliteSnapshot(items, now);
    let built = buildSatellites(selected);
    let satellites = built.satellites;

    if (satellites.length >= 100 && selected.length >= 100) {
      lastGoodCatalogRecords = selected.slice(0, 20000);
      lastGoodCatalogAt = Date.now();
      await writeEdgeCatalog(request, selected);
    }

    // If the current upstream degraded but this Worker still has a recent good
    // orbital catalog, re-propagate those records to NOW instead of collapsing.
    if (satellites.length < 100 && lastGoodCatalogRecords.length >= 100) {
      const cacheAge = Date.now() - lastGoodCatalogAt;
      if (cacheAge <= LAST_GOOD_MAX_AGE_MS) {
        const cachedBuild = buildSatellites(lastGoodCatalogRecords);
        if (cachedBuild.satellites.length > satellites.length) {
          satellites = cachedBuild.satellites;
          built = cachedBuild;
          selected = lastGoodCatalogRecords;
        }
      }
    }

    let runtimeFallback: "none" | "verified-release" | "github-mirror" | "active-gp" | "worker-cache" | "celestrak-curated" | "tle-api" | "wheretheiss" =
      verifiedRelease.length >= 100 ? "verified-release" :
      official.length >= 100 ? "active-gp" :
      mirrorCatalog.length >= 100 ? "github-mirror" :
      satellites.length >= 100 && selected === lastGoodCatalogRecords ? "worker-cache" :
      "none";

    if (!satellites.length) {
      const fallback = await fetchCuratedFallback();
      built = buildSatellites(
        fallback.map(({ record, category }) => ({ record, category })),
      );
      satellites = built.satellites;
      if (satellites.length) runtimeFallback = "celestrak-curated";
    }

    if (satellites.length < 100) {
      const catalogRecords = await fetchTleApiCatalog(20000);
      const catalogBuild = buildSatellites(catalogRecords);
      if (catalogBuild.satellites.length > satellites.length) {
        satellites = catalogBuild.satellites;
        built = catalogBuild;
        runtimeFallback = "tle-api";
      }
    }

    if (satellites.length < 24) {
      const tleApiRecords = await fetchTleApiFallback();
      const tleBuild = buildSatellites(tleApiRecords);
      if (tleBuild.satellites.length > satellites.length) {
        satellites = tleBuild.satellites;
        built = tleBuild;
        runtimeFallback = "tle-api";
      }
    }

    if (!satellites.length) {
      satellites = await fetchWhereTheIssFallback();
      if (satellites.length) runtimeFallback = "wheretheiss";
    }

    if (satellites.length < 100) {
      return satelliteJson(request,
        {
          satellites: [],
          count: 0,
          source: "Satellite catalog temporarily degraded",
          generatedAt: now.toISOString(),
          feedHealth: {
            active: activeCatalog.length,
            workerCache: lastGoodCatalogRecords.length,
            stations: stations.length,
            weather: weather.length,
            resources: resources.length,
            starlink: starlink.length,
            runtimeFallback,
            degradedCount: satellites.length,
            ...built.stats,
          },
          categories: {
            stations: 0,
            weather: 0,
            earthObservation: 0,
            starlink: 0,
            other: 0,
          },
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "public, s-maxage=10, stale-while-revalidate=10",
          },
        },
      );
    }

    return satelliteJson(request,
      {
        satellites,
        count: satellites.length,
        source: "CelesTrak GP · OMM JSON",
        generatedAt: now.toISOString(),
        feedHealth: {
          mirror: mirrorCatalog.length,
          verifiedRelease: verifiedRelease.length,
          verifiedReleaseAgeMinutes: verifiedSnapshot.sourceAgeMinutes,
          verifiedReleasePastPublisherExpiry: verifiedSnapshot.publisherExpired,
          officialActive: official.length,
          publisherPreferredOnColdEdge: true,
          staleMirrorRecordsDropped: mirrorCatalogAll.length - mirrorCatalog.length,
          mirrorSkippedDueToValidatedSource: official.length >= 100 || verifiedRelease.length >= 100,
          ...built.stats,
          active: activeCatalog.length,
          orbitModel: "SGP4",
          orbitEpochPolicy: "LEO<=72h; MEO<=7d; GEO<=14d",
          workerCache: lastGoodCatalogRecords.length,
          stations: stations.length,
          weather: weather.length,
          resources: resources.length,
          starlink: starlink.length,
          fallbackUsed: groupResults.length > 0 &&
            groupResults.every((result) => result.status !== "fulfilled" || result.value.length === 0),
          runtimeFallback,
        },
        categories: {
          stations: satellites.filter((item) => item.category === "STATION").length,
          weather: satellites.filter((item) => item.category === "WEATHER").length,
          earthObservation: satellites.filter((item) => item.category === "EARTH OBSERVATION").length,
          starlink: satellites.filter((item) => item.category === "STARLINK").length,
          other: satellites.filter((item) => item.category === "OTHER").length,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=25, stale-while-revalidate=15",
        },
      },
    );
  } catch {
    return satelliteJson(request,
      {
        satellites: [],
        count: 0,
        source: "Satellite catalog temporarily degraded",
        generatedAt: now.toISOString(),
        categories: { stations: 0, weather: 0, earthObservation: 0, starlink: 0 },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=10",
        },
      },
    );
  }
}
