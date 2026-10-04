import { NextResponse } from "next/server";

export const revalidate = 3600;

const TRANSPARENT =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XqQfWQAAAABJRU5ErkJggg==";

function dateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function fetchClouds(date: string) {
  const url = new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.1.1");
  url.searchParams.set("REQUEST", "GetMap");
  url.searchParams.set("LAYERS", "MODIS_Terra_Cloud_Fraction_Day");
  url.searchParams.set("STYLES", "");
  url.searchParams.set("SRS", "EPSG:4326");
  url.searchParams.set("BBOX", "-180,-90,180,90");
  url.searchParams.set("WIDTH", "2048");
  url.searchParams.set("HEIGHT", "1024");
  url.searchParams.set("FORMAT", "image/png");
  url.searchParams.set("TRANSPARENT", "TRUE");
  url.searchParams.set("TIME", date);

  return fetch(url, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "CUPOLA-Earth-Experience/1.0" },
  });
}

export async function GET() {
  const now = new Date();

  for (const daysAgo of [0, 1, 2, 3]) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    const day = dateLabel(date);

    try {
      const response = await fetchClouds(day);
      const type = response.headers.get("content-type") || "";
      if (!response.ok || !type.includes("image")) continue;

      const body = await response.arrayBuffer();
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": type,
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
          "X-Cupola-Source": "NASA GIBS MODIS Terra Cloud Fraction",
          "X-Cupola-Imagery-Date": day,
        },
      });
    } catch {}
  }

  const transparent = Uint8Array.from(atob(TRANSPARENT), (c) => c.charCodeAt(0));
  return new NextResponse(transparent, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      "X-Cupola-Source": "Transparent fallback",
    },
  });
}
