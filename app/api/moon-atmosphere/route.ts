import { NextRequest, NextResponse } from "next/server";

/**
 * CAMS AOD550 through Open-Meteo. These are numerical weather-model fields,
 * NOT direct optical observations of the Moon. Cache upstream requests and
 * return no aerosol estimate when the model time is too old.
 */
export async function GET(request:NextRequest){
  const rawLat=request.nextUrl.searchParams.get("lat");
  const rawLon=request.nextUrl.searchParams.get("lon");
  const lat=rawLat===null?NaN:Number(rawLat);
  const lon=rawLon===null?NaN:Number(rawLon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){
    return NextResponse.json({error:"Invalid observer coordinates"},{status:400});
  }
  // Quantize requests to limit geographically redundant upstream calls.
  const qLat=Math.round(lat*4)/4;
  const qLon=Math.round(lon*4)/4;
  const url=new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude",String(qLat));
  url.searchParams.set("longitude",String(qLon));
  url.searchParams.set("current","aerosol_optical_depth");
  url.searchParams.set("timezone","UTC");
  url.searchParams.set("forecast_days","1");
  try{
    const upstream=await fetch(url.toString(),{next:{revalidate:1800},signal:AbortSignal.timeout(7000)});
    if(!upstream.ok)throw new Error("Air-quality upstream unavailable");
    const data=await upstream.json() as {current?:{time?:unknown;aerosol_optical_depth?:unknown}};
    const rawAod=data.current?.aerosol_optical_depth;
    const aod=typeof rawAod==="number"?rawAod:NaN;
    const rawTime=data.current?.time;
    if(typeof rawTime!=="string")throw new Error("Missing CAMS forecast time");
    const validMs=Date.parse(rawTime.endsWith("Z")?rawTime:rawTime+"Z");
    if(!Number.isFinite(validMs)||Math.abs(Date.now()-validMs)>4*3600_000 ||
      !Number.isFinite(aod)||aod<0||aod>3.5)throw new Error("Missing or stale CAMS AOD");
    return NextResponse.json({
      aerosolOpticalDepth550:aod,
      validAt:new Date(validMs).toISOString(),
      source:"CAMS via Open-Meteo",
      provenance:"MODEL_FORECAST",
      latitude:qLat,
      longitude:qLon
    },{headers:{"Cache-Control":"public, max-age=0, s-maxage=1800, stale-while-revalidate=600"}});
  }catch{
    return NextResponse.json({error:"No fresh CAMS aerosol estimate",provenance:"UNAVAILABLE"},
      {status:503,headers:{"Cache-Control":"public, max-age=0, s-maxage=120"}});
  }
}
