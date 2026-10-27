#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {editorialSolarTwilightHeroCamera,editorialTwilightHeroCamera,editorialDawnCamera}
 from "../../lib/earth/editorialDawnCamera.mjs";
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const len=a=>Math.hypot(a.x,a.y,a.z);
const unit=a=>({x:a.x/len(a),y:a.y/len(a),z:a.z/len(a)});
const solarVectors=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},
 {x:.92,y:.22,z:-.32},{x:-.43,y:-.33,z:.85}];
const desktops=[
 {name:"1600x570",w:1600,h:570,left:.21,top:-.22,iw:1.06,ih:1.45},
 {name:"2006x675",w:2006,h:675,left:.21,top:-.22,iw:1.06,ih:1.45},
 {name:"1600x468",w:1600,h:468,left:.21,top:-.22,iw:1.06,ih:1.45}
];
const project=(v,c,aspect,fov)=>{
 const z=dot(v,c.lookDirection);
 const tan=Math.tan(fov*Math.PI/360);
 assert.ok(z>0,"Sun and Earth must both face the actual scene camera");
 return {x:dot(v,c.right)/(z*tan*aspect),
   y:dot(v,c.up)/(z*tan),z};
};
for(const vec of solarVectors){
 const before=JSON.stringify(vec),sun=unit(vec);
 const c=editorialSolarTwilightHeroCamera(vec,4.3);
 assert.equal(JSON.stringify(vec),before,"never mutate the physical Sun");
 assert.equal(c.frameKind,"CUPOLA_EARTH_FIXED_SOLAR_TWILIGHT_HERO_CAMERA");
 assert.equal(c.shot,"solar-twilight");
 assert.equal(c.verticalFovDegrees,80);
 assert.ok(Math.abs(c.distance/4.3-2.80)<1e-9);
 assert.ok(c.daylightFractionApprox>.295&&c.daylightFractionApprox<.305,
   "about 70% real nightside for original VIIRS city radiance");
 assert.ok(Math.abs(dot(c.up,c.right))<1e-10);
 assert.ok(Math.abs(dot(c.right,c.lookDirection))<1e-10);
 assert.ok(Math.abs(dot(c.up,c.lookDirection))<1e-10);
 const earthAngle=Math.acos(dot(sun,unit({x:-c.normal.x,y:-c.normal.y,z:-c.normal.z})));
 assert.ok(earthAngle>1.1&&earthAngle<1.2,"actual Sun must be ~66deg from Earth center");
 const gap=earthAngle-c.earthLimbAngleRad;
 assert.ok(gap>.80,"real Sun must not be occulted by Earth's disk");
 for(const d of desktops){
  const aspect=d.w*d.iw/(d.h*d.ih);
  const earthDirection=unit({x:-c.normal.x,y:-c.normal.y,z:-c.normal.z});
  const earth=project(earthDirection,c,aspect,80);
  const sunProjection=project(sun,c,aspect,80);
  assert.ok(Math.abs(earth.x)<1 && Math.abs(earth.y)<1);
  assert.ok(Math.abs(sunProjection.x)<1 && Math.abs(sunProjection.y)<1,
   d.name+" physical solar billboard must be inside actual 70deg lens");
  const screen=(p)=>({x:d.left+d.iw*(1+p.x)/2,
    y:d.top+d.ih*(1-p.y)/2});
  const e=screen(earth),s=screen(sunProjection);
  const diameter=d.ih*Math.tan(c.earthLimbAngleRad)/Math.tan(80*Math.PI/360);
  assert.ok(e.x>.52&&e.x<.65&&e.y>.50&&e.y<.63,
    d.name+" globe must move LEFT without covering the text or falling below hero");
  assert.ok(e.y-diameter/2>.20 && e.y+diameter/2<.94,
    d.name+" Earth disk must remain readable within header");
  assert.ok(s.x>.87&&s.x<.985&&s.y>.3&&s.y<.53,
    d.name+" REAL Sun must visibly appear at right after iframe clipping");
  assert.ok(s.x>e.x+.30,"Sun must be separated from Earth's limb");
 }
 assert.ok(Math.abs(editorialTwilightHeroCamera(vec,4.3).distance/4.3-4.3)<1e-9,
  "8.9 fallback must remain unchanged on narrow screens");
 assert.ok(Math.abs(editorialDawnCamera(vec,4.3).distance/4.3-1.56)<1e-9,
  "legacy QA and science capture remain unchanged");
}
const component=fs.readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(component.includes('params.get("heroShot")!=="twilight" && editorialCamera.aspect>=1.85'));
assert.ok(component.includes('const desiredFov=solarHero?80:41;'));
assert.ok(component.includes('editorialSolarTwilightHeroCamera(getSunDirection(new Date(utcMs)),GLOBE_RADIUS)'));
assert.ok(component.includes('solarHero?"solar-twilight-wide-v1"'));
assert.ok(component.includes('data-sun-projection-x'));
assert.ok(component.includes('data-sun-visible-in-frustum'));
assert.ok(component.includes('cityLights: true'));
assert.ok(component.includes('retrieveDailyImage("night",nightVersionRef.current,controller.signal)'));
const frame=fs.readFileSync("components/editorial/SceneFrame.tsx","utf8");
assert.ok(frame.includes('src="/explore?embed=1&hero=sunrise"'));
assert.ok(!frame.includes('sun-placeholder.png'));
const capture=JSON.parse(fs.readFileSync("config/scene-capture-presets.json","utf8")).presets;
assert.equal(capture.find(x=>x.id==="home-hero").route,"/explore?capture=1&hero=sunrise");
const qa=fs.readFileSync("scripts/scene-capture/qa-twilight-home.mjs","utf8");
assert.ok(qa.includes('data-sun-projection-x'));
assert.ok(qa.includes("sunPageX"));
console.log("PASS CUPOLA 8.10 — REAL Sun and visible city-lit Earth share one desktop WebGL crop");
