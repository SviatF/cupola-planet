/**
 * CUPOLA V3 keyless visual gap-fill. Not a scientific Cloud Mask decoder.
 *
 * Strict L2 observations (GOES ACMF / Himawari CMSK) are immutable. Only
 * pixels with ZERO L2 confidence can receive a visibly different provenance:
 * live EUMETView MSG / MTG WMS IR imagery, heuristically converted to a
 * white-alpha cloud visualization by /api/clouds-geostationary.
 *
 * R = cloud visualization; G = display confidence, B = source provenance;
 * A = 255. WMS-derived opacity must NEVER be reported as L2 coverage.
 */
export const VISUAL_GAP_WIDTH = 2048;
export const VISUAL_GAP_HEIGHT = 1024;
export const VISUAL_GAP_MAX_AGE_MS = 90 * 60_000;

export type MeteosatVisualFrame = {
  source: "meteosat" | "meteosat-iodc";
  image: ImageData;
  observationMs: number;
  layer: string;
};

export type VisualGapResult = {
  canvas: HTMLCanvasElement;
  visualCoverageFraction: number;
  totalVisualFootprintFraction: number;
  sources: string[];
};

const smooth = (value: number) => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};
const validWms = (image: ImageData, x: number, y: number) => {
  if (y < 0 || y >= VISUAL_GAP_HEIGHT) return false;
  const xx = (x + VISUAL_GAP_WIDTH) % VISUAL_GAP_WIDTH;
  const o = (y * VISUAL_GAP_WIDTH + xx) * 4;
  // The server uses alpha=0 for NO DATA, alpha=8 for observed clear sky.
  return image.data[o] >= 240 && image.data[o + 3] >= 8;
};

export function composeScientificWithMeteosatVisualGap(
  science: ImageData, frames: readonly MeteosatVisualFrame[], now: number,
): VisualGapResult {
  if (science.width !== VISUAL_GAP_WIDTH || science.height !== VISUAL_GAP_HEIGHT)
    throw new Error("Scientific atlas has unexpected dimensions");

  const accepted = frames.filter(frame =>
    frame.image.width === VISUAL_GAP_WIDTH &&
    frame.image.height === VISUAL_GAP_HEIGHT &&
    Number.isFinite(frame.observationMs) &&
    frame.observationMs <= now + 5 * 60_000 &&
    now - frame.observationMs <= VISUAL_GAP_MAX_AGE_MS &&
    /^msg_(?:fes|iodc):ir108$|^mtg_fd:ir105_hrfi$/i.test(frame.layer),
  );
  const canvas = document.createElement("canvas");
  canvas.width = VISUAL_GAP_WIDTH;
  canvas.height = VISUAL_GAP_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No Canvas2D context for Meteosat visual gap");
  const data = ctx.createImageData(VISUAL_GAP_WIDTH, VISUAL_GAP_HEIGHT);
  data.data.set(science.data);
  if (!accepted.length) {
    ctx.putImageData(data, 0, 0);
    return { canvas, visualCoverageFraction: 0, totalVisualFootprintFraction: 0, sources: [] };
  }

  const original = science.data;
  const result = data.data;
  let visualOnly = 0;
  let withAny = 0;
  const pixels = VISUAL_GAP_WIDTH * VISUAL_GAP_HEIGHT;
  const sourcePixels = new Array(accepted.length).fill(0) as number[];

  for (let y = 0; y < VISUAL_GAP_HEIGHT; y++) {
    for (let x = 0; x < VISUAL_GAP_WIDTH; x++) {
      const o = (y * VISUAL_GAP_WIDTH + x) * 4;
      // L2 science is authoritative, including CLASSIFIED CLEAR skies:
      // these have R=0 but G>0. Never overwrite them with a WMS guess.
      if (original[o + 1] !== 0) { withAny++; continue; }
      let weightSum = 0;
      let clouds = 0;
      let maxWeight = 0;
      let dominant = -1;

      for (let i = 0; i < accepted.length; i++) {
        const f = accepted[i];
        if (!validWms(f.image, x, y)) continue;
        // Smooth visual weights only INSIDE genuine observed WMS footprints.
        // At an empty WMS disk edge, no pixels are invented outside its mask.
        const near = [
          validWms(f.image, x - 3, y), validWms(f.image, x + 3, y),
          validWms(f.image, x, y - 3), validWms(f.image, x, y + 3),
        ].filter(Boolean).length / 4;
        const far = [
          validWms(f.image, x - 12, y), validWms(f.image, x + 12, y),
          validWms(f.image, x, y - 12), validWms(f.image, x, y + 12),
        ].filter(Boolean).length / 4;
        const footprint = (0.12 + 0.50 * smooth(near) + 0.38 * smooth(far));
        const freshness = 0.75 + 0.25 * (1 - Math.max(0, now - f.observationMs) / VISUAL_GAP_MAX_AGE_MS);
        const weight = footprint * freshness;
        // EUMETView IR brightness is not a measured cloud probability.
        const alpha = f.image.data[o + 3];
        const visualCloud = Math.pow(Math.max(0, Math.min(1, (alpha - 8) / 214)), 1.12) * 0.70;
        clouds += visualCloud * weight;
        weightSum += weight;
        if (weight > maxWeight) { maxWeight = weight; dominant = i; }
      }
      if (weightSum <= 0) continue;

      // Near the edge of L2 coverage, fade visual-only pixels in over a
      // ~2-degree ribbon. L2 pixels stay byte-for-byte unchanged.
      const nearScience = [
        original[(y * VISUAL_GAP_WIDTH + (x + VISUAL_GAP_WIDTH - 8) % VISUAL_GAP_WIDTH) * 4 + 1] > 0,
        original[(y * VISUAL_GAP_WIDTH + (x + 8) % VISUAL_GAP_WIDTH) * 4 + 1] > 0,
        y > 8 && original[((y - 8) * VISUAL_GAP_WIDTH + x) * 4 + 1] > 0,
        y < VISUAL_GAP_HEIGHT - 8 && original[((y + 8) * VISUAL_GAP_WIDTH + x) * 4 + 1] > 0,
      ].filter(Boolean).length / 4;
      const seamWeight = 1 - smooth(nearScience) * 0.67;
      const coverage = Math.min(0.64, (weightSum / accepted.length) * 0.76 * seamWeight);
      result[o] = Math.round(255 * (clouds / weightSum) * seamWeight);
      result[o + 1] = Math.round(255 * coverage);
      // Distinct source code, never the GOES/Himawari L2 values.
      result[o + 2] = dominant >= 0 ? (accepted[dominant].source === "meteosat" ? 224 : 248) : 0;
      result[o + 3] = 255;
      sourcePixels[dominant]++;
      if (coverage > 0.02) { visualOnly++; withAny++; }
    }
  }
  ctx.putImageData(data, 0, 0);
  return {
    canvas,
    visualCoverageFraction: visualOnly / pixels,
    totalVisualFootprintFraction: withAny / pixels,
    sources: accepted.filter((_, i) => sourcePixels[i] > 0).map(f => f.source),
  };
}
