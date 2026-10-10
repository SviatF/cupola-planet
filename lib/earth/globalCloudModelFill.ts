/**
 * CUPOLA V3 worldwide visual coverage from actual NOAA GFS cloud-cover grid.
 *
 * ONLY paints scientific / satellite WMS no-data pixels. Clear-sky Level-2
 * cells are authoritative (even where R=0) and must be left byte-for-byte
 * unchanged. Model data are explicitly separate from satellite observations.
 *
 * GFS is global MODEL analysis (not geostationary NRT imagery), so this
 * backup is for a continuous EARTH VISUALIZATION, never "100% live satellite".
 */
export type GfsGapResult = {
  canvas: HTMLCanvasElement;
  modelFraction: number;
  totalDataFootprint: number;
};

export function fillGlobalCloudModelGaps(
  observed: ImageData, globalModel: ImageData,
): GfsGapResult {
  if (observed.width !== 2048 || observed.height !== 1024 ||
      globalModel.width !== 2048 || globalModel.height !== 1024)
    throw new Error("Global model & satellite atlas must be 2048x1024");

  const canvas = document.createElement("canvas");
  canvas.width = observed.width;
  canvas.height = observed.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context for global cloud visualization");

  const next = ctx.createImageData(observed.width, observed.height);
  next.data.set(observed.data);
  const input = observed.data;
  const source = globalModel.data;
  const result = next.data;
  let filled = 0;
  let sourced = 0;

  const W = observed.width;
  const H = observed.height;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      // A positive confidence is proof this cell was already provided by
      // official L2 or an independently labelled WMS visual observation.
      if (input[o + 1] > 0) { sourced++; continue; }
      // GFS G is only a global *model grid valid* flag, not L2 QA.
      if (source[o + 1] < 250) continue;
      const cc = source[o] / 255;
      // Soften MODEL data at the border of any real observation, but do not
      // invent clouds where GFS predicts clear sky.
      let neighbors = 0;
      const x0 = Math.max(0, x - 10), x1 = Math.min(W - 1, x + 10);
      const y0 = Math.max(0, y - 10), y1 = Math.min(H - 1, y + 10);
      if (input[(y * W + x0) * 4 + 1] > 0) neighbors++;
      if (input[(y * W + x1) * 4 + 1] > 0) neighbors++;
      if (input[(y0 * W + x) * 4 + 1] > 0) neighbors++;
      if (input[(y1 * W + x) * 4 + 1] > 0) neighbors++;
      const seamFade = 1 - neighbors * 0.14;
      const modelSignal = Math.pow(Math.max(0, cc), 1.12) * 0.86 * seamFade;
      result[o] = Math.round(modelSignal * 255);
      result[o + 1] = 92; // Render confidence is lower than QA-screened L2.
      result[o + 2] = 255; // provenance: NOAA GFS model (NOT satellite).
      result[o + 3] = 255;
      filled++;
      sourced++;
    }
  }
  ctx.putImageData(next, 0, 0);
  return {
    canvas,
    modelFraction: filled / (W * H),
    totalDataFootprint: sourced / (W * H),
  };
}
