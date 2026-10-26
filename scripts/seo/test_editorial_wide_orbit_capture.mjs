#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {editorialDawnCamera,editorialWideOrbitCamera}
  from "../../lib/earth/editorialDawnCamera.mjs";
const unit=p=>{const n=Math.hypot(p.x,p.y,p.z);return {x:p.x/n,y:p.y/n,z:p.z/n}};
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sunVectors=[
 {x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},
 {x:0.82,y:0.48,z:-0.31},{x:-0.44,y:-0.27,z:0.87}
];
const tan=Math.tan(41*Math.PI/360);
for(const vec of sunVectors){
 const original=JSON.stringify(vec),r=4.3;
 const wide=editorialWideOrbitCamera(vec,r);
 const hero=editorialDawnCamera(vec,r);
 assert.equal(JSON.stringify(vec),original,"must never mutate the physical Sun");
 assert.equal(hero.shot,"daylit");
 assert.ok(Math.abs(hero.distance/r-1.56)<1e-9,"live hero must remain untouched");
 assert.equal(wide.shot,"wide");
 assert.equal(wide.frameKind,"CUPOLA_EARTH_FIXED_WIDE_ORBIT_CAMERA");
 assert.ok(Math.abs(wide.distance/r-4.15)<1e-9);
 assert.ok(Math.abs(wide.earthLimbAngleRad*180/Math.PI-13.94)<0.10);
 assert.ok(wide.daylightFractionApprox>=.675&&wide.daylightFractionApprox<=.685,
  "real solar observation must illuminate the visible globe, without cloud changes");
 // Actual center of Earth in the 1600x900 screenshot. Width is 16:9.
 const earthLook={x:-wide.normal.x,y:-wide.normal.y,z:-wide.normal.z};
 const forward=dot(earthLook,wide.lookDirection);
 const clipX=dot(earthLook,wide.right)/(forward*tan*16/9);
 const clipY=dot(earthLook,wide.up)/(forward*tan);
 assert.ok(Math.abs(clipX)<.5 && Math.abs(clipY)<.5,
  "full Earth must remain centered in screenshot");
 const apparentDiameterFraction=Math.tan(wide.earthLimbAngleRad)/tan;
 assert.ok(apparentDiameterFraction>.60 && apparentDiameterFraction<.73,
  "full Earth should fill roughly two thirds of still height, not a close-up");
 assert.ok(wide.distance>hero.distance*2.5,"wide still must visibly pull back");
}
const presets=JSON.parse(fs.readFileSync("config/scene-capture-presets.json","utf8")).presets;
const earth=presets.find(p=>p.id==="from-orbit-feature");
assert.equal(earth.cameraMode,"editorial-wide-clouds");
assert.ok(earth.route.endsWith("&captureShot=wide"));
assert.equal(earth.distanceEarthRadii,4.15);
assert.equal(presets.find(p=>p.id==="home-hero").route,
 "/explore?capture=1&hero=sunrise","existing Home film keeps its sunrise camera");
const scene=fs.readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(scene.includes('get("capture")==="1"') &&
  scene.includes('get("captureShot")==="wide"'),"wide is capture-only");
assert.match(scene,/editorialWideOrbitCamera\(getSunDirection\(new Date\(utcMs\)\),GLOBE_RADIUS\)/);
for(const k of ["data-earth-center-projection-x","data-earth-center-projection-y",
 "data-earth-distance-radii","data-editorial-shot"]){
 assert.ok(scene.includes(k),"actual camera measurement missing "+k);
}
const capture=fs.readFileSync("scripts/scene-capture/render.mjs","utf8");
assert.match(capture,/preset\.cameraMode==="editorial-wide-clouds"/);
assert.match(capture,/root\?\.getAttribute\("data-editorial-shot"\)==="wide"/);
const science=fs.readFileSync("lib/scene-media/science-gate.mjs","utf8");
assert.match(science,/meta\.preset==="from-orbit-feature"/);
assert.match(science,/camera\.shot==="wide"/);
assert.match(science,/earthDistanceRadii/);
console.log("PASS CUPOLA 8.8 isolated 4.15R wide-orbit composition and science provenance");
