import {
  CLOUD_ATLAS_WIDTH as WIDTH, CLOUD_ATLAS_HEIGHT as HEIGHT,
  CLOUD_ATLAS_MAX_AGE_MS, type CloudAtlasFrames, type CloudAtlasSource,
} from "./cloudAtlas";

/**
 * Experimental Cloud Engine V2 (opt-in via ?cloudEngine=v2).
 *
 * Data contract:
 *  - Input RGBA masks: white RGB + alpha cloud strength, 0 alpha = no-data.
 *  - Alpha >= 8 denotes a valid observed clear-sky pixel.
 *  - Output atlas: R = cloud strength, G = observation confidence,
 *    B = contributing source code, A = opaque.
 *
 * This is a safer compositor, NOT a calibrated meteorological cloud product:
 * existing IR/VIIRS mask extraction still requires upstream improvement.
 */
const GEO: CloudAtlasSource[] = ["east", "west", "himawari", "meteosat", "iodc"];
const POLAR: CloudAtlasSource[] = ["polar", "polar20", "polarsnpp"];
const ALL: CloudAtlasSource[] = [...GEO, ...POLAR];
const SIZE = WIDTH * HEIGHT;
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const fresh = (key: CloudAtlasSource, time: number, now: number) =>
  Number.isFinite(time) && time <= now + 300_000 &&
  now - time <= (key.startsWith("polar") ? 48 * 3_600_000 : CLOUD_ATLAS_MAX_AGE_MS);

/** Alpha is used as footprint VALIDITY only above zero. Never infer cloud coverage
 * from whether the image looks bright or dark. Keep observed clear sky distinct.
 */
function edgeConfidence(data: Uint8ClampedArray, p: number, x: number, y: number) {
  if (data[p * 4 + 3] === 0 || data[p * 4] < 128) return 0;
  const n = (xx: number, yy: number) => {
    if (yy < 0 || yy >= HEIGHT) return 0;
    const i = (yy * WIDTH + ((xx + WIDTH) % WIDTH)) * 4;
    return data[i + 3] > 0 && data[i] >= 128 ? 1 : 0;
  };
  // 2-pixel soft transition at actual no-data edges; no 28px erosion.
  return 0.42 + 0.145 * (n(x - 2, y) + n(x + 2, y) + n(x, y - 2) + n(x, y + 2));
}

export function composeCloudAtlasV2(frames: CloudAtlasFrames, now: number): HTMLCanvasElement | null {
  const available = ALL.flatMap((key, index) => {
    const frame = frames[key];
    if (!frame || !fresh(key, frame.time, now) ||
        frame.image.width !== WIDTH || frame.image.height !== HEIGHT) return [];
    return [{ key, index, data: frame.image.data, time: frame.time,
      // A day-level polar mosaic has lower confidence than an observed GEO scene.
      reliability: key.startsWith("polar") ? 0.50 : 0.95,
    }];
  });
  if (!available.length) return null;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(WIDTH, HEIGHT);
  const out = img.data;
  const counters = new Uint32Array(ALL.length);
  let observed = 0;
  for (let y = 0; y < HEIGHT; y++) {
    const latitude = Math.abs(90 - 180 * (y + 0.5) / HEIGHT);
    const polarSuitability = smooth((latitude - 55) / 16);
    for (let x = 0; x < WIDTH; x++) {
      const p = y * WIDTH + x;
      let geoWeight = 0, geoCloud = 0, geoBest = 0, geoSource = 0;
      let polarWeight = 0, polarCloud = 0, polarBest = 0, polarSource = 0;
      for (const frame of available) {
        const conf = edgeConfidence(frame.data, p, x, y);
        if (conf <= 0) continue;
        const isPolar = frame.key.startsWith("polar");
        if (isPolar && polarSuitability <= 0) continue;
        const age = Math.max(0, now - frame.time);
        const timeliness = isPolar ? 0.82 : 0.73 + 0.27 * (1 - age / CLOUD_ATLAS_MAX_AGE_MS);
        const weight = conf * frame.reliability * timeliness *
          (isPolar ? polarSuitability : 1);
        const a = frame.data[p * 4 + 3];
        const density = Math.pow(Math.max(0, Math.min(1, (a - 8) / 205)), 1.1) * 0.8;
        if (isPolar) {
          polarWeight += weight;
          polarCloud += density * weight;
          if (weight > polarBest) { polarBest = weight; polarSource = frame.index + 1; }
        } else {
          geoWeight += weight;
          geoCloud += density * weight;
          if (weight > geoBest) { geoBest = weight; geoSource = frame.index + 1; }
        }
      }

      // Polar observations fill missing GEO swaths; they do not turn a
      // dated scan into a sharp rectangular boundary over a current GEO scan.
      const geoConf = Math.min(1, geoWeight);
      const polarConf = Math.min(1, polarWeight);
      const polarMix = polarConf * (1 - geoConf);
      const conf = geoConf + polarMix;
      const cloud = conf > 0 ? (
        (geoWeight > 0 ? geoCloud / geoWeight * geoConf : 0) +
        (polarWeight > 0 ? polarCloud / polarWeight * polarMix : 0)
      ) / conf : 0;
      const o = p * 4;
      out[o] = Math.round(255 * Math.max(0, Math.min(1, cloud)));
      out[o + 1] = Math.round(255 * conf);
      const owner = geoConf >= polarMix ? geoSource : polarSource;
      out[o + 2] = owner ? Math.round(owner * 255 / (ALL.length + 1)) : 0;
      out[o + 3] = 255;
      if (conf > 0.03) observed++;
      if (owner) counters[owner - 1]++;
    }
  }
  ctx.putImageData(img, 0, 0);
  canvas.dataset.observedCoverage = (observed / SIZE).toFixed(3);
  canvas.dataset.sources = available.map(s => s.key).join(",");
  canvas.dataset.products = available.map(s => s.key + ":" + frames[s.key]?.product).join(",");
  canvas.dataset.observationTime = new Date(Math.max(...available.map(s => s.time))).toISOString();
  canvas.dataset.sourceCoverage = ALL.map((key, i) => key + ":" + (100 * counters[i] / SIZE).toFixed(2) + "%").join(",");
  canvas.dataset.engine = "v2";
  return canvas;
}
