import { NextResponse } from "next/server";

export const revalidate = 1800;

const FALLBACK =
  "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg";

const LAYERS = [
  "VIIRS_NOAA21_GapFilled_BRDF_Corrected_DayNightBand_Radiance",
  "VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance",
  "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance",
];

function dateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function fetchLayer(layer: string, date: string) {
  const url = new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.1.1");
  url.searchParams.set("REQUEST", "GetMap");
  url.searchParams.set("LAYERS", layer);
  url.searchParams.set("STYLES", "");
  url.searchParams.set("SRS", "EPSG:4326");
  url.searchParams.set("BBOX", "-180,-90,180,90");
  url.searchParams.set("WIDTH", "4096");
  url.searchParams.set("HEIGHT", "2048");
  url.searchParams.set("FORMAT", "image/png");
  url.searchParams.set("TRANSPARENT", "TRUE");
  url.searchParams.set("TIME", date);

  return fetch(url, {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "CUPOLA-Earth-Experience/1.0" },
  });
}

export async function GET() {
  const now = new Date();

  for (const daysAgo of [0, 1, 2, 3]) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    const day = dateLabel(date);

    for (const layer of LAYERS) {
      try {
        const response = await fetchLayer(layer, day);
        const type = response.headers.get("content-type") || "";
        if (!response.ok || !type.includes("image")) continue;

        const body = await response.arrayBuffer();
        if (body.byteLength < 5000) continue;

        return new NextResponse(body, {
          status: 200,
          headers: {
            "Content-Type": type,
            "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600",
            "X-Cupola-Source": layer + " · BRDF-CORRECTED",
            "X-Cupola-Imagery-Date": day,
            "X-Cupola-Age-Hours": String(
              Math.max(0, Math.round((now.getTime() - date.getTime()) / 3600000)),
            ),
          },
        });
      } catch {}
    }
  }

  try {
    const fallback = await fetch(FALLBACK, { next: { revalidate: 86400 } });
    const body = await fallback.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": fallback.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Cupola-Source": "NASA Black Marble fallback",
        "X-Cupola-Imagery-Date": "2016-composite",
        "X-Cupola-Age-Hours": "-1",
      },
    });
  } catch {
    return NextResponse.json({ error: "Night lights unavailable" }, { status: 503 });
  }
}
