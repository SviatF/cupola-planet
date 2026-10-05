import { NextResponse } from "next/server";

export const revalidate = 600;

const BASE =
  "https://nowcoast.noaa.gov/geoserver/observations/lightning_detection/ows";
const LAYER = "ldn_lightning_strike_density";
const STYLE = "lightning_density";

function latestObservationTime(xml: string) {
  const values = Array.from(
    xml.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g),
    (match) => match[0],
  )
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.time) && entry.time <= Date.now() + 5 * 60_000)
    .sort((a, b) => b.time - a.time);

  return values[0]?.value ?? null;
}

async function fetchCapabilities() {
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetCapabilities",
  });

  const response = await fetch(BASE + "?" + params.toString(), {
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return null;
  const xml = await response.text();
  if (!xml.includes(LAYER)) return null;
  return xml;
}

async function fetchImage(time: string | null) {
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers: LAYER,
    styles: STYLE,
    srs: "EPSG:4326",
    bbox: "-180,-90,180,90",
    width: "2048",
    height: "1024",
    format: "image/png",
    transparent: "true",
  });
  if (time) params.set("time", time);

  const response = await fetch(BASE + "?" + params.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;

  const body = await response.arrayBuffer();
  if (body.byteLength < 5_000) return null;
  return { body, contentType };
}

export async function GET() {
  try {
    const capabilities = await fetchCapabilities();
    const observationTime = capabilities ? latestObservationTime(capabilities) : null;
    const image = await fetchImage(observationTime);

    if (!image) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
          "X-Cupola-Source": "NOAA nowCOAST lightning density",
        },
      });
    }

    const ageMinutes = observationTime
      ? Math.max(0, Math.round((Date.now() - Date.parse(observationTime)) / 60000))
      : null;

    return new NextResponse(image.body, {
      status: 200,
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
        "X-Cupola-Source": "NOAA/NWS nowCOAST lightning density",
        "X-Cupola-Observation-Time": observationTime || "default",
        "X-Cupola-Age-Minutes": ageMinutes == null ? "unknown" : String(ageMinutes),
        "X-Cupola-Window": "15m",
      },
    });
  } catch {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        "X-Cupola-Source": "NOAA nowCOAST lightning density",
      },
    });
  }
}
