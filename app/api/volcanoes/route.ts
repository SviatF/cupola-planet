import { NextResponse } from "next/server";

export const revalidate = 900;

const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=open&limit=200";

type VolcanoEvent = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  eventTime: string | null;
  magnitude: number | null;
  source: string;
  sourceUrl: string | null;
};

function centroidFromGeometry(geometry: any): { latitude: number; longitude: number } | null {
  const coordinates = geometry?.coordinates;
  if (!coordinates) return null;

  if (geometry.type === "Point" && Array.isArray(coordinates) && coordinates.length >= 2) {
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;
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

  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function parseMagnitude(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function GET() {
  try {
    const response = await fetch(EONET_URL, {
      next: { revalidate: 900 },
      headers: {
        Accept: "application/json",
        "User-Agent": "CUPOLA-Earth-Viewer/1.0",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          volcanoes: [],
          source: "NASA EONET · VOLCANOES",
          updatedAt: new Date().toISOString(),
        },
        { status: 502 },
      );
    }

    const payload = await response.json();
    const events = Array.isArray(payload?.events) ? payload.events : [];

    const volcanoes: VolcanoEvent[] = events.flatMap((event: any, eventIndex: number) => {
      const geometries = Array.isArray(event?.geometry) ? event.geometry : [];
      if (!geometries.length) return [];

      const latest = geometries[geometries.length - 1];
      const point = centroidFromGeometry(latest);
      if (!point) return [];

      const sources = Array.isArray(event?.sources) ? event.sources : [];
      const firstSource = sources[0];

      return [{
        id: String(event?.id || "volcano-" + eventIndex),
        name: String(event?.title || event?.name || "Active volcano"),
        latitude: point.latitude,
        longitude: point.longitude,
        eventTime: typeof latest?.date === "string" ? latest.date : null,
        magnitude: parseMagnitude(latest?.magnitudeValue),
        source: typeof firstSource?.id === "string" ? firstSource.id : "NASA EONET",
        sourceUrl: typeof firstSource?.url === "string" ? firstSource.url : null,
      }];
    });

    volcanoes.sort((a, b) => {
      const aTime = a.eventTime ? new Date(a.eventTime).getTime() : 0;
      const bTime = b.eventTime ? new Date(b.eventTime).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json(
      {
        volcanoes: volcanoes.slice(0, 80),
        source: "NASA EONET · VOLCANOES",
        updatedAt: new Date().toISOString(),
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
        volcanoes: [],
        source: "NASA EONET · VOLCANOES",
        updatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=180, stale-while-revalidate=900",
        },
      },
    );
  }
}
