/**
 * A deliberately conservative, VISUAL-only land mask for fresh VIIRS
 * TrueColor optical data. This is NOT the official VIIRS L2 surface
 * reflectance quality mask; clouds and shadows cannot be certified from RGB.
 *
 * Never turn missing imagery into fabricated terrain. Ocean separation uses
 * NASA/Three's existing ocean specular mask: white = water, dark = land.
 * Accepted RGB pixels are copied unchanged; no fake color/terrain synthesis.
 */
export type LandSurfaceCompositeStats = {
  accepted: number;
  sampled: number;
  coverageFraction: number;
  oceanRejected: number;
  cloudCandidateRejected: number;
  noDataRejected: number;
};
export type LandSurfaceComposite = {
  pixels: Uint8ClampedArray;
  stats: LandSurfaceCompositeStats;
};
export function compositeVIIRSLandSurface(
  imagery: Uint8ClampedArray,
  oceanMask: Uint8ClampedArray,
  width:number,height:number,
): LandSurfaceComposite {
  const count=width*height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||
     width<64||height<32||count>16_777_216||
     imagery.length!==count*4||oceanMask.length!==count*4)
    throw Error("VIIRS land compositing requires equal, bounded RGBA rasters");
  const result=new Uint8ClampedArray(count*4);
  let accepted=0,oceanRejected=0,cloudCandidateRejected=0,noDataRejected=0;
  for(let i=0;i<count;i++) {
    const j=i*4;
    const w=(oceanMask[j]*.2126+oceanMask[j+1]*.7152+oceanMask[j+2]*.0722);
    // White NASA specular texture is ocean (also coastal water).
    // Keep all water exactly as the premium existing 3D ocean material.
    if(w>=100){oceanRejected++;continue;}
    const r=imagery[j],g=imagery[j+1],b=imagery[j+2],a=imagery[j+3];
    const hi=Math.max(r,g,b),lo=Math.min(r,g,b),chroma=hi-lo;
    // TrueColor WMS black/no-data is not Earth ground observation.
    if(a<240||hi<48||r+g+b<175){noDataRejected++;continue;}
    // Optical WHITE/GRAY cloud candidate exclusion. This is intentionally
    // restrictive, but NOT a replacement for native VIIRS cloud QA bits.
    if((hi>162&&chroma<36&&g>140&&b>133)||
       (hi>211&&lo>159)||
       (r+g+b>665&&chroma<71)){
      cloudCandidateRejected++;continue;
    }
    // Coast/shore anti-aliasing of the land-only overlay.
    const coast=Math.max(0,Math.min(1,(100-w)/72));
    const opacity=Math.round(coast*(138+Math.min(40,chroma*.55)));
    if(opacity<36){oceanRejected++;continue;}
    result[j]=r;
    result[j+1]=g;
    result[j+2]=b;
    result[j+3]=opacity;
    accepted++;
  }
  return {
    pixels:result,
    stats:{
      accepted,sampled:count,coverageFraction:accepted/count,
      oceanRejected,cloudCandidateRejected,noDataRejected,
    },
  };
}
