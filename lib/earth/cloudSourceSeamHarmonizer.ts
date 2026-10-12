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
  let tail=0, longitudePairs=0, sourceClearEdges=0;
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
    if(reference===0 && rgba[p*4]===0)continue;
    if(rgba[p*4]===0)sourceClearEdges++;
    distance[p]=1;
    edgeValue[p]=reference;
    // Only extend a satellite-observed BRIGHT cloud into an otherwise dim
    // visual gap. Never impose large stretches of black over valid IR clouds.
    seamRadius[p]=nativeL2Neighbor
      ? (reference>rgba[p*4]+12 ? R : reference+12<rgba[p*4] ? 12 : 28)
      : 28;
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
    const changed=Math.max(0,Math.min(255,Math.round(
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
  }};
}
