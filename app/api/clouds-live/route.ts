import { NextResponse } from "next/server";

export const revalidate = 3600;

const FALLBACK =
  "https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png";

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function gibsUrl(date: string, layer: string) {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    FORMAT: "image/jpeg",
    TRANSPARENT: "false",
    LAYERS: layer,
    SRS: "EPSG:4326",
    STYLES: "",
    WIDTH: "2048",
    HEIGHT: "1024",
    BBOX: "-180,-90,180,90",
    TIME: date,
  });

  return "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?" + params.toString();
}

async function fetchImage(url: string, timeout = 12000) {
  const response = await fetch(url, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;

  const body = await response.arrayBuffer();

  // A real global GIBS frame is much larger than an XML/error/blank response.
  if (body.byteLength < 50_000) return null;

  return {
    body,
    contentType,
  };
}

export async function GET() {
  const now = new Date();

  // Aqua tends to provide a later daily pass. Terra is the fallback.
  const layers = [
    "MODIS_Aqua_CorrectedReflectance_TrueColor",
    "MODIS_Terra_CorrectedReflectance_TrueColor",
  ];

  for (let ageDays = 0; ageDays <= 4; ageDays++) {
    const date = new Date(now.getTime() - ageDays * 86400000);
    const imageryDate = ymd(date);

    for (const layer of layers) {
      try {
        const result = await fetchImage(gibsUrl(imageryDate, layer));
        if (!result) continue;

        return new NextResponse(result.body, {
          status: 200,
          headers: {
            "Content-Type": result.contentType,
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
            "X-Cupola-Source": "NASA GIBS " + layer,
            "X-Cupola-Imagery-Date": imageryDate,
            "X-Cupola-Age-Days": String(ageDays),
          },
        });
      } catch {
        // Try the next date/layer.
      }
    }
  }

  try {
    const fallback = await fetch(FALLBACK, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(10000),
    });

    if (fallback.ok) {
      const body = await fallback.arrayBuffer();
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": fallback.headers.get("content-type") || "image/png",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "X-Cupola-Source": "STATIC CLOUD FALLBACK",
          "X-Cupola-Imagery-Date": "fallback",
        },
      });
    }
  } catch {}

  return new NextResponse(null, { status: 204 });
}
