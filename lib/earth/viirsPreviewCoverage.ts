/**
 * Display-only estimate of *visible* NASA GIBS true-color swath pixels.
 * Black/no-data fill must never be reported as a full-Earth observation.
 * NOT a scientific cloud/QA mask and never appropriate for surface fusion.
 */
export type ViirsPreviewExtent = {
  visibleFraction: number;
  observedSamplePixels: number;
  sampledPixels: number;
  bounds: {x:number;y:number;width:number;height:number};
  status: "partial-swath"|"broad-visible-swaths"|"insufficient-imagery";
};

export function estimateViirsPreviewExtent(
  pixels: Uint8ClampedArray | Uint8Array, width:number, height:number,
):ViirsPreviewExtent {
  if(!Number.isInteger(width)||!Number.isInteger(height)||
    width<16||height<8||width*height>262144||pixels.length<width*height*4)
    throw Error("Invalid VIIRS thumbnail sampling dimensions");
  const cols=new Uint16Array(width);
  const rows=new Uint16Array(height);
  let observed=0;
  // WMS NoData is close to black. Real very dark ocean pixels can be
  // excluded, so this is conservative VISIBLE coverage, never data QA.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];
    if(a<150||Math.max(r,g,b)<34||(r+g+b)<73)continue;
    observed++;
    cols[x]++;
    rows[y]++;
  }
  const sampled=width*height;
  const visibleFraction=observed/sampled;
  if(visibleFraction<0.009)return {
    visibleFraction,observedSamplePixels:observed,sampledPixels:sampled,
    bounds:{x:0,y:0,width:1,height:1},status:"insufficient-imagery",
  };
  // Find densest contiguous set of observed columns. A raw polar-orbit
  // swath may cover one narrow longitude band of a global black raster.
  // Bridge small discontinuities but NOT entire blank oceans.
  const minColumnCount=Math.max(2,Math.floor(height*.018));
  let bestStart=0,bestEnd=width-1,bestWeight=-1;
  let currentStart=-1,lastGood=-1,currentWeight=0,gap=0;
  const finish=()=>{
    if(currentStart>=0&&currentWeight>bestWeight){
      bestWeight=currentWeight;bestStart=currentStart;bestEnd=lastGood;
    }
    currentStart=-1;lastGood=-1;currentWeight=0;gap=0;
  };
  for(let x=0;x<=width;x++){
    const valid=x<width&&cols[x]>=minColumnCount;
    if(valid){
      if(currentStart<0){currentStart=x;currentWeight=0;}
      lastGood=x;currentWeight+=cols[x];gap=0;
    }else if(currentStart>=0){
      if(++gap>Math.max(2,Math.round(width*.018)))finish();
    }
  }
  finish();
  if(bestWeight<0){bestStart=0;bestEnd=width-1;}
  let minY=height-1,maxY=0;
  const minRowCount=Math.max(2,Math.floor((bestEnd-bestStart+1)*.012));
  for(let y=0;y<height;y++){
    let count=0;
    for(let x=bestStart;x<=bestEnd;x++){
      const i=(y*width+x)*4;
      const r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];
      if(a>=150&&Math.max(r,g,b)>=34&&r+g+b>=73)count++;
    }
    if(count>=minRowCount){minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  }
  if(minY>maxY){minY=0;maxY=height-1;}
  const marginX=Math.max(3,Math.round((bestEnd-bestStart+1)*.08));
  const marginY=Math.max(3,Math.round((maxY-minY+1)*.08));
  const left=Math.max(0,bestStart-marginX);
  const right=Math.min(width,bestEnd+marginX+1);
  const top=Math.max(0,minY-marginY);
  const bottom=Math.min(height,maxY+marginY+1);
  return {
    visibleFraction,observedSamplePixels:observed,sampledPixels:sampled,
    bounds:{x:left/width,y:top/height,width:(right-left)/width,height:(bottom-top)/height},
    status:visibleFraction>=.72?"broad-visible-swaths":"partial-swath",
  };
}

export function viirsFrameCrop(
  bounds:ViirsPreviewExtent["bounds"], sourceWidth:number,sourceHeight:number,
  aspect=4/3,
):{x:number;y:number;width:number;height:number} {
  if(!Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||
    sourceWidth<=0||sourceHeight<=0)throw Error("Invalid VIIRS source image");
  const centerX=(bounds.x+bounds.width/2)*sourceWidth;
  const centerY=(bounds.y+bounds.height/2)*sourceHeight;
  let w=Math.max(32,bounds.width*sourceWidth),h=Math.max(32,bounds.height*sourceHeight);
  if(w/h>aspect)h=w/aspect;
  else w=h*aspect;
  // Never sample outside the real image. This crop only changes the preview,
  // it does not fill or extrapolate Earth surface or satellite observations.
  const f=Math.min(1,sourceWidth/w,sourceHeight/h);
  w*=f;h*=f;
  return {x:Math.max(0,Math.min(sourceWidth-w,centerX-w/2)),
    y:Math.max(0,Math.min(sourceHeight-h,centerY-h/2)),
    width:w,height:h};
}
