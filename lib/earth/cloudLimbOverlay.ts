/**
 * CUPOLA V3 — measured NOAA IR cross-source CONTINUITY overlay.
 *
 * ROOT CAUSE: older "positive-only" overlay used max(nativeL2, IR) and
 * seeded only G<=90 science pixels. When L2 brightness was HIGHER than the
 * same-coordinate GMGSI IR, the shader could never reduce it, producing an
 * unmistakable sharp rectangle all the way along the L2 source footprint.
 *
 * The solution is a SYMMETRIC, finite geospatial crossover. For 64 pixels
 * INSIDE native Level-2 and 64 pixels OUTSIDE it (NOAA/WMS VISUAL ONLY),
 * render progressively more of the EXACT SAME DQF-valid measured NOAA IR
 * at each world coordinate, reaching identical imagery on either side of
 * the boundary. Both outer interiors return smoothly to their original
 * signals. This is a separate visual display texture, NOT a scientific
 * cloud mask. It never mutates the verified L2, any provenance G/B/A bytes,
 * timestamp, or the unified archived/source PNG.
 *
 * This overlay must be mixed in the shader, NOT max()-composited.
 * Zero IR radiance is a valid dark observation, not automatically no-data.
 * Cannot run without same-location validated NOAA IR on BOTH sides of a
 * real satellite-source boundary. Never bridge NOAA GFS or missing pixels.
 */
export type SatelliteLimbOverlayStats = {
  borderSeeds: number;
  observedIrLimbPixels: number;
  unsupportedOrClearPixels: number;
  alteredSciencePixels: 0;
  radiusPixels: number;
  farSideIrPixels: number;
  maxObservedDistance: number;
  nativeSidePixels: number;
  supplementalSidePixels: number;
  originalLevel2Immutable: true;
  sameCoordinateIrBothSides: true;
};

const ease=(v:number)=>{
  const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);
};
const supplemental=(b:number)=>b===224||b===232||b===248;
const validIr=(data:Uint8ClampedArray,p:number)=>{
  const o=p*4;
  return data[o+1]===135&&data[o+2]===232&&data[o+3]===255;
};

/**
 * Density transform must be the SAME as used in the NOAA visual compositor.
 * The optional callback is provided by the caller with its image-calibration
 * field; the deterministic stand-alone QA defaults to exact raw source R.
 */
export function buildSatelliteLimbOverlay(
  science:ImageData,
  composite:ImageData,
  infrared:ImageData,
  radius=64,
  measuredIrDensity?:(x:number,y:number,sourceDensity:number)=>number,
):{image:ImageData;stats:SatelliteLimbOverlayStats}{
  const w=science.width,h=science.height,n=w*h;
  if(w<8||h<4||composite.width!==w||composite.height!==h||
     infrared.width!==w||infrared.height!==h)
    throw new Error("Satellite crossover requires matching global coordinates");
  const limit=Math.max(8,Math.min(96,Math.floor(radius)));
  const s=science.data,c=composite.data,ir=infrared.data;
  const out=new ImageData(new Uint8ClampedArray(n*4),w,h);
  const dst=out.data;
  const dist=new Uint8Array(n);
  const queue=new Int32Array(n);
  const isNative=(p:number)=>s[p*4+1]>0&&s[p*4+2]<200;
  const isSatelliteVisual=(p:number)=>{
    const o=p*4;
    return !isNative(p)&&c[o+1]>0&&supplemental(c[o+2]);
  };
  const supported=(p:number)=>validIr(ir,p)&&(isNative(p)||isSatelliteVisual(p));
  const neighbors=(p:number,visit:(q:number)=>void)=>{
    const x=p%w,y=(p-x)/w;
    visit(p+(x===0?w-1:-1));
    visit(p+(x===w-1?-(w-1):1));
    if(y>0)visit(p-w);
    if(y+1<h)visit(p+w);
  };

  let end=0;
  // The two sides are seeded with the SAME verified infrared acquisition,
  // not with brightness values copied from the neighboring satellite.
  for(let p=0;p<n;p++){
    if(!supported(p))continue;
    const native=isNative(p);
    let border=false;
    neighbors(p,q=>{
      if(supported(q)&&isNative(q)!==native)border=true;
    });
    if(!border)continue;
    dist[p]=1;queue[end++]=p;
  }
  const borderSeeds=end;
  // Propagate strictly within each individual native/visual source side.
  // An invalid IR/DQF cell is an absolute barrier: NO interpolation.
  for(let head=0;head<end;head++){
    const p=queue[head],d=dist[p],native=isNative(p);
    if(d>=limit)continue;
    neighbors(p,q=>{
      if(dist[q]||!supported(q)||isNative(q)!==native)return;
      dist[q]=d+1;
      queue[end++]=q;
    });
  }

  let nativePixels=0,otherPixels=0,farNative=0,maxDistance=0,valid=0;
  for(let k=0;k<end;k++){
    const p=queue[k],o=p*4,d=dist[p];
    // 1 on the satellite seam; 0 beyond the finite crossover corridor.
    const t=1-ease((d-1)/(limit-1));
    const opacity=Math.round(t*255);
    if(opacity===0)continue;
    const x=p%w,y=(p-x)/w,raw=ir[o];
    const derived=measuredIrDensity?
      measuredIrDensity(x,y,raw):raw;
    if(!Number.isFinite(derived))continue;
    // Raw IR=0 can legitimately replace a cloudier conflicting L2 signal
    // in the VISUAL layer: this is the key to eliminating one-sided seams.
    dst[o]=Math.round(Math.max(0,Math.min(255,derived)));
    dst[o+1]=opacity;
    dst[o+2]=232;
    dst[o+3]=255;
    valid++;
    maxDistance=Math.max(maxDistance,d);
    if(isNative(p)){
      nativePixels++;
      if(s[o+1]>=246)farNative++;
    }else otherPixels++;
  }
  return {image:out,stats:{
    borderSeeds,
    observedIrLimbPixels:valid,
    unsupportedOrClearPixels:0,
    alteredSciencePixels:0,
    radiusPixels:limit,
    farSideIrPixels:farNative,
    maxObservedDistance:maxDistance,
    nativeSidePixels:nativePixels,
    supplementalSidePixels:otherPixels,
    originalLevel2Immutable:true,
    sameCoordinateIrBothSides:true,
  }};
}
