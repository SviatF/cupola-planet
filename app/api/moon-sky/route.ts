import { NextRequest, NextResponse } from "next/server";

/**
 * Weather-model cloud fractions for an Earth-surface Moon observer.
 * Cloud cover is regional area probability, NEVER verified Moon-ray
 * obstruction or a satellite snapshot of the exact sky.
 */
export async function GET(request:NextRequest){
  const p=request.nextUrl.searchParams;
  const lat=p.has("lat")?Number(p.get("lat")):NaN;
  const lon=p.has("lon")?Number(p.get("lon")):NaN;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)
    return NextResponse.json({error:"Invalid coordinates"},{status:400});
  const qLat=Math.round(lat*4)/4,qLon=Math.round(lon*4)/4;
  const url=new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude",String(qLat));
  url.searchParams.set("longitude",String(qLon));
  url.searchParams.set("current","cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,surface_pressure");
  url.searchParams.set("timezone","UTC");
  url.searchParams.set("forecast_days","1");
  try{
    const response=await fetch(url.toString(),{next:{revalidate:900},signal:AbortSignal.timeout(7000)});
    if(!response.ok)throw new Error("Cloud forecast upstream unavailable");
    const data=await response.json() as {current?:Record<string,unknown>};
    const c=data.current;
    if(!c||typeof c.time!=="string")throw new Error("Cloud forecast without timestamp");
    const validMs=Date.parse(c.time.endsWith("Z")?c.time:c.time+"Z");
    if(!Number.isFinite(validMs)||Math.abs(Date.now()-validMs)>3*3600_000)
      throw new Error("Stale regional cloud cover");
    const percentage=(value:unknown):number|null=>typeof value==="number"&&
      Number.isFinite(value)&&value>=0&&value<=100?value:null;
    const cloudCover=percentage(c.cloud_cover);
    if(cloudCover===null)throw new Error("Cloud cover unavailable");
    return NextResponse.json({
      cloudCover,
      lowCover:percentage(c.cloud_cover_low),
      midCover:percentage(c.cloud_cover_mid),
      highCover:percentage(c.cloud_cover_high),
      surfacePressureHpa:typeof c.surface_pressure==="number"&&
        Number.isFinite(c.surface_pressure)&&c.surface_pressure>=550&&
        c.surface_pressure<=1085?c.surface_pressure:null,
      validAt:new Date(validMs).toISOString(),
      provenance:"MODEL_FORECAST",
      precision:"REGIONAL_CLOUD_AREA_NOT_MOON_RAY",
      source:"Open-Meteo forecast"
    },{headers:{"Cache-Control":"public, max-age=0, s-maxage=900, stale-while-revalidate=300"}});
  }catch{
    return NextResponse.json({error:"No fresh regional cloud forecast",
      provenance:"UNAVAILABLE"},{status:503,headers:{"Cache-Control":"public, max-age=0, s-maxage=120"}});
  }
}
