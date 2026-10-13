import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NOAA_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";

export async function GET() {
  try {
    const response = await fetch(NOAA_URL, {
      headers: { "User-Agent": "CUPOLA Earth viewer" },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json({ points: [], source: "NOAA SWPC OVATION", updatedAt: new Date().toISOString() }, { status: 502 });
    }

    const payload = await response.json();
    const observation = payload?.["Observation Time"] ?? payload?.observationTime ?? null;
    const parsedObservation = typeof observation === "string"
      ? Date.parse(observation.replace(" UTC", "Z").replace(" ", "T")) : NaN;
    // OVATION is a model, not a photograph. Do not draw an expired auroral
    // probability map as if it were a fresh NOAA forecast.
    if (!Number.isFinite(parsedObservation) ||
        parsedObservation > Date.now() + 10 * 60000 ||
        Date.now() - parsedObservation > 4 * 3600000) {
      return NextResponse.json({
        points: [], source: "NOAA SWPC OVATION", status: "stale-or-unknown",
        observationTime: observation, updatedAt: new Date().toISOString(),
      }, { status: 503 });
    }
    const coords = Array.isArray(payload?.coordinates) ? payload.coordinates : [];
    const points = coords
      .map((row: any) => {
        if (!Array.isArray(row) || row.length < 3) return null;
        const longitude = Number(row[0]);
        const latitude = Number(row[1]);
        const intensity = Number(row[2]);
        if (![longitude, latitude, intensity].every(Number.isFinite)) return null;
        if (intensity < 8) return null;
        return { longitude, latitude, intensity };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.intensity - a.intensity)
      .slice(0, 2600);

    return NextResponse.json(
      {
        points,
        source: "NOAA SWPC OVATION",
        forecastTime: payload?.["Forecast Time"] ?? payload?.forecastTime ?? null,
        observationTime: payload?.["Observation Time"] ?? payload?.observationTime ?? null,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { points: [], source: "NOAA SWPC OVATION", updatedAt: new Date().toISOString() },
      { status: 502 },
    );
  }
}
