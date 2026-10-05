import { NextResponse } from "next/server";

export const revalidate = 300;

const WMS = "https://view.eumetsat.int/geoserver/wms";
const TARGET_TITLE = "LI Accumulated Flash Area - MTG - 0 degree";

function extractLayer(xml: string) {
  const layerBlocks = Array.from(
    xml.matchAll(/<Layer\b[^>]*>([\s\S]*?)<\/Layer>/gi),
    (m) => m[1],
  );

  for (const block of layerBlocks) {
    if (!block.includes(TARGET_TITLE)) continue;

    const name =
      block.match(/<Name>([^<]+)<\/Name>/i)?.[1]?.trim() ||
      block.match(/<[^:>]+:Name>([^<]+)<\/[^:>]+:Name>/i)?.[1]?.trim();

    if (!name) continue;

    const timeBlock =
      block.match(/<(?:Dimension|Extent)\b[^>]*name=["']time["'][^>]*>([^<]+)<\/(?:Dimension|Extent)>/i)?.[1] ||
      "";

    const candidates = timeBlock
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .flatMap((value) => {
        if (!value.includes("/")) return [value];
        const parts = value.split("/");
        return parts.length >= 2 ? [parts[1]] : [];
      })
      .map((value) => ({ value, time: Date.parse(value) }))
      .filter((entry) => Number.isFinite(entry.time) && entry.time <= Date.now() + 5 * 60_000)
      .sort((a, b) => b.time - a.time);

    return { name, time: candidates[0]?.value ?? null };
  }

  return null;
}

async function fetchCapabilities() {
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetCapabilities",
  });

  const response = await fetch(WMS + "?" + params.toString(), {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return null;
  const xml = await response.text();
  if (!xml.includes(TARGET_TITLE)) return null;
  return xml;
}

async function fetchImage(layer: string, time: string | null) {
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers: layer,
    styles: "",
    srs: "EPSG:4326",
    bbox: "-180,-90,180,90",
    width: "2048",
    height: "1024",
    format: "image/png",
    transparent: "true",
  });

  if (time) params.set("time", time);

  const response = await fetch(WMS + "?" + params.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;

  const body = await response.arrayBuffer();
  if (body.byteLength < 4_000) return null;

  return { body, contentType };
}

export async function GET() {
  try {
    const capabilities = await fetchCapabilities();
    if (!capabilities) return new NextResponse(null, { status: 204 });

    const resolved = extractLayer(capabilities);
    if (!resolved) return new NextResponse(null, { status: 204 });

    const image = await fetchImage(resolved.name, resolved.time);
    if (!image) return new NextResponse(null, { status: 204 });

    const ageMinutes = resolved.time
      ? Math.max(0, Math.round((Date.now() - Date.parse(resolved.time)) / 60000))
      : null;

    return new NextResponse(image.body, {
      status: 200,
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1200",
        "X-Cupola-Source": "EUMETSAT MTG Lightning Imager",
        "X-Cupola-Observation-Time": resolved.time || "latest",
        "X-Cupola-Age-Minutes": ageMinutes == null ? "unknown" : String(ageMinutes),
        "X-Cupola-Coverage": "Europe Africa Atlantic Middle East",
      },
    });
  } catch {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        "X-Cupola-Source": "EUMETSAT MTG Lightning Imager",
      },
    });
  }
}
