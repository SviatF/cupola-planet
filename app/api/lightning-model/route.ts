import { NextResponse } from "next/server";

export const revalidate = 900;

type ModelPoint = {
  latitude: number;
  longitude: number;
  density: number;
  validTime: string | null;
};

const LATITUDES = Array.from({ length: 23 }, (_, i) => -50 + i * 5);
const LONGITUDES = Array.from({ length: 27 }, (_, i) => 50 + i * 5);

function pairs() {
  const points: Array<{ latitude: number; longitude: number }> = [];
  for (const latitude of LATITUDES) {
    for (const longitude of LONGITUDES) {
      points.push({ latitude, longitude: longitude > 180 ? longitude - 360 : longitude });
    }
  }
  return points;
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function readCurrentDensity(result: any): { density: number; validTime: string | null } | null {
  const times = Array.isArray(result?.hourly?.time) ? result.hourly.time : [];
  const values = Array.isArray(result?.hourly?.lightning_density)
    ? result.hourly.lightning_density
    : [];

  if (!times.length || !values.length) return null;

  const now = Date.now();
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < Math.min(times.length, values.length); i++) {
    const ts = Date.parse(times[i]);
    if (!Number.isFinite(ts)) continue;
    const distance = Math.abs(ts - now);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  const density = Number(values[bestIndex]);
  if (!Number.isFinite(density) || density <= 0) return null;

  return {
    density,
    validTime: typeof times[bestIndex] === "string" ? times[bestIndex] : null,
  };
}

async function fetchBatch(batch: Array<{ latitude: number; longitude: number }>) {
  const params = new URLSearchParams({
    latitude: batch.map((p) => p.latitude.toFixed(2)).join(","),
    longitude: batch.map((p) => p.longitude.toFixed(2)).join(","),
    hourly: "lightning_density",
    timezone: "UTC",
    past_hours: "1",
    forecast_hours: "2",
  });

  const response = await fetch(
    "https://api.open-meteo.com/v1/ecmwf?" + params.toString(),
    {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) return [] as ModelPoint[];
  const json = await response.json();
  const rows = Array.isArray(json) ? json : [json];
  const out: ModelPoint[] = [];

  for (let i = 0; i < Math.min(rows.length, batch.length); i++) {
    const current = readCurrentDensity(rows[i]);
    if (!current) continue;

    out.push({
      latitude: batch[i].latitude,
      longitude: batch[i].longitude,
      density: current.density,
      validTime: current.validTime,
    });
  }

  return out;
}

export async function GET() {
  try {
    const grid = pairs();
    const batches = chunks(grid, 80);
    const results = await Promise.all(batches.map(fetchBatch));
    const merged = results.flat();

    // Keep the strongest cells only. This is a model fallback for coverage
    // gaps, not a dense weather-map overlay.
    const points = merged
      .filter((point) => point.density > 0)
      .sort((a, b) => b.density - a.density)
      .slice(0, 140);

    return NextResponse.json(
      {
        points,
        source: "ECMWF lightning density via Open-Meteo",
        kind: "model",
        updatedAt: new Date().toISOString(),
        coverage: "Asia and Oceania fallback grid · 5 degree sampling",
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
        points: [],
        source: "ECMWF lightning density via Open-Meteo",
        kind: "model",
        updatedAt: new Date().toISOString(),
        coverage: "Asia and Oceania fallback grid · 5 degree sampling",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
        },
      },
    );
  }
}
