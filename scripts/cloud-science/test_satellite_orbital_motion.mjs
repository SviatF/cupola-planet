#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source=readFileSync("lib/earth/satelliteMotion.ts","utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
}}).outputText;
const {
 satelliteMotionFactor, satelliteMotionClockOffset,
 satelliteOrbitArcPoint, SATELLITE_MOTION_WINDOW_MS,
 SATELLITE_MOTION_REFERENCE_BUCKET_MS,
}=await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(compiled));

assert.equal(SATELLITE_MOTION_WINDOW_MS,180000);
assert.equal(SATELLITE_MOTION_REFERENCE_BUCKET_MS,3600000);
const at=Date.parse("2026-10-14T19:03:00Z");
const ts=new Date(at).toISOString();
assert.equal(satelliteMotionFactor(ts,at-180000),0);
assert.equal(satelliteMotionFactor(ts,at-90000),0.5);
assert.equal(satelliteMotionFactor(ts,at),1);
assert.equal(satelliteMotionFactor(ts,at+60_000),1);
assert.equal(satelliteMotionFactor("invalid",at),0);
// Different satellite targets should move independently, even in one fleet.
const second=new Date(at+60_000).toISOString();
assert.equal(satelliteMotionFactor(second,at-90_000),1/6);
assert.equal(satelliteMotionFactor(ts,at-90_000),0.5);
const origin=Math.floor(at/SATELLITE_MOTION_REFERENCE_BUCKET_MS)*SATELLITE_MOTION_REFERENCE_BUCKET_MS;
const start=satelliteMotionClockOffset(ts,origin);
const shaderProgress=(now)=>Math.min(1,Math.max(0,((now-origin)/1000-start)/180));
assert.ok(Math.abs(shaderProgress(at-90000)-.5)<1e-8);
assert.ok(Math.abs(shaderProgress(at)-1)<1e-8);
assert.ok(Math.abs(start)<3600);
assert.equal(satelliteMotionClockOffset("invalid",origin),0);

// A straight line between orbit samples crosses inside a smaller radius.
// Spherical interpolation must maintain exactly the radius of a circular
// Earth orbit, including across ±180 longitude and for nonzero globe center.
const center=[4,-2,7];
const R=2.9;
const latlon=(lon,alt=R)=>[
 center[0]+alt*Math.cos(lon*Math.PI/180),
 center[1]+alt*Math.sin(lon*Math.PI/180),
 center[2]
];
const a=latlon(179);
const b=latlon(-179);
for (let i=0;i<=20;i++){
 const t=i/20;
 const p=satelliteOrbitArcPoint(a,b,center,t);
 const r=Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2]);
 assert.ok(Math.abs(r-R)<1e-10,"a great-circle arc must not dive toward Earth");
 assert.ok(p[0]<center[0]-2.8,"antimeridian crossing must use the short arc");
}
const startAlt=latlon(34,2.9),endAlt=latlon(47,3.05);
const mid=satelliteOrbitArcPoint(startAlt,endAlt,center,.5);
assert.ok(Math.abs(Math.hypot(mid[0]-center[0],mid[1]-center[1],mid[2]-center[2])-2.975)<1e-10);
for(const [t,expected] of [[0,a],[1,b]]) {
 const actual=satelliteOrbitArcPoint(a,b,center,t);
 for(let axis=0;axis<3;axis++) assert.ok(
  Math.abs(actual[axis]-expected[axis])<1e-10,
  "orbit arc must preserve exact endpoint within floating-point tolerance"
 );
}
// No NaNs from broken tracking timestamps.
assert.ok(satelliteOrbitArcPoint(a,b,center,NaN).every(Number.isFinite));

const file=readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(file,/attribute float instanceMotionStart;/);
assert.match(file,/uniform float uNowSeconds;/);
assert.match(file,/uniform vec3 uGlobeCenter;/);
assert.match(file,/float progress = clamp\(\(uNowSeconds - instanceMotionStart\) \/ 180\.0/);
assert.match(file,/direction \* mix\(startRadius, endRadius, progress\)/);
assert.match(file,/new THREE\.InstancedBufferAttribute\(motionStarts, 1\)/);
assert.match(file,/geometry\.userData\.motionReferenceMs = motionReferenceMs/);
assert.match(file,/satelliteOrbitArcPoint\(/);
assert.match(file,/\(Date\.now\(\) - referenceMs\) \/ 1000/);
assert.ok(!file.includes("satelliteMotionProgress(visible[0])"));
assert.ok(!file.includes("uniform float uProgress;"));
// Preserve 17k-class one-draw-call fleet, lazy loading and selected-satellite follow.
assert.match(file,/geometry\.instanceCount = count/);
assert.match(file,/if \(!layers\.satellites\) return;/);
assert.match(file,/function SelectedSatelliteMarker\(/);
assert.match(file,/if \(props\.followSatellite && selectedSatellite && controls\.current\)/);
console.log("PASS: per-satellite precision-safe UTC motion, great-circle arc and unchanged single-call 20k fleet");
