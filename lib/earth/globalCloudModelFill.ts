import { bridgeVisualCloudGap } from "./cloudSeamBridge";

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
  return Math.round(255 * 0.20 * t * t * (3 - 2 * t));
}

/**
 * NO METEOSAT DARK BORDER: immutable science and WMS, GFS-only transition.
 *
 * Older rendering faded categorical Meteosat toward a much darker GFS
 * forecast across 32px of its own valid coverage. This produced the broad
 * vertical charcoal ribbon seen on the right of the user's globe.
 *
 * The new blend works only on the lower-authority MODEL side, only where
 * GFS already reports cloud. No cloud is invented over model-clear regions,
 * no WMS classified clear pixel can become cloudy, and no provenance
 * channel changes. A capped 32/255 uplift suppresses the sharpest source
 * luminance discontinuity without painting white model rectangles.
 */
export function featherMeteosatGfsHandoff(
  science: ImageData,
  wms: ImageData,
  filled: ImageData,
  model: ImageData,
  radius = 32,
): ImageData {
  const w = filled.width, h = filled.height;
  if (w !== science.width || h !== science.height ||
      w !== wms.width || h !== wms.height ||
      w !== model.width || h !== model.height)
    throw new Error("Meteosat/GFS handoff needs matching atlases");
  const cap = Math.max(3, Math.min(48, Math.floor(radius)));
  const n = w*h;
  const base = science.data, observed = wms.data, pixels = filled.data;
  const forecast = model.data;
  const output = new ImageData(new Uint8ClampedArray(pixels),w,h);
  const distance = new Uint8Array(n);
  const target = new Float32Array(n);
  const queue = new Int32Array(n);
  let head=0,count=0;
  const wmsAt=(p:number)=>{
    const o=p*4;
    return base[o+1]===0 && observed[o+1]>0 &&
      (observed[o+2]===224 || observed[o+2]===248);
  };
  const modelAt=(p:number)=>{
    const o=p*4;
    return base[o+1]===0 && observed[o+1]===0 &&
      pixels[o+2]===255 && pixels[o+1]>0 && forecast[o+1]>=250;
  };
  const neighbors=(p:number,fn:(q:number)=>void)=>{
    const x=p%w,y=(p-x)/w;
    fn(p+(x===0?w-1:-1));
    fn(p+(x===w-1?-(w-1):1));
    if(y>0)fn(p-w);
    if(y+1<h)fn(p+w);
  };
  // Seed the MODEL side of an actual WMS/GFS border.
  for(let p=0;p<n;p++){
    if(!modelAt(p))continue;
    let sum=0, cnt=0;
    neighbors(p,q=>{if(wmsAt(q)){sum+=pixels[q*4];cnt++;}});
    if(!cnt)continue;
    distance[p]=1;
    target[p]=sum/cnt;
    queue[count++]=p;
  }
  while(head<count){
    const p=queue[head++],d=distance[p];
    if(d>=cap)continue;
    neighbors(p,q=>{
      if(distance[q] || !modelAt(q))return;
      distance[q]=d+1;
      target[q]=target[p];
      queue[count++]=q;
    });
  }
  // Smooth nearest-border estimates along the same model-only corridor
  // to avoid striping/Voronoi streaks, never propagate through WMS/L2.
  const smoothed=new Float32Array(n);
  for(let i=0;i<count;i++){
    const p=queue[i],o=p*4;
    if(forecast[o]===0 || pixels[o]===0)continue;
    let t=target[p],samples=1;
    neighbors(p,q=>{
      if(distance[q]>0 && distance[q]<=cap){
        t+=target[q];samples++;
      }
    });
    smoothed[p]=t/samples;
  }
  for(let i=0;i<count;i++){
    const p=queue[i],o=p*4;
    // Never extrapolate white Meteosat cloud onto model-clear sky.
    if(forecast[o]===0 || pixels[o]===0)continue;
    const d=distance[p];
    const t=Math.max(0,Math.min(1,(d-1)/(cap-1)));
    const weight=1-t*t*(3-2*t);
    const increment=Math.max(0,Math.min(32,smoothed[p]-pixels[o]));
    output.data[o]=Math.min(255,Math.round(pixels[o]+increment*weight));
  }
  return output;
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
  // Two-stage source-aware cinematic display-only handoff. The categorical
  // Meteosat/GFS border becomes a continuous measured/model transition;
  // L2 stays pixel-identical. For L2/GFS seams, keep asymmetric correction
  // toward immutable L2 without ever writing scientific pixels.
  if (filled) {
    const harmonized = featherMeteosatGfsHandoff(
      science ?? observed, observed, next, globalModel, 32);
    // Apply a separate one-sided L2/GFS seam bridge. The BASE is the
    // original observed science+WMS, unmodified. WMS is never dimmed;
    // GFS modifications remain visibly marked as forecast-only.
    ctx.putImageData(bridgeVisualCloudGap(observed, harmonized, 18),0,0);
  } else {
    ctx.putImageData(next,0,0);
  }
  return {canvas, modelFraction: filled / N, totalDataFootprint: sourced / N};
}
