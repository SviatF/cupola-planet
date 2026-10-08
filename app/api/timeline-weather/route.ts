import { NextRequest, NextResponse } from "next/server";

/**
 * Point-based hourly weather, explicitly NOT a global forecast raster.
 * Forecast and recent-hours weather are model data from Open-Meteo.
 * All times are UTC so the Earth timeline and the response agree.
 */
export const revalidate = 900;
type HourlyPoint = {
  time: string;
  temperature: number | null;
  cloudCover: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  pressure: number | null;
};

const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Valid lat/lon required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: "temperature_2m,cloud_cover,precipitation,wind_speed_10m,pressure_msl",
    past_hours: "30",
    forecast_hours: "30",
    timezone: "GMT",
    wind_speed_unit: "kmh",
  });

  try {
    const res = await fetch("https://api.open-meteo.com/v1/forecast?" + params, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error("forecast unavailable");
    const data = await res.json();
    const h = data.hourly ?? {};
    const times: string[] = Array.isArray(h.time) ? h.time : [];
    const rows: HourlyPoint[] = times
      .filter((t) => typeof t === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t))
      .map((time, index) => ({
        time: time + ":00Z",
        temperature: finite(h.temperature_2m?.[index]),
        cloudCover: finite(h.cloud_cover?.[index]),
        precipitation: finite(h.precipitation?.[index]),
        windSpeed: finite(h.wind_speed_10m?.[index]),
        pressure: finite(h.pressure_msl?.[index]),
      }));
    return NextResponse.json({
      rows,
      latitude,
      longitude,
      source: "Open-Meteo hourly weather models",
      type: "MODEL",
      disclaimer: "Point forecast, not satellite imagery or a global forecast layer.",
      updatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
  } catch {
    return NextResponse.json({ rows: [], error: "Hourly weather unavailable" },
      { status: 503, headers: { "Cache-Control": "public, s-maxage=120" } });
  }
}
