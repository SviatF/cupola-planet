/**
 * CUPOLA Celestial Engine 1.0 — physically dimensioned Earth/Moon/Sun.
 *
 * Coordinates: geocentric Earth-fixed, right-handed x toward lon 0,
 * y toward geographic north, z toward lon -90°.
 * Numeric units: kilometres, UTC dates. Render units are separate.
 *
 * The analytical lunar series is deliberately TRUNCATED (Meeus-style).
 * Positions and overlap are geometric previews, NOT contact-time predictions,
 * JPL DE440 results, eclipse visibility forecasts or navigational ephemerides.
 */
export const EARTH_RADIUS_KM=6371.0;
export const MOON_RADIUS_KM=1737.4;
export const SUN_RADIUS_KM=695700;
export const AU_KM=149597870.7;
export const MEAN_MOON_DISTANCE_KM=384400;
const DEG=Math.PI/180;
const RAD=180/Math.PI;
const positive=(v:number,m:number)=>((v%m)+m)%m;
const sind=(d:number)=>Math.sin(d*DEG);
const cosd=(d:number)=>Math.cos(d*DEG);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export type Vec3={x:number;y:number;z:number};
export type BodyState={earthFixedKm:Vec3;distanceKm:number;radiusKm:number;angularRadiusDeg:number;eclipticLongitudeDeg:number};
export type CelestialState={at:string;sun:BodyState;moon:BodyState;moonIlluminatedFraction:number;moonPhaseAngleDeg:number;accuracy:"ANALYTICAL_PREVIEW"|"JPL_HORIZONS_EARTH_FIXED_QA"};
export type EclipseGeometry={kind:"none"|"partial"|"total"|"annular";obscuration:number;separationDeg:number;sunRadiusDeg:number;moonRadiusDeg:number};

export function dot(a:Vec3,b:Vec3):number{return a.x*b.x+a.y*b.y+a.z*b.z;}
export function sub(a:Vec3,b:Vec3):Vec3{return{x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};}
export function norm(v:Vec3):number{return Math.hypot(v.x,v.y,v.z);}
export function direction(v:Vec3):Vec3{
  const r=norm(v);return r>0?{x:v.x/r,y:v.y/r,z:v.z/r}:{x:0,y:0,z:0};
}
export function angleDeg(a:Vec3,b:Vec3):number{
  const n=norm(a)*norm(b);return n>0?Math.acos(clamp(dot(a,b)/n,-1,1))*RAD:0;
}
/** Astronomical JD in UTC, not dynamical TDB; a tiny additional time error remains. */
export function julianDate(date:Date):number{return date.getTime()/86400000+2440587.5;}
function siderealDeg(jd:number):number{
  const t=(jd-2451545)/36525;
  return positive(280.46061837+360.98564736629*(jd-2451545)+0.000387933*t*t-t*t*t/38710000,360);
}
function eclipticToEarthFixed(lonDeg:number,latDeg:number,rKm:number,obliquityDeg:number,gmstDeg:number):Vec3{
  const lon=lonDeg*DEG,lat=latDeg*DEG,eps=obliquityDeg*DEG;
  const x=Math.cos(lat)*Math.cos(lon);
  const y=Math.cos(lat)*Math.sin(lon)*Math.cos(eps)-Math.sin(lat)*Math.sin(eps);
  const z=Math.cos(lat)*Math.sin(lon)*Math.sin(eps)+Math.sin(lat)*Math.cos(eps);
  const ra=Math.atan2(y,x),dec=Math.atan2(z,Math.hypot(x,y));
  // y in scene points to terrestrial north; z scene sign follows globeWorldPoint().
  const earthLon=ra-gmstDeg*DEG;
  return {x:rKm*Math.cos(dec)*Math.cos(earthLon),
          y:rKm*Math.sin(dec),
          z:-rKm*Math.cos(dec)*Math.sin(earthLon)};
}
/** Approximate IAU mean lunar north pole, projected into this UTC Earth's
 * rotating frame. Keeps the NASA LROC lunar north orientation consistent
 * across geolocations. Physical libration/nutation remain preview quality.
 * IAU Moon pole J2000: RA 269.9949°, Dec 66.5392°.
 */
