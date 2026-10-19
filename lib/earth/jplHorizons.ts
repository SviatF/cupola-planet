/**
 * JPL Horizons vector adapter (ICRF/J2000, Earth-centered, KM-S).
 * Raw inertial vectors are NOT Earth-fixed coordinates. They must not be used
 * by the renderer until validated ICRF -> terrestrial-frame rotation is ready.
 * Unavailable/malformed source => no vectors, never synthetic JPL labels.
 */
export type HorizonsVector={jdUt:number;x:number;y:number;z:number};
export type HorizonsBody="moon"|"sun";
const bounds:{[K in HorizonsBody]:[number,number]}={
  moon:[340000,410000],sun:[145000000,155000000]
};
const num=(s:string):number=>Number(s.trim().replace(/[dD]/g,"E"));
export function parseHorizonsGeocentricVectors(text:string,body:HorizonsBody):HorizonsVector[]{
  if(!text || text.length>1_000_000)throw new Error("Invalid Horizons payload size");
  // Make the observer origin, target, axes, and units explicit.
  const name=body==="moon"?"Moon":"Sun",id=body==="moon"?"301":"10";
  if(!new RegExp("Target body name:\\s*"+name+"\\s*\\("+id+"\\)","i").test(text) ||
     !/Center body name:\s*Earth\s*\(399\)/i.test(text) ||
     !/Reference frame\s*:\s*ICRF/i.test(text) ||
     !/Output units\s*:\s*KM-S\b/i.test(text) ||
     !/Output type\s*:\s*GEOMETRIC cartesian states/i.test(text) ||
     !/Output format\s*:\s*1\s*\(/i.test(text) ||
     !/\bJDUT\b/i.test(text))
    throw new Error("JPL Horizons frame, origin or units are not verified");
  // JPL Horizons DE441 can omit the optional "Coordinate systm" line.
  // The mandatory ICRF reference-frame header plus a deliberately specified
  // REF_PLANE=FRAME request establishes the equatorial frame. If the response
  // does explicitly state another plane/system, reject it rather than silently
  // interpreting ecliptic XYZ as equatorial Cartesian vectors.
  const explicitPlane=text.match(
    /(?:Coordinate syst(?:m|em)|Reference plane|Coordinate plane)\s*:\s*([^\r\n]+)/i
  );
  if(explicitPlane &&
    (/ecliptic/i.test(explicitPlane[1]) ||
      !/(?:equator|equatorial|ICRF)/i.test(explicitPlane[1])))
    throw new Error("Horizons coordinate plane contradicts ICRF equatorial request");
  if(!/\bJDUT\s*,[^\r\n]*\bX\s*,\s*Y\s*,\s*Z\s*,?/i.test(text))
    throw new Error("Horizons vector CSV column header missing or mismatched");
  const start=text.indexOf("$SOE"),end=text.indexOf("$EOE");
  if(start<0||end<=start)throw new Error("Horizons markers missing");
  const out:HorizonsVector[]=[];
  for(const rawLine of text.slice(start+5,end).split(/\r?\n/)){
    const parts=rawLine.split(",").map(x=>x.trim());
    if(parts.length<5||!/^[0-9]{7}\.[0-9]+$/.test(parts[0]))continue;
    const [jdUt,x,y,z]=[num(parts[0]),num(parts[2]),num(parts[3]),num(parts[4])];
    const magnitude=Math.hypot(x,y,z),[min,max]=bounds[body];
    if(![jdUt,x,y,z].every(Number.isFinite)||magnitude<min||magnitude>max)
      throw new Error("Implausible Horizons vector");
    if(out.length&&jdUt<=out[out.length-1].jdUt)throw new Error("Non-monotonic Horizons times");
    out.push({jdUt,x,y,z});
  }
  if(out.length<2||out.length>60)throw new Error("Insufficient Horizons vector samples");
  return out;
}
/** Build a Horizons 1.3 vector query with no implicit frame or time settings.
 * This is a raw ICRF source, not a replacement for Earth's rotating frame.
 */
export function buildHorizonsVectorUrl(command:"301"|"10",start:Date,end:Date):string{
  const startMs=start.getTime(),endMs=end.getTime();
  if((command!=="301"&&command!=="10")||
    !Number.isFinite(startMs)||!Number.isFinite(endMs)||
    endMs<=startMs||endMs-startMs>3_600_000)
    throw new Error("Invalid JPL vector request");
  const u=new URL("https://ssd.jpl.nasa.gov/api/horizons.api");
  const put=(name:string,value:string)=>u.searchParams.set(name,"'"+value+"'");
  u.searchParams.set("format","json");
  put("COMMAND",command);
  put("MAKE_EPHEM","YES");
  put("EPHEM_TYPE","VECTORS");
  put("CENTER","500@399");
  put("REF_PLANE","FRAME");
  put("REF_SYSTEM","ICRF");
  put("VEC_CORR","NONE");
  put("VEC_TABLE","1");
  put("VEC_LABELS","NO");
  put("OUT_UNITS","KM-S");
  put("TIME_TYPE","UT");
  put("CSV_FORMAT","YES");
  put("OBJ_DATA","NO");
  const stamp=(d:Date)=>d.toISOString().slice(0,16).replace("T"," ");
  put("START_TIME",stamp(start));
  put("STOP_TIME",stamp(end));
  put("STEP_SIZE","10 m");
  return u.toString();
}
/** A UTC request is invalid if Horizons returns a different time window. */
export function validateHorizonsUtcWindow(samples:HorizonsVector[],start:Date,end:Date){
  if(samples.length<2)throw new Error("JPL vector window is empty");
  const jd=(d:Date)=>d.getTime()/86_400_000+2440587.5;
  if(Math.abs(samples[0].jdUt-jd(start))*86400>90||
    Math.abs(samples[samples.length-1].jdUt-jd(end))*86400>90)
    throw new Error("JPL vector data is outside requested UTC window");
  for(let i=1;i<samples.length;i++){
    const gap=(samples[i].jdUt-samples[i-1].jdUt)*86400;
    if(gap<540||gap>660)throw new Error("Unexpected JPL 10-minute interval");
  }
}
/**
 * Frame-invariant audit: distances and elongation do NOT require conversion
 * from ICRF to Earth-fixed. Use this to validate the source before deployment.
 */
export function horizonsFrameInvariantAudit(
  sun:HorizonsVector,moon:HorizonsVector,
  analyticMoonDistanceKm:number,analyticSunDistanceKm:number,analyticElongationDeg:number,
){
  const norm=(v:HorizonsVector)=>Math.hypot(v.x,v.y,v.z);
  const md=norm(moon),sd=norm(sun);
  const cos=(sun.x*moon.x+sun.y*moon.y+sun.z*moon.z)/(md*sd);
  const elongationDeg=Math.acos(Math.max(-1,Math.min(1,cos)))*180/Math.PI;
  const moonDeltaKm=Math.abs(md-analyticMoonDistanceKm);
  const sunDeltaKm=Math.abs(sd-analyticSunDistanceKm);
  const elongationDeltaDeg=Math.abs(elongationDeg-analyticElongationDeg);
  // These thresholds catch bad inputs; they are NOT precision claims.
  const plausible=Number.isFinite(elongationDeg)&&moonDeltaKm<5_000&&
    sunDeltaKm<2_000_000&&elongationDeltaDeg<3;
  return {plausible,moonDistanceKm:md,sunDistanceKm:sd,elongationDeg,
    moonDeltaKm,sunDeltaKm,elongationDeltaDeg};
}

/** Linear interpolation is only allowed between two close JPL samples. */
export function interpolateHorizonsVectors(samples:HorizonsVector[],jdUt:number):HorizonsVector|null{
  if(!Number.isFinite(jdUt))return null;
  for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i];
    const span=(b.jdUt-a.jdUt)*86400;
    if(span<=0||span>1800)continue; // reject sparse or unsorted ephemerides
    if(jdUt>=a.jdUt && jdUt<=b.jdUt){
      const t=(jdUt-a.jdUt)/(b.jdUt-a.jdUt);
      return {jdUt,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
    }
  }
  return null;
}
