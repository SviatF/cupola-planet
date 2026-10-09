/**
 * Atomic equirectangular satellite cloud atlas.
 * Incoming WMS images are already EPSG:4326 world canvases (NOT raw GOES
 * fixed-grid scans). Never paste raw geostationary scan coordinates here.
 *
 * Atlas channels: R = cloud density, G = coverage confidence, B = source id,
 * A = 255. Density 0 with confidence > 0 is observed clear sky. Confidence
 * 0 means no satellite observation, so the shader uses its MODIS fallback.
 */
export const CLOUD_ATLAS_WIDTH = 2048;
export const CLOUD_ATLAS_HEIGHT = 1024;
export const CLOUD_ATLAS_MAX_AGE_MS = 90 * 60 * 1000;

export type CloudAtlasSource = "east" | "west" | "himawari" | "meteosat";
export type CloudAtlasFrame = { image: ImageData; time: number };
export type CloudAtlasQuality = { valid: boolean; observedFraction: number; reason: string };
export type CloudAtlasFrames = Partial<Record<CloudAtlasSource, CloudAtlasFrame>>;

const sources: CloudAtlasSource[] = ["east", "west", "himawari", "meteosat"];
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
    if (d[p + 3] >= 8 && d[p] >= 128) observed++;
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
      distance[p] = data[p * 4] >= 128 && data[p * 4 + 3] >= 3 ? 96 : 0;
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
  // Avoid a patchwork of clouds photographed at widely different times.
  // Older scans remain cached, but stale relative to the newest observation
  // contribute no pixels until updated. Missing regions use NRT baseline.
  const latest = Math.max(...sources.map(key => frames[key]?.time ?? 0));
  const maxSourceSkewMs = 35 * 60_000;
  const valid = sources.flatMap((key, index) => {
    const frame = frames[key];
    if (!frame || frame.time > now + 5 * 60_000 || now - frame.time > CLOUD_ATLAS_MAX_AGE_MS || latest - frame.time > maxSourceSkewMs ||
        frame.image.width !== CLOUD_ATLAS_WIDTH || frame.image.height !== CLOUD_ATLAS_HEIGHT) return [];
    return [{ index, data: frame.image.data, distance: footprintDistance(frame.image.data),
      freshness: 0.72 + 0.28 * (1 - Math.max(0, now - frame.time) / CLOUD_ATLAS_MAX_AGE_MS) }];
  });
  if (!valid.length) return null;

  const canvas = document.createElement("canvas");
  canvas.width = CLOUD_ATLAS_WIDTH; canvas.height = CLOUD_ATLAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(CLOUD_ATLAS_WIDTH, CLOUD_ATLAS_HEIGHT);
  const out = image.data;
  for (let p = 0; p < SIZE; p++) {
    let total = 0, density = 0, best = 0, source = 0;
    for (const frame of valid) {
      const dist = frame.distance[p];
      if (dist === 0) continue;
      // Missing tile / scan-edge pixels must fade, never replace baseline.
      // Only the confidence fades at the satellite edge; cloud density does not.
      const weight = fade(dist / 44) * frame.freshness;
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
    const o = p * 4;
    out[o] = total > 0 ? Math.round(255 * density / total) : 0;
    // Conservative confidence: retain the baseline in overlap and doubtful
    // areas instead of completely replacing it with contrasting IR products.
    out[o + 1] = Math.round(255 * 0.68 * fade(Math.min(1, total)));
    out[o + 2] = source * 48;
    out[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
