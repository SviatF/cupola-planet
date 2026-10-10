/**
 * Visual-only CUPOLA V3 multisource cloud presentation.
 *
 * QA-scientific GOES/Himawari pixels are never modified in the source atlas.
 * Meteosat observed IR is stored in an independent image. NOAA GFS is an
 * entirely different, lower-authority meteorological MODEL.
 *
 * The DISPLAY texture softly blends cloud luminosity at the rectangular
 * boundaries between the three classes. This blending does NOT convert
 * model data into satellite observations, and reported science coverage
 * remains based on the ORIGINAL Level-2 data.
 *
 * R: display cloud signal; G: usable visualization confidence;
 * B: dominant provenance; A: opaque. GFS-valid clear sky is a valid cell
 * with no cloud, and must not be painted white merely to reach 100%.
 */
export type GfsGapResult = {
  canvas: HTMLCanvasElement;
  modelFraction: number;
  totalDataFootprint: number;
};

const W = 2048;
const H = 1024;
const N = W * H;
const FEATHER_PX = 36;
const BLUR_PX = 21;

const smoothstep = (v: number) => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};

/** Fast 2D sliding-window box blur; longitude wraps, poles clamp. */
function boxBlurDensity(rgba: Uint8ClampedArray, radius: number): Float32Array {
  const horizontal = new Float32Array(N);
  const vertical = new Float32Array(N);
  const span = radius * 2 + 1;
  const inverse = 1 / span;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let sum = 0;
    for (let d = -radius; d <= radius; d++) {
      const x = (d + W) % W;
      sum += rgba[(row + x) * 4];
    }
    for (let x = 0; x < W; x++) {
      horizontal[row + x] = sum * inverse;
      const outgoing = (x - radius + W) % W;
      const incoming = (x + radius + 1) % W;
      sum += rgba[(row + incoming) * 4] - rgba[(row + outgoing) * 4];
    }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let d = -radius; d <= radius; d++) {
      const y = Math.max(0, Math.min(H - 1, d));
      sum += horizontal[y * W + x];
    }
    for (let y = 0; y < H; y++) {
      vertical[y * W + x] = sum * inverse;
      const leaving = Math.max(0, Math.min(H - 1, y - radius));
      const entering = Math.max(0, Math.min(H - 1, y + radius + 1));
      sum += horizontal[entering * W + x] - horizontal[leaving * W + x];
    }
  }
  return vertical;
}

/**
 * Approximate distance in pixels to the nearest boundary where provenance
 * changes. Chamfer pass: orthogonal=3, diagonal=4 (within ~6% of Euclidean).
 * The provenance classification includes ALL classified clear scientific
 * cells, not only bright/cloudy pixels, so seams are not cloud-edge contours.
 */
function seamDistances(provenance: Uint8Array): Uint8Array {
  const distance = new Uint8Array(N);
  distance.fill(255);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const k = row + x;
      const type = provenance[k];
      if (type !== provenance[row + (x + W - 1) % W] ||
          type !== provenance[row + (x + 1) % W] ||
          (y > 0 && type !== provenance[k - W]) ||
          (y < H - 1 && type !== provenance[k + W])) {
        distance[k] = 0;
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      let d = distance[k];
      if (x > 0) d = Math.min(d, distance[k - 1] + 3);
      if (y > 0) {
        d = Math.min(d, distance[k - W] + 3);
        if (x > 0) d = Math.min(d, distance[k - W - 1] + 4);
        if (x < W - 1) d = Math.min(d, distance[k - W + 1] + 4);
      }
      distance[k] = d;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const k = y * W + x;
      let d = distance[k];
      if (x < W - 1) d = Math.min(d, distance[k + 1] + 3);
      if (y < H - 1) {
        d = Math.min(d, distance[k + W] + 3);
        if (x > 0) d = Math.min(d, distance[k + W - 1] + 4);
        if (x < W - 1) d = Math.min(d, distance[k + W + 1] + 4);
      }
      distance[k] = d;
    }
  }
  return distance;
}

/** A global *cloud fraction*, not optical depth. Treat it as subtle haze. */
function modelCloudSignal(totalCloudCover: number): number {
  const cc = Math.max(0, Math.min(1, totalCloudCover / 255));
  // Suppress diffuse low clouds of a coarse 0.25deg NWP field. Even at
  // 100% predicted cloud cover, brightness should never compete with the
  // crisp Level-2 observed cloud signal (max 0.37 vs L2 near 1.0).
  return 255 * 0.37 * smoothstep((cc - 0.26) / 0.74);
}

/**
 * Renders a continuous geographic visualization, not a fused scientific
 * classification. No original L2 or WMS image is mutated. Model is used
 * only where original science AND WMS have no recorded observation.
 *
 * Visual-only feathering averages cloud DISPLAY signal around each
 * provenance transition. Core observed pixels (>36 px from any source edge)
 * are untouched. No new cloud pixels are claimed as L2.
 */
export function fillGlobalCloudModelGaps(
  observed: ImageData,
  globalModel: ImageData,
  science?: ImageData,
): GfsGapResult {
  if (observed.width !== W || observed.height !== H ||
      globalModel.width !== W || globalModel.height !== H ||
      (science && (science.width !== W || science.height !== H))) {
    throw new Error("Cloud imagery must match the 2048x1024 full-Earth atlas");
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context for global cloud visualization");

  const next = ctx.createImageData(W, H);
  next.data.set(observed.data);
  const result = next.data;
  const measured = observed.data;
  const model = globalModel.data;
  const scientific = science?.data;
  const provenance = new Uint8Array(N);
  let filled = 0;
  let sourced = 0;

  for (let k = 0; k < N; k++) {
    const o = k * 4;
    // Scientific observed CLEAR has G>0 and R=0: it is never treated as
    // missing. The raw authoritative scientific pixels stay untouched.
    if (scientific && scientific[o + 1] > 0) {
      provenance[k] = 1; sourced++;
      continue;
    }
    if (measured[o + 1] > 0) {
      provenance[k] = 2; sourced++;
      continue;
    }
    if (model[o + 1] < 250) continue;
    provenance[k] = 3;
    result[o] = Math.round(modelCloudSignal(model[o]));
    result[o + 1] = 92;
    result[o + 2] = 255; // Explicit NOAA GFS NWP provenance, NOT Level-2.
    result[o + 3] = 255;
    sourced++;
    filled++;
  }

  if (filled > 0) {
    const edge = seamDistances(provenance);
    // Blur the combined R *only at provenance boundaries*. The substantial
    // width hides model rectangular borders, without blurring the excellent
    // GOES/Himawari cloud textures anywhere inside their verified footprint.
    const softened = boxBlurDensity(result, BLUR_PX);
    for (let k = 0; k < N; k++) {
      const d = edge[k];
      if (d >= FEATHER_PX * 3) continue;
      const blendToOriginal = smoothstep(d / (FEATHER_PX * 3));
      const o = k * 4;
      result[o] = Math.round(
        softened[k] * (1 - blendToOriginal) + result[o] * blendToOriginal,
      );
    }
  }

  ctx.putImageData(next, 0, 0);
  return {
    canvas,
    modelFraction: filled / N,
    totalDataFootprint: sourced / N,
  };
}
