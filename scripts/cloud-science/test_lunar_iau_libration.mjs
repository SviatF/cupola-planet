#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import * as Astronomy from "astronomy-engine";
import {createRequire} from "node:module";
const nodeRequire=createRequire(import.meta.url);
const load=p=>{
  const js=ts.transpileModule(readFileSync(p,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const module={exports:{}};
  // data: ESM URLs cannot resolve bare npm imports such as astronomy-engine.
  new Function("require","module","exports",js)(nodeRequire,module,module.exports);
  return module.exports;
};
const frameEngine=load("lib/earth/lunarIauOrientation.ts");
const C=load("lib/earth/celestialEngine.ts");
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,(
  a.x*b.x+a.y*b.y+a.z*b.z)/(
  Math.hypot(a.x,a.y,a.z)*Math.hypot(b.x,b.y,b.z)
))))*180/Math.PI;
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const longitudeDelta=(a,b)=>((a-b+540)%360)-180;
assert.throws(()=>frameEngine.moonIauBodyFrameAt(
  new Date("2200-01-01T00:00:00Z"),{x:384400,y:0,z:0}));
assert.throws(()=>frameEngine.moonIauBodyFrameAt(
  new Date("2026-10-21T00:00:00Z"),{x:3,y:0,z:0}));
const values=[];
const epoch=Date.parse("2026-09-01T00:00:00Z");
for(let i=0;i<40;i++){
  const date=new Date(epoch+i*24*3600_000);
  const moon=C.celestialAt(date).moon.earthFixedKm;
  const f=frameEngine.moonIauBodyFrameAt(date,moon);
  const ref=Astronomy.Libration(date);
  assert.equal(f.source,"IAU_2015_ROTATION_AXIS_EQUINOX_APPROX_QA");
  for(const a of [f.east,f.north,f.primeMeridian])
    assert.ok(Math.abs(Math.hypot(a.x,a.y,a.z)-1)<1e-12,
      "IAU Moon axes unit length");
  assert.ok(Math.abs(dot(f.north,f.east))<1e-12);
  assert.ok(Math.abs(dot(f.north,f.primeMeridian))<1e-12);
  assert.ok(Math.abs(dot(f.east,f.primeMeridian))<1e-12);
  assert.ok(angle(cross(f.east,f.north),f.primeMeridian)<0.0001,
    "Three.js body group basis must be proper right-handed rotation");
  // Physical IAU sub-Earth point MUST migrate across NASA lunar longitudes,
  // rather than pinning 0° longitude to terrestrial observers forever.
  assert.ok(Math.abs(f.subEarthLongitudeDeg)<12.0);
  assert.ok(Math.abs(f.subEarthLatitudeDeg)<12.0);
  const lonError=Math.abs(longitudeDelta(f.subEarthLongitudeDeg,ref.elon));
  const oppositeLonError=Math.abs(longitudeDelta(-f.subEarthLongitudeDeg,ref.elon));
  const latError=Math.abs(f.subEarthLatitudeDeg-ref.elat);
  values.push({utc:date.toISOString().slice(0,10),
    moonLongitudeDeg:f.subEarthLongitudeDeg,moonLatitudeDeg:f.subEarthLatitudeDeg,
    referenceLongitudeDeg:ref.elon,referenceLatitudeDeg:ref.elat,
    lonError,oppositeLonError,latError});
}
const range=a=>Math.max(...a)-Math.min(...a);
assert.ok(range(values.map(v=>v.moonLongitudeDeg))>7,
  "Longitude libration should span several degrees in one lunar month");
assert.ok(range(values.map(v=>v.moonLatitudeDeg))>7,
  "Latitude libration should span several degrees in one lunar month");
const maxLatError=Math.max(...values.map(v=>v.latError));
const maxSignedLonError=Math.max(...values.map(v=>v.lonError));
const maxOppositeLonError=Math.max(...values.map(v=>v.oppositeLonError));
// Astronomy Engine's Libration is a separate analytical method; the IAU
// WGCCRE rotation axis includes its own physical libration terms.
assert.ok(maxLatError<1.5,"IAU selenographic latitude vs independent lunar libration: "+maxLatError);
assert.ok(maxSignedLonError<1.5,
 "IAU east-positive libration longitude vs independent lunar libration: "+
 maxSignedLonError+"; opposite sign error "+maxOppositeLonError);
