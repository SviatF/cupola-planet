/**
 * Atomic equirectangular satellite cloud atlas.
 * Incoming WMS images are already EPSG:4326 world canvases (NOT raw GOES
 * fixed-grid scans). Never paste raw geostationary scan coordinates here.
 *
 * Atlas channels: R = cloud density, G = coverage confidence, B = source id,
 * A = 255. Density 0 with confidence > 0 is observed clear sky. Confidence
 * 0 means no satellite observation: strict LIVE-only rendering leaves it clear.
 */
export const CLOUD_ATLAS_WIDTH = 2048;
export const CLOUD_ATLAS_HEIGHT = 1024;
export const CLOUD_ATLAS_MAX_AGE_MS = 90 * 60 * 1000;

export type CloudAtlasSource = "east" | "west" | "himawari" | "meteosat" | "iodc" | "polar";
export type CloudAtlasFrame = { image: ImageData; time: number; product: "geocolor" | "infrared" | "viirs-daily" };
export type CloudAtlasQuality = { valid: boolean; observedFraction: number; reason: string };
export type CloudAtlasFrames = Partial<Record<CloudAtlasSource, CloudAtlasFrame>>;

const sources: CloudAtlasSource[] = ["east", "west", "himawari", "meteosat", "iodc", "polar"];
const fade = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const SIZE = CLOUD_ATLAS_WIDTH * CLOUD_ATLAS_HEIGHT;

/** Resample each source consistently into our shared EPSG:4326 canvas. */
export async function decodeCloudFrame(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = CLOUD_ATLAS_WIDTH; canvas.height = CLOUD_ATLAS_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Cloud atlas needs Canvas2D");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally { bitmap.close(); }
}

/** Conservative polar-only VIIRS false-colour interpretation.
 * NASA daily mosaic has date precision only and cannot be honestly
 * labelled as a 10-minute observation. Use white/nearly neutral pixels as
 * probable clouds; false-colour cyan snow/ice and missing black are excluded.
 * Nothing outside absolute 67° latitude is treated as polar coverage.
 */
export async function decodePolarViirsFrame(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = CLOUD_ATLAS_WIDTH;
    canvas.height = CLOUD_ATLAS_HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Polar clouds require Canvas2D");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = image.data;
    for (let y = 0; y < image.height; y++) {
      const latitude = Math.abs(90 - 180 * (y + 0.5) / image.height);
      const polarOnly = latitude >= 67;
      for (let x = 0; x < image.width; x++) {
        const p = (y * image.width + x) * 4;
        const r = d[p], g = d[p + 1], b = d[p + 2];
        // Pure white/black JPEG background and no-data should not claim coverage.
        const blank = (r < 8 && g < 8 && b < 8) ||
          (r > 250 && g > 250 && b > 250);
        if (!polarOnly || blank) {
          d[p] = d[p + 1] = d[p + 2] = d[p + 3] = 0;
          continue;
        }
        const brightness = (r + g + b) / 3;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        // Reject cyan ice/snow false-colour returns (blue and green dominant).
        const icy = b > r + 25 && g > r + 12;
        const neutrality = Math.max(0, 1 - spread / 76);
        const brightnessScore = Math.max(0, Math.min(1, (brightness - 115) / 125));
        const density = icy ? 0 : Math.pow(neutrality * brightnessScore, 1.35);
        d[p] = d[p + 1] = d[p + 2] = 255;
        d[p + 3] = Math.round(8 + density * 205);
      }
    }
    return image;
  } finally { bitmap.close(); }
}

/** Fail closed on incomplete/empty/placeholder satellite scans.
 * A dark infrared scene can be legitimate, so rejection uses decoded
 * coverage and tile integrity, not the apparent amount of cloud.
 */
export function validateCloudFrame(image: ImageData): CloudAtlasQuality {
  if (image.width !== CLOUD_ATLAS_WIDTH || image.height !== CLOUD_ATLAS_HEIGHT)
    return { valid: false, observedFraction: 0, reason: "unexpected geometry" };
  const d = image.data;
  let observed = 0, samples = 0;
  const step = 8;
  for (let y = 4; y < image.height; y += step) for (let x = 4; x < image.width; x += step) {
    samples++;
    const p = (y * image.width + x) * 4;
    if (d[p + 3] > 0 && d[p] >= 128) observed++;
  }
  const fraction = observed / Math.max(1, samples);
  return { valid: fraction >= 0.012, observedFraction: fraction,
    reason: fraction >= 0.012 ? "observed" : "missing or empty coverage" };
}

