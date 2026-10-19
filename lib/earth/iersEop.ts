/**
 * IERS Rapid EOP: Bulletin A daily IAU2000A series.
 * https://data.iers.org/products/eop/rapid/daily/json/finals2000A.daily.json
 * xp/yp are arcseconds, UT1-UTC is SECONDS (not milliseconds).
 * Do not fabricate Earth orientation values if the feed is unavailable.
 */
export type EarthOrientation={mjd:number;dut1Seconds:number;xpArcsec:number;ypArcsec:number;quality:"FINAL"|"RAPID"|"PREDICTION"};
const parse=(v:unknown)=>typeof v==="string"&&v.trim()!==""?Number(v):
  typeof v==="number"?v:NaN;
type SeriesItem={time?:{MJD?:unknown};dataEOP?:{
  pole?:Array<{source?:string;type?:string;X?:unknown;Y?:unknown}>;
  UT?:Array<{source?:string;type?:string;["UT1-UTC"]?:unknown}>;
}};
export function parseIersDaily(json:unknown):EarthOrientation[]{
  if(!json||typeof json!=="object")throw Error("Invalid IERS EOP payload");
  const eop=(json as {EOP?:{type?:string;data?:{timeSeries?:unknown}}}).EOP;
  if(eop?.type!=="IAU2000A"||!Array.isArray(eop.data?.timeSeries)||
    eop.data.timeSeries.length<2||eop.data.timeSeries.length>150)
    throw Error("Missing IERS daily IAU2000A data");
  const result:EarthOrientation[]=[];
  for(const record of eop.data.timeSeries as SeriesItem[]){
    const mjd=parse(record.time?.MJD);
    const pole=record.dataEOP?.pole?.find(p=>p.source==="BulletinA");
    const ut=record.dataEOP?.UT?.find(p=>p.source==="BulletinA");
    const x=parse(pole?.X),y=parse(pole?.Y),dut1=parse(ut?.["UT1-UTC"]);
    if(![mjd,x,y,dut1].every(Number.isFinite))continue;
    if(!Number.isInteger(mjd)||mjd<50000||mjd>80000||
       Math.abs(x)>1||Math.abs(y)>1||Math.abs(dut1)>0.9)
      throw Error("IERS record outside Earth-orientation safety bounds");
    const label=String(ut?.type??pole?.type??"").toLowerCase();
    const quality=label==="final"?"FINAL":label==="prediction"?"PREDICTION":"RAPID";
    if(result.length && mjd<=result[result.length-1].mjd)
      throw Error("IERS MJD not strictly increasing");
    result.push({mjd,dut1Seconds:dut1,xpArcsec:x,ypArcsec:y,quality});
  }
  if(result.length<2)throw Error("No complete IERS UT1 / polar-motion records");
  return result;
}
/** Only bracketed day-to-day interpolation: no data, no fabricated DUT1. */
export function interpolateIersEop(records:EarthOrientation[],date:Date):EarthOrientation|null{
  const mjd=date.getTime()/86400000+40587;
  if(!Number.isFinite(mjd))return null;
  for(let i=1;i<records.length;i++){
    const a=records[i-1],b=records[i];
    if(mjd>=a.mjd&&mjd<=b.mjd&&b.mjd-a.mjd===1){
      const t=mjd-a.mjd;
      return {mjd,dut1Seconds:a.dut1Seconds+(b.dut1Seconds-a.dut1Seconds)*t,
        xpArcsec:a.xpArcsec+(b.xpArcsec-a.xpArcsec)*t,
        ypArcsec:a.ypArcsec+(b.ypArcsec-a.ypArcsec)*t,
        quality:a.quality==="PREDICTION"||b.quality==="PREDICTION"?"PREDICTION":
          a.quality==="FINAL"&&b.quality==="FINAL"?"FINAL":"RAPID"};
    }
  }
  return null;
}
