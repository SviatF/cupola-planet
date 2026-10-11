/**
 * CUPOLA visual-only GFS fallback. STRICT source preservation.
 *
 * The beautiful original NOAA GOES/JMA Himawari Level-2 texture is the
 * reference. It must NEVER be remapped, normalised, eroded, repainted or
 * cross-faded to a low-resolution GFS model. Meteosat WMS may only fill
 * missing L2 cells; GFS in turn may only fill missing L2 AND WMS cells.
 *
 * R=cloud display; G=confidence, B=source provenance, A=opaque.
 * This is one composited RGBA atlas, NOT multiple WebGL overlays.
 */
export type GfsGapResult = {
  canvas: HTMLCanvasElement;
  modelFraction: number;
  totalDataFootprint: number;
};
const W = 2048;
const H = 1024;
const N = W * H;

function modelCloudSignal(coverByte: number): number {
  // TCDC is a forecast/analysis fraction, not measured optical thickness.
  // Render it as understated haze, never as a solid opaque white blanket.
  const cc = Math.max(0, Math.min(1, coverByte / 255));
  const t = Math.max(0, Math.min(1, (cc - 0.26) / 0.74));
  return Math.round(255 * 0.31 * t * t * (3 - 2 * t));
}

/**
 * Input satellite bytes are copied EXACTLY; the original scientific source
 * remains independent for QA metrics. Unclassified pixels receive GFS only
 * where its global grid carries a valid flag. No artificial rectangular
 * source-wide brightness normalization or GFS repaint of satellite clouds.
 */
export function fillGlobalCloudModelGaps(
  observed: ImageData,
  globalModel: ImageData,
  science?: ImageData,
): GfsGapResult {
  if (observed.width !== W || observed.height !== H ||
      globalModel.width !== W || globalModel.height !== H ||
      (science && (science.width !== W || science.height !== H))) {
    throw new Error("Cloud imagery must match the 2048x1024 Earth atlas");
  }
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No Canvas2D context for GFS gap fill");
  const next = ctx.createImageData(W, H);
  next.data.set(observed.data);
  const output = next.data, measured = observed.data, model = globalModel.data;
  const scientific = science?.data;
  let filled = 0, sourced = 0;
  for (let k = 0; k < N; k++) {
    const o = k * 4;
    // The existence of a valid observation is based on G, NOT R.
    // Classified CLEAR (R=0, G>0) remains clear and unchanged.
    if ((scientific && scientific[o+1] > 0) || measured[o+1] > 0) {
      sourced++;
      continue;
    }
    if (model[o+1] < 250) continue;
    output[o] = modelCloudSignal(model[o]);
    output[o+1] = 92; // Lower render confidence, never verified L2 QA.
    output[o+2] = 255; // NOAA GFS model only.
    output[o+3] = 255;
    filled++;
    sourced++;
  }
  ctx.putImageData(next, 0, 0);
  return {canvas, modelFraction: filled / N, totalDataFootprint: sourced / N};
}
