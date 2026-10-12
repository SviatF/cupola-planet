/**
 * CUPOLA Cloud V3 -- final SOURCE-AWARE display-only seam compositor.
 *
 * Operates on a finished global 2048x1024 image after source priority has
 * already been decided. Never reprojects/expands the footprint of a source.
 * RGB atlas channel conventions: R displayed density, G validity/QA,
 * B provenance (GMGSI 232, Meteosat 224/248, GFS 255, L2 other), A 255.
 *
 * Only fallback R may change. L2 including classified-clear R=0 stays byte
 * identical, as do all G/B/A, all unknown/invalid and all original inputs.
 *
 * - Where clouds exist on both sides of a source edge, a bounded harmonic
 *   luminance correction grows only inside the LOWER-priority source.
 * - Where a visual-only GMGSI IR scene ends at model CLEAR sky, it fades only
 *   the last 18px of GMGSI, instead of painting clouds over model-clear sky.
 * - Longitude is periodic (EPSG:4326 x=0 touches x=width-1).
 *
 * No model-clear sky is filled with invented clouds. These are display
 * corrections and MUST NOT be counted as new satellite coverage.
 */
export type CloudSourceSeamStats = {
  boundaryPairs: number;
  softenedPixels: number;
  taperedIrPixels: number;
  longitudePairs: number;
};
export type CloudSourceSeamResult = {
  image: ImageData;
  stats: CloudSourceSeamStats;
};
const rank = (r:number) => {
  if (r===255) return 1; // forecast model
  if (r===224 || r===248) return 2; // EUMETSAT styled WMS
  if (r===232) return 3; // NOAA GMGSI IR visual-only
  return 4; // NOAA/JMA native Level-2 (or protected unknown)
};
const isVisual = (s:number)=>s===255||s===224||s===248||s===232;
const smooth = (t:number)=>{
  const x=Math.max(0,Math.min(1,t));
  return x*x*(3-2*x);
};

export function harmonizeV3CloudEdges(
  input:ImageData, radius=18,
):CloudSourceSeamResult {
  const w=input.width,h=input.height, pixels=input.data;
  if(w<8||h<8||pixels.length!==w*h*4)
    throw new Error("CUPOLA V3 requires a rectangular RGBA cloud atlas");
  const n=w*h;
  const limit=Math.max(4,Math.min(32,Math.floor(radius)));
  const result=new ImageData(new Uint8ClampedArray(pixels),w,h);
  const out=result.data;
  const dist=new Uint8Array(n);
  const delta=new Float32Array(n);
  const taperDist=new Uint8Array(n);
  const queue=new Int32Array(n);
  const fadeQueue=new Int32Array(n);
  let end=0, fadeEnd=0, boundaries=0, wrapPairs=0;
  const source=(p:number)=>pixels[p*4+2];
  const valid=(p:number)=>pixels[p*4+1]>0 && isVisual(source(p));
  const visit=(p:number,fn:(q:number)=>void)=>{
    const x=p%w,y=(p-x)/w;
    fn(p+(x===0?w-1:-1));
    fn(p+(x===w-1?-(w-1):1));
    if(y>0)fn(p-w);
    if(y+1<h)fn(p+w);
  };
  // Seed the correct (lower-priority) side of observed/model boundaries.
  // Only originally positive-cloud pixels can be harmonized.
  for(let p=0;p<n;p++){
    if(!valid(p))continue;
    const s=source(p), priority=rank(s), po=p*4, r=pixels[po];
    if(r===0)continue;
    let target=0, samples=0;
    visit(p,q=>{
      if(!valid(q)||rank(source(q))<=priority) return;
      const qr=pixels[q*4];
      if(qr===0) return;
      target+=qr;samples++;
      if((p%w===0&&q%w===w-1)||(p%w===w-1&&q%w===0))wrapPairs++;
    });
    if(samples){
      delta[p]=Math.max(-72,Math.min(72,(target/samples-r)*0.83));
      dist[p]=1;queue[end++]=p;boundaries++;
    }
    // Forecast classified/estimated clear is NEVER painted cloudy. On
    // GMGSI (visual IR, not science) side, soften its own final pixels.
    if(s!==232)continue;
    let nextToClearForecast=false;
    visit(p,q=>{
      if(valid(q)&&source(q)===255&&pixels[q*4]===0)
        nextToClearForecast=true;
    });
    if(nextToClearForecast){taperDist[p]=1;fadeQueue[fadeEnd++]=p;}
  }
  // Propagate local color corrections only through the SAME lower-priority
  // source so no corrections jump rectangular footprints or L2 boundaries.
  let read=0;
  while(read<end){
    const p=queue[read++],d=dist[p],s=source(p);
    if(d>=limit)continue;
    visit(p,q=>{
      if(dist[q]||!valid(q)||source(q)!==s||pixels[q*4]===0)return;
      dist[q]=d+1;delta[q]=delta[p];queue[end++]=q;
    });
  }
  // Short-range Laplace smoothing removes the radial Voronoi streaks that
  // nearest-edge colors alone cause near jagged GEO footprints.
  let cur=delta, other=new Float32Array(n);
  for(let iteration=0;iteration<8;iteration++){
    for(let i=0;i<end;i++){
      const p=queue[i],d=dist[p];
      if(d===1){other[p]=delta[p];continue;}
      let value=cur[p],count=1;
      visit(p,q=>{
        if(dist[q]>0 && source(q)===source(p)){
          value+=cur[q];count++;
        }
      });
      other[p]=value/count;
    }
    const tmp=cur;cur=other;other=tmp;
  }
  let changed=0;
  for(let i=0;i<end;i++){
    const p=queue[i],o=p*4,r=pixels[o];
    const fade=1-smooth((dist[p]-1)/limit);
    const adjusted=Math.max(0,Math.min(255,Math.round(r+cur[p]*fade)));
    if(adjusted!==r){out[o]=adjusted;changed++;}
  }
  // GMGSI-to-clear-model edge: fade GMGSI over a short distance instead of
  // creating clouds in model-clear cells. L2, WMS, and GFS never fade here.
  const fadeLimit=Math.min(18,limit);
  read=0;
  while(read<fadeEnd){
    const p=fadeQueue[read++],d=taperDist[p];
    if(d>=fadeLimit)continue;
    visit(p,q=>{
      if(taperDist[q]||!valid(q)||source(q)!==232||pixels[q*4]===0)return;
      taperDist[q]=d+1;fadeQueue[fadeEnd++]=q;
    });
  }
  let faded=0;
  for(let i=0;i<fadeEnd;i++){
    const p=fadeQueue[i],o=p*4;
    // At the boundary there must be no step to model-clear (R=0).
    // Smoothly restore unaltered IR by fadeLimit pixels inland.
    const weight=smooth((taperDist[p]-1)/Math.max(1,fadeLimit-1));
    const adjusted=Math.round(out[o]*weight);
    if(out[o]!==adjusted){out[o]=adjusted;faded++;}
  }
  return {image:result,stats:{
    boundaryPairs:boundaries,softenedPixels:changed,
    taperedIrPixels:faded,longitudePairs:wrapPairs,
  }};
}
