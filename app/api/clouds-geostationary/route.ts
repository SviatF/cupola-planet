import { NextRequest, NextResponse } from "next/server";

export const revalidate = 300;

type GeoSource = "goes-east" | "goes-west" | "himawari" | "meteosat";

const NASA_SOURCES: Record<Exclude<GeoSource, "meteosat">, { layer: string; label: string }> = {
  "goes-east": {
    layer: "GOES-East_ABI_Band13_Clean_Infrared",
    label: "GOES-EAST / ABI BAND 13 IR",
  },
  "goes-west": {
    layer: "GOES-West_ABI_Band13_Clean_Infrared",
    label: "GOES-WEST / ABI BAND 13 IR",
  },
  himawari: {
    layer: "Himawari_AHI_Band13_Clean_Infrared",
    label: "HIMAWARI / AHI BAND 13 IR",
  },
};

const MAX_GEO_FRAME_AGE_MINUTES = 90;
const EUMETSAT_WMS = "https://view.eumetsat.int/geoserver/wms";
const MTG_TITLE_CANDIDATES = [
  "FCI HRFI IR10.5 μm Image - MTG - 0 degree",
  "IR 10.5 - MTG - 0 degree",
  "IR 10.5 - MTG - 0 degrees",
  "GeoColour RGB - MTG - 0 degree",
  "Geo Colour RGB - MTG - 0 degree",
  "Geo Colour RGB - MTG - 0 degrees",
];

function unavailable(source: string, reason: string, extra: Record<string, string> = {}) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "public, s-maxage=60",
      "X-Cupola-Source": source,
      "X-Cupola-Data-Status": reason,
      ...extra,
    },
  });
}

function roundToTenMinutes(date: Date) {
  return new Date(Math.floor(date.getTime() / 600000) * 600000);
}

function isoNoMillis(date: Date) {
  return date.toISOString().replace(".000Z", "Z");
}

function nasaGibsUrl(layer: string, time: Date) {
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

  return "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?" + params.toString();
}

async function fetchFrame(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/png") && !contentType.startsWith("image/jpeg")) return null;

  const body = await response.arrayBuffer();
  if (body.byteLength < 2_000) return null;

  return { body, contentType };
}

