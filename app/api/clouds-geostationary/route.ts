import { NextRequest, NextResponse } from "next/server";

export const revalidate = 300;

type GeoSource = "goes-east" | "goes-west" | "himawari";

const SOURCES: Record<GeoSource, { layer: string; label: string }> = {
  "goes-east": {
    layer: "GOES-East_ABI_GeoColor",
    label: "GOES-EAST / ABI",
  },
  "goes-west": {
    layer: "GOES-West_ABI_GeoColor",
    label: "GOES-WEST / ABI",
  },
  himawari: {
    layer: "Himawari_AHI_Band3_Red_Visible_1km",
    label: "HIMAWARI / AHI",
  },
};

function roundToTenMinutes(date: Date) {
  return new Date(Math.floor(date.getTime() / 600000) * 600000);
}

function isoNoMillis(date: Date) {
  return date.toISOString().replace(".000Z", "Z");
}

function gibsUrl(layer: string, time: Date) {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    LAYERS: layer,
    SRS: "EPSG:4326",
    STYLES: "",
    WIDTH: "2048",
    HEIGHT: "1024",
    BBOX: "-180,-90,180,90",
    TIME: isoNoMillis(time),
  });

  return "https://gibs.earthdata.nasa.gov/wms/epsg4326/nrt/wms.cgi?" + params.toString();
}

async function fetchFrame(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;

  const body = await response.arrayBuffer();
  if (body.byteLength < 40_000) return null;

  return { body, contentType };
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") as GeoSource | null;
  if (!source || !SOURCES[source]) {
    return NextResponse.json({ error: "Unknown geostationary source" }, { status: 400 });
  }

  const config = SOURCES[source];
  const base = roundToTenMinutes(new Date(Date.now() - 20 * 60 * 1000));

  // Walk backwards up to three hours. This keeps the feed near-live while
  // tolerating normal propagation delays in the upstream imagery service.
  for (let step = 0; step < 18; step++) {
    const frameTime = new Date(base.getTime() - step * 10 * 60 * 1000);

    try {
      const frame = await fetchFrame(gibsUrl(config.layer, frameTime));
      if (!frame) continue;

      const ageMinutes = Math.max(0, Math.round((Date.now() - frameTime.getTime()) / 60000));

      return new NextResponse(frame.body, {
        status: 200,
        headers: {
          "Content-Type": frame.contentType,
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
          "X-Cupola-Source": config.label,
          "X-Cupola-Frame-Time": frameTime.toISOString(),
          "X-Cupola-Age-Minutes": String(ageMinutes),
          "X-Cupola-Cadence": "10m",
        },
      });
    } catch {
      // Try the previous 10-minute slot.
    }
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
      "X-Cupola-Source": config.label,
    },
  });
}
