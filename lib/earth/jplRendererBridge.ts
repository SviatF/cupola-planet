import {angleDeg,norm,type Vec3} from "./celestialEngine";

/**
 * Browser-only QA bridge from validated JPL/IERS server positions to the scene.
 * No extrapolation, unvalidated XYZ, or unsafe automatic source switching.
 * 10-minute Earth-fixed sample directions are great-circle interpolated,
 * while physical distances are interpolated separately to prevent artificial
 * chord shortening (~90 km over a 2.5 degree Earth rotation).
 * This is an approximation, NOT an ERFA/SOFA-level transform.
 */
type Sample={jdUt:number;moonEarthFixedKm:Vec3;sunEarthFixedKm:Vec3};
let activeSamples:Sample[]|null=null;
const validVector=(v:unknown,min:number,max:number):v is Vec3=>{
  if(!v || typeof v!=="object")return false;
  const p=v as Partial<Vec3>;
  return [p.x,p.y,p.z].every(x=>typeof x==="number"&&Number.isFinite(x)) &&
    norm(p as Vec3)>=min&&norm(p as Vec3)<=max;
};
const validSample=(s:unknown):s is Sample=>{
  if(!s||typeof s!=="object")return false;
  const v=s as Partial<Sample>;
  return typeof v.jdUt==="number"&&Number.isFinite(v.jdUt)&&
    validVector(v.moonEarthFixedKm,340000,410000)&&
    validVector(v.sunEarthFixedKm,145000000,155000000);
};
export function clearJplRendererQa(){activeSamples=null;}
export function applyJplRendererQa(payload:unknown,now:Date):boolean{
  if(!payload||typeof payload!=="object"){clearJplRendererQa();return false;}
  const p=payload as Record<string,unknown>;
  const t=p.terrestrial as Record<string,unknown>|undefined;
  const audit=t?.angularAudit as Record<string,unknown>|undefined;
  const data=t?.earthFixedSamples;
  const generated=typeof p.generatedAt==="string"?Date.parse(p.generatedAt):NaN;
  const nowMs=now.getTime();
  if(p.source!=="JPL HORIZONS"||p.provenance!=="GEOCENTRIC_ICRF_RAW"||
    p.validation!=="NOT_EARTH_FIXED_NOT_YET_USED_BY_RENDERER"||
    p.frame!=="ICRF_EQUATORIAL"||p.vectorUnits!=="KM"||
    t?.activation!=="QA_OPT_IN_RENDERER_ONLY"||
    t.conversion!=="EQUINOX_BASED_APPROX_PRECESSION_NUTATION_UT1_POLAR_MOTION"||
    !Number.isFinite(generated)||Math.abs(nowMs-generated)>15*60_000 ||
    !audit||!Number.isFinite(audit.moonDirectionDeltaDeg)||
    !Number.isFinite(audit.sunDirectionDeltaDeg)||
    Math.abs(audit.moonDirectionDeltaDeg as number)>2 ||
    Math.abs(audit.sunDirectionDeltaDeg as number)>2 ||
    !Array.isArray(data)||data.length<3||data.length>16||
    !data.every(validSample)){
    clearJplRendererQa();return false;
  }
  const samples=data as Sample[];
  for(let i=1;i<samples.length;i++){
    const delta=(samples[i].jdUt-samples[i-1].jdUt)*86400;
    if(!(delta>540&&delta<660)){clearJplRendererQa();return false;}
    // Earth-fixed sky directions normally shift ~2.5 degrees per ten
    // minutes from terrestrial rotation. Reject implausible sudden flips,
    // large range jumps or inconsistent Sun/Moon geometry even when every
    // sample has a plausible individual heliocentric/geocentric radius.
    const moonTurn=angleDeg(samples[i-1].moonEarthFixedKm,samples[i].moonEarthFixedKm);
    const sunTurn=angleDeg(samples[i-1].sunEarthFixedKm,samples[i].sunEarthFixedKm);
    const moonRangeJump=Math.abs(norm(samples[i].moonEarthFixedKm)-
      norm(samples[i-1].moonEarthFixedKm));
    const sunRangeJump=Math.abs(norm(samples[i].sunEarthFixedKm)-
      norm(samples[i-1].sunEarthFixedKm));
    if(moonTurn>4||sunTurn>4||moonRangeJump>1500||sunRangeJump>50000){
      clearJplRendererQa();return false;
    }
  }
  const nowJd=nowMs/86400000+2440587.5;
  if(nowJd<samples[0].jdUt||nowJd>samples[samples.length-1].jdUt){
    clearJplRendererQa();return false;
  }
  activeSamples=samples.map(v=>({
    jdUt:v.jdUt,moonEarthFixedKm:{...v.moonEarthFixedKm},
    sunEarthFixedKm:{...v.sunEarthFixedKm}
  }));
  return true;
}
function interpolateGreatCircle(a:Vec3,b:Vec3,t:number):Vec3{
  const ra=norm(a),rb=norm(b);
  const u={x:a.x/ra,y:a.y/ra,z:a.z/ra};
  const v={x:b.x/rb,y:b.y/rb,z:b.z/rb};
  const cos=Math.max(-1,Math.min(1,u.x*v.x+u.y*v.y+u.z*v.z));
  const omega=Math.acos(cos);
  const sin=Math.sin(omega);
  const k0=sin>1e-8?Math.sin((1-t)*omega)/sin:1-t;
  const k1=sin>1e-8?Math.sin(t*omega)/sin:t;
  const radius=ra+(rb-ra)*t;
  return {x:(u.x*k0+v.x*k1)*radius,
    y:(u.y*k0+v.y*k1)*radius,z:(u.z*k0+v.z*k1)*radius};
}
export function jplRendererQaAt(date:Date):{
  moonEarthFixedKm:Vec3;sunEarthFixedKm:Vec3;
  elongationDeg:number;illuminatedFraction:number;
}|null{
  if(!activeSamples||!Number.isFinite(date.getTime()))return null;
  const jd=date.getTime()/86400000+2440587.5;
  for(let i=1;i<activeSamples.length;i++){
    const a=activeSamples[i-1],b=activeSamples[i];
    if(jd>=a.jdUt&&jd<=b.jdUt){
      const t=(jd-a.jdUt)/(b.jdUt-a.jdUt);
      const moonEarthFixedKm=interpolateGreatCircle(a.moonEarthFixedKm,b.moonEarthFixedKm,t);
      const sunEarthFixedKm=interpolateGreatCircle(a.sunEarthFixedKm,b.sunEarthFixedKm,t);
      const elongationDeg=angleDeg(moonEarthFixedKm,sunEarthFixedKm);
      // True Sun–Moon–Earth illumination; do not confuse lunar phase angle
      // with Earth-centred elongation used by the independent JPL audit.
      const moonToSun={
        x:sunEarthFixedKm.x-moonEarthFixedKm.x,
        y:sunEarthFixedKm.y-moonEarthFixedKm.y,
        z:sunEarthFixedKm.z-moonEarthFixedKm.z
      };
      const moonToEarth={
        x:-moonEarthFixedKm.x,y:-moonEarthFixedKm.y,z:-moonEarthFixedKm.z
      };
      const phaseAngleDeg=angleDeg(moonToSun,moonToEarth);
      return {moonEarthFixedKm,sunEarthFixedKm,elongationDeg,
        illuminatedFraction:(1+Math.cos(phaseAngleDeg*Math.PI/180))/2};
    }
  }
  return null; // Outside verified source interval: analytical fallback.
}
