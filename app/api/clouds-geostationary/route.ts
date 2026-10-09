import { buildCloudMaskFromInfraredPng } from "@/lib/earth/cloudMask";
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

// Verify every PNG chunk checksum, not only its declared MIME type.
function pngChunkCrcValid(bytes: Uint8Array, from: number, to: number, expected: number) {
  let crc = 0xffffffff;
  for (let i = from; i < to; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0) === expected;
}

// Inspect decoded PNG pixels, not HTTP status or compressed file size.
// Fail closed on unsupported formats so blank WMS placeholders are not called observed.
async function hasVisiblePngPixels(buffer: ArrayBuffer): Promise<boolean> {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 57 || signature.some((v, i) => bytes[i] !== v)) return false;

  const view = new DataView(buffer);
  let offset = 8;
  let width = 0, height = 0, colorType = -1, bitDepth = 0, interlace = -1;
  const parts: Uint8Array[] = [];
  let compressedSize = 0;
  let ended = false;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const start = offset + 8;
    if (length > bytes.length - start - 4) return false;
    if (!pngChunkCrcValid(bytes, offset + 4, start + length, view.getUint32(start + length))) return false;
    if (type === "IHDR") {
      if (length !== 13 || width !== 0) return false;
      width = view.getUint32(start);
      height = view.getUint32(start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    }
    if (type === "IDAT") {
      parts.push(bytes.subarray(start, start + length));
      compressedSize += length;
    }
    offset = start + length + 4; // CRC
    if (type === "IEND") { ended = true; break; }
  }

  // The near-live cloud overlays are 8-bit, non-interlaced RGBA PNGs.
  // Other modes need a separate decoder before being accepted.
  if (!ended || width < 256 || height < 128 || width * height > 4_194_304 ||
      bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0 || !parts.length) return false;

  if (offset !== bytes.length) return false;

  const packed = new Uint8Array(compressedSize);
  let cursor = 0;
  for (const part of parts) { packed.set(part, cursor); cursor += part.length; }

  try {
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate"));
    const raw = new Uint8Array(await new Response(stream).arrayBuffer());
    const channels = colorType === 6 ? 4 : 3;
    const stride = width * channels;
    if (raw.length !== (stride + 1) * height) return false;
    let previous = new Uint8Array(stride);
    let visible = 0;
    let samples = 0;
    const pixelCount = width * height;
    for (let y = 0; y < height; y++) {
      const rowStart = y * (stride + 1);
      const filter = raw[rowStart];
      if (filter > 4) return false;
      const row = new Uint8Array(stride);
      for (let x = 0; x < stride; x++) {
        const left = x >= channels ? row[x - channels] : 0;
        const up = previous[x];
        const upperLeft = x >= channels ? previous[x - channels] : 0;
        let predictor = 0;
        if (filter === 1) predictor = left;
        else if (filter === 2) predictor = up;
        else if (filter === 3) predictor = Math.floor((left + up) / 2);
        else if (filter === 4) {
          const p = left + up - upperLeft;
          const a = Math.abs(p - left), b = Math.abs(p - up), d = Math.abs(p - upperLeft);
          predictor = a <= b && a <= d ? left : b <= d ? up : upperLeft;
        }
        row[x] = (raw[rowStart + 1 + x] + predictor) & 255;
      }
      for (let x = 0; x < stride; x += channels * 4) {
        samples++;
        if (channels === 4 ? row[x + 3] > 8 : Math.max(row[x], row[x + 1], row[x + 2]) > 8) visible++;
      }
      previous = row;
    }
    // Avoid accepting a near-blank/error tile with only a handful of opaque pixels.
    return samples > 0 && visible >= Math.max(64, Math.floor(samples * 0.0005)) && pixelCount > 0;
  } catch {
    return false;
  }
}

async function fetchFrame(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/png")) return null;

  const body = await response.arrayBuffer();
  if (!(await hasVisiblePngPixels(body))) return null;

  return { body, contentType };
}

