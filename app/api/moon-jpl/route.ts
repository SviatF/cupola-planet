import { NextResponse } from "next/server";
import { parseHorizonsGeocentricVectors } from "@/lib/earth/jplHorizons";

/**
 * Experimental JPL Horizons geocentric ICRF vectors only.
 * DO NOT use as Earth-fixed positions: UTC -> ECEF conversion is not yet
 * validated here. A failed or ambiguous upstream response is unavailable,
 * never a successful JPL position backed by synthetic Meeus values.
 */
export async function GET(){
  const start=new Date(Math.floor(Date.now()/600000)*600000);
  const end=new Date(start.getTime()+60*60_000);
  const stamp=(d:Date)=>d.toISOString().slice(0,16).replace("T"," ");
  async function load(command:"301"|"10"){
    const u=new URL("https://ssd.jpl.nasa.gov/api/horizons.api");
    const q=(name:string,value:string)=>u.searchParams.set(name,"'"+value+"'");
    u.searchParams.set("format","json");
    q("COMMAND",command);
    q("EPHEM_TYPE","VECTORS");
    q("CENTER","500@399");
    q("REF_PLANE","FRAME");
    q("REF_SYSTEM","ICRF");
    q("VEC_TABLE","1");
    q("VEC_LABELS","NO");
    q("OUT_UNITS","KM-S");
    q("TIME_TYPE","UT");
    q("CSV_FORMAT","YES");
    q("OBJ_DATA","NO");
    q("START_TIME",stamp(start));
    q("STOP_TIME",stamp(end));
    q("STEP_SIZE","10 m");
    const response=await fetch(u.toString(),{
      next:{revalidate:1800},signal:AbortSignal.timeout(9000)
    });
    if(!response.ok)throw new Error("Horizons upstream unavailable");
    const raw=await response.text();
    if(raw.length>1_100_000)throw new Error("Oversized Horizons response");
    const parsed=JSON.parse(raw) as {result?:unknown;error?:unknown};
    if(parsed.error||typeof parsed.result!=="string")throw new Error("Horizons rejected vector query");
    return parseHorizonsGeocentricVectors(parsed.result,command==="301"?"moon":"sun");
  }
  try{
    const [moon,sun]=await Promise.all([load("301"),load("10")]);
    if(moon.length!==sun.length || moon.some((v,i)=>Math.abs(v.jdUt-sun[i].jdUt)>1e-7))
      throw new Error("JPL solar and lunar series are not synchronized");
    return NextResponse.json({
      source:"JPL HORIZONS",provenance:"GEOCENTRIC_ICRF_RAW",
      validation:"NOT_EARTH_FIXED_NOT_YET_USED_BY_RENDERER",moon,sun,
      generatedAt:new Date().toISOString()
    },{headers:{"Cache-Control":"public, max-age=0, s-maxage=1800, stale-while-revalidate=300"}});
  }catch{
    return NextResponse.json({error:"Unverified or unavailable JPL Horizons ICRF data",
      provenance:"UNAVAILABLE"},{status:503,headers:{"Cache-Control":"public, max-age=0, s-maxage=120"}});
  }
}
