import * as Astronomy from "astronomy-engine";

/**
 * Physical geocentric Sun/Moon calculations for CUPOLA.
 * Distances live in kilometers; THREE coordinates are derived separately.
 * Astronomy Engine: equator-of-date and apparent sidereal rotation.
 */
export const EARTH_RADIUS_KM = 6371.0;
export const SUN_RADIUS_KM = 695700.0;
export const MOON_RADIUS_KM = 1737.4;
export const ASTRONOMICAL_UNIT_KM = 149597870.7;

/** Small vector independent of WebGL, in Earth-fixed coordinates:
 * x at Greenwich equator, y geographic north, z at 90 deg west.
 */
export type CelestialDirection = { x:number;y:number;z:number };
export type CelestialBodySnapshot = {
  direction: CelestialDirection;
  distanceKm:number;
  radiusKm:number;
  angularRadiusRad:number;
  subLatitudeDeg:number;
  subLongitudeDeg:number;
};
export type SunMoonSnapshot = { sun:CelestialBodySnapshot;moon:CelestialBodySnapshot;timestamp:string };
function normLongitude(lon:number) {
  return ((lon+180)%360+360)%360-180;
}
function normalize(v:CelestialDirection):CelestialDirection {
  const d=Math.hypot(v.x,v.y,v.z);
  return {x:v.x/d,y:v.y/d,z:v.z/d};
}
function calculate(date:Date):SunMoonSnapshot {
  const time=new Astronomy.AstroTime(date);
  const eqd=Astronomy.Rotation_EQJ_EQD(time);
  const sidereal=Astronomy.SiderealTime(time)*15;
  function body(eqj:Astronomy.Vector, radiusKm:number):CelestialBodySnapshot {
    const eq=Astronomy.RotateVector(eqd,eqj);
    const distanceAu=Math.hypot(eq.x,eq.y,eq.z);
    const dec=Math.asin(eq.z/distanceAu);
    const ra=Math.atan2(eq.y,eq.x)*180/Math.PI;
    const lon=normLongitude(ra-sidereal);
    const dir=normalize({
      x:Math.cos(dec)*Math.cos(lon*Math.PI/180),
      y:Math.sin(dec),
      z:-Math.cos(dec)*Math.sin(lon*Math.PI/180)
    });
    const distanceKm=distanceAu*ASTRONOMICAL_UNIT_KM;
    return {
      direction:dir, distanceKm,radiusKm,
      angularRadiusRad:Math.asin(radiusKm/distanceKm),
      subLatitudeDeg:dec*180/Math.PI,subLongitudeDeg:lon
    };
  }
  const sun=body(Astronomy.GeoVector(Astronomy.Body.Sun,time,true),SUN_RADIUS_KM);
  const moon=body(Astronomy.GeoMoon(time),MOON_RADIUS_KM);
  return {sun,moon,timestamp:date.toISOString()};
}

let cachedMinute=Number.NaN;
let cachedFrom:SunMoonSnapshot;
let cachedTo:SunMoonSnapshot;
/** Cache expensive planetary series for each minute; interpolate continuously
 * so the Solar disc and Moon never jump at minute boundaries.
 */
export function getSunMoonSnapshot(date:Date):SunMoonSnapshot {
  const ms=date.getTime();
  if(!Number.isFinite(ms)) throw new Error("Invalid ephemeris time");
  const minute=Math.floor(ms/60000);
  if(minute!==cachedMinute) {
    cachedMinute=minute;
    cachedFrom=calculate(new Date(minute*60000));
    cachedTo=calculate(new Date((minute+1)*60000));
  }
  const t=(ms-minute*60000)/60000;
  function blend(a:CelestialBodySnapshot,b:CelestialBodySnapshot):CelestialBodySnapshot {
    const dir=normalize({
      x:a.direction.x*(1-t)+b.direction.x*t,
      y:a.direction.y*(1-t)+b.direction.y*t,
      z:a.direction.z*(1-t)+b.direction.z*t
    });
    const distanceKm=a.distanceKm*(1-t)+b.distanceKm*t;
    const dec=Math.asin(dir.y);
    return {
      direction:dir, distanceKm, radiusKm:a.radiusKm,
      angularRadiusRad:Math.asin(a.radiusKm/distanceKm),
      subLatitudeDeg:dec*180/Math.PI,
      subLongitudeDeg:normLongitude(Math.atan2(-dir.z,dir.x)*180/Math.PI)
    };
  }
  return {sun:blend(cachedFrom.sun,cachedTo.sun),moon:blend(cachedFrom.moon,cachedTo.moon),timestamp:date.toISOString()};
}

export type SolarEclipseStatus = {
  obscuration:number;
  separationDeg:number;
  sunAngularRadiusDeg:number;
  moonAngularRadiusDeg:number;
  kind:"none"|"partial"|"annular"|"total";
};
/** Exact overlap of two apparent circular disks. The observer is specified
 * explicitly; geocentric alignment alone is NOT evidence of an eclipse
 * visible from a given place.
 */
export function solarEclipseAtObserver(date:Date,latitude:number,longitude:number):SolarEclipseStatus {
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||
      Math.abs(longitude)>180) throw new Error("Invalid terrestrial observer");
  const observer=new Astronomy.Observer(latitude,longitude,0);
  const sun=Astronomy.Equator(Astronomy.Body.Sun,date,observer,true,true);
  const moon=Astronomy.Equator(Astronomy.Body.Moon,date,observer,true,true);
  const rad=Math.PI/180;
  const separation=Math.acos(Math.max(-1,Math.min(1,
    Math.sin(sun.dec*rad)*Math.sin(moon.dec*rad)+
    Math.cos(sun.dec*rad)*Math.cos(moon.dec*rad)*Math.cos((sun.ra-moon.ra)*15*rad)
  )));
  const r=Math.asin(SUN_RADIUS_KM/(sun.dist*ASTRONOMICAL_UNIT_KM));
  const R=Math.asin(MOON_RADIUS_KM/(moon.dist*ASTRONOMICAL_UNIT_KM));
  let overlap=0;
  if(separation>=r+R) overlap=0;
  else if(separation<=Math.abs(r-R)) overlap=Math.PI*Math.min(r,R)**2;
  else {
    const d=separation;
    const a=Math.acos(Math.max(-1,Math.min(1,(d*d+r*r-R*R)/(2*d*r))));
    const b=Math.acos(Math.max(-1,Math.min(1,(d*d+R*R-r*r)/(2*d*R))));
    overlap=r*r*a+R*R*b-
      0.5*Math.sqrt(Math.max(0,(-d+r+R)*(d+r-R)*(d-r+R)*(d+r+R)));
  }
  const obscuration=Math.max(0,Math.min(1,overlap/(Math.PI*r*r)));
  const kind=obscuration<0.000001?"none":
    separation<=Math.abs(r-R) && R>=r?"total":
    separation<=Math.abs(r-R) && R<r?"annular":"partial";
  return {
    obscuration,separationDeg:separation/rad,
    sunAngularRadiusDeg:r/rad,moonAngularRadiusDeg:R/rad,kind
  };
}

export function nextGlobalSolarEclipse(date:Date) {
  const eclipse=Astronomy.SearchGlobalSolarEclipse(date);
  return {kind:String(eclipse.kind).toLowerCase(),peakUtc:eclipse.peak.date.toISOString(),
    latitude: Number.isFinite(eclipse.latitude) ? eclipse.latitude : null,
    longitude: Number.isFinite(eclipse.longitude) ? eclipse.longitude : null};
}
