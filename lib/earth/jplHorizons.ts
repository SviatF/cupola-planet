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
     !/Output units\s*:\s*KM-S/i.test(text))
    throw new Error("JPL Horizons frame, origin or units are not verified");
  const start=text.indexOf("$$SOE"),end=text.indexOf("$$EOE");
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
