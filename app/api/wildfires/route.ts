import { NextResponse } from "next/server";

export const revalidate = 600;

type WildfireHotspot = {
  id: string;
  latitude: number;
  longitude: number;
  frp: number | null;
  brightness: number | null;
  confidence: string | null;
  acquiredAt: string | null;
  daynight: string | null;
  satellite: string | null;
};

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=250";

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

function parseNumber(value: string | undefined) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseAcquiredAt(date: string | undefined, time: string | undefined) {
  if (!date) return null;
  const raw = String(time || "").padStart(4, "0");
  const hours = raw.slice(0, 2);
  const minutes = raw.slice(2, 4);
  const parsed = new Date(date + "T" + hours + ":" + minutes + ":00Z");
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseFirmsCsv(csv: string, sensor: string): WildfireHotspot[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((value) => value.trim().toLowerCase());
  const index = (name: string) => headers.indexOf(name);

  const latIndex = index("latitude");
  const lonIndex = index("longitude");
  if (latIndex < 0 || lonIndex < 0) return [];

  return lines.slice(1).flatMap((line, rowIndex) => {
    const row = parseCsvLine(line);
    const latitude = parseNumber(row[latIndex]);
    const longitude = parseNumber(row[lonIndex]);
    if (latitude == null || longitude == null) return [];

    const frp = parseNumber(row[index("frp")]);
    const brightness = parseNumber(row[index("bright_ti4")]);
    const acquiredAt = parseAcquiredAt(row[index("acq_date")], row[index("acq_time")]);
    const satellite = row[index("satellite")]?.trim() || sensor;

    return [{
      id: sensor + ":" + rowIndex + ":" + latitude.toFixed(5) + ":" + longitude.toFixed(5),
      latitude,
      longitude,
      frp,
      brightness,
      confidence: row[index("confidence")]?.trim() || null,
      acquiredAt,
      daynight: row[index("daynight")]?.trim() || null,
      satellite,
    }];
  });
}

function hotspotScore(hotspot: WildfireHotspot) {
  const frpScore = Math.log2(1 + Math.max(0, hotspot.frp ?? 0)) * 1.8;
  const brightScore = Math.max(0, (hotspot.brightness ?? 300) - 300) / 20;
  const ageHours = hotspot.acquiredAt
    ? Math.max(0, (Date.now() - new Date(hotspot.acquiredAt).getTime()) / 3600000)
    : 24;
  const recency = Math.max(0, 1 - ageHours / 24) * 4.5;
  const confidence = hotspot.confidence?.toLowerCase();
  const confidenceScore = confidence === "h" || confidence === "high" ? 2 : confidence === "n" || confidence === "nominal" ? 1 : 0;
  return frpScore + brightScore + recency + confidenceScore;
}

async function fetchFirmsSensor(mapKey: string, sensor: string) {
  const url = FIRMS_BASE + "/" + encodeURIComponent(mapKey) + "/" + sensor + "/world/1";
  const response = await fetch(url, {
    next: { revalidate: 600 },
    headers: {
      Accept: "text/csv",
      "User-Agent": "CUPOLA-Earth-Viewer/1.0",
    },
    signal: AbortSignal.timeout(18000),
  });

  if (!response.ok) return [];
  return parseFirmsCsv(await response.text(), sensor);
}

function centroidFromGeometry(geometry: any): { latitude: number; longitude: number } | null {
  const coordinates = geometry?.coordinates;
  if (!coordinates) return null;

  if (geometry.type === "Point" && Array.isArray(coordinates) && coordinates.length >= 2) {
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }

  const flattened: number[][] = [];
  const walk = (value: any) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      flattened.push([value[0], value[1]]);
      return;
    }
    value.forEach(walk);
  };
  walk(coordinates);

  if (!flattened.length) return null;
  const longitude = flattened.reduce((sum, point) => sum + point[0], 0) / flattened.length;
  const latitude = flattened.reduce((sum, point) => sum + point[1], 0) / flattened.length;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

async function fetchEonetFallback(): Promise<WildfireHotspot[]> {
  const response = await fetch(EONET_URL, {
    next: { revalidate: 900 },
    headers: {
      Accept: "application/json",
      "User-Agent": "CUPOLA-Earth-Viewer/1.0",
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return [];
  const payload = await response.json();
  const events = Array.isArray(payload?.events) ? payload.events : [];

  return events.flatMap((event: any, eventIndex: number) => {
    const geometries = Array.isArray(event?.geometry) ? event.geometry : [];
    const latest = geometries[geometries.length - 1];
    const point = centroidFromGeometry(latest);
    if (!point) return [];

    const date = typeof latest?.date === "string" ? latest.date : null;
    return [{
      id: "eonet:" + String(event?.id || eventIndex),
      latitude: point.latitude,
      longitude: point.longitude,
      frp: null,
      brightness: null,
      confidence: "event",
      acquiredAt: date,
      daynight: null,
      satellite: "NASA EONET",
    }];
  });
}

export async function GET() {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY?.trim();

  if (mapKey) {
    try {
      const [noaa20, noaa21] = await Promise.all([
        fetchFirmsSensor(mapKey, "VIIRS_NOAA20_NRT"),
        fetchFirmsSensor(mapKey, "VIIRS_NOAA21_NRT"),
      ]);

      const all = [...noaa20, ...noaa21];
      if (all.length) {
        const latestTime = all
          .map((hotspot) => hotspot.acquiredAt ? new Date(hotspot.acquiredAt).getTime() : 0)
          .reduce((max, value) => Math.max(max, value), 0);

        const hotspots = all
          .sort((a, b) => hotspotScore(b) - hotspotScore(a))
          .slice(0, 480);

        return NextResponse.json(
          {
            hotspots,
            totalDetections: all.length,
            source: "NASA FIRMS · VIIRS NOAA-20/21 NRT",
            mode: "firms",
            latestAcquisition: latestTime > 0 ? new Date(latestTime).toISOString() : null,
            updatedAt: new Date().toISOString(),
          },
          {
            headers: {
              "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
            },
          },
        );
      }
    } catch {
      // Fall through to keyless NASA EONET events.
    }
  }

  try {
    const hotspots = await fetchEonetFallback();
    const latestTime = hotspots
      .map((hotspot) => hotspot.acquiredAt ? new Date(hotspot.acquiredAt).getTime() : 0)
      .reduce((max, value) => Math.max(max, value), 0);

    return NextResponse.json(
      {
        hotspots,
        totalDetections: hotspots.length,
        source: "NASA EONET · WILDFIRE EVENTS",
        mode: "eonet-fallback",
        latestAcquisition: latestTime > 0 ? new Date(latestTime).toISOString() : null,
        updatedAt: new Date().toISOString(),
        firmsConfigured: Boolean(mapKey),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        hotspots: [],
        totalDetections: 0,
        source: mapKey ? "NASA FIRMS" : "NASA EONET",
        mode: mapKey ? "firms-unavailable" : "eonet-unavailable",
        latestAcquisition: null,
        updatedAt: new Date().toISOString(),
        firmsConfigured: Boolean(mapKey),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=180, stale-while-revalidate=600",
        },
      },
    );
  }
}
