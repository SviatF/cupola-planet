/**
 * High-detail global NOAA GMGSI infrared VISUAL integration, V3 preview only.
 *
 * Product is a geolocated LW brightness proxy, NOT a native scientific cloud
 * mask. Unlike the coarse GFS forecast it is true multisatellite imagery.
 *
 * Strict deterministic priority:
 *  1. Original NOAA/JMA L2, including classified CLEAR (G>0) — immutable.
 *  2. Verified-quality NOAA GMGSI IR pixels (G=135, B=232) — display only.
 *  3. Existing Meteosat WMS visual pixels — fallback outside GMGSI footprint.
 *  4. NOAA GFS forecast — last-resort outside every observed input.
 *
 * Never interpolate a source into invalid/no-data cells or invent clouds.
 * All source identifiers remain in B; A stays opaque.
 */
export type GmgsiVisualResult = {
  image: ImageData;
  visualCoverageFraction: number;
  newCoverageFraction: number;
  displacedWmsFraction: number;
  totalDataFootprintFraction: number;
};
export function overlayGmgsiVisualGap(
  scientific: ImageData,
  lowerPriorityVisual: ImageData,
  gmgsi: ImageData,
): GmgsiVisualResult {
  const w=scientific.width,h=scientific.height;
  if (w!==2048 || h!==1024 ||
      lowerPriorityVisual.width!==w || lowerPriorityVisual.height!==h ||
      gmgsi.width!==w || gmgsi.height!==h)
    throw new Error("NOAA GMGSI visual requires the matching 2048x1024 global atlas");
  const science=scientific.data, base=lowerPriorityVisual.data, ir=gmgsi.data;
  const result=new ImageData(new Uint8ClampedArray(base),w,h);
  const out=result.data;
  const N=w*h;
  let visual=0, added=0, displaced=0, total=0;
  for(let p=0;p<N;p++){
    const o=p*4;
    // L2 classified CLEAR has R=0 but G>0. It MUST remain unchanged.
    if(science[o+1]>0){total++;continue;}
    // Exact byte semantics of QA-screened GEO-registered NOAA GMGSI
    // preview publisher. Prevent any foreign or broken PNG becoming cloud.
    const valid=ir[o+1]===135 && ir[o+2]===232 && ir[o+3]===255;
    if(valid){
      if(base[o+1]===0) added++;
      else if(base[o+2]===224 || base[o+2]===248) displaced++;
      out[o]=ir[o]; out[o+1]=135;out[o+2]=232;out[o+3]=255;
      visual++;total++;
    }else if(base[o+1]>0){
      total++;
    }
  }
  return {
    image:result,
    visualCoverageFraction:visual/N,
    newCoverageFraction:added/N,
    displacedWmsFraction:displaced/N,
    totalDataFootprintFraction:total/N,
  };
}
