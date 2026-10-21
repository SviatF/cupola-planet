/**
 * CUPOLA 4.6 — observer-dependent lunar phase, measured from true Sun and
 * camera directions at the Moon. Does not change any ephemerides or lighting.
 *
 * Illuminated percentage from Earth != illuminated percentage from an orbit
 * camera behind the Moon. Both are physically legitimate perspectives.
 * For a spherical opaque Moon: (1 + cos Sun–Moon–observer phase angle) / 2.
 * Coordinates must share the same reference-frame orientation.
 *
 * This geometric projected-disk approximation intentionally excludes local
 * horizon obstruction, topography, atmospheric scattering and Earthshine.
 */
export type PhaseDirection={x:number;y:number;z:number};
const unit=(v:PhaseDirection):PhaseDirection=>{
  const n=Math.hypot(v.x,v.y,v.z);
  if(!Number.isFinite(n)||n<=1e-12)
    throw new Error("Invalid observer-dependent lunar phase vector");
  return {x:v.x/n,y:v.y/n,z:v.z/n};
};
const dot=(a:PhaseDirection,b:PhaseDirection)=>a.x*b.x+a.y*b.y+a.z*b.z;
const clamp=(n:number)=>Math.max(-1,Math.min(1,n));
export function illuminatedFractionFromMoonView(
  sunFromMoon:PhaseDirection,cameraFromMoon:PhaseDirection
):number{
  return 0.5*(1+clamp(dot(unit(sunFromMoon),unit(cameraFromMoon))));
}
export type MoonObserverHemisphere="EARTH-FACING"|"FAR-SIDE"|"LIMB";
export function moonObserverHemisphere(
  cameraFromMoon:PhaseDirection,earthFromMoon:PhaseDirection
):MoonObserverHemisphere{
  const side=clamp(dot(unit(cameraFromMoon),unit(earthFromMoon)));
  // ±0.4 allows unambiguous labels; near the terminator use LIMB.
  if(side>0.4)return "EARTH-FACING";
  if(side< -0.4)return "FAR-SIDE";
  return "LIMB";
}
