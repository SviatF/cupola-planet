/**
 * Cloud-cover forecast is an AREA FRACTION, not the optical thickness along
 * a single Moon ray. Therefore this estimate intentionally only softens lunar
 * brightness, and does not claim to predict exact per-disc obscuration.
 */
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export function forecastLunarCloudContrast(
  totalCoverPct:number|null, lowPct:number|null,midPct:number|null,highPct:number|null,
):number{
  if(totalCoverPct===null||!Number.isFinite(totalCoverPct)||totalCoverPct<0||totalCoverPct>100)
    return 1;
  const cover=totalCoverPct/100;
  if(cover<=0.65)return 1;
  const valid=(x:number|null)=>x!==null&&Number.isFinite(x)&&x>=0&&x<=100?x/100:null;
  const low=valid(lowPct),mid=valid(midPct),high=valid(highPct);
  const opaqueEstimate=low===null&&mid===null&&high===null?0.5:
    clamp((low??0)*0.65+(mid??0)*0.28+(high??0)*0.07,0,1);
  const highCoverage=clamp((cover-0.65)/0.35,0,1);
  // 0.44 to 1.0 scalar range; intentionally cannot pretend pixel-accurate cloud blockage.
  return clamp(1-highCoverage*(0.25+opaqueEstimate*0.31),0.44,1);
}
