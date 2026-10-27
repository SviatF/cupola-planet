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
 assert.ok(f.distance>r*1.55 && f.distance<r*1.57,"CUPOLA 8.1 daylit camera must pull back without switching to the full-globe Explore view");
 assert.ok(Math.abs(length(f.normal)-1)<1e-9);
 assert.ok(Math.abs(length(f.up)-1)<1e-9);
 assert.ok(Math.abs(length(f.right)-1)<1e-9);
 assert.ok(Math.abs(dot(f.lookDirection,f.up))<1e-9,"camera up orthogonal to actual off-axis lens");
 assert.ok(Math.abs(dot(f.lookDirection,f.right))<1e-9);
 assert.ok(Math.abs(dot(f.up,f.right))<1e-9);
 // Sun's center is just outside Earth's geometrical silhouette. Its
 // actual angular radius is ~0.266° so its disc is fully or mostly visible.
 const angular=Math.acos(-dot(f.normal,S));
 assert.ok(Math.abs(angular-f.sunCenterSeparationRad)<1e-8);
 assert.ok(deg(angular-f.earthLimbAngleRad)>35 && deg(angular-f.earthLimbAngleRad)<37,
   "science-based sky Sun separation, not a fake CSS source");
 const solarRight=dot(S,f.right),solarUp=dot(S,f.up);
 assert.ok(solarRight>0.05&&solarUp>0.05,
   "real Sun should be in upper-right of camera image");
 // Visibility is not merely a positive direction: the previous camera
 // placed the Sun ABOVE the 41° vertical field and rendered no solar disk.
 const solarForward=dot(S,f.lookDirection);
 assert.ok(solarForward>0,"real Sun must be in front of the camera");
 for(const aspect of [16/9,2.55]){
   const tangent=Math.tan(41*Math.PI/360);
   const sunNdcX=solarRight/(solarForward*tangent*aspect);
   const sunNdcY=solarUp/(solarForward*tangent);
   assert.ok(sunNdcX>0.08 && sunNdcX<0.95,
     "Sun should be horizontally visible in the upper right at aspect "+aspect);
   assert.ok(sunNdcY>0.20 && sunNdcY<0.95,
     "Sun should fit vertically within the real WebGL frustum at aspect "+aspect);
 }
 assert.ok(f.compositionOffsetRad>0.88 && f.compositionOffsetRad<0.90);
 assert.ok(Math.abs(dot(f.lookDirection,f.up))<1e-9);
 assert.ok(Math.abs(dot(f.lookDirection,f.right))<1e-9);
 assert.ok(f.daylightFractionApprox>0.375 && f.daylightFractionApprox<0.385,
   "closer sunrise viewpoint must expose more physically daylit cloud texture while retaining the night");
 assert.equal(f.frameKind,"CUPOLA_EARTH_FIXED_DAWN_CAMERA");
}
const changeA=editorialDawnCamera({x:0.98,y:0.15,z:0.1},4.3);
const changeB=editorialDawnCamera({x:-0.98,y:0.15,z:-0.1},4.3);
assert.ok(dot(changeA.normal,changeB.normal)<-.2,
 "pulled-back camera must continue to follow real sunrise across longitudes");
const classic=editorialDawnCamera({x:.9,y:.41,z:-.15},4.3,"classic");
assert.ok(Math.abs(classic.distance-4.3*1.40)<1e-9,
 "A/B classic composition must remain exactly reproducible");
assert.ok(Math.abs(classic.compositionOffsetRad-37*Math.PI/180)<1e-9);
assert.ok(classic.daylightFractionApprox<.17,
 "classic still represents the previous dark-side view");
assert.throws(()=>editorialDawnCamera({x:0,y:0,z:0},4.3),/invalid solar frame/);
assert.throws(()=>editorialDawnCamera({x:1,y:0,z:0},0),/Invalid Earth radius/);
// CUPOLA 7.3 regression: WebGL frustum visibility is NOT the same as
// visibility in the cropped Atlas iframe. Verify the physical solar disc
// projects inside the *visible homepage hero* for every responsive mode.
// Viewport dimensions and iframe offsets mirror the final 7.2/7.3 CSS rules.
const heroViewports=[
  {name:"desktop",w:1600,h:468,left:.21,top:-.22,iw:1.06,ih:1.45},
  {name:"tablet",w:820,h:465,left:.12,top:-.21,iw:1.21,ih:1.45},
  {name:"mobile",w:390,h:620,left:-.12,top:-.18,iw:1.45,ih:1.03}
];
for(const viewport of heroViewports){
  const solar=unit({x:.9,y:.41,z:-.15});
  const frame=editorialDawnCamera(solar,4.3);
  const forward=dot(solar,frame.lookDirection);
  const aspect=(viewport.w*viewport.iw)/(viewport.h*viewport.ih);
  const scale=Math.tan(41*Math.PI/360)*forward;
  const clipX=dot(solar,frame.right)/(scale*aspect);
  const clipY=dot(solar,frame.up)/scale;
  const x=viewport.left+viewport.iw*(1+clipX)/2;
  const y=viewport.top+viewport.ih*(1-clipY)/2;
  assert.ok(viewport.name==="desktop" ? (x>.92 && x<1.02 && y>.08 && y<.30) : (x>.95 && y>0 && y<.4),
    viewport.name+" Sun must remain in the upper-right of the ACTUAL Atlas hero after iframe crop: "+JSON.stringify({x,y}));
}
const render=readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(render.includes('editorialDawnCamera(getSunDirection(new Date(utcMs)),GLOBE_RADIUS,shot)'),
 "hero must use the exact existing scene solar ephemeris, not separate app time");
assert.ok(render.includes('enabled={!props.editorialDawn && !orbitVideoCapture}') &&
  render.includes('get("captureShot")==="orbit"') &&
  render.includes('get("capture")==="1"'),
 "hero and capture-only 360 film lock controls; regular Explore stays interactive");
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
assert.ok(styles.includes("CUPOLA 7.2 — actual screenshot-driven hero composition fix"));
assert.ok(styles.includes("top:-22%"),"iframe must cover the header's top; no rectangular empty stripe");
assert.ok(styles.includes("height:145%"),"real WebGL scene must fill viewport after optical banking");
const cropStyles=styles.slice(styles.lastIndexOf("/* CUPOLA 7.2 —"));
assert.ok(cropStyles.includes("left:21%") && cropStyles.includes("top:-22%"),
  "desktop iframe crop must match geometric viewport test");
assert.ok(cropStyles.includes("left:12%") && cropStyles.includes("top:-21%"),
  "tablet iframe crop must match geometric viewport test");
assert.ok(cropStyles.includes("left:-12%") && cropStyles.includes("top:-18%"),
  "mobile iframe crop must match geometric viewport test");
assert.ok(render.includes('data-sun-visible-in-frustum'),
  "scene must expose actual GPU clip-space solar visibility to QA");
console.log("PASS CUPOLA 7.1: UTC Sun-aligned upper-right limb, physical occultation, dynamic follow, isolated Explore controls, responsive editorial identity");
