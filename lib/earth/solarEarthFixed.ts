/**
 * CUPOLA 4.4 — unified astronomical solar subpoint, sunrise/sunset longitude.
 *
 * Input is the SAME geocentric Earth-fixed solar position used by the 3D
 * Sun billboard, Earth's directional light and lunar phase engine. Never
 * independently approximate the Sun from civil clock/day-of-year, which
 * otherwise places sunrise markers and terminator several degrees away
 * from the actual lit hemisphere.
 *
 * Earth-fixed CUPOLA axes:
 *   +X = longitude 0° at equator; +Y = geographic north;
 *   +Z = longitude 90° WEST at equator.
 * Longitudes are degrees east in [-180,180).
 * Geometric equatorial terminator only: no atmospheric refraction, altitude,
 * local topography, solar disc or equation-of-time independently re-applied.
 */
export type SolarWorldKm={x:number;y:number;z:number};
export type SolarSubpoint={
  declinationRadians:number;
  declinationDegrees:number;
  subSolarLongitude:number;
  sunriseLongitude:number;
  sunsetLongitude:number;
};
const wrapLongitude=(degrees:number):number=>
  ((degrees+180)%360+360)%360-180;
export function solarSubpointEarthFixed(sunKm:SolarWorldKm):SolarSubpoint{
  const {x,y,z}=sunKm;
  const r=Math.hypot(x,y,z);
  if(!Number.isFinite(r)||r<1e8||r>2e8)
    throw new Error("Invalid geocentric Earth-fixed Sun position");
  const declinationRadians=Math.asin(Math.max(-1,Math.min(1,y/r)));
  const subSolarLongitude=wrapLongitude(Math.atan2(-z,x)*180/Math.PI);
  return {
    declinationRadians,
    declinationDegrees:declinationRadians*180/Math.PI,
    subSolarLongitude,
    // At the equator, the solar hour angle is -90° at sunrise and +90°
    // at sunset. This is the solar *centre* on a spherical Earth.
    sunriseLongitude:wrapLongitude(subSolarLongitude-90),
    sunsetLongitude:wrapLongitude(subSolarLongitude+90),
  };
}
