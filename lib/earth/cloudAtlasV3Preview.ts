import {
  CLOUD_ATLAS_WIDTH as WIDTH,
  CLOUD_ATLAS_HEIGHT as HEIGHT,
  CLOUD_ATLAS_MAX_AGE_MS,
  type CloudAtlasFrames,
  type CloudAtlasSource,
} from "./cloudAtlas";

/**
 * V3 SATELLITE VISUAL PREVIEW — rendered on the existing 3D cloud shell.
 *
 * Sources are actual, timestamped satellite IR/WMS imagery processed into
 * white-alpha visualization masks by /api/clouds-geostationary. They are NOT
 * equivalent to validated GOES/Himawari/Meteosat L2 cloud-classification data.
 * The scientific V3 decoders remain separate until a live ingestion feed exists.
 *
 * Atlas RGBA: density, footprint confidence, dominant source, opaque.
 * Valid zero-density pixels (alpha=8 in source) are observed CLEAR, never no-data.
 * Missing pixels have zero confidence and cannot create invented cloud cover.
 */
const GEO: CloudAtlasSource[] = ["east", "west", "himawari", "meteosat", "iodc"];
const SIZE = WIDTH * HEIGHT;
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

function valid(data: Uint8ClampedArray, x: number, y: number): number {
  if (y < 0 || y >= HEIGHT) return 0;
  const pos = (y * WIDTH + ((x + WIDTH) % WIDTH)) * 4;
  return data[pos] >= 128 && data[pos + 3] >= 8 ? 1 : 0;
}

/** Longitude is periodic, latitude is not. Keep valid limb pixels,
 * softly lowering their blend weight without erasing the footprint. */
function footprintConfidence(data: Uint8ClampedArray, x: number, y: number): number {
  if (!valid(data, x, y)) return 0;
  const close = (
    valid(data, x - 2, y) + valid(data, x + 2, y) +
    valid(data, x, y - 2) + valid(data, x, y + 2)
  ) * 0.25;
  const far = (
    valid(data, x - 6, y) + valid(data, x + 6, y) +
    valid(data, x, y - 6) + valid(data, x, y + 6)
  ) * 0.25;
  return 0.16 + 0.44 * smooth(close) + 0.40 * smooth(far);
}

export function composeSatellitePreviewV3(
  frames: CloudAtlasFrames, now: number,
): HTMLCanvasElement | null {
  const inputs = GEO.flatMap((key, index) => {
    const frame = frames[key];
    if (!frame || !Number.isFinite(frame.time) ||
        frame.time > now + 5 * 60_000 ||
        now - frame.time > CLOUD_ATLAS_MAX_AGE_MS ||
        frame.image.width !== WIDTH || frame.image.height !== HEIGHT) return [];
    const age = Math.max(0, now - frame.time) / CLOUD_ATLAS_MAX_AGE_MS;
    return [{ key, index, time: frame.time, data: frame.image.data,
      freshness: 0.65 + 0.35 * (1 - age) }];
  });
  if (!inputs.length) return null;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const output = ctx.createImageData(WIDTH, HEIGHT);
  const pixels = output.data;
  const owners = new Uint32Array(GEO.length);
  let observed = 0;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const index = y * WIDTH + x;
      const offset = index * 4;
      let total = 0;
      let weightedDensity = 0;
      let dominantWeight = 0;
      let sourceIndex = -1;
      for (const frame of inputs) {
        const confidence = footprintConfidence(frame.data, x, y);
        if (confidence === 0) continue;
        const weight = confidence * frame.freshness;
        // This is a *visual* IR-derived cloud score, not optical depth.
        const alpha = frame.data[offset + 3];
        const density = Math.pow(Math.max(0, Math.min(1, (alpha - 8) / 205)), 1.10) * 0.80;
        total += weight;
        weightedDensity += weight * density;
        if (weight > dominantWeight) {
          dominantWeight = weight;
          sourceIndex = frame.index;
        }
      }
      const coverage = Math.min(1, total);
      pixels[offset] = total ? Math.round(255 * weightedDensity / total) : 0;
      pixels[offset + 1] = Math.round(255 * coverage);
      pixels[offset + 2] = sourceIndex < 0 ? 0 : Math.round((sourceIndex + 1) * 255 / (GEO.length + 1));
      pixels[offset + 3] = 255;
      if (coverage > 0.03) observed++;
      if (sourceIndex >= 0) owners[sourceIndex]++;
    }
  }
  ctx.putImageData(output, 0, 0);
  canvas.dataset.engine = "v3-satellite-preview";
  canvas.dataset.observedCoverage = (observed / SIZE).toFixed(3);
  canvas.dataset.observationTime = new Date(Math.max(...inputs.map(s => s.time))).toISOString();
  canvas.dataset.sources = inputs.map(s => s.key).join(",");
  canvas.dataset.products = inputs.map(s => s.key + ":infrared-visual").join(",");
  canvas.dataset.sourceCoverage = GEO.map((key, index) =>
    key + ":" + (owners[index] * 100 / SIZE).toFixed(2) + "%"
  ).join(",");
  return canvas;
}
