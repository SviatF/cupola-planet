import { NextResponse } from "next/server";

export const revalidate = 30;

type OmmRecord = {
  OBJECT_NAME?: string;
  OBJECT_ID?: string;
  NORAD_CAT_ID?: string | number;
  EPOCH?: string;
  MEAN_MOTION?: number | string;
  ECCENTRICITY?: number | string;
  INCLINATION?: number | string;
  RA_OF_ASC_NODE?: number | string;
  ARG_OF_PERICENTER?: number | string;
  MEAN_ANOMALY?: number | string;
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
  track: SatelliteTrackPoint[];
};

const GP_BASE = "https://celestrak.org/NORAD/elements/gp.php";
const MU = 398600.4418;
const EARTH_RADIUS_KM = 6371.0;

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

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deg(value: number) {
  return value * Math.PI / 180;
}

function parseOmmEpoch(value: string | undefined) {
  if (!value) return null;

  // CelesTrak OMM epochs commonly contain microseconds, e.g.
  // 2026-06-19T12:16:41.638656. Normalize to JS-safe milliseconds.
  const normalized = value
    .trim()
    .replace(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z)?$/,
      (_match, base: string, fraction: string | undefined) => {
        const millis = (fraction || "0").padEnd(3, "0").slice(0, 3);
        return base + "." + millis + "Z";
      },
    );

  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number) {
  let E = meanAnomaly;
  for (let i = 0; i < 8; i++) {
    const f = E - eccentricity * Math.sin(E) - meanAnomaly;
    const fp = 1 - eccentricity * Math.cos(E);
    E -= f / Math.max(fp, 1e-8);
  }
  return E;
}

function gmstRadians(date: Date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  let degrees =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;
  degrees = ((degrees % 360) + 360) % 360;
  return deg(degrees);
}

