import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

export async function GET() {
  try {
    const response = await fetch(USGS_URL, {
      headers: { "User-Agent": "CUPOLA Earth viewer" },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return NextResponse.json({ earthquakes: [], source: "USGS", updatedAt: new Date().toISOString() }, { status: 502 });
    }

    const payload = await response.json();
    const earthquakes = Array.isArray(payload?.features)
      ? payload.features
          .map((feature: any) => {
            const coords = feature?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return null;
            const magnitude = Number(feature?.properties?.mag);
            const time = Number(feature?.properties?.time);
            const depth = Number(coords[2] ?? 0);
            return {
              id: String(feature?.id ?? time ?? Math.random()),
              latitude: Number(coords[1]),
              longitude: Number(coords[0]),
              depth: Number.isFinite(depth) ? depth : 0,
              magnitude: Number.isFinite(magnitude) ? magnitude : 0,
              place: String(feature?.properties?.place ?? "Earthquake"),
              time: Number.isFinite(time) ? time : Date.now(),
              url: typeof feature?.properties?.url === "string" ? feature.properties.url : null,
            };
          })
          .filter(Boolean)
          .filter((item: any) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
          .sort((a: any, b: any) => b.magnitude - a.magnitude)
          .slice(0, 180)
      : [];

    return NextResponse.json(
      {
        earthquakes,
        source: "USGS Earthquake Hazards Program",
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=180",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { earthquakes: [], source: "USGS Earthquake Hazards Program", updatedAt: new Date().toISOString() },
      { status: 502 },
    );
  }
}