// Official NASA SVS Moon Phase and Libration 2026, hourly geocentric table,
// https://svs.gsfc.nasa.gov/5587/
// https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/mooninfo_2026.json
// Independent of both Astronomy Engine Libration() and our geometry calculations.
// Match UTC exactly; data verified 2026-10-21.
const nasaSvsHours=[
  {utc:"2026-09-01T00:00:00Z",illuminatedPct:84.17,lon:-4.481,lat:-5.607,distanceKm:377761},
  {utc:"2026-09-09T00:00:00Z",illuminatedPct:5.83,lon:3.291,lat:-1.289,distanceKm:370266},
  {utc:"2026-09-17T00:00:00Z",illuminatedPct:32.72,lon:3.059,lat:6.785,distanceKm:401381},
  {utc:"2026-09-25T00:00:00Z",illuminatedPct:96.71,lon:-5.051,lat:-1.352,distanceKm:386732},
  {utc:"2026-10-21T16:00:00Z",illuminatedPct:77.70,lon:-5.648,lat:-0.442,distanceKm:391289}
];
const nasaErrors=[];
for(const nasa of nasaSvsHours){
  const t=new Date(nasa.utc),state=C.celestialAt(t);
  const f=frameEngine.moonIauBodyFrameAt(t,state.moon.earthFixedKm);
  const lonDiff=Math.abs(longitudeDelta(f.subEarthLongitudeDeg,nasa.lon));
  const latDiff=Math.abs(f.subEarthLatitudeDeg-nasa.lat);
  const illuminationDiffPct=Math.abs(state.moonIlluminatedFraction*100-nasa.illuminatedPct);
  const distanceDiffKm=Math.abs(state.moon.distanceKm-nasa.distanceKm);
  nasaErrors.push({utc:nasa.utc,lonDiffDeg:lonDiff,latDiffDeg:latDiff,
    illuminationDiffPct,distanceDiffKm});
  assert.ok(lonDiff<0.5&&latDiff<0.5,
    "IAU lunar face must match NASA SVS longitude/latitude at "+nasa.utc+
    " (lon "+lonDiff+", lat "+latDiff+")");
  assert.ok(illuminationDiffPct<3,
    "Phase must agree with NASA hourly Dial-A-Moon: "+
    nasa.utc+" "+illuminationDiffPct+"%pt");
  assert.ok(distanceDiffKm<8000,
    "Analytical lunar distance must be bounded against NASA "+
    nasa.utc+" "+distanceDiffKm+" km");
}
console.log("CUPOLA 4.6 NASA SVS 2026 HOURLY REFERENCE PASS",JSON.stringify(nasaErrors));
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(scene,/new URLSearchParams\(window\.location\.search\)\.get\("celestialLibration"\)==="1"/);
assert.match(scene,/moonIauBodyFrameAt\(utcNow,celestialShadow\.moon\.earthFixedKm\)/);
assert.match(scene,/new THREE\.Matrix4\(\)\.makeBasis\(east,northIau,prime\)/);
assert.match(scene,/panel\.id="cupola-iau-libration-qa"/,
  "QA-only mode must be explicitly visible in screenshots");
assert.match(scene,/panel\.dataset\.mode="iau-rotation"/);
assert.match(scene,/readout\.dataset\.lunarLongitude=frame\.subEarthLongitudeDeg\.toFixed\(3\)/);
assert.match(scene,/readout\.dataset\.lunarLatitude=frame\.subEarthLatitudeDeg\.toFixed\(3\)/);
assert.match(scene,/ILLUSTRATIVE PLACEHOLDER/,
  "QA must not claim NASA texture if the genuine map has not loaded");
assert.match(scene,/new THREE\.Matrix4\(\)\.makeBasis\(xAxis,alignedNorth,toEarth\)/,
  "Keep visual-tested mean orientation for normal visitors");
console.log("CUPOLA 4.5 IAU LIBRATION QA PASS",JSON.stringify({
  dates:values.length,longitudeRange:range(values.map(v=>v.moonLongitudeDeg)),
  latitudeRange:range(values.map(v=>v.moonLatitudeDeg)),
  maxLatitudeReferenceDeltaDeg:maxLatError,
  maxLongitudeReferenceDeltaDeg:maxSignedLonError,
  sample:values.slice(0,3),
  mode:"QA_OPT_IN_ONLY; IAU2015 + equinox, not lunar PCK or IERS"
}));
