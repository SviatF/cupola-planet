import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,cloud_cover,wind_speed_10m,weather_code,is_day");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timezone", "auto");

  try {
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) throw new Error("Weather upstream unavailable");
    const data = await response.json();
    const current = data.current;

    return NextResponse.json({
      temperature: Number(current.temperature_2m),
      cloudCover: Number(current.cloud_cover),
      windSpeed: Number(current.wind_speed_10m),
      weatherCode: Number(current.weather_code),
      isDay: Number(current.is_day) === 1,
      sunrise: Array.isArray(data.daily?.sunrise) ? data.daily.sunrise[0] : null,
      sunset: Array.isArray(data.daily?.sunset) ? data.daily.sunset[0] : null,
      timezone: String(data.timezone ?? "UTC"),
      updatedAt: String(current.time),
    });
  } catch {
    return NextResponse.json({ error: "Weather data unavailable" }, { status: 503 });
  }
}
