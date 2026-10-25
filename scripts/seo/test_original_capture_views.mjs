#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {editorialDawnCamera} from "../../lib/earth/editorialDawnCamera.mjs";

const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const len=p=>Math.hypot(p.x,p.y,p.z);
const sun={x:.9,y:.41,z:-.15};
const configs=[
 ["clouds",.63,1.85],
 ["terminator",.49,2.03],
 ["nightlights",.15,1.90]
];
const frames=[];
for(const [shot,day,distance] of configs){
 const frame=editorialDawnCamera(sun,4.3,shot);
 assert.equal(frame.shot,shot);
 assert.equal(frame.frameKind,"CUPOLA_EARTH_FIXED_DAWN_CAMERA");
 assert.ok(Math.abs(frame.distance/4.3-distance)<1e-9);
 assert.ok(Math.abs(frame.daylightFractionApprox-day)<1e-9);
 assert.ok(Math.abs(len(frame.normal)-1)<1e-9);
 assert.ok(Math.abs(dot(frame.lookDirection,frame.right))<1e-9);
 assert.ok(Math.abs(dot(frame.lookDirection,frame.up))<1e-9);
 assert.ok(Math.abs(frame.sunCenterSeparationRad-Math.acos(1-2*day))<1e-9);
 frames.push(frame);
}
for(let i=0;i<frames.length;i++)for(let j=0;j<i;j++){
 assert.ok(dot(frames[i].normal,frames[j].normal)<.996,
  "independent themes must use DISTINCT genuine orbital views, not duplicate photographs");
}
const normal=editorialDawnCamera(sun,4.3),classic=editorialDawnCamera(sun,4.3,"classic");
assert.ok(Math.abs(normal.distance/4.3-1.56)<1e-9,
 "media camera changes cannot shift the approved homepage daylit view");
assert.ok(Math.abs(classic.distance/4.3-1.40)<1e-9,
 "media camera changes cannot shift the original classic QA view");
const experience=readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(experience.includes('params.get("capture")==="1"') &&
 experience.includes('requestedShot==="clouds"') &&
 experience.includes('requestedShot==="terminator"') &&
 experience.includes('requestedShot==="nightlights"'),
 "dedicated views are prohibited outside the capture-only route");
const presets=JSON.parse(readFileSync("config/scene-capture-presets.json","utf8"));
for(const [shot] of configs){
 const p=presets.presets.find(x=>x.id===(shot==="terminator"?"day-night-hero":shot==="nightlights"?"night-lights-hero":"clouds-hero"));
 assert.ok(p && p.cameraMode==="editorial-science-capture");
 assert.equal(new URL(p.route,"https://cupola.earth").searchParams.get("heroShot"),shot);
 assert.equal(p.pageId,"earth");
}
const renderer=readFileSync("scripts/scene-capture/render.mjs","utf8");
assert.ok(renderer.includes('root?.getAttribute("data-editorial-shot")===expected') &&
 renderer.includes("data-daylight-fraction-approx") &&
 renderer.includes("expectedDaylight"),"QA must attest actual requested physical camera from WebGL DOM");
console.log("PASS CUPOLA 8.4: three unique science cameras, verified physical Sun, approved hero unchanged");