function propagatePosition(record: OmmRecord, at: Date) {
  const nRevDay = num(record.MEAN_MOTION);
  const e = num(record.ECCENTRICITY);
  const inc = num(record.INCLINATION);
  const raan = num(record.RA_OF_ASC_NODE);
  const argp = num(record.ARG_OF_PERICENTER);
  const meanAnomaly0 = num(record.MEAN_ANOMALY);
  const epoch = parseOmmEpoch(record.EPOCH);

  if (
    nRevDay == null || e == null || inc == null || raan == null ||
    argp == null || meanAnomaly0 == null || !epoch || !Number.isFinite(epoch.getTime())
  ) return null;

  const n = nRevDay * Math.PI * 2 / 86400;
  const a = Math.cbrt(MU / (n * n));
  const dt = (at.getTime() - epoch.getTime()) / 1000;
  let M = deg(meanAnomaly0) + n * dt;
  M = ((M % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  const E = solveEccentricAnomaly(M, e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const r = a * (1 - e * cosE);
  const trueAnomaly = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);

  const u = deg(argp) + trueAnomaly;
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosO = Math.cos(deg(raan));
  const sinO = Math.sin(deg(raan));
  const cosI = Math.cos(deg(inc));
  const sinI = Math.sin(deg(inc));

  const xEci = r * (cosO * cosU - sinO * sinU * cosI);
  const yEci = r * (sinO * cosU + cosO * sinU * cosI);
  const zEci = r * (sinU * sinI);

  const theta = gmstRadians(at);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const x = cosT * xEci + sinT * yEci;
  const y = -sinT * xEci + cosT * yEci;
  const z = zEci;

  const longitude = Math.atan2(y, x) * 180 / Math.PI;
  const latitude = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
  const altitude = r - EARTH_RADIUS_KM;
  const velocity = Math.sqrt(Math.max(0, MU * (2 / r - 1 / a)));

  if (![latitude, longitude, altitude, velocity].every(Number.isFinite)) return null;
  return { latitude, longitude, altitude, velocity, epoch };
}

function propagate(
  record: OmmRecord,
  at: Date,
  category: SatellitePoint["category"],
  includeTrack = false,
): SatellitePoint | null {
  const position = propagatePosition(record, at);
  if (!position) return null;
  const { latitude, longitude, altitude, velocity, epoch } = position;

  const id = String(record.NORAD_CAT_ID ?? record.OBJECT_ID ?? record.OBJECT_NAME ?? "");
  const name = String(record.OBJECT_NAME ?? "SATELLITE");

  const track = includeTrack
    ? [-20, -10, 0, 10, 20].flatMap((offset) => {
        const sampleDate = new Date(at.getTime() + offset * 60000);
        const sample = propagatePosition(record, sampleDate);
        return sample ? [{
          latitude: sample.latitude,
          longitude: sample.longitude,
          altitude: sample.altitude,
          timestamp: sampleDate.toISOString(),
        }] : [];
      })
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

  return {
    OBJECT_NAME: typeof record.name === "string" ? record.name : "SATELLITE",
    NORAD_CAT_ID: record.satelliteId ?? line1.slice(2, 7).trim(),
    EPOCH: epoch,
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

export async function GET(request: Request) {
  const now = new Date();

  try {
    const edgeCatalog = await readEdgeCatalog(request);
    const edgeAge = edgeCatalog ? Date.now() - edgeCatalog.savedAt : Number.POSITIVE_INFINITY;

    // Fast path: reuse orbital elements from Cloudflare edge storage and
    // propagate them to the current time. Coordinates stay live even though
    // the upstream TLE/OMM payload is refreshed only every few hours.
    if (edgeCatalog && edgeAge <= EDGE_CATALOG_FRESH_MS) {
      const buildFromEdge = (
        items: CatalogRecord[],
      ) => {
        const seen = new Set<string>();
        return items
          .map(({ record, category }) => propagate(record, now, category, false))
          .filter((item): item is SatellitePoint => Boolean(item))
          .filter((item) => {
            if (!item.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          })
          .slice(0, 20000);
      };

      const satellites = buildFromEdge(edgeCatalog.records);
      if (satellites.length >= 100) {
        return NextResponse.json(
          {
            satellites,
            count: satellites.length,
            source: "Edge-cached orbital elements",
            generatedAt: now.toISOString(),
            feedHealth: {
              runtimeFallback: "edge-cache",
              edgeCache: satellites.length,
              edgeAgeMinutes: Math.round(edgeAge / 60000),
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
              "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
            },
          },
        );
      }
    }

    const mirrorCatalog = await fetchMirrorActiveCatalog(20000);
    const activeCatalog = mirrorCatalog.length >= 100
      ? mirrorCatalog
      : await fetchActiveGpCatalog(20000);

    const groupResults = await Promise.allSettled([
      fetchGpGroup("STATIONS"),
      fetchGpGroup("WEATHER"),
      fetchGpGroup("RESOURCE"),
      fetchGpGroup("STARLINK"),
    ]);

    const stations = groupResults[0].status === "fulfilled" ? groupResults[0].value : [];
    const weather = groupResults[1].status === "fulfilled" ? groupResults[1].value : [];
    const resources = groupResults[2].status === "fulfilled" ? groupResults[2].value : [];
    const starlink = groupResults[3].status === "fulfilled" ? groupResults[3].value.slice(0, 140) : [];

    if (activeCatalog.length >= 100) {
      await writeEdgeCatalog(request, activeCatalog);
    }

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

    const buildSatellites = (
      items: CatalogRecord[],
    ) => {
      const seen = new Set<string>();
      return items
        .map(({ record, category }) => propagate(record, now, category, false))
        .filter((item): item is SatellitePoint => Boolean(item))
        .filter((item) => {
          if (!item.id || seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        })
        .slice(0, 20000);
    };

    let satellites = buildSatellites(selected);

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
        const cachedSatellites = buildSatellites(lastGoodCatalogRecords);
        if (cachedSatellites.length > satellites.length) {
          satellites = cachedSatellites;
          selected = lastGoodCatalogRecords;
        }
      }
    }

    let runtimeFallback: "none" | "github-mirror" | "active-gp" | "worker-cache" | "celestrak-curated" | "tle-api" | "wheretheiss" =
      mirrorCatalog.length >= 100 ? "github-mirror" :
      activeCatalog.length >= 100 ? "active-gp" :
      satellites.length >= 100 && selected === lastGoodCatalogRecords ? "worker-cache" :
      "none";

    if (!satellites.length) {
      const fallback = await fetchCuratedFallback();
      satellites = buildSatellites(
        fallback.map(({ record, category }) => ({ record, category })),
      );
      if (satellites.length) runtimeFallback = "celestrak-curated";
    }

    if (satellites.length < 100) {
      const catalogRecords = await fetchTleApiCatalog(20000);
      const catalogSatellites = buildSatellites(catalogRecords);
      if (catalogSatellites.length > satellites.length) {
        satellites = catalogSatellites;
        runtimeFallback = "tle-api";
      }
    }

    if (satellites.length < 24) {
      const tleApiRecords = await fetchTleApiFallback();
      const tleApiSatellites = buildSatellites(tleApiRecords);
      if (tleApiSatellites.length > satellites.length) {
        satellites = tleApiSatellites;
        runtimeFallback = "tle-api";
      }
    }

    if (!satellites.length) {
      satellites = await fetchWhereTheIssFallback();
      if (satellites.length) runtimeFallback = "wheretheiss";
    }

    if (satellites.length < 100) {
      return NextResponse.json(
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
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=600",
          },
        },
      );
    }

    return NextResponse.json(
      {
        satellites,
        count: satellites.length,
        source: "CelesTrak GP · OMM JSON",
        generatedAt: now.toISOString(),
        feedHealth: {
          mirror: mirrorCatalog.length,
          active: activeCatalog.length,
          workerCache: lastGoodCatalogRecords.length,
          stations: stations.length,
          weather: weather.length,
          resources: resources.length,
          starlink: starlink.length,
          fallbackUsed: groupResults.every((result) => result.status !== "fulfilled" || result.value.length === 0),
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
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        satellites: [],
        count: 0,
        source: "CelesTrak GP · OMM JSON",
        generatedAt: now.toISOString(),
        categories: { stations: 0, weather: 0, earthObservation: 0, starlink: 0 },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      },
    );
  }
}
