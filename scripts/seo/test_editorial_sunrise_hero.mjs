#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {editorialDawnCamera} from "../../lib/earth/editorialDawnCamera.mjs";
const unit=p=>{const r=Math.hypot(p.x,p.y,p.z);return {x:p.x/r,y:p.y/r,z:p.z/r}};
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const length=a=>Math.hypot(a.x,a.y,a.z);
const deg=r=>r*180/Math.PI;
const solar=[
 {x:1,y:0,z:0}, {x:-1,y:0,z:0}, {x:0,y:0,z:1},
 {x:0.9,y:0.41,z:-0.15}, {x:-0.44,y:-0.28,z:0.85},
 {x:0,y:1,z:0},{x:0,y:-1,z:0}
];
for(const vec of solar){
 const before=JSON.stringify(vec),S=unit(vec),r=4.3;
 const f=editorialDawnCamera(vec,r);
 assert.equal(JSON.stringify(vec),before,"must never mutate shared ephemeris Sun vector");
 assert.ok(f.distance>r+4,"editorial camera must stay outside Earth");
 assert.ok(Math.abs(length(f.normal)-1)<1e-9);
 assert.ok(Math.abs(length(f.up)-1)<1e-9);
 assert.ok(Math.abs(length(f.right)-1)<1e-9);
 assert.ok(Math.abs(dot(f.normal,f.up))<1e-9,"camera up orthogonal to Earth normal");
 assert.ok(Math.abs(dot(f.normal,f.right))<1e-9);
 assert.ok(Math.abs(dot(f.up,f.right))<1e-9);
 // Sun's center is just outside Earth's geometrical silhouette. Its
 // actual angular radius is ~0.266° so its disc is fully or mostly visible.
 const angular=Math.acos(-dot(f.normal,S));
 assert.ok(Math.abs(angular-f.sunCenterSeparationRad)<1e-8);
 assert.ok(Math.abs(deg(angular-f.earthLimbAngleRad)-0.88)<0.000001,
   "science-based sky Sun separation, not a fake CSS source");
 const solarRight=dot(S,f.right),solarUp=dot(S,f.up);
 assert.ok(solarRight>0.05&&solarUp>0.05,
   "real Sun should be in upper-right of camera image");
 assert.ok(f.daylightFractionApprox>0.03 && f.daylightFractionApprox<0.17,
   "sunrise view needs night lights with a physically daylit crescent");
 assert.equal(f.frameKind,"CUPOLA_EARTH_FIXED_DAWN_CAMERA");
}
const changeA=editorialDawnCamera({x:0.98,y:0.15,z:0.1},4.3);
const changeB=editorialDawnCamera({x:-0.98,y:0.15,z:-0.1},4.3);
assert.ok(dot(changeA.normal,changeB.normal)<-.5,
 "editorial camera must follow rotating sunrise, not freeze on North America");
assert.throws(()=>editorialDawnCamera({x:0,y:0,z:0},4.3),/invalid solar frame/);
assert.throws(()=>editorialDawnCamera({x:1,y:0,z:0},0),/Invalid Earth radius/);
const render=readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(render.includes('editorialDawnCamera(getSunDirection(new Date(utcMs)),GLOBE_RADIUS)'),
 "hero must use the exact existing scene solar ephemeris, not separate app time");
assert.ok(render.includes('enabled={!props.editorialDawn}'),
 "hero is locked while Explore retains ordinary interactive camera controls");
assert.ok(render.includes('new URLSearchParams(window.location.search).get("hero")==="sunrise"'),
 "opt-in scene route only: normal /explore must retain original camera");
const frame=readFileSync("components/editorial/SceneFrame.tsx","utf8");
assert.ok(frame.includes('src="/explore?embed=1&hero=sunrise"'));
const capture=JSON.parse(readFileSync("config/scene-capture-presets.json","utf8"));
assert.ok(capture.presets.find(p=>p.id==="home-hero")?.route===
  "/explore?capture=1&hero=sunrise");
assert.ok(!capture.presets.find(p=>p.id==="satellite-atlas-hero").route.includes("hero=sunrise"),
 "capture for satellites must not borrow editorial sunrise framing");
const styles=readFileSync("app/atlas.css","utf8");
assert.ok(styles.includes("CUPOLA 7.1 — Editorial Art Direction"));
assert.ok(styles.includes("--ae-display"));
console.log("PASS CUPOLA 7.1: UTC Sun-aligned upper-right limb, physical occultation, dynamic follow, isolated Explore controls, responsive editorial identity");
