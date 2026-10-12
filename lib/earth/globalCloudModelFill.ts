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
 * Source-aware Meteosat/GFS display transition.
 *
 * WMS categorical cloud mask is much brighter than the low-authority model;
 * matching only the model's first pixel to WMS creates a fake solid-cloud
 * curtain. Instead, soften the *WMS side* toward the actual co-located GFS
 * signal within a bounded source boundary corridor. This way no data is
 * extrapolated from outside a satellite footprint, and the correction has
 * zero intensity discontinuity where WMS hands off to GFS.
 *
 * Strict invariants: source L2 and classified-clear L2 are untouched,
 * all G/B/A provenance bytes are copied exactly, no outside pixels painted,
 * and the interior of a valid WMS source is unchanged.
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
  const dmax = Math.max(3, Math.min(48, Math.floor(radius)));
  const base = science.data, observed = wms.data, pixels = filled.data;
  const modelPixels = model.data;
  const output = new ImageData(new Uint8ClampedArray(pixels),w,h);
  const distance = new Uint8Array(w*h);
  const queue = new Int32Array(w*h);
  let read=0, count=0;
  const wmsAt = (p: number) => {
    const o=p*4;
    return base[o+1]===0 && observed[o+1]>0 &&
      (observed[o+2]===224 || observed[o+2]===248) &&
      modelPixels[o+1]>=250;
  };
  const modelAt = (p: number) => {
    const o=p*4;
    return base[o+1]===0 && observed[o+1]===0 &&
      pixels[o+2]===255 && pixels[o+1]>0;
  };
  const neighbors = (p: number, fn:(q:number)=>void) => {
    const x=p%w,y=(p-x)/w;
    fn(p + (x===0?w-1:-1));
    fn(p + (x===w-1?-(w-1):1));
    if(y>0)fn(p-w);
    if(y+1<h)fn(p+w);
  };
  // Seed true WMS cells next to GFS only, never at the L2 boundary.
  for(let p=0;p<w*h;p++){
    if(!wmsAt(p))continue;
    let touches=false;
    neighbors(p,q=>{if(modelAt(q))touches=true;});
    if(touches){distance[p]=1;queue[count++]=p;}
  }
  // Geodesic city-block distance inside WMS footprint. No propagation
  // across either NOAA/JMA science, classified clear, or unobserved cells.
  while(read<count){
    const p=queue[read++],d=distance[p];
    if(d>=dmax)continue;
    neighbors(p,q=>{
      if(distance[q] || !wmsAt(q))return;
      distance[q]=d+1;queue[count++]=q;
    });
  }
  for(let i=0;i<count;i++){
    const p=queue[i],d=distance[p],o=p*4;
    const t=Math.max(0,Math.min(1,(d-1)/(dmax-1)));
    const keepWms=t*t*(3-2*t);
    // The model signal is sampled at the SAME geographic pixel. No
    // neighbour copy, nearest-cell paint, artificial cloud noise, or
    // claiming forecast pixels to be satellite measurements.
    const reference=modelCloudSignal(modelPixels[o]);
    // Never turn Meteosat-classified CLEAR into model-generated cloud.
    // If the model is cloudier, bridge the lower-authority model toward WMS
    // on its OWN side instead. Supplemental WMS R can only be attenuated.
    const referenceNoBrighter=Math.min(reference,pixels[o]);
    output.data[o]=Math.round(referenceNoBrighter*(1-keepWms)+pixels[o]*keepWms);
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
    // The seam bridge must see the *harmonized* WMS baseline; otherwise it
    // would undo the gradual handoff by matching GFS to the old WMS edge.
    const matchingBase = new ImageData(new Uint8ClampedArray(observed.data),W,H);
    for(let o=0;o<N*4;o+=4) {
      if (observed.data[o+1]>0 &&
          (observed.data[o+2]===224 || observed.data[o+2]===248) &&
          (!science || science.data[o+1]===0))
        matchingBase.data[o]=harmonized.data[o];
    }
    ctx.putImageData(bridgeVisualCloudGap(matchingBase, harmonized, 18),0,0);
  } else {
    ctx.putImageData(next,0,0);
  }
  return {canvas, modelFraction: filled / N, totalDataFootprint: sourced / N};
}
