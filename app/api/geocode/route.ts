import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("Geocoding unavailable");
    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];

    return NextResponse.json({
      results: results.map((item: any) => ({
        id: item.id,
        name: item.name,
        country: item.country,
        admin1: item.admin1 ?? null,
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        timezone: item.timezone,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Geocoding unavailable" }, { status: 503 });
  }
}
