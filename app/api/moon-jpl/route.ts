import { NextResponse } from "next/server";
import { celestialAt } from "@/lib/earth/celestialEngine";
import { parseIersDaily,interpolateIersEop } from "@/lib/earth/iersEop";
import { horizonsIcrfToCupolaEarthFixed,terrestrialAngularDifferenceDeg } from "@/lib/earth/jplEarthFixed";
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
    // The IERS EOP daily feed is an independent scientific source.
    // If UT1 or pole coordinates are stale, refuse Earth-fixed JPL output.
    const iersResponse=await fetch(
      "https://data.iers.org/products/eop/rapid/daily/json/finals2000A.daily.json",
      {next:{revalidate:21600},signal:AbortSignal.timeout(9000)}
    );
    if(!iersResponse.ok)throw Error("IERS orientation feed unavailable");
    const iersText=await iersResponse.text();
    if(iersText.length>1_500_000)throw Error("Oversized IERS response");
    const iers=parseIersDaily(JSON.parse(iersText) as unknown);
    const eop=interpolateIersEop(iers,now);
    if(!eop||Math.abs(eop.mjd-(now.getTime()/86400000+40587))>0.01)
      throw Error("IERS UT1/polar-motion data not current");
    const moonEarthFixedKm=horizonsIcrfToCupolaEarthFixed(moonAt,now,eop);
    const sunEarthFixedKm=horizonsIcrfToCupolaEarthFixed(sunAt,now,eop);
    // Angle agreement is an ERROR DETECTOR only. Analytic Meeus previews
    // cannot prove arcsecond-level JPL precision.
    const moonDirectionDeltaDeg=terrestrialAngularDifferenceDeg(
      moonEarthFixedKm,analytical.moon.earthFixedKm);
    const sunDirectionDeltaDeg=terrestrialAngularDifferenceDeg(
      sunEarthFixedKm,analytical.sun.earthFixedKm);
    if(moonDirectionDeltaDeg>2.0||sunDirectionDeltaDeg>2.0)
      throw Error("Terrestrial JPL/Meeus directions disagree by over two degrees");
    return NextResponse.json({
      source:"JPL HORIZONS",provenance:"GEOCENTRIC_ICRF_RAW",
      validation:"NOT_EARTH_FIXED_NOT_YET_USED_BY_RENDERER",
      frame:"ICRF_EQUATORIAL",timeScale:"UT",vectorUnits:"KM",
      correction:"GEOMETRIC",moon,sun,audit,
      terrestrial:{
        moonEarthFixedKm,sunEarthFixedKm,
        eop:{mjd:eop.mjd,dut1Seconds:eop.dut1Seconds,
          xpArcsec:eop.xpArcsec,ypArcsec:eop.ypArcsec,quality:eop.quality,
          source:"IERS finals2000A.daily BulletinA"},
        angularAudit:{moonDirectionDeltaDeg,sunDirectionDeltaDeg},
        conversion:"EQUINOX_BASED_APPROX_PRECESSION_NUTATION_UT1_POLAR_MOTION",
        verifiedPrecision:"NOT_SOFA_ERFA_IAU2006_2000A",
        activation:"STAGED_NOT_USED_BY_RENDERER"
      },
      generatedAt:now.toISOString()
    },{headers:{"Cache-Control":"public, max-age=0, s-maxage=600, stale-while-revalidate=300"}});
  }catch{
    return NextResponse.json({
      error:"No independently validated JPL vector data",
      provenance:"UNAVAILABLE"
    },{status:503,headers:{"Cache-Control":"public, max-age=0, s-maxage=120"}});
  }
}
