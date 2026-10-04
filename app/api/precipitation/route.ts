import { NextResponse } from "next/server";

export const revalidate = 1800;

function dateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function fetchLayer(date: string) {
  const url = new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.1.1");
  url.searchParams.set("REQUEST", "GetMap");
  url.searchParams.set("LAYERS", "IMERG_Precipitation_Rate_v7_NRT");
  url.searchParams.set("STYLES", "");
  url.searchParams.set("SRS", "EPSG:4326");
  url.searchParams.set("BBOX", "-180,-90,180,90");
  url.searchParams.set("WIDTH", "2048");
  url.searchParams.set("HEIGHT", "1024");
  url.searchParams.set("FORMAT", "image/png");
  url.searchParams.set("TRANSPARENT", "TRUE");
  url.searchParams.set("TIME", date);

  return fetch(url, {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "CUPOLA-Earth-Experience/1.0" },
  });
}

export async function GET() {
  const now = new Date();
  const attempts = [0, 1, 2].map((daysAgo) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return dateLabel(d);
  });

  for (const date of attempts) {
    try {
      const response = await fetchLayer(date);
      if (!response.ok) continue;
      const type = response.headers.get("content-type") || "";
      if (!type.includes("image")) continue;
      const body = await response.arrayBuffer();

      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": type,
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=7200",
          "X-Cupola-Source": "NASA GIBS IMERG v7 NRT",
          "X-Cupola-Imagery-Date": date,
        },
      });
    } catch {}
  }

  const transparent = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XqQfWQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  return new NextResponse(transparent, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      "X-Cupola-Source": "Transparent fallback",
    },
  });
}
