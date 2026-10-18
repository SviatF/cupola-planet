import { NextResponse } from "next/server";
import { celestialAt } from "@/lib/earth/celestialEngine";
import {
  buildHorizonsVectorUrl,parseHorizonsGeocentricVectors,
  validateHorizonsUtcWindow,interpolateHorizonsVectors,horizonsFrameInvariantAudit
} from "@/lib/earth/jplHorizons";

/**
 * Scientific staging endpoint for JPL Horizons Earth-centered ICRF positions.
 * An inertial position is NOT an Earth-fixed position; never pass these
 * unconverted XYZ values into Cupola's terrestrial geometry.
 */
export async function GET(){
  const now=new Date();
  const start=new Date(Math.floor(now.getTime()/600000)*600000);
  const end=new Date(start.getTime()+60*60_000);
  async function load(command:"301"|"10"){
    const response=await fetch(buildHorizonsVectorUrl(command,start,end),{
      next:{revalidate:1800},signal:AbortSignal.timeout(9000)
    });
    if(!response.ok)throw new Error("Horizons upstream unavailable");
    const raw=await response.text();
    if(raw.length>1_100_000)throw new Error("Oversized Horizons response");
    const parsed=JSON.parse(raw) as {
      result?:unknown;error?:unknown;signature?:{source?:unknown;version?:unknown}
    };
    if(parsed.error || typeof parsed.result!=="string" ||
      !String(parsed.signature?.source??"").includes("NASA/JPL") ||
      !/^1\./.test(String(parsed.signature?.version??"")))
      throw new Error("Unverified Horizons API response signature");
    const body=command==="301"?"moon":"sun";
    const samples=parseHorizonsGeocentricVectors(parsed.result,body);
    validateHorizonsUtcWindow(samples,start,end);
    return samples;
  }
  try{
    const [moon,sun]=await Promise.all([load("301"),load("10")]);
    if(moon.length!==sun.length || moon.some((v,i)=>Math.abs(v.jdUt-sun[i].jdUt)>1e-7))
      throw new Error("Solar/lunar JPL timestamps do not align");
    const nowJd=now.getTime()/86_400_000+2440587.5;
    const moonAt=interpolateHorizonsVectors(moon,nowJd);
    const sunAt=interpolateHorizonsVectors(sun,nowJd);
    if(!moonAt||!sunAt)throw new Error("No JPL sample at current time");
    const analytical=celestialAt(now);
    const audit=horizonsFrameInvariantAudit(
      sunAt,moonAt,analytical.moon.distanceKm,
      analytical.sun.distanceKm,analytical.moonPhaseAngleDeg
    );
    if(!audit.plausible)throw new Error("JPL frame-invariant audit failed");
    return NextResponse.json({
      source:"JPL HORIZONS",provenance:"GEOCENTRIC_ICRF_RAW",
      validation:"NOT_EARTH_FIXED_NOT_YET_USED_BY_RENDERER",
      frame:"ICRF_EQUATORIAL",timeScale:"UT",vectorUnits:"KM",
      correction:"GEOMETRIC",moon,sun,audit,
      generatedAt:now.toISOString()
    },{headers:{"Cache-Control":"public, max-age=0, s-maxage=600, stale-while-revalidate=300"}});
  }catch{
    return NextResponse.json({
      error:"No independently validated JPL vector data",
      provenance:"UNAVAILABLE"
    },{status:503,headers:{"Cache-Control":"public, max-age=0, s-maxage=120"}});
  }
}
