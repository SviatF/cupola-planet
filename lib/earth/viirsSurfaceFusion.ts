/**
 * VISUAL-only conservative fusion of near-daily VIIRS true-color observations
 * with the existing NASA basemap. This is NOT a scientific L2 QA/cloud mask.
 * Output leaves oceans/cloud-like/no-data and strongly mismatched colors
 * unchanged. Never label this as fully cloud-free or global LIVE surface.
 */
export type FusionStats={acceptedPixels:number;totalPixels:number;date:string;sensor:string};
export function eligibleViirsLandPixel(
  baseR:number,baseG:number,baseB:number,
  viirsR:number,viirsG:number,viirsB:number
):number{
  // Reject black swath background, grayscale/bright cloud or snow, and ocean.
  if(Math.max(viirsR,viirsG,viirsB)<42 || viirsR+viirsG+viirsB<120)return 0;
  const baseMax=Math.max(baseR,baseG,baseB);
  const vMax=Math.max(viirsR,viirsG,viirsB);
  if(baseMax<28 || vMax>222)return 0;
  if(baseB>baseR*1.16&&baseB>baseG*1.10)return 0; // probable ocean
  if(viirsB>viirsR*1.16&&viirsB>viirsG*1.12)return 0;
  if(viirsR>130&&viirsG>130&&viirsB>130&&vMax-Math.min(viirsR,viirsG,viirsB)<35)return 0;
  if(baseR>190&&baseG>190&&baseB>190)return 0; // icy/bright surface
  const baseSum=baseR+baseG+baseB,vSum=viirsR+viirsG+viirsB;
  const nr=viirsR/vSum,ng=viirsG/vSum,nb=viirsB/vSum;
  const br=baseR/baseSum,bg=baseG/baseSum,bb=baseB/baseSum;
  const chromaDelta=Math.abs(nr-br)+Math.abs(ng-bg)+Math.abs(nb-bb);
  if(chromaDelta>0.23)return 0; // conservative cloud or changed geometry
  const baseLum=.2126*baseR+.7152*baseG+.0722*baseB;
  const newLum=.2126*viirsR+.7152*viirsG+.0722*viirsB;
  if(newLum<baseLum*.46||newLum>baseLum*1.8)return 0;
  // Never hide surface entirely with an uncertain optical overlay.
  return Math.max(0,Math.min(.76,(.23-chromaDelta)*3.3));
}
export function fuseViirsPixels(
  base:Uint8ClampedArray,observed:Uint8ClampedArray,
  width:number,height:number
):{pixels:Uint8ClampedArray;accepted:number}{
  if(base.length!==width*height*4||observed.length!==base.length)
    throw Error("VIIRS/base dimensions mismatch");
  const out=new Uint8ClampedArray(base);
  let accepted=0;
  for(let i=0;i<out.length;i+=4){
    const strength=eligibleViirsLandPixel(
      base[i],base[i+1],base[i+2],observed[i],observed[i+1],observed[i+2]);
    if(strength<=0)continue;
    accepted++;
    for(let c=0;c<3;c++)out[i+c]=Math.round(base[i+c]*(1-strength)+observed[i+c]*strength);
  }
  return {pixels:out,accepted};
}
