import { NextResponse } from "next/server";
import { earthSourceTime, sourceAgeMinutes, isCurrentSource } from "@/lib/earth/eventDataFreshness";

export const dynamic = "force-dynamic";
const NOAA_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const MAX_OBSERVATION_AGE_MINUTES = 90;
// NOAA OVATION is a short-term FORECAST derived from upstream solar wind,
// never a camera image of auroras.
function offline(reason: string, observationTime: string | null = null) {
  return NextResponse.json({
    points: [], source: "NOAA SWPC OVATION", status: "stale-or-unknown",
    dataStatus: "offline", reason, observationTime, forecastTime: null,
    observationAgeMinutes: sourceAgeMinutes(observationTime),
    updatedAt: new Date().toISOString(),
  }, { status: 503, headers: {"Cache-Control":"no-store"} });
}

export async function GET() {
  try {
    const response = await fetch(NOAA_URL, {
      headers: { Accept: "application/json", "User-Agent": "CUPOLA-Earth-Viewer/1.0" },
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return offline("noaa-swpc-upstream-error");
    const payload = await response.json();
    const observationTime = earthSourceTime(payload?.["Observation Time"] ?? payload?.observationTime);
    const forecastTime = earthSourceTime(payload?.["Forecast Time"] ?? payload?.forecastTime);
    if (!isCurrentSource(observationTime, MAX_OBSERVATION_AGE_MINUTES)) {
      return offline("source-observation-outside-90-min-window", observationTime);
    }
    // Do not upgrade an untimestamped, historical, or implausibly distant
    // forecast to a freshly observed aurora.
    const forecastMs = Date.parse(forecastTime || "");
    const observationMs = Date.parse(observationTime || "");
    if (!Number.isFinite(forecastMs) ||
        forecastMs < observationMs - 15 * 60_000 ||
        forecastMs > observationMs + 120 * 60_000 ||
        forecastMs < Date.now() - 120 * 60_000 ||
        forecastMs > Date.now() + 150 * 60_000) {
      return offline("no-valid-ovation-forecast-time", observationTime);
    }

    const coords = Array.isArray(payload?.coordinates) ? payload.coordinates : null;
    if (!coords || coords.length < 100) return offline("no-usable-ovation-grid", observationTime);
    const points = coords.flatMap((row: unknown) => {
      if (!Array.isArray(row) || row.length < 3) return [];
      const longitude = Number(row[0]), latitude = Number(row[1]), intensity = Number(row[2]);
      if (![longitude,latitude,intensity].every(Number.isFinite) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 360 ||
          intensity < 8 || intensity > 100) return [];
      return [{longitude: longitude > 180 ? longitude - 360 : longitude, latitude, intensity}];
    }).sort((a, b) => b.intensity - a.intensity).slice(0, 2600);
    return NextResponse.json({
      points, source: "NOAA SWPC OVATION", dataStatus: "forecast",
      status: "current-ovation-model", forecastTime, observationTime,
      observationAgeMinutes: sourceAgeMinutes(observationTime),
      updatedAt: new Date().toISOString(),
      description: "30-90 minute probability forecast from L1 solar-wind observations; NOT a live photograph",
    }, {headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=150",
      "X-Cupola-Data-Status":"forecast-not-observation",
      "X-Cupola-Observation-Time":observationTime ?? "",
      "X-Cupola-Forecast-Time":forecastTime ?? "",
    }});
  } catch { return offline("noaa-swpc-request-failed"); }
}
