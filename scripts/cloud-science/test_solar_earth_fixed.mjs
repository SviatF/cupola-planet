#!/usr/bin/env node
/**
 * CUPOLA 4.4 solar-frame regression. We use independently computed
 * Astronomy Engine solar RA/Dec and sidereal orientation as a numerical
 * sanity check on the truncated Meeus production model.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import * as Astronomy from "astronomy-engine";
const load=async path=>{
  const js=ts.transpileModule(readFileSync(path,"utf8"),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
  }).outputText;
  return await import("data:text/javascript,"+encodeURIComponent(js));
};
const C=await load("lib/earth/celestialEngine.ts");
const S=await load("lib/earth/solarEarthFixed.ts");
const D=Math.PI/180;
const x0={x:149600000,y:0,z:0};
const wrap=x=>((x+180)%360+360)%360-180;
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
function station(lat,lon){
  return {x:Math.cos(lat*D)*Math.cos(lon*D),
    y:Math.sin(lat*D),z:-Math.cos(lat*D)*Math.sin(lon*D)};
}
assert.throws(()=>S.solarSubpointEarthFixed({x:NaN,y:0,z:0}));
assert.throws(()=>S.solarSubpointEarthFixed({x:1,y:0,z:0}));
assert.equal(S.solarSubpointEarthFixed(x0).subSolarLongitude,0);
assert.equal(S.solarSubpointEarthFixed(x0).sunriseLongitude,-90);
assert.equal(S.solarSubpointEarthFixed(x0).sunsetLongitude,90);
assert.equal(S.solarSubpointEarthFixed({x:0,y:0,z:-149600000}).subSolarLongitude,90);
assert.equal(S.solarSubpointEarthFixed({x:0,y:0,z:149600000}).subSolarLongitude,-90);
const cases=[
  "2024-03-20T03:06:00Z","2024-04-08T18:17:00Z",
  "2024-06-20T20:51:00Z","2024-09-22T12:44:00Z",
  "2024-12-21T09:20:00Z","2025-03-14T06:58:41Z",
  "2026-10-21T12:00:00Z","2027-03-20T20:25:00Z",
  "2030-06-21T00:00:00Z"
];
let maxReferenceErrorDeg=0,maxTerminatorDot=0;
for(const iso of cases){
  const date=new Date(iso),sun=C.celestialAt(date).sun.earthFixedKm;
  const sub=S.solarSubpointEarthFixed(sun);
  const unit={x:sun.x/C.norm(sun),y:sun.y/C.norm(sun),z:sun.z/C.norm(sun)};
  assert.ok(Math.abs(sub.declinationDegrees)<23.6);
  const noon=station(sub.declinationDegrees,sub.subSolarLongitude);
  assert.ok(dot(unit,noon)>0.99999999999,"Subsolar point must face true Sun "+iso);
  const sunrise=station(0,sub.sunriseLongitude),sunset=station(0,sub.sunsetLongitude);
  const err=Math.max(Math.abs(dot(unit,sunrise)),Math.abs(dot(unit,sunset)));
  maxTerminatorDot=Math.max(maxTerminatorDot,err);
  assert.ok(err<1e-12,"Equatorial terminator must be exactly 90deg from Sun "+iso);
  const inertial=Astronomy.GeoVector(Astronomy.Body.Sun,date,false);
  const equatorial=Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(date),inertial);
  const ra=Math.atan2(equatorial.y,equatorial.x)/D;
  const dec=Math.atan2(equatorial.z,Math.hypot(equatorial.x,equatorial.y))/D;
  const apparentSolarLon=wrap(ra-15*Astronomy.SiderealTime(date));
  const lonErr=Math.abs(wrap(sub.subSolarLongitude-apparentSolarLon));
  const latErr=Math.abs(sub.declinationDegrees-dec);
  maxReferenceErrorDeg=Math.max(maxReferenceErrorDeg,lonErr,latErr);
  assert.ok(lonErr<0.6&&latErr<0.6,
    "Sun subpoint disagrees with independent sidereal frame "+iso+
    ": longitude "+lonErr+", declination "+latErr);
  const offset=wrap(sub.sunsetLongitude-sub.sunriseLongitude);
  assert.ok(Math.abs(Math.abs(offset)-180)<1e-9);
}
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(scene,/solarSubpointEarthFixed\(getCelestial\(date\)\.sun\.earthFixedKm\)/);
assert.match(scene,/function getSunDirection\(date:Date\)\s*\{\s*return earthFixedToWorld\(getCelestial\(date\)\.sun\.earthFixedKm\)/);
assert.match(scene,/sunLight\.current\.position\.copy\(GLOBE_CENTER\)\.add\(sun\.multiplyScalar\(24\)\)/);
assert.doesNotMatch(scene,/equationOfTimeMinutes|0\.006918\s*-\s*0\.399912/,
  "NOAA approximated Sun must not separately drive sunrise labels");
assert.match(scene,/getSolarCoordinates\(now\)/);
assert.match(scene,/getSolarCoordinates\(new Date\(\)\)/);
console.log("CUPOLA 4.4 SOLAR FRAME PASS",JSON.stringify({
  count:cases.length,maxIndependentReferenceDifferenceDeg:maxReferenceErrorDeg,
  maxTerminatorNormalDot:maxTerminatorDot,
  source:"Astronomy Engine EQJ→EQD independent RA/Dec + sidereal angle",
  scope:"Sun geometry, not calibrated terrain/atmospheric sunrise event times"
}));
