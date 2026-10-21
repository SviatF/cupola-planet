/**
 * CUPOLA 4.5 — IAU lunar body-fixed orientation in CUPOLA's terrestrial frame.
 *
 * Astronomy Engine RotationAxis(Moon) implements IAU WGCCRE rotational elements
 * (RA, Dec of lunar north pole and W, the moving 0° prime meridian).
 * Those THREE angles are essential; an arbitrary Earth-facing Moon sprite
 * permanently locks one map meridian toward Earth and erases optical libration.
 *
 * Equatorial J2000 (ICRF-like) pole and meridian vectors are rotated into
 * true equator of date, then into CUPOLA's Earth-fixed convention:
 *   +X geographic Greenwich / 0°E, +Y geographic north, +Z 90°W.
 *
 * The terrestrial rotation below shares the equinox-based method already
 * tested against ERFA in jplEarthFixed.ts. This preview omits current
 * IERS DUT1 + polar motion, and is NOT high-precision JPL lunar PCK or a
 * measured physical libration. The IAU rotational model includes periodic
 * physical terms. Client opt-in remains required for visual acceptance.
 *
 * Lunar texture mesh has a permanent y=-PI/2 correction: GROUP +Z aligns to
 * body-fixed lunar +X (0° longitude); GROUP +Y to lunar north +Z; GROUP +X
 * to lunar +90°E. No additional texture rotation is applied here.
 *
 * Reference: IAU WGCCRE 2015 lunar pole and prime meridian elements.
 * https://astrogeology.usgs.gov/groups/rotational-and-cartographic-information
 */
import * as Astronomy from "astronomy-engine";

export type LunarVector={x:number;y:number;z:number};
export type LunarBodyFrame={
  east:LunarVector;
  north:LunarVector;
  primeMeridian:LunarVector;
  subEarthLongitudeDeg:number;
  subEarthLatitudeDeg:number;
  source:"IAU_2015_ROTATION_AXIS_EQUINOX_APPROX_QA";
};

const rad=Math.PI/180;
const clamp=(v:number)=>Math.max(-1,Math.min(1,v));
const dot=(a:LunarVector,b:LunarVector)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:LunarVector,b:LunarVector):LunarVector=>({
  x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x
});
const length=(v:LunarVector)=>Math.hypot(v.x,v.y,v.z);
const normalize=(v:LunarVector):LunarVector=>{
  const m=length(v);
  if(!Number.isFinite(m)||m<1e-12)throw Error("Invalid lunar rotational axis");
  return{x:v.x/m,y:v.y/m,z:v.z/m};
};
const scale=(v:LunarVector,m:number):LunarVector=>({x:v.x*m,y:v.y*m,z:v.z*m});
const add=(a:LunarVector,b:LunarVector):LunarVector=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const fromEqj=(v:LunarVector,date:Date):LunarVector=>{
  const t=new Astronomy.AstroTime(date);
  const eqd=Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(date),
    new Astronomy.Vector(v.x,v.y,v.z,t));
  const gst=Astronomy.SiderealTime(date)*15*rad;
  const c=Math.cos(gst),s=Math.sin(gst);
  const x=c*eqd.x+s*eqd.y;
  const east=-s*eqd.x+c*eqd.y;
  // Scene axes X Greenwich, Y north, Z west.
  return {x,y:eqd.z,z:-east};
};
const wrapLongitude=(degrees:number)=>((degrees+180)%360+360)%360-180;

export function moonIauBodyFrameAt(date:Date,moonEarthFixedKm:LunarVector):LunarBodyFrame{
  if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1900||
     date.getUTCFullYear()>2100||
     !Number.isFinite(length(moonEarthFixedKm))||
     length(moonEarthFixedKm)<340000||length(moonEarthFixedKm)>410000)
    throw Error("Invalid Moon body-fixed orientation inputs");
  const axis=Astronomy.RotationAxis(Astronomy.Body.Moon,date);
  const a=axis.ra*15*rad,d=axis.dec*rad,w=axis.spin*rad;
  const pole:LunarVector={x:Math.cos(d)*Math.cos(a),
    y:Math.cos(d)*Math.sin(a),z:Math.sin(d)};
  // IAU prime meridian W sweeps around the lunar north pole; lunar +90°E
  // is the in-plane, right-handed orthogonal axis.
  const reference:LunarVector={x:-Math.sin(a),y:Math.cos(a),z:0};
  const q=cross(pole,reference);
  const lunarZeroEqj=normalize(add(scale(reference,Math.cos(w)),scale(q,Math.sin(w))));
  const lunarNorthEqj=normalize(pole);
  const primeMeridian=normalize(fromEqj(lunarZeroEqj,date));
  const north=normalize(fromEqj(lunarNorthEqj,date));
  const east=normalize(cross(north,primeMeridian));
  // Sub-Earth coordinates in the IAU lunar body frame.
  const earthward=normalize(scale(moonEarthFixedKm,-1));
  const subEarthLongitudeDeg=wrapLongitude(
    Math.atan2(dot(earthward,east),dot(earthward,primeMeridian))/rad
  );
  const subEarthLatitudeDeg=Math.asin(clamp(dot(earthward,north)))/rad;
  return{east,north,primeMeridian,subEarthLongitudeDeg,subEarthLatitudeDeg,
    source:"IAU_2015_ROTATION_AXIS_EQUINOX_APPROX_QA"};
}
