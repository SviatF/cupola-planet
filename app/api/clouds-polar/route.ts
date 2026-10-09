import { NextResponse } from "next/server";

export const revalidate = 1800;

// Polar VIIRS is a DAILY swath mosaic, never a 10-minute live scan.
// These are false-colour composites: snow/ice tends toward cyan while
// clouds tend toward neutral white. A client-side, conservative mask is
// used only at high latitudes, not as a replacement Earth texture.
const LAYERS = [
  "VIIRS_NOAA21_CorrectedReflectance_BandsM11-I2-I1",
  "VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1",
  "VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1",
];

function urlFor(layer: string, date: string) {
  const params = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetMap",
    FORMAT: "image/jpeg", TRANSPARENT: "false", LAYERS: layer,
    SRS: "EPSG:4326", STYLES: "", WIDTH: "2048", HEIGHT: "1024",
    BBOX: "-180,-90,180,90", TIME: date,
  });
  return "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?" + params;
}

export async function GET() {
  const now = Date.now();
  // Avoid pretending that a date-only mosaic supplies a per-pixel
  // acquisition timestamp. Never fetch historic 'fallback' days.
  for (let ageDays = 0; ageDays <= 1; ageDays++) {
    const day = new Date(now - ageDays * 86400000).toISOString().slice(0, 10);
    for (const layer of LAYERS) {
      try {
        const response = await fetch(urlFor(layer, day), {
          signal: AbortSignal.timeout(12000),
          next: { revalidate: 1800 },
        });
        if (!response.ok || !(response.headers.get("content-type") || "").startsWith("image/jpeg")) continue;
        const body = await response.arrayBuffer();
        if (body.byteLength < 35000 || body.byteLength > 14_000_000) continue;
        return new NextResponse(body, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, s-maxage=1800",
            "X-Cupola-Source": "NASA GIBS " + layer,
            "X-Cupola-Frame-Time": day + "T00:00:00.000Z",
            "X-Cupola-Source-Type": "viirs-daily-mosaic",
            "X-Cupola-Temporal-Precision": "date-only",
            "X-Cupola-Imagery-Date": day,
          },
        });
      } catch {
        // Try another sensor or recent day.
      }
    }
  }
  return new NextResponse(null, {
    status: 204,
    headers: { "X-Cupola-Data-Status": "no-recent-polar-mosaic", "Cache-Control": "public, s-maxage=300" },
  });
}
