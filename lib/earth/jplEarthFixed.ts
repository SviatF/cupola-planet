import * as Astronomy from "astronomy-engine";
import type {HorizonsVector} from "./jplHorizons";
import type {EarthOrientation} from "./iersEop";

/**
 * JPL Horizons geocentric ICRF -> CUPOLA's Earth-fixed Cartesian convention:
 * Earth-fixed X: Greenwich lon=0, Y: North Pole, Z: longitude -90 degrees.
 *
 * Earth orientation:
 * - Astronomy Engine EQJ -> true equator of date: precession + nutation.
 * - Apparent sidereal angle / Earth's rotation, corrected by IERS UT1-UTC.
 * - IERS xp,yp first-order polar-motion rotation (the neglected s' locator
 *   is sub-milliarcsecond today).
 *
 * This is an independently auditable approximation, NOT IAU 2006/2000A
 * ERFA c2t06a precision. Do NOT claim centimeter or eclipse-contact accuracy.
 */
export type EarthFixedKm={x:number;y:number;z:number};
export function horizonsIcrfToCupolaEarthFixed(
  vec:HorizonsVector,date:Date,eop:EarthOrientation,
):EarthFixedKm {
  if(!Number.isFinite(date.getTime()) ||
     Math.abs(vec.jdUt-(date.getTime()/86400000+2440587.5))*86400>601 ||
     !Number.isFinite(eop.dut1Seconds)||Math.abs(eop.dut1Seconds)>0.9 ||
     !Number.isFinite(eop.xpArcsec)||Math.abs(eop.xpArcsec)>1 ||
     !Number.isFinite(eop.ypArcsec)||Math.abs(eop.ypArcsec)>1)
    throw Error("Invalid or stale JPL/IERS terrestrial transform input");
  const r=Math.hypot(vec.x,vec.y,vec.z);
  if(!Number.isFinite(r)||r<1e4||r>2e8)throw Error("Invalid JPL radius");
  const input=new Astronomy.Vector(vec.x,vec.y,vec.z,date);
  const eqd=Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(date),input);
  // sidereal angle (apparent, in HOURS) is the equinox-based rotation
  // compatible with true equator-of-date axes. Correction is ~15"/sec DUT1.
  const degrees=(Astronomy.SiderealTime(date)*15+
    eop.dut1Seconds*360.98564736629/86400)*Math.PI/180;
  const c=Math.cos(degrees),s=Math.sin(degrees);
  const x=c*eqd.x+s*eqd.y;
  const y=-s*eqd.x+c*eqd.y;
  const z=eqd.z;
  // Linear polar-motion terms, IERS xp/yp ARCSECONDS not milliarcseconds.
  const arcsecToRad=Math.PI/(180*3600);
  const xp=eop.xpArcsec*arcsecToRad;
  const yp=eop.ypArcsec*arcsecToRad;
  const terrestrialX=x+xp*z;
  const terrestrialY=y-yp*z;
  const terrestrialZ=z-xp*x+yp*y;
  // CUPOLA's third axis points to 90° WEST (negative geographic longitude).
  return {x:terrestrialX,y:terrestrialZ,z:-terrestrialY};
}
export function terrestrialAngularDifferenceDeg(a:EarthFixedKm,b:EarthFixedKm):number{
  const na=Math.hypot(a.x,a.y,a.z),nb=Math.hypot(b.x,b.y,b.z);
  if(!(na>0&&nb>0))throw Error("Zero Earth-fixed test vector");
  return Math.acos(Math.max(-1,Math.min(1,(a.x*b.x+a.y*b.y+a.z*b.z)/(na*nb))))*180/Math.PI;
}
