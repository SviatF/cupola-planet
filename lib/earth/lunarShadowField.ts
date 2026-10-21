/**
 * Solar-disc obscuration at a physical point on the Moon by the Earth.
 * Distances are kilometres, vectors are in a single geocentric frame.
 * This is geometrical occultation (umbra + penumbra), not a measurement
 * of Earth's atmospheric refraction, spectral transmission or Danjon scale.
 */
export type LunarVector={x:number;y:number;z:number};
const diff=(a:LunarVector,b:LunarVector):LunarVector=>({
  x:a.x-b.x,y:a.y-b.y,z:a.z-b.z
});
const norm=(v:LunarVector)=>Math.hypot(v.x,v.y,v.z);
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const dot=(a:LunarVector,b:LunarVector)=>a.x*b.x+a.y*b.y+a.z*b.z;
/** 
 * Conservative broad phase for expensive GPU per-fragment eclipse math.
 * True whenever even a lunar surface point MIGHT see Earth's disc touch
 * the Sun. Use upper-bound angular radii at the nearest lunar limb plus a
 * generous 0.02 rad (~1.15°) safety margin; false negatives are forbidden.
 * Coordinates for Moon, Earth and Sun must be in the SAME physical km frame.
 */
export function lunarEclipseMayReachSurface(
  moonCenterKm:LunarVector,earthCenterKm:LunarVector,sunCenterKm:LunarVector,
  moonRadiusKm=1737.4,earthRadiusKm=6371,sunRadiusKm=695700
):boolean{
  const toEarth=diff(earthCenterKm,moonCenterKm);
  const toSun=diff(sunCenterKm,moonCenterKm);
  const de=norm(toEarth),ds=norm(toSun);
  if(![de,ds,moonRadiusKm,earthRadiusKm,sunRadiusKm].every(Number.isFinite)||
    moonRadiusKm<=0||earthRadiusKm<=0||sunRadiusKm<=0||
    de<=moonRadiusKm+earthRadiusKm||ds<=moonRadiusKm+sunRadiusKm)
    return true; // Fail open: never skip rendering for bad or extreme inputs.
  const angularEarth=Math.asin(clamp(earthRadiusKm/(de-moonRadiusKm),0,1));
  const angularSun=Math.asin(clamp(sunRadiusKm/(ds-moonRadiusKm),0,1));
  const lunarParallax=Math.asin(clamp(moonRadiusKm/(de-moonRadiusKm),0,1));
  const separation=Math.acos(clamp(dot(toEarth,toSun)/(de*ds),-1,1));
  return separation<=angularEarth+angularSun+lunarParallax+0.02;
}
export function eclipseSolarDiscObscuration(
  lunarPointKm:LunarVector,earthCenterKm:LunarVector,sunCenterKm:LunarVector,
  earthRadiusKm=6371,sunRadiusKm=695700,
):number{
  if(![earthRadiusKm,sunRadiusKm].every(v=>Number.isFinite(v)&&v>0))return 0;
  const earth=diff(earthCenterKm,lunarPointKm);
  const sun=diff(sunCenterKm,lunarPointKm);
  const de=norm(earth),ds=norm(sun);
  if(de<=earthRadiusKm||ds<=sunRadiusKm)return 0;
  const re=Math.asin(clamp(earthRadiusKm/de,0,1));
  const rs=Math.asin(clamp(sunRadiusKm/ds,0,1));
  const sep=Math.acos(clamp(dot(earth,sun)/(de*ds),-1,1));
  if(sep>=re+rs)return 0;
  if(sep<=Math.abs(re-rs))
    return clamp(Math.min(1,(re*re)/(rs*rs)),0,1);
  const e2=re*re,s2=rs*rs,d2=sep*sep;
  const ae=Math.acos(clamp((d2+e2-s2)/(2*sep*re),-1,1));
  const as=Math.acos(clamp((d2+s2-e2)/(2*sep*rs),-1,1));
  const determinant=Math.sqrt(Math.max(0,
    (-sep+re+rs)*(sep+re-rs)*(sep-re+rs)*(sep+re+rs)));
  const covered=e2*ae+s2*as-0.5*determinant;
  return clamp(covered/(Math.PI*s2),0,1);
}
/** A dim conservative copper residual models sunlight refracted by Earth.
 * Not precise atmospheric radiance or a calibrated lunar-eclipse color.
 */
export function eclipseSolarTransmission(obscuredFraction:number):
  [number,number,number]{
  const obscured=clamp(Number.isFinite(obscuredFraction)?obscuredFraction:0,0,1);
  const clear=1-obscured;
  return [clear+0.045*obscured,clear+0.009*obscured,clear+0.004*obscured];
}