function extractMtgLayer(xml: string) {
  // WMS Layers are nested. A non-greedy <Layer> regex can accidentally associate
  // a child's Title with its parent's Name/Dimension. Keep only direct fields.
  type LayerFields = { directXml: string };
  const stack: LayerFields[] = [];
  const layers: LayerFields[] = [];
  const tags = /<\/?(?:[\w.-]+:)?Layer\b[^>]*>/gi;
  let cursor = 0;
  let tag: RegExpExecArray | null;

  while ((tag = tags.exec(xml)) !== null) {
    if (stack.length) stack[stack.length - 1].directXml += xml.slice(cursor, tag.index);
    if (/^<\//.test(tag[0])) {
      const completed = stack.pop();
      if (completed) layers.push(completed);
    } else if (!/\/\s*>$/.test(tag[0])) {
      stack.push({ directXml: "" });
    }
    cursor = tags.lastIndex;
  }

  const field = (body: string, name: string) =>
    body.match(new RegExp("<(?:[\\w.-]+:)?" + name + "\\b[^>]*>([^<]*)<\\/(?:[\\w.-]+:)?" + name + ">", "i"))?.[1]?.trim() || null;

  for (const candidate of MTG_TITLE_CANDIDATES) {
    for (const layer of layers) {
      const title = field(layer.directXml, "Title");
      if (title?.toLowerCase() !== candidate.toLowerCase()) continue;
      const name = field(layer.directXml, "Name");
      if (!name) continue;

      const timeBlock = Array.from(
        layer.directXml.matchAll(/<(?:[\w.-]+:)?(?:Dimension|Extent)\b([^>]*)>([^<]*)<\/(?:[\w.-]+:)?(?:Dimension|Extent)>/gi),
      ).find((match) => /\bname\s*=\s*["']time["']/i.test(match[1]))?.[2] || "";

      const times = timeBlock
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .flatMap((value) => {
          if (!value.includes("/")) return [value];
          const parts = value.split("/");
          return parts.length >= 2 ? [parts[1]] : [];
        })
        .map((value) => ({ value, time: Date.parse(value) }))
        .filter((entry) => Number.isFinite(entry.time) && entry.time <= Date.now() + 5 * 60_000)
        .sort((a, b) => b.time - a.time);

      return { name, title, time: times[0]?.value ?? null };
    }
  }
  return null;
}

async function resolveMeteosat() {
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetCapabilities",
  });

  const response = await fetch(EUMETSAT_WMS + "?" + params.toString(), {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return null;
  const xml = await response.text();
  return extractMtgLayer(xml);
}

function eumetsatUrl(layer: string, time: string | null) {
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
  return EUMETSAT_WMS + "?" + params.toString();
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") as GeoSource | null;

  if (!source || ![...Object.keys(NASA_SOURCES), "meteosat"].includes(source)) {
    return NextResponse.json({ error: "Unknown geostationary source" }, { status: 400 });
  }

  if (source === "meteosat") {
    try {
      const resolved = await resolveMeteosat();
      if (!resolved) return unavailable("EUMETSAT MTG", "layer-not-found");

      // Do not silently present an old or undated frame as near-live.
      const observedAt = resolved.time ? Date.parse(resolved.time) : NaN;
      const ageMinutes = Number.isFinite(observedAt)
        ? Math.max(0, Math.round((Date.now() - observedAt) / 60000))
        : null;
      if (ageMinutes === null || ageMinutes > MAX_GEO_FRAME_AGE_MINUTES) {
        return unavailable("EUMETSAT MTG", ageMinutes === null ? "unknown-time" : "stale",
          { "X-Cupola-Age-Minutes": ageMinutes === null ? "unknown" : String(ageMinutes) });
      }

      const frame = await fetchFrame(eumetsatUrl(resolved.name, resolved.time));
      if (!frame) return unavailable("EUMETSAT MTG", "frame-unavailable");

      const frameTime = new Date(observedAt);

      return new NextResponse(frame.body, {
        status: 200,
        headers: {
          "Content-Type": frame.contentType,
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
          "X-Cupola-Source": "EUMETSAT MTG / " + resolved.title,
          "X-Cupola-Frame-Time": frameTime.toISOString(),
          "X-Cupola-Age-Minutes": String(ageMinutes),
          "X-Cupola-Data-Status": "observed",
          "X-Cupola-Cadence": "10m",
          "X-Cupola-Coverage": "Europe Africa Atlantic",
        },
      });
    } catch {
      return unavailable("EUMETSAT MTG", "upstream-error");
    }
  }

  const config = NASA_SOURCES[source as Exclude<GeoSource, "meteosat">];
  const base = roundToTenMinutes(new Date(Date.now() - 20 * 60 * 1000));

  let upstreamErrors = 0;
  let emptyFrames = 0;
  for (let step = 0; step < 18; step++) {
    const frameTime = new Date(base.getTime() - step * 10 * 60 * 1000);
    if (Date.now() - frameTime.getTime() > MAX_GEO_FRAME_AGE_MINUTES * 60000) break;

    try {
      const frame = await fetchFrame(nasaGibsUrl(config.layer, frameTime));
      if (!frame) { emptyFrames += 1; continue; }

      const ageMinutes = Math.max(0, Math.round((Date.now() - frameTime.getTime()) / 60000));

      return new NextResponse(frame.body, {
        status: 200,
        headers: {
          "Content-Type": frame.contentType,
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
          "X-Cupola-Source": config.label,
          "X-Cupola-Frame-Time": frameTime.toISOString(),
          "X-Cupola-Age-Minutes": String(ageMinutes),
          "X-Cupola-Data-Status": "observed",
          "X-Cupola-Cadence": "10m",
        },
      });
    } catch {
      upstreamErrors += 1;
      // Try the previous 10-minute slot.
    }
  }

  return unavailable(config.label, upstreamErrors > 0 && emptyFrames === 0 ? "upstream-error" : "frame-unavailable", {
    "X-Cupola-Empty-Frames": String(emptyFrames),
    "X-Cupola-Upstream-Errors": String(upstreamErrors),
  });
}