export function moonPoleEarthFixed(date:Date):Vec3{
  const jd=julianDate(date),T=(jd-2451545)/36525;
  const poleRa=(269.9949+0.0031*T)*DEG;
  const poleDec=(66.5392+0.0130*T)*DEG;
  const earthRa=poleRa-siderealDeg(jd)*DEG;
  return {
    x:Math.cos(poleDec)*Math.cos(earthRa),
    y:Math.sin(poleDec),
    z:-Math.cos(poleDec)*Math.sin(earthRa),
  };
}
function moonEcliptic(jd:number):{lon:number;lat:number;distance:number}{
  const d=jd-2451545;
  const L=positive(218.3164477+13.17639648*d,360);
  const M=positive(134.9633964+13.06499295*d,360);
  const Ms=positive(357.5291092+0.98560028*d,360);
  const D=positive(297.8501921+12.19074912*d,360);
  const F=positive(93.272095+13.22935024*d,360);
  const lon=L+
    6.289*sind(M)+1.274*sind(2*D-M)+0.658*sind(2*D)+0.214*sind(2*M)
    -0.186*sind(Ms)-0.114*sind(2*F)+0.059*sind(2*D-2*M)
    +0.057*sind(2*D-Ms-M)+0.053*sind(2*D+M)+0.046*sind(2*D-Ms)
    +0.041*sind(Ms-M)-0.035*sind(D)-0.031*sind(M+Ms)
    -0.015*sind(2*F-2*D)+0.011*sind(2*D-4*M);
  const lat=5.128*sind(F)+0.280*sind(M+F)+0.277*sind(M-F)
    +0.173*sind(2*D-F)+0.055*sind(2*D+F-M)
    +0.046*sind(2*D-F-M)+0.033*sind(2*D+F)
    +0.017*sind(2*M+F)+0.009*sind(2*D+M-F)
    +0.009*sind(2*M-F)+0.008*sind(2*D-Ms-F)
    +0.008*sind(2*D+M+F)+0.007*sind(Ms-F)-0.006*sind(Ms+F);
  const distance=385000.56-20905.355*cosd(M)-3699.111*cosd(2*D-M)
    -2955.968*cosd(2*D)-569.925*cosd(2*M)+246.158*cosd(2*M-2*D)
    -204.586*cosd(Ms-2*D)-170.733*cosd(M+2*D)-152.137*cosd(M+Ms-2*D);
  return {lon:positive(lon,360),lat,distance};
}
export function celestialAt(date:Date):CelestialState{
  const jd=julianDate(date),T=(jd-2451545)/36525;
  const meanLon=positive(280.46646+36000.76983*T+0.0003032*T*T,360);
  const M=positive(357.52911+35999.05029*T-0.0001537*T*T,360);
  const C=(1.914602-0.004817*T-0.000014*T*T)*sind(M)
          +(0.019993-0.000101*T)*sind(2*M)+0.000289*sind(3*M);
  const omega=125.04-1934.136*T;
  const sunLon=positive(meanLon+C-0.00569-0.00478*sind(omega),360);
  const epsilon=23+(26+(21.448-46.8150*T-0.00059*T*T+0.001813*T*T*T)/60)/60
                +0.00256*cosd(omega);
  const sunDistance=AU_KM*(1.00014-0.01671*cosd(M)-0.00014*cosd(2*M));
  const moon=moonEcliptic(jd),gmst=siderealDeg(jd);
  const sunKm=eclipticToEarthFixed(sunLon,0,sunDistance,epsilon,gmst);
  const moonKm=eclipticToEarthFixed(moon.lon,moon.lat,moon.distance,epsilon,gmst);
  const elongation=angleDeg(sunKm,moonKm);
  const illuminated=clamp((1-Math.cos(elongation*DEG))/2,0,1);
  return {
    at:date.toISOString(),accuracy:"ANALYTICAL_PREVIEW",
    sun:{earthFixedKm:sunKm,distanceKm:sunDistance,radiusKm:SUN_RADIUS_KM,
         angularRadiusDeg:Math.asin(SUN_RADIUS_KM/sunDistance)*RAD,eclipticLongitudeDeg:sunLon},
    moon:{earthFixedKm:moonKm,distanceKm:moon.distance,radiusKm:MOON_RADIUS_KM,
         angularRadiusDeg:Math.asin(MOON_RADIUS_KM/moon.distance)*RAD,eclipticLongitudeDeg:moon.lon},
    moonIlluminatedFraction:illuminated,moonPhaseAngleDeg:elongation
  };
}
/** Circle overlap of apparent Sun and Moon as seen from a specific position. */
export function eclipseAt(state:CelestialState,observerKm:Vec3):EclipseGeometry{
  const sun=sub(state.sun.earthFixedKm,observerKm);
  const moon=sub(state.moon.earthFixedKm,observerKm);
  const sep=angleDeg(sun,moon);
  const rs=Math.asin(clamp(SUN_RADIUS_KM/norm(sun),0,1))*RAD;
  const rm=Math.asin(clamp(MOON_RADIUS_KM/norm(moon),0,1))*RAD;
  let area=0,kind:EclipseGeometry["kind"]="none";
  if(sep<rs+rm){
    if(sep<=Math.abs(rs-rm)){
      area=Math.PI*Math.min(rs,rm)**2;
      kind=rm>=rs?"total":"annular";
    }else{
      const a=rs,b=rm,d=sep;
      const ca=clamp((d*d+a*a-b*b)/(2*d*a),-1,1);
      const cb=clamp((d*d+b*b-a*a)/(2*d*b),-1,1);
      const term=Math.sqrt(Math.max(0,(-d+a+b)*(d+a-b)*(d-a+b)*(d+a+b)));
      area=a*a*Math.acos(ca)+b*b*Math.acos(cb)-term/2;
      kind="partial";
    }
  }
  return {kind,obscuration:clamp(area/(Math.PI*rs*rs),0,1),separationDeg:sep,
          sunRadiusDeg:rs,moonRadiusDeg:rm};
}
/** Map physical km to current Three.js scale: Earth radius 4.3 in render units. */
export function kmToScene(km:number,earthSceneRadius=4.3):number{
  return km/EARTH_RADIUS_KM*earthSceneRadius;
}
