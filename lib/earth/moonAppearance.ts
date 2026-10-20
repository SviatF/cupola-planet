/**
 * CUPOLA moon rendering geometry, physically grounded optical approximation.
 * Coordinates are scene-world render coordinates except physical shadow inputs
 * (km). Atmospheric RGB attenuation is modeled, never claimed to be a live
 * measurement of aerosol content or cloud cover.
 */
export type MoonVec3={x:number;y:number;z:number};
export const MOON_STANDARD_ATMOSPHERE_KM=8.0;
export const MOON_RAYLEIGH_TAU=[0.075,0.105,0.215] as const;
const clamp=(v:number,low:number,high:number)=>Math.min(high,Math.max(low,v));
const dot=(a:MoonVec3,b:MoonVec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const magnitude=(v:MoonVec3)=>Math.hypot(v.x,v.y,v.z);
const diff=(a:MoonVec3,b:MoonVec3):MoonVec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
function unit(v:MoonVec3):MoonVec3{
  const n=magnitude(v);
  return n>1e-12?{x:v.x/n,y:v.y/n,z:v.z/n}:{x:0,y:1,z:0};
}
export function moonAltitudeDegrees(camera:MoonVec3,earth:MoonVec3,moon:MoonVec3):number{
  const radial=unit(diff(camera,earth));
  return Math.asin(clamp(dot(unit(diff(moon,camera)),radial),-1,1))*180/Math.PI;
}
/** Kasten–Young optical airmass in clear standard atmosphere. */
/**
 * Optional CAMS forecast aerosol optical depth at 550 nm (entire vertical
 * column). This is NOT observed line-of-sight photometry. Wavelength scaling
 * uses an assumed Angstrom exponent, since the API gives only AOD550.
 * Null / invalid inputs intentionally reproduce the clear-air fallback.
 */
export function lunarAtmosphereTransmission(
  altitudeDeg:number,cameraAltitudeKm:number,aerosolOpticalDepth550:number|null=null,
  surfacePressureHpa:number|null=null,
):[number,number,number]{
  if(cameraAltitudeKm>=120)return [1,1,1];
  const e=clamp(altitudeDeg,-1,90);
  const m=e<=-0.83?38:1/(Math.sin(e*Math.PI/180)+
    0.50572*Math.pow(e+6.07995,-1.6364));
  const column=Math.exp(-Math.max(0,cameraAltitudeKm)/MOON_STANDARD_ATMOSPHERE_KM);
  const aod=typeof aerosolOpticalDepth550==="number" &&
    Number.isFinite(aerosolOpticalDepth550) && aerosolOpticalDepth550>=0 && aerosolOpticalDepth550<=3.5
      ? aerosolOpticalDepth550 : 0;
  const wavelengthNm=[650,550,450] as const;
  // For a near-ground camera, Rayleigh's column optical depth scales
  // approximately with local surface pressure. CAMS AOD550 is itself a
  // measured/modelled total-column quantity, so NEVER scale it by pressure.
  const pressure=typeof surfacePressureHpa==="number"&&
    Number.isFinite(surfacePressureHpa)&&surfacePressureHpa>=550&&surfacePressureHpa<=1085
      ?surfacePressureHpa/1010:1;
  return MOON_RAYLEIGH_TAU.map((rayleigh,i)=>{
    const aerosol=aod*Math.pow(550/wavelengthNm[i],1.2);
    return Math.exp(-(rayleigh*pressure+aerosol)*Math.min(38,m)*column);
  }) as [number,number,number];
}
/** Earth umbra/penumbra against the physically positioned Moon in km.
 * Output is a global preview; a partial eclipse needs a per-pixel umbra
 * for professional photometry and high-accuracy external ephemerides.
 */
export function moonEarthShadow(moonKm:MoonVec3,sunKm:MoonVec3,
  earthRadiusKm=6371,moonRadiusKm=1737.4,sunRadiusKm=695700):{umbra:number;penumbra:number}{
  const sunDistance=magnitude(sunKm),sunAxis=unit(sunKm);
  const behind=-dot(moonKm,sunAxis);
  if(behind<=0||sunDistance<1)return {umbra:0,penumbra:0};
  const d=dot(moonKm,sunAxis);
  const lateral=Math.sqrt(Math.max(0, dot(moonKm,moonKm)-d*d));
  const umbraRadius=Math.max(0,earthRadiusKm-behind*(sunRadiusKm-earthRadiusKm)/sunDistance);
  const penumbraRadius=earthRadiusKm+behind*(sunRadiusKm+earthRadiusKm)/sunDistance;
  const umbra=clamp((umbraRadius+moonRadiusKm-lateral)/(2*moonRadiusKm),0,1);
  const penumbra=clamp((penumbraRadius+moonRadiusKm-lateral)/(2*moonRadiusKm),0,1);
  return {umbra:umbra*umbra*(3-2*umbra),penumbra:penumbra*penumbra*(3-2*penumbra)};
}
/** No atmospheric color shift above Earth atmosphere. During an umbral
 * eclipse the faint red color is a conservative artistic estimate of
 * Earth-refracted sunlight, not a real-time spectral measurement.
 */
export function moonAppearanceRGB(transmission:readonly number[],umbra:number,penumbra:number):
  [number,number,number]{
  const u=clamp(umbra,0,1);
  const p=clamp(penumbra,0,1);
  const dim=1-0.25*p;
  const eclipse:[number,number,number]=[0.22,0.045,0.025];
  return [0,1,2].map(i=>clamp(transmission[i]*dim*((1-u)+u*eclipse[i]),0,1)) as
    [number,number,number];
}
/** Explicit ray-sphere solar occultation. The Moon blocks a distant Sun
 * only when in front of the camera along the true Sun direction. Returned
 * smooth mask suppresses leaked additive glare in full occultation; GPU
 * depth buffer handles partial disc overlap.
 */
export function moonSunVisibility(camera:MoonVec3,moon:MoonVec3,radius:number,
  sunDirection:MoonVec3,sunAngularRadiusRad=0.266*Math.PI/180):number{
  const offset=diff(moon,camera),dist=magnitude(offset);
  if(!(dist>radius&&radius>0))return 1;
  const inFront=dot(unit(offset),unit(sunDirection));
  if(inFront<=0)return 1;
  const separation=Math.acos(clamp(inFront,-1,1));
  const moonRadius=Math.asin(clamp(radius/dist,0,1));
  // Actual angular-circle overlap: full occultation is exactly zero,
  // while partial eclipse attenuates only the covered part of Sun's disc.
  const rs=sunAngularRadiusRad,rm=moonRadius,d=separation;
  if(d>=rs+rm)return 1;
  if(d<=Math.abs(rs-rm))return rm>=rs?0:1-rm*rm/(rs*rs);
  const first=clamp((d*d+rs*rs-rm*rm)/(2*d*rs),-1,1);
  const second=clamp((d*d+rm*rm-rs*rs)/(2*d*rm),-1,1);
  const tangent=Math.sqrt(Math.max(0,(-d+rs+rm)*(d+rs-rm)*(d-rs+rm)*(d+rs+rm)));
  const blocked=rs*rs*Math.acos(first)+rm*rm*Math.acos(second)-tangent/2;
  return clamp(1-blocked/(Math.PI*rs*rs),0,1);
}