/** Distances from the nearest missing observation, capped at 96 atlas pixels. */
function footprintDistance(data: Uint8ClampedArray): Uint8Array {
  const { width: w, height: h } = { width: CLOUD_ATLAS_WIDTH, height: CLOUD_ATLAS_HEIGHT };
  const distance = new Uint8Array(SIZE);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const p = base + x;
      distance[p] = data[p * 4] >= 128 && data[p * 4 + 3] > 0 ? 96 : 0;
      // The equirectangular texture wraps across ±180°, so longitude is
      // NOT an image boundary. Only poles may be faded at the canvas edge.
      if (y === 0 || y === h - 1) distance[p] = Math.min(distance[p], 1);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
    if (y) distance[i] = Math.min(distance[i], distance[i - w] + 1);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (x + 1 < w) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
    if (y + 1 < h) distance[i] = Math.min(distance[i], distance[i + w] + 1);
  }
  return distance;
}

export function composeCloudAtlas(frames: CloudAtlasFrames, now: number): HTMLCanvasElement | null {
  // Different geostationary satellites publish on different schedules.
  // Do not remove an entire region just because another satellite has a newer
  // image: each frame is evaluated against its own strictly bounded age.
  const latest = Math.max(...sources.map(key => frames[key]?.time ?? 0));
  const valid = sources.flatMap((key, index) => {
    const frame = frames[key];
    if (!frame || frame.time > now + 5 * 60_000 || now - frame.time > (key === "polar" ? 48 * 60 * 60 * 1000 : CLOUD_ATLAS_MAX_AGE_MS) ||
        frame.image.width !== CLOUD_ATLAS_WIDTH || frame.image.height !== CLOUD_ATLAS_HEIGHT) return [];
    return [{ index, data: frame.image.data, distance: footprintDistance(frame.image.data),
      freshness: key === "polar" ? 0.70 : 0.72 + 0.28 * (1 - Math.max(0, now - frame.time) / CLOUD_ATLAS_MAX_AGE_MS) }];
  });
  if (!valid.length) return null;

  const canvas = document.createElement("canvas");
  canvas.width = CLOUD_ATLAS_WIDTH; canvas.height = CLOUD_ATLAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(CLOUD_ATLAS_WIDTH, CLOUD_ATLAS_HEIGHT);
  const out = image.data;
  let coveredPixels = 0;
  for (let p = 0; p < SIZE; p++) {
    let total = 0, density = 0, best = 0, source = 0;
    for (const frame of valid) {
      const dist = frame.distance[p];
      if (dist === 0) continue;
      // Missing scan-edge pixels fade to transparent, never to synthetic clouds.
      // Only the confidence fades at the satellite edge; cloud density does not.
      // Keep valid edge observations: feather a narrow 6-pixel zone rather
      // than discarding tens of pixels at each geostationary footprint.
      const weight = fade(dist / 6) * frame.freshness;
      if (weight < 0.001) continue;
      const raw = frame.data[p * 4 + 3] / 255;
      // Alpha 8/255 represents measured clear, not no-data.
      // Source alpha encodes heuristic IR cloud density; it is not coverage.
      // Preserve texture detail independently of the seam confidence.
      const normalized = Math.max(0, Math.min(1, (raw - 8 / 255) / 0.72));
      const signal = Math.pow(normalized, 1.16) * 0.78;
      total += weight;
      density += weight * signal;
      if (weight > best) { best = weight; source = frame.index + 1; }
    }
    if (total > 0.05) coveredPixels++;
    const o = p * 4;
    out[o] = total > 0 ? Math.round(255 * density / total) : 0;
    // Encode independently measured coverage, not baseline opacity.
    out[o + 1] = Math.round(255 * Math.min(1, total));
    out[o + 2] = source * 48;
    out[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // Client telemetry only. Coverage refers to the atlas observation footprint,
  // not cloud percentage; never present it as a meteorological cloud statistic.
  canvas.dataset.observedCoverage = (coveredPixels / SIZE).toFixed(3);
  canvas.dataset.observationTime = new Date(latest).toISOString();
  canvas.dataset.sources = valid.map(item => sources[item.index]).join(",");
  canvas.dataset.products = valid.map(item => `${sources[item.index]}:${frames[sources[item.index]]?.product ?? "unknown"}`).join(",");
  canvas.dataset.sourceCoverage = valid.map(item => {
    let observed = 0;
    for (let p = 0; p < SIZE; p += 64) if (item.distance[p] > 0) observed++;
    return `${sources[item.index]}:${(100 * observed / Math.ceil(SIZE / 64)).toFixed(1)}%`;
  }).join(",");
  return canvas;
}
