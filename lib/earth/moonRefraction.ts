/**
 * Geometric-to-apparent lunar refraction for terrestrial observers.
 * Saemundsson (1986) near-horizon approximation, corrected for pressure and
 * temperature. This is a model of a standard atmosphere, NOT an observation
 * of instantaneous local turbulence, mirage, or differential lunar-limb bending.
 * All position vectors use the same arbitrary scene scale.
 */
export type MoonRayVec={x:number;y:number;z:number};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const dot=(a:MoonRayVec,b:MoonRayVec)=>a.x*b.x+a.y*b.y+a.z*b.z;
const length=(v:MoonRayVec)=>Math.hypot(v.x,v.y,v.z);
const unit=(v:MoonRayVec):MoonRayVec=>{
  const l=length(v);return l>1e-12?{x:v.x/l,y:v.y/l,z:v.z/l}:{x:0,y:1,z:0};
};
const subtract=(a:MoonRayVec,b:MoonRayVec):MoonRayVec=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
/** Pressure hPa, temperature °C. Near-horizon formula is not trustworthy below -1°. */
export function lunarRefractionDegrees(
  geometricAltitudeDeg:number,observerAltitudeKm:number,
  pressureHpa=1010,temperatureC=10,
):number{
  if(!Number.isFinite(geometricAltitudeDeg)||!Number.isFinite(observerAltitudeKm) ||
    geometricAltitudeDeg<=-1 || geometricAltitudeDeg>=85 || observerAltitudeKm>=120)return 0;
  const h=clamp(geometricAltitudeDeg,-0.9,85);
  const pressure=Number.isFinite(pressureHpa)?clamp(pressureHpa,100,1100):1010;
  const temperature=Number.isFinite(temperatureC)?clamp(temperatureC,-80,60):10;
  // Baseline standard-pressure profile decays with observer altitude.
  const atmosphere=Math.exp(-Math.max(0,observerAltitudeKm)/8);
  const elevation=(h+10.3/(h+5.11))*Math.PI/180;
  return clamp((1.02/Math.tan(elevation))/60*(pressure/1010)*
    (283/(273+temperature))*atmosphere,0,0.8);
}
/**
 * Return the apparent render-world center from the same physical observer.
 * The actual ephemeris and Earth/Moon shadow geometry remain geometric.
 * Only the ground observer's image changes with atmospheric bending.
 */
export function refractedMoonPosition(
 observer:MoonRayVec,earth:MoonRayVec,moon:MoonRayVec,earthRadius:number,
 pressureHpa=1010,temperatureC=10,
):MoonRayVec{
  const position=subtract(observer,earth),r=length(position);
  const moonRay=subtract(moon,observer),range=length(moonRay);
  if(!(r>earthRadius && range>0 && earthRadius>0))return {...moon};
  const observerAltitudeKm=(r/earthRadius-1)*6371;
  if(observerAltitudeKm>=120)return {...moon};
  const zenith=unit(position),line=unit(moonRay);
  const elevation=Math.asin(clamp(dot(line,zenith),-1,1));
  const delta=lunarRefractionDegrees(elevation*180/Math.PI,observerAltitudeKm,pressureHpa,temperatureC)*Math.PI/180;
  if(delta<=0)return {...moon};
  const horizontal=unit({x:line.x-zenith.x*Math.sin(elevation),
    y:line.y-zenith.y*Math.sin(elevation),z:line.z-zenith.z*Math.sin(elevation)});
  const apparent=elevation+delta;
  const dir={x:horizontal.x*Math.cos(apparent)+zenith.x*Math.sin(apparent),
    y:horizontal.y*Math.cos(apparent)+zenith.y*Math.sin(apparent),
    z:horizontal.z*Math.cos(apparent)+zenith.z*Math.sin(apparent)};
  return {x:observer.x+range*dir.x,y:observer.y+range*dir.y,z:observer.z+range*dir.z};
}
