import { NextResponse } from "next/server";
import { lightningLayerTime } from "@/lib/earth/lightningObservation";

export const revalidate = 300;

const BASE = "https://nowcoast.noaa.gov/geoserver/observations/lightning_detection/ows";
const LAYER = "ldn_lightning_strike_density";
const STYLE = "lightning_density";
const MAX_AGE_MINUTES = 90;

function absent(reason: string) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "public, s-maxage=90, stale-while-revalidate=180",
      "X-Cupola-Source": "NOAA nowCOAST lightning strike density",
      "X-Cupola-Data-Status": reason,
    },
  });
}

export async function GET() {
  try {
    const capabilities = new URLSearchParams({
      service: "WMS", version: "1.1.1", request: "GetCapabilities",
    });
    const metadata = await fetch(BASE + "?" + capabilities, {
      next: { revalidate: 300 }, signal: AbortSignal.timeout(12000),
    });
    if (!metadata.ok) return absent("capabilities-unavailable");

    const observationTime = lightningLayerTime(
      await metadata.text(), LAYER, MAX_AGE_MINUTES,
    );
    if (!observationTime) return absent("no-recent-observation-timestamp");

    const params = new URLSearchParams({
      service: "WMS", version: "1.1.1", request: "GetMap",
      layers: LAYER, styles: STYLE, srs: "EPSG:4326",
      bbox: "-180,-90,180,90", width: "2048", height: "1024",
      format: "image/png", transparent: "true", time: observationTime,
    });
    const response = await fetch(BASE + "?" + params, {
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok || !(response.headers.get("content-type") || "").startsWith("image/png")) {
      return absent("lightning-frame-unavailable");
    }
    const body = await response.arrayBuffer();
    const bytes = new Uint8Array(body);
    if (body.byteLength < 100 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) {
      return absent("invalid-lightning-png");
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=90, stale-while-revalidate=180",
        "X-Cupola-Source": "NOAA nowCOAST observed lightning density",
        "X-Cupola-Data-Status": "observed-5min-to-90min",
        "X-Cupola-Observation-Time": observationTime,
        "X-Cupola-Age-Minutes": String(Math.max(0, Math.round((Date.now() - Date.parse(observationTime)) / 60000))),
        "X-Cupola-Window": "15m",
      },
    });
  } catch {
    return absent("noaa-upstream-error");
  }
}