function extractMtgLayer(xml: string) {
  // The WMS XML contains nested layers. Time dimensions are sometimes on
  // parent layers and may use ISO intervals rather than enumerated instants.
  type Node = { direct: string; inheritedTime: string; inheritedDefault: string };
  type Candidate = { name: string; title: string; time: string; score: number; date: number };
  const stack: Node[] = [];
  const candidates: Candidate[] = [];
  const tags = /<\/?(?:[\w.-]+:)?Layer\b[^>]*>/gi;
  const field = (body: string, name: string) =>
    body.match(new RegExp("<(?:[\\w.-]+:)?" + name + "\\b[^>]*>([^<]*)<\\/(?:[\\w.-]+:)?" + name + ">", "i"))?.[1]?.trim() || "";
  const dimension = (body: string) => {
    const match = Array.from(body.matchAll(/<(?:[\w.-]+:)?(?:Dimension|Extent)\b([^>]*)>([^<]*)<\/(?:[\w.-]+:)?(?:Dimension|Extent)>/gi))
      .find(m => /\bname\s*=\s*["']time["']/i.test(m[1]));
    return {
      time: match?.[2]?.trim() || "",
      defaultTime: match?.[1]?.match(/\bdefault\s*=\s*["']([^"']+)/i)?.[1] || "",
    };
  };
  const newestTime = (raw: string, defaultValue: string) => {
    const values = [defaultValue, ...raw.split(",").map(part => part.trim()).flatMap(part => {
      if (!part.includes("/")) return [part];
      const interval = part.split("/");
      return interval.length >= 2 ? [interval[1]] : [];
    })];
    return values
      .map(value => ({ value, date: Date.parse(value) }))
      .filter(item => Number.isFinite(item.date) && item.date <= Date.now() + 5 * 60_000)
      .sort((a, b) => b.date - a.date)[0] ?? null;
  };
  const addCandidate = (node: Node) => {
    const title = field(node.direct, "Title");
    const name = field(node.direct, "Name");
    if (!name || !title) return;
    const titleLower = title.toLowerCase();
    const exact = MTG_TITLE_CANDIDATES.some(t => t.toLowerCase() === titleLower);
    const infrared = /(?:ir\s*10[.,]?5|ir10[.,]?5|hrfi.*ir)/i.test(title);
    const msg = /(?:msg|meteosat|mtg|fci)/i.test(title);
    const knownIrLayer = /^(?:mtg_fd:ir105_hrfi|msg_fes:ir108)$/i.test(name);
    if (!exact && !(infrared && msg) && !knownIrLayer) return;
    const own = dimension(node.direct);
    const observed = newestTime(own.time || node.inheritedTime, own.defaultTime || node.inheritedDefault);
    if (!observed) return;
    const age = Date.now() - observed.date;
    if (age > MAX_GEO_FRAME_AGE_MINUTES * 60000) return;
    candidates.push({ name, title, time: observed.value, date: observed.date,
      score: (knownIrLayer ? 20 : 0) + (exact ? 10 : 0) + (infrared ? 5 : 0) });
  };
  let cursor = 0;
  let tag: RegExpExecArray | null;
  while ((tag = tags.exec(xml)) !== null) {
    if (stack.length) stack[stack.length - 1].direct += xml.slice(cursor, tag.index);
    if (tag[0].startsWith("</")) {
      const node = stack.pop();
      if (node) addCandidate(node);
    } else if (!/\/\s*>$/.test(tag[0])) {
      const parent = stack[stack.length - 1];
      const parentDimension = parent ? dimension(parent.direct) : { time: "", defaultTime: "" };
      stack.push({ direct: "", inheritedTime: parentDimension.time || parent?.inheritedTime || "",
        inheritedDefault: parentDimension.defaultTime || parent?.inheritedDefault || "" });
    }
    cursor = tags.lastIndex;
  }
  candidates.sort((a, b) => b.date - a.date || b.score - a.score);
  return candidates.map(({ name, title, time }) => ({ name, title, time }));
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
  // Opt-in visual experiment. IR remains the default until GeoColor is
  // verified against satellite observations in the diagnostic preview.
  const product = request.nextUrl.searchParams.get("product") === "geocolor" ? "geocolor" : "infrared";

  if (!source || ![...Object.keys(NASA_SOURCES), "meteosat"].includes(source)) {
    return NextResponse.json({ error: "Unknown geostationary source" }, { status: 400 });
  }

  if (source === "meteosat") {
    try {
      const candidates = await resolveMeteosat();
      if (!candidates?.length) return unavailable("EUMETSAT MTG", "fresh-layer-not-found");

      // Try all fresh matched layers, not just the first advertised one.
      // Some EUMETView layers have valid metadata but return an empty GetMap.
      for (const resolved of candidates.slice(0, 6)) {
        const observedAt = Date.parse(resolved.time);
        if (!Number.isFinite(observedAt) || observedAt > Date.now() + 5 * 60_000 ||
            Date.now() - observedAt > MAX_GEO_FRAME_AGE_MINUTES * 60000) continue;
        const frame = await fetchFrame(eumetsatUrl(resolved.name, resolved.time)).catch(() => null);
        if (!frame) continue;
        const mask = await buildCloudMaskFromInfraredPng(frame.body).catch(() => null);
        if (!mask) continue;
        const ageMinutes = Math.max(0, Math.round((Date.now() - observedAt) / 60000));
        const frameTime = new Date(observedAt);

      return new NextResponse(mask, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Cupola-Cloud-Render": "white-alpha-mask",
          "X-Cupola-Source-Type": "infrared-processed",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
          "X-Cupola-Source": "EUMETSAT MTG / " + resolved.title,
          "X-Cupola-Frame-Time": frameTime.toISOString(),
          "X-Cupola-Age-Minutes": String(ageMinutes),
          "X-Cupola-Data-Status": "observed",
          "X-Cupola-Image-Validation": "png-crc-and-alpha",
          "X-Cupola-Cadence": "10m",
          "X-Cupola-Coverage": "Europe Africa Atlantic",
          "X-Cupola-Layer": resolved.name,
        },
      });      }
      return unavailable("EUMETSAT MTG", "fresh-frames-unavailable", {
        "X-Cupola-Fresh-Layer-Candidates": String(candidates.length),
      });
    } catch {
      return unavailable("EUMETSAT MTG", "upstream-error");
    }
  }

  const config = NASA_SOURCES[source as Exclude<GeoSource, "meteosat">];
  const geoColorLayers: Partial<Record<GeoSource, string>> = {
    "goes-east": "GOES-East_ABI_GeoColor",
    "goes-west": "GOES-West_ABI_GeoColor",
  };
  const requestedGeoColor = product === "geocolor" ? geoColorLayers[source] : undefined;
  const base = roundToTenMinutes(new Date(Date.now() - 20 * 60 * 1000));

  let upstreamErrors = 0;
  let emptyFrames = 0;
  let geoColorFetchFailed = 0;
  let geoColorMaskFailed = 0;
  for (let step = 0; step < 18; step++) {
    const frameTime = new Date(base.getTime() - step * 10 * 60 * 1000);
    if (Date.now() - frameTime.getTime() > MAX_GEO_FRAME_AGE_MINUTES * 60000) break;

    try {
      // GeoColor is tested only when explicitly selected. If the enhanced
      // image is absent/invalid, transparently fall back to the same-time IR.
      let candidate = requestedGeoColor
        ? await fetchFrame(nasaGibsUrl(requestedGeoColor, frameTime)) : null;
      if (requestedGeoColor && !candidate) geoColorFetchFailed++;
      let sourceType: "geocolor-experimental" | "infrared-processed" =
        candidate ? "geocolor-experimental" : "infrared-processed";
      let mask = candidate
        ? await buildCloudMaskFromInfraredPng(candidate.body, "geocolor") : null;
      if (requestedGeoColor && candidate && !mask) geoColorMaskFailed++;
      if (!mask) {
        candidate = await fetchFrame(nasaGibsUrl(config.layer, frameTime));
        if (!candidate) { emptyFrames += 1; continue; }
        sourceType = "infrared-processed";
        mask = await buildCloudMaskFromInfraredPng(candidate.body);
      }
      if (!mask) { emptyFrames += 1; continue; }

      const ageMinutes = Math.max(0, Math.round((Date.now() - frameTime.getTime()) / 60000));

      return new NextResponse(mask, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Cupola-Cloud-Render": "white-alpha-mask",
          "X-Cupola-Source-Type": sourceType,
          "X-Cupola-Requested-Product": product,
          "X-Cupola-Product-Fallback": requestedGeoColor && sourceType !== "geocolor-experimental" ? (geoColorMaskFailed ? "geocolor-mask-rejected" : "geocolor-frame-unavailable") : "none",
          "X-Cupola-GeoColor-Fetch-Failures": String(geoColorFetchFailed),
          "X-Cupola-GeoColor-Mask-Failures": String(geoColorMaskFailed),
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
          "X-Cupola-Source": config.label,
          "X-Cupola-Frame-Time": frameTime.toISOString(),
          "X-Cupola-Age-Minutes": String(ageMinutes),
          "X-Cupola-Data-Status": "observed",
          "X-Cupola-Image-Validation": "png-crc-and-alpha",
          "X-Cupola-Cadence": "10m",
        },
      });
    } catch {
      upstreamErrors += 1;
      // Try the previous 10-minute slot.
    }
  }

  return unavailable(config.label, upstreamErrors > 0 && emptyFrames === 0 ? "upstream-error" : "frame-unavailable", {
    "X-Cupola-Requested-Product": product,
    "X-Cupola-Product-Fallback": requestedGeoColor ? (geoColorMaskFailed ? "geocolor-mask-rejected" : "geocolor-frame-unavailable") : "none",
    "X-Cupola-GeoColor-Fetch-Failures": String(geoColorFetchFailed),
    "X-Cupola-GeoColor-Mask-Failures": String(geoColorMaskFailed),
    "X-Cupola-Empty-Frames": String(emptyFrames),
    "X-Cupola-Upstream-Errors": String(upstreamErrors),
  });
}
