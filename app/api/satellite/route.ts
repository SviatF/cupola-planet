import { NextResponse } from "next/server";

export const revalidate = 3600;

const FALLBACK =
  "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg";

function yyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  const time = yyyyMmDd(date);

  const url = new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.1.1");
  url.searchParams.set("REQUEST", "GetMap");
  url.searchParams.set("LAYERS", "MODIS_Terra_CorrectedReflectance_TrueColor");
  url.searchParams.set("STYLES", "");
  url.searchParams.set("SRS", "EPSG:4326");
  url.searchParams.set("BBOX", "-180,-90,180,90");
  url.searchParams.set("WIDTH", "2048");
  url.searchParams.set("HEIGHT", "1024");
  url.searchParams.set("FORMAT", "image/jpeg");
  url.searchParams.set("TIME", time);

  try {
    let response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "CUPOLA-Earth-Experience/1.0" },
    });

    let source = "NASA GIBS";
    if (!response.ok) {
      response = await fetch(FALLBACK, { next: { revalidate: 86400 } });
      source = "Fallback Earth texture";
    }

    if (!response.ok) throw new Error("Satellite imagery unavailable");
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Cupola-Imagery-Date": time,
        "X-Cupola-Source": source,
      },
    });
  } catch {
    try {
      const fallback = await fetch(FALLBACK, { next: { revalidate: 86400 } });
      const body = await fallback.arrayBuffer();
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": fallback.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "X-Cupola-Source": "Fallback Earth texture",
        },
      });
    } catch {
      return NextResponse.json({ error: "Satellite imagery unavailable" }, { status: 503 });
    }
  }
}
