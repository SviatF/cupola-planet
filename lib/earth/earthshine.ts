/**
 * CUPOLA 4.4 — physical-scale Earthshine *estimate* at the Moon.
 *
 * Earth reflects sunlight onto the lunar near side. The Earth is full from
 * the Moon near terrestrial NEW MOON, and nearly dark at FULL MOON.
 * Approximate the Earth as a Lambertian, homogeneous sphere with global
 * Bond reflectance 0.30: this is NOT a real-time cloud/albedo observation.
 *
 * Irradiance from Earth / direct solar irradiance at lunar distance:
 *  (2/3) * assumedAlbedo * (EarthRadius / EarthMoonDistance)^2
 *  * [sin(phase)+(PI-phase)*cos(phase)]/PI
 *
 * Wavelength-neutral because Earth spectral albedo is unmeasured here;
 * never use this estimate to claim live Earth illumination/weather.
 */
export type EarthshineVector={x:number;y:number;z:number};
const clamp=(x:number)=>Math.min(1,Math.max(-1,x));
export const EARTHSHINE_ASSUMED_BOND_ALBEDO=0.30;
export const EARTHSHINE_REFERENCE_EARTH_RADIUS_KM=6371;
export function earthshineSolarIrradianceRatioAtMoon(
  sunFromEarthKm:EarthshineVector,
  moonFromEarthKm:EarthshineVector,
  assumedBondAlbedo=EARTHSHINE_ASSUMED_BOND_ALBEDO
):number{
  const rSun=Math.hypot(sunFromEarthKm.x,sunFromEarthKm.y,sunFromEarthKm.z);
  const rMoon=Math.hypot(moonFromEarthKm.x,moonFromEarthKm.y,moonFromEarthKm.z);
  if(!Number.isFinite(rSun)||rSun<1e8||rSun>2e8||
     !Number.isFinite(rMoon)||rMoon<3e5||rMoon>5e5||
     !Number.isFinite(assumedBondAlbedo)||assumedBondAlbedo<0||assumedBondAlbedo>1)
    throw new Error("Invalid physical Sun/Moon/Earthshine geometry");
  const cosPhase=clamp((
    sunFromEarthKm.x*moonFromEarthKm.x+
    sunFromEarthKm.y*moonFromEarthKm.y+
    sunFromEarthKm.z*moonFromEarthKm.z
  )/(rSun*rMoon));
  const phase=Math.acos(cosPhase);
  const lambertPhase=Math.max(0,(Math.sin(phase)+(Math.PI-phase)*cosPhase)/Math.PI);
  return (2/3)*assumedBondAlbedo*
    (EARTHSHINE_REFERENCE_EARTH_RADIUS_KM/rMoon)**2*lambertPhase;
}
