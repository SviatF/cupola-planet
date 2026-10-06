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
  category: "STATION" | "WEATHER" | "EARTH OBSERVATION" | "STARLINK";
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  epoch: string | null;
  source: "CelesTrak";
  track: SatelliteTrackPoint[];
};

const GP_BASE = "https://celestrak.org/NORAD/elements/gp.php";
const SATCAT_BASE = "https://celestrak.org/satcat/records.php";
const MU = 398600.4418;
const EARTH_RADIUS_KM = 6371.0;

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deg(value: number) {
  return value * Math.PI / 180;
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
  const epoch = record.EPOCH ? new Date(record.EPOCH) : null;

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

function propagate(record: OmmRecord, at: Date, category: SatellitePoint["category"]): SatellitePoint | null {
  const position = propagatePosition(record, at);
  if (!position) return null;
  const { latitude, longitude, altitude, velocity, epoch } = position;

  const id = String(record.NORAD_CAT_ID ?? record.OBJECT_ID ?? record.OBJECT_NAME ?? "");
  const name = String(record.OBJECT_NAME ?? "SATELLITE");

  const trackOffsetsMinutes = [-20, -10, 0, 10, 20];
  const track = trackOffsetsMinutes.flatMap((offset) => {
    const sampleDate = new Date(at.getTime() + offset * 60000);
    const sample = propagatePosition(record, sampleDate);
    return sample ? [{
      latitude: sample.latitude,
      longitude: sample.longitude,
      altitude: sample.altitude,
      timestamp: sampleDate.toISOString(),
    }] : [];
  });

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

async function fetchStarlinkSample() {
  const url = SATCAT_BASE + "?NAME=STARLINK&PAYLOADS=1&ONORBIT=1&ACTIVE=1&MAX=12&FORMAT=JSON";
  const response = await fetch(url, {
    next: { revalidate: 1800 },
    headers: { Accept: "application/json", "User-Agent": "CUPOLA-Earth-Viewer/1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return [] as OmmRecord[];
  const payload = await response.json();
  const rows: Array<Record<string, unknown>> = Array.isArray(payload)
    ? payload as Array<Record<string, unknown>>
    : [];
  const cats: Array<string | number> = rows
    .map((row) => row.NORAD_CAT_ID ?? row.NORAD_CAT_ID_INT ?? row.OBJECT_NUMBER)
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .slice(0, 12);

  const records = await Promise.all(cats.map((cat) => fetchGpCat(cat)));
  return records.filter(Boolean) as OmmRecord[];
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
      if (picked.length >= 10) return picked;
    }
  }
  return picked.length ? picked.slice(0, 10) : records.slice(0, 10);
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
      if (picked.length >= 10) return picked;
    }
  }
  return picked.length ? picked.slice(0, 10) : records.slice(0, 10);
}

export async function GET() {
  const now = new Date();

  try {
    const [stations, weather, resources, starlink] = await Promise.all([
      fetchGpGroup("STATIONS"),
      fetchGpGroup("WEATHER"),
      fetchGpGroup("RESOURCE"),
      fetchStarlinkSample(),
    ]);

    const selected: Array<{ record: OmmRecord; category: SatellitePoint["category"] }> = [
      ...stations.slice(0, 4).map((record) => ({ record, category: "STATION" as const })),
      ...pickWeather(weather).map((record) => ({ record, category: "WEATHER" as const })),
      ...pickEarthObservation(resources).map((record) => ({ record, category: "EARTH OBSERVATION" as const })),
      ...starlink.map((record) => ({ record, category: "STARLINK" as const })),
    ];

    const seen = new Set<string>();
    const satellites = selected
      .map(({ record, category }) => propagate(record, now, category))
      .filter((item): item is SatellitePoint => Boolean(item))
      .filter((item) => {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .slice(0, 36);

    return NextResponse.json(
      {
        satellites,
        count: satellites.length,
        source: "CelesTrak GP · OMM JSON",
        generatedAt: now.toISOString(),
        categories: {
          stations: satellites.filter((item) => item.category === "STATION").length,
          weather: satellites.filter((item) => item.category === "WEATHER").length,
          earthObservation: satellites.filter((item) => item.category === "EARTH OBSERVATION").length,
          starlink: satellites.filter((item) => item.category === "STARLINK").length,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
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
