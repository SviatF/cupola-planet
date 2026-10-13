/**
 * CUPOLA scientific V3: source-AWARE image-space handoff, DISPLAY ONLY.
 *
 * Previous seam filter skipped every lower-priority clear/dark pixel (R=0)
 * and required both sides to be cloudy. Thus a bright L2 frame next to dark
 * GMGSI/GFS produced a literal hard rectangular edge from pole to pole.
 *
 * Use higher-priority observations as the fixed edge condition and adapt
 * ONLY the 28-pixel strip of the lower-priority visual source. We treat a
 * model-clear cell as uncertain (not an independently verified cloud mask):
 * close to an observed cloudy L2 border it may acquire an interpolated
 * *visual signal* for continuity. No such changed pixel counts as an
 * observation or satellite coverage. Native classified-clear L2 stays clear.
 * Source provenance G/B/A stays byte-identical, even in this display-only
 * transition. Interior cloud morphology and all no-data remain unchanged.
 *
 * X is periodic longitude, Y clamps at the poles.
 */
export type CloudSourceSeamStats={
  boundaryPairs:number;
  softenedPixels:number;
  taperedIrPixels:number;
  longitudePairs:number;
  interpolatedModelClearPixels:number;
  crossSourceClearEdges:number;
  preventedDarkeningSeeds:number;
  untouchedSupplementalPixels:number;
};
export type CloudSourceSeamResult={image:ImageData;stats:CloudSourceSeamStats};
const rank=(code:number)=>{
  if(code===255)return 1; // low-confidence NOAA GFS model
  if(code===224||code===248)return 2; // styled Meteosat WMS
  if(code===232)return 3; // NOAA GMGSI IR proxy
  return 4; // verified scientific L2 (protected)
};
const visual=(code:number)=>code===255||code===224||code===248||code===232;
const smooth=(n:number)=>{
  const x=Math.max(0,Math.min(1,n));return x*x*(3-2*x);
};
export function harmonizeV3CloudEdges(
  input:ImageData,radius=28,
):CloudSourceSeamResult{
  const w=input.width,h=input.height,rgba=input.data,n=w*h;
  if(w<8||h<8||rgba.length!==n*4)
    throw new Error("Cloud seam atlas dimensions invalid");
  // Long-range matching is reserved for bright native-L2 boundaries only.
  // WMS/GMGSI/GFS source borders retain a conservative 28px transition.
  const R=Math.max(4,Math.min(96,Math.floor(radius)));
  const result=new ImageData(new Uint8ClampedArray(rgba),w,h);
  const out=result.data;
  const distance=new Uint8Array(n);
  const edgeValue=new Float32Array(n);
  const seamRadius=new Uint8Array(n);
  const queue=new Int32Array(n);
  let tail=0, longitudePairs=0, sourceClearEdges=0,preventedDarkening=0;
  const src=(p:number)=>rgba[p*4+2];
  const present=(p:number)=>rgba[p*4+1]>0;
  const candidate=(p:number)=>present(p)&&visual(src(p));
  const around=(p:number,fn:(q:number,wrap:boolean)=>void)=>{
    const x=p%w,y=(p-x)/w;
    fn(p+(x===0?w-1:-1),x===0);
    fn(p+(x===w-1?-(w-1):1),x===w-1);
    if(y>0)fn(p-w,false);
    if(y+1<h)fn(p+w,false);
  };
  // Edges are seeded on the LOW-priority side, including its R=0 pixels.
  // L2 (including known-clear L2) is a non-writing boundary condition.
  // Higher-priority R is real display data, not guessed from brightness.
  for(let p=0;p<n;p++){
    if(!candidate(p))continue;
    const level=rank(src(p));
    let sum=0,samples=0,nativeL2Neighbor=false;
    around(p,(q,wrap)=>{
      if(!present(q)||rank(src(q))<=level)return;
      // Do not blur across an unrelated L2 classified-clear boundary:
      // a matching clear region should remain visually clear.
      sum+=rgba[q*4];
      samples++;
      if(rank(src(q))===4)nativeL2Neighbor=true;
      if(wrap)longitudePairs++;
    });
    if(!samples)continue;
    const reference=sum/samples;
    // CRITICAL: a dark or classified-clear Level-2 fringe is NOT evidence
    // that real adjacent GMGSI/Meteosat cloud should be erased. Older code
    // matched both directions and created a pole-to-pole BLACK curtain on
    // the lower-priority side. Only add a missing positive cloud signal;
    // never subtract real lower-priority observations to match dark L2.
    if(reference<=rgba[p*4]+2){preventedDarkening++;continue;}
    if(rgba[p*4]===0)sourceClearEdges++;
    distance[p]=1;
    edgeValue[p]=reference;
    // Only extend a satellite-observed BRIGHT cloud into an otherwise dim
    // visual gap. Never impose large stretches of black over valid IR clouds.
    seamRadius[p]=nativeL2Neighbor && reference>rgba[p*4]+12
      ? R : 28;
    queue[tail++]=p;
  }
  // Geodesic (4-neighbour) distance inside each *unchanged footprint*.
  // We don't propagate across no-data or into any other source.
  let head=0;
  while(head<tail){
    const p=queue[head++],d=distance[p],type=src(p);
    if(d>=seamRadius[p])continue;
    around(p,(q)=>{
      if(distance[q]||!candidate(q)||src(q)!==type)return;
      distance[q]=d+1;
      edgeValue[q]=edgeValue[p];
      seamRadius[q]=seamRadius[p];
      queue[tail++]=q;
    });
  }
  // Propagated nearest-seed values can make radial streaks. Diffuse the
  // target luminance tangentially within source-connected strip only,
  // keeping source-edge pixels pinned to the actual higher-trust signal.
  let cur=edgeValue,other=new Float32Array(n);
  for(let iteration=0;iteration<24;iteration++){
    for(let i=0;i<tail;i++){
      const p=queue[i];
      if(distance[p]===1){other[p]=edgeValue[p];continue;}
      let value=cur[p],samples=1;
      around(p,q=>{
        if(distance[q]>0&&src(q)===src(p)){
          value+=cur[q];samples++;
        }
      });
      other[p]=value/samples;
    }
    const swap=cur;cur=other;other=swap;
  }
  let softened=0,modeledClear=0;
  for(let i=0;i<tail;i++){
    const p=queue[i],o=p*4;
    // Near edge = strong correspondence, into fallback = original pixels.
    // Extra feather width covers cloud-edge registration differences,
    // but excludes interiors by construction.
    const closeness=1-smooth((distance[p]-1)/seamRadius[p]);
    // Even an averaged nearest-edge value may be lower than a different
    // nearby real cloud. Never paint a dark stripe by subtracting it.
    const changed=Math.max(rgba[o],Math.min(255,Math.round(
      rgba[o]*(1-closeness)+cur[p]*closeness
    )));
    if(changed===rgba[o])continue;
    if(rgba[o]===0&&src(p)===255&&changed>0)modeledClear++;
    out[o]=changed;
    softened++;
  }
  return {image:result,stats:{
    boundaryPairs:tail,softenedPixels:softened,taperedIrPixels:0,
    longitudePairs,interpolatedModelClearPixels:modeledClear,
    crossSourceClearEdges:sourceClearEdges,
    preventedDarkeningSeeds:preventedDarkening,
    untouchedSupplementalPixels:n-tail,
  }};
}


