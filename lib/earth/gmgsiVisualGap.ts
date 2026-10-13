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
/**
 * Scene matching uses ONLY real overlap of unmodified L2 with actual
 * GMGSI IR pixels. The IR quicklook is a different radiometric proxy,
 * so its 0..255 values are not inherently comparable to the L2 mask.
 * Never use synthetic GFS, WMS or no-data as a calibration reference.
 *
 * Local 128px tiles avoid a single global color correction producing
 * visually different rectangular hemispheres. Cloud/cloud overlap ONLY
 * estimates a bounded brightness ratio; it cannot shift or invent clouds.
 * No overlap => preserve incoming IR unchanged.
 */
export function estimateGmgsiVisualGains(science:ImageData,ir:ImageData){
  const w=science.width,h=science.height,src=science.data,raw=ir.data;
  if(w!==ir.width||h!==ir.height)throw new Error("GMGSI radiometric overlap requires equal dimensions");
  const tile=128,tw=Math.ceil(w/tile),th=Math.ceil(h/tile),count=tw*th;
  const l2=new Float64Array(count),sat=new Float64Array(count),samples=new Uint32Array(count);
  let totalL2=0,totalIr=0,matched=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const o=(y*w+x)*4;
    if(!src[o+1] || raw[o+1]!==135 || raw[o+2]!==232)continue;
    // Compare only plausible cloudy pixels on BOTH sensors. Temporal
    // displacements and differing cloud-sensitivity keep this conservative.
    if(src[o]<48||raw[o]<48)continue;
    const k=Math.floor(y/tile)*tw+Math.floor(x/tile);
    l2[k]+=src[o];sat[k]+=raw[o];samples[k]++;
    totalL2+=src[o];totalIr+=raw[o];matched++;
  }
  const gain=new Float32Array(count);
  const global=matched>=256&&totalIr>0?
    Math.max(.78,Math.min(1.35,totalL2/totalIr)):1;
  for(let k=0;k<count;k++){
    const local=samples[k]>=48&&sat[k]>0?
      Math.max(.78,Math.min(1.35,l2[k]/sat[k])):global;
    const reliability=samples[k]>=48?samples[k]/(samples[k]+192):0;
    gain[k]=global*(1-reliability)+local*reliability;
  }
  // Share local photometric information across tile boundaries without
  // painting any image pixel; actual per-pixel gain is bilinear below.
  let old=gain;
  for(let iter=0;iter<2;iter++){
    const next=new Float32Array(count);
    for(let ty=0;ty<th;ty++)for(let tx=0;tx<tw;tx++){
      const k=ty*tw+tx;
      let sum=old[k]*4,weight=4;
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const xx=(tx+dx+tw)%tw,yy=ty+dy;
        if(yy<0||yy>=th)continue;
        sum+=old[yy*tw+xx];weight++;
      }
      next[k]=sum/weight;
    }
    old=next;
  }
  return {gains:old,tilesX:tw,tilesY:th,tileSize:tile,
    overlapPixels:matched,globalGain:global};
}
export const interpolateGmgsiVisualGain=(field:ReturnType<typeof estimateGmgsiVisualGains>,x:number,y:number)=>{
  const {gains,tilesX:tw,tilesY:th,tileSize:t}=field;
  const tx=x/t-.5,ty=y/t-.5;
  const x0=Math.floor(tx),y0=Math.floor(ty);
  const fx=tx-x0,fy=ty-y0;
  const i=(col:number,row:number)=>gains[
    Math.max(0,Math.min(th-1,row))*tw + ((col%tw+tw)%tw)];
  return (1-fy)*((1-fx)*i(x0,y0)+fx*i(x0+1,y0))+
    fy*((1-fx)*i(x0,y0+1)+fx*i(x0+1,y0+1));
};

/**
 * IR VISUAL + EUMETSAT CLOUD CLASS complement, not IR-only replacement.
 *
 * A weak/zero GMGSI LW-IR brightness proxy does NOT prove clear sky.
 * Previously its R=0 overwrote a Meteosat CLOUD class R~175 across the
 * entire MSG footprint, erasing the low grey structures and creating an
 * artificial black strip on both vertical boundaries of the NOAA/JMA L2
 * footprints. The supplemental source is a *styled* WMS class and must
 * remain explicitly visual-only (never label as native L2).
 *
 * Use the modest CLM display signal only when (a) its WMS footprint and
 * cloud class are clear, (b) GMGSI has valid QA but weak brightness, and
 * (c) the recovered signal really exceeds IR. Do not carry the WMS into
 * classified clear L2 or unsupported WMS/IR cells.
 *
 * When the supplemental class wins, retain its own provenance B/G.
 * This honestly records where IR alone could not explain detected clouds,
 * and reduces NOoA GMGSI's reported ownership instead of inflating it.
 */
export function recoverMeteosatCloudsUnderWeakIr(
  infraredDensity: number,
  wmsDensity: number,
  wmsConfidence: number,
  wmsSource: number,
): {density:number;source:number;confidence:number;recovered:boolean} {
  const cloudClass=(wmsSource===224||wmsSource===248) &&
    wmsConfidence>=85 && wmsDensity>=64;
  if(!cloudClass || infraredDensity>=115)
    return {density:infraredDensity,source:232,confidence:135,recovered:false};
  // Categorical class contributes a visually restrained grey cloud, not a
  // fabricated photometric optical-thickness estimate. Keep actual NOAA IR
  // texture at its full original signal if stronger.
  const complemented=Math.min(126,Math.round(
    wmsDensity*.49+infraredDensity*.24));
  if(complemented<=infraredDensity+4)
    return {density:infraredDensity,source:232,confidence:135,recovered:false};
  return {
    density:complemented,source:wmsSource,confidence:wmsConfidence,
    recovered:true,
  };
}

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
  const calibration=estimateGmgsiVisualGains(scientific,gmgsi);
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
      const y=Math.floor(p/w),x=p-y*w;
      const density=Math.round(Math.min(255,ir[o]*interpolateGmgsiVisualGain(calibration,x,y)));
      const correction=recoverMeteosatCloudsUnderWeakIr(
        density,base[o],base[o+1],base[o+2]);
      out[o]=correction.density;
      out[o+1]=correction.confidence;
      out[o+2]=correction.source;
      out[o+3]=255;
      // A real Meteosat WMS cloud class can rescue weak IR, not overwrite
      // the science mask. Track the true owner in both pixels AND metrics.
      if(!correction.recovered){
        if(base[o+1]===0) added++;
        else if(base[o+2]===224 || base[o+2]===248) displaced++;
        visual++;
      } else if(base[o+1]===0) {
        // Cannot happen with wmsConfidence>=85; reserved for audit.
        added++;
      }
      total++;
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
