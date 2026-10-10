/**
 * Cloud Engine V3 — scientific observation contract.
 *
 * Unlike the legacy IR-colour heuristic, observations must carry explicit
 * cloud classifications, per-pixel quality and coordinates. No guesswork
 * from RGB palettes, no synthetic filling of unobserved areas.
 *
 * Decoding NOAA ABI-L2-ACMF / NASA VIIRS CLDMSK netCDF swaths should occur
 * in an upstream ingestion worker, NOT inside the browser's WebGL renderer.
 */
export type CloudScienceSource =
  | "goes-east-acmf" | "goes-west-acmf"
  | "viirs-noaa21-cldmsk" | "viirs-noaa20-cldmsk" | "viirs-snpp-cldmsk";

export type ClassifiedPixel = {
  /** Longitude [-180, 180] and latitude [-90, 90] in WGS84 degrees. */
  lon: number;
  lat: number;
  /** 0 confidently clear, 1 probably clear, 2 probably cloudy, 3 cloudy. */
  class: 0 | 1 | 2 | 3;
  /** Flag produced by the corresponding science product decoder. */
  valid: boolean;
  /** Product-specific quality normalized by the decoder, 0..1. */
  quality: number;
  /** UTC acquisition timestamp for THIS pixel, not just mosaic publication. */
  observedAtMs: number;
};

export type ClassifiedSwath = {
  source: CloudScienceSource;
  product: "ABI-L2-ACMF" | "CLDMSK_L2";
  /** Unique granule reference for audit and duplicate rejection. */
  granuleId: string;
  pixels: ClassifiedPixel[];
};

export const SCIENCE_CLOUD_WIDTH = 2048;
export const SCIENCE_CLOUD_HEIGHT = 1024;
export const SCIENCE_GEO_MAX_AGE_MS = 90 * 60_000;
export const SCIENCE_POLAR_MAX_AGE_MS = 24 * 60 * 60_000;

export type ScienceCloudAtlas = {
  width: number;
  height: number;
  /** RGBA: R=cloud probability, G=coverage confidence, B=age band, A=255. */
  rgba: Uint8ClampedArray;
  /** Per-pixel acquisition time. 0=missing. */
  acquiredMs: Float64Array;
  observedCoverage: number;
  countsBySource: Partial<Record<CloudScienceSource, number>>;
};

const probability: Record<ClassifiedPixel["class"], number> = { 0: 0, 1: 0.18, 2: 0.72, 3: 1 };
const isPolarSource = (source: CloudScienceSource) => source.startsWith("viirs-");
const validTime = (source: CloudScienceSource, time: number, now: number) => {
  const maxAge = isPolarSource(source) ? SCIENCE_POLAR_MAX_AGE_MS : SCIENCE_GEO_MAX_AGE_MS;
  return Number.isFinite(time) && time <= now + 5 * 60_000 && now - time <= maxAge;
};
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Pure projection and overlap resolver. No DOM, shaders or implicit fallbacks.
 * Frames are screened per pixel and the highest quality *recent* observation
 * wins. Tie-breaking is deterministic by acquisition time.
 */
export function composeScientificCloudAtlas(
  swaths: readonly ClassifiedSwath[], now: number,
  width = SCIENCE_CLOUD_WIDTH, height = SCIENCE_CLOUD_HEIGHT,
): ScienceCloudAtlas {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width * height > 4_194_304) {
    throw new Error("Invalid scientific cloud atlas dimensions");
  }
  const size = width * height;
  const rgba = new Uint8ClampedArray(size * 4);
  const acquiredMs = new Float64Array(size);
  const bestScore = new Float32Array(size);
  const bestSource = new Array<CloudScienceSource | undefined>(size);
  for (const swath of swaths) {
    if (!swath.granuleId || !Array.isArray(swath.pixels)) continue;
    if (swath.source.startsWith("goes-") !== (swath.product === "ABI-L2-ACMF")) continue;
    for (const sample of swath.pixels) {
      if (!sample.valid || !Number.isFinite(sample.lat) || !Number.isFinite(sample.lon) ||
          !Number.isFinite(sample.quality) || sample.quality < 0.5 ||
          sample.lat < -90 || sample.lat > 90 || sample.lon < -180 || sample.lon > 180 ||
          !validTime(swath.source, sample.observedAtMs, now) ||
          !Object.prototype.hasOwnProperty.call(probability, sample.class)) continue;
      const x = Math.min(width - 1, Math.floor((sample.lon + 180) / 360 * width));
      const y = Math.min(height - 1, Math.floor((90 - sample.lat) / 180 * height));
      const index = y * width + x;
      const age = Math.max(0, now - sample.observedAtMs);
      const maxAge = isPolarSource(swath.source) ? SCIENCE_POLAR_MAX_AGE_MS : SCIENCE_GEO_MAX_AGE_MS;
      const score = sample.quality * (0.75 + 0.25 * (1 - age / maxAge));
      if (score < bestScore[index] || (score === bestScore[index] && sample.observedAtMs <= acquiredMs[index])) continue;
      bestScore[index] = score;
      bestSource[index] = swath.source;
      acquiredMs[index] = sample.observedAtMs;
      const o = index * 4;
      rgba[o] = Math.round(probability[sample.class] * 255);
      rgba[o + 1] = Math.round(clamp(sample.quality, 0, 1) * 255);
      rgba[o + 2] = Math.round(clamp(age / maxAge, 0, 1) * 255);
      rgba[o + 3] = 255;
    }
  }
  let observedPixels = 0;
  const countsBySource: Partial<Record<CloudScienceSource, number>> = {};
  for (const source of bestSource) {
    if (!source) continue;
    observedPixels++;
    countsBySource[source] = (countsBySource[source] || 0) + 1;
  }
  return { width, height, rgba, acquiredMs, observedCoverage: observedPixels / size, countsBySource };
}

/** Only scientifically classified observations are permitted in V3.
 * Missing pixels retain G=0; the renderer must not infer coverage from cloud colour.
 */
export function hasScientificCoverage(atlas: ScienceCloudAtlas): boolean {
  return atlas.observedCoverage > 0;
}