/**
 * Display-only, STRUCTURE-PRESERVING V3 radiometric seam matching.
 *
 * Satellite cloud MASK opacity and IR brightness are different physical
 * quantities. Matching one source by copying the neighbor's brightness
 * creates long white/black curtains. This optional SECOND pass never copies
 * cross-source cloud pixels; it scales only already-observed visual features
 * on the lower-priority side of a real boundary. Pixel R=0 stays 0.
 *
 * Boundary gains are estimated only where both independent sources show
 * nontrivial structure (R>=28). Different cloud outlines or classified clear
 * sky are NOT assumed to coincide. Corrections are clamped to +/-32/255 and
 * smoothly disappear within 56 atlas pixels. Verified L2 and G/B/A ownership
 * are byte-for-byte immutable. Intended only for the V3 preview, not Cinema.
 */
export function toneMatchV3SupplementalSeams(
  input:ImageData,radius=56,
):{image:ImageData;stats:{
  pairedEdges:number;affectedPixels:number;brightenedPixels:number;
  darkenedPixels:number;maxAbsoluteChange:number;radiusPixels:number;
  zeroCloudPixelsPreserved:boolean;originalLevel2Immutable:boolean;
}}{
  const w=input.width,h=input.height,raw=input.data,n=w*h;
  if(w<8||h<8||raw.length!==n*4)throw new Error("Invalid V3 tone-matching atlas");
  const limit=Math.max(8,Math.min(80,Math.floor(radius)));
  const output=new ImageData(new Uint8ClampedArray(raw),w,h);
  const dest=output.data;
  const distance=new Uint8Array(n),gain=new Float32Array(n);
  const queue=new Int32Array(n);
  const src=(p:number)=>raw[p*4+2];
  const enabled=(p:number)=>raw[p*4+1]>0&&visual(src(p))&&src(p)!==255;
  const nearby=(p:number,cb:(q:number)=>void)=>{
    const x=p%w,y=(p-x)/w;
    cb(p+(x===0?w-1:-1));cb(p+(x===w-1?-(w-1):1));
    if(y>0)cb(p-w);
    if(y+1<h)cb(p+w);
  };
  let tail=0,pairedEdges=0;
  for(let p=0;p<n;p++){
    if(!enabled(p)||raw[p*4]<28)continue;
    let sum=0,weight=0;
    nearby(p,q=>{
      if(raw[q*4+1]===0||rank(src(q))<=rank(src(p))||raw[q*4]<28)return;
      // Compare only matching cloud-bearing pixels, NEVER extrapolate a
      // cloud into known-clear L2 or low-radiance IR background.
      const low=raw[p*4],high=raw[q*4];
      const log=Math.log((high+18)/(low+18));
      sum+=Math.max(-0.47,Math.min(0.47,log));
      weight++;
    });
    if(!weight)continue;
    pairedEdges+=weight;
    distance[p]=1;gain[p]=sum/weight;
    queue[tail++]=p;
  }
  // Propagate through source-local footprints ONLY; longitude wraps.
  // This never borrows GFS model or a neighbor's meteorological structure.
  for(let head=0;head<tail;head++){
    const p=queue[head],d=distance[p];
    if(d>=limit)continue;
    nearby(p,q=>{
      if(distance[q]||!enabled(q)||src(q)!==src(p))return;
      distance[q]=d+1;gain[q]=gain[p];
      queue[tail++]=q;
    });
  }
  // Jacobi tangential diffusion avoids nearest-seed Voronoi streaks.
  // Actual edge measurements (d=1) are fixed, and no other source is read.
  let current=gain,following=new Float32Array(n);
  for(let pass=0;pass<20;pass++){
    for(let i=0;i<tail;i++){
      const p=queue[i];
      if(distance[p]===1){following[p]=gain[p];continue;}
      let sum=current[p]*2,weights=2;
      nearby(p,q=>{
        if(distance[q]>0&&src(q)===src(p)){
          sum+=current[q];weights++;
        }
      });
      following[p]=sum/weights;
    }
    const temp=current;current=following;following=temp;
  }
  let affected=0,brightened=0,darkened=0,maxAbsolute=0;
  for(let i=0;i<tail;i++){
    const p=queue[i],o=p*4,original=raw[o];
    // No zero-to-grey fill and no near-clear atmospheric blanket.
    if(original<28)continue;
    const normalized=(distance[p]-1)/limit;
    const feather=1-smooth(normalized);
    const shifted=Math.round(original*Math.exp(current[p]*feather*0.82));
    const change=Math.max(-32,Math.min(32,shifted-original));
    if(change===0)continue;
    dest[o]=Math.max(0,Math.min(255,original+change));
    affected++;if(change>0)brightened++;else darkened++;
    maxAbsolute=Math.max(maxAbsolute,Math.abs(change));
  }
  return {image:output,stats:{
    pairedEdges,affectedPixels:affected,brightenedPixels:brightened,
    darkenedPixels:darkened,maxAbsoluteChange:maxAbsolute,
    radiusPixels:limit,zeroCloudPixelsPreserved:true,
    originalLevel2Immutable:true,
  }};
}
