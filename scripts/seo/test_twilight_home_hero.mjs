#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {editorialTwilightHeroCamera,editorialDawnCamera,editorialWideOrbitCamera} from "../../lib/earth/editorialDawnCamera.mjs";
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const length=a=>Math.hypot(a.x,a.y,a.z);
const unit=a=>({x:a.x/length(a),y:a.y/length(a),z:a.z/length(a)});
const solarVectors=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:.92,y:.22,z:-.32},{x:-.43,y:-.33,z:.85}];
const tanHalf=Math.tan(41*Math.PI/360);
for(const raw of solarVectors){
 const original=JSON.stringify(raw),sun=unit(raw),frame=editorialTwilightHeroCamera(raw,4.3);
 assert.equal(JSON.stringify(raw),original);
 assert.equal(frame.shot,"twilight");
 assert.equal(frame.frameKind,"CUPOLA_EARTH_FIXED_TWILIGHT_HERO_CAMERA");
 assert.ok(Math.abs(frame.distance/4.3-4.30)<1e-9);
 assert.ok(frame.daylightFractionApprox>.395&&frame.daylightFractionApprox<.405,
  "the actual UTC solar vector must give a genuine day/night split");
 assert.ok(Math.abs(length(frame.normal)-1)<1e-10);
 assert.ok(Math.abs(dot(frame.lookDirection,frame.up))<1e-10);
 assert.ok(Math.abs(dot(frame.lookDirection,frame.right))<1e-10);
 assert.ok(Math.abs(dot(frame.up,frame.right))<1e-10);
 assert.ok(dot(sun,frame.right)>.5,"sunlit morning edge must face right");
 const diameter=Math.tan(frame.earthLimbAngleRad)/tanHalf;
 assert.ok(diameter>.60&&diameter<.67,"globe must be distant and recognizable");
 assert.ok(frame.distance>2.6*editorialDawnCamera(raw,4.3).distance);
 assert.equal(editorialWideOrbitCamera(raw,4.3).shot,"wide");
}
const viewports=[
 {name:"desktop",w:1600,h:468,left:.21,top:-.22,iw:1.06,ih:1.45},
 {name:"tablet",w:820,h:465,left:.12,top:-.21,iw:1.21,ih:1.45},
 {name:"mobile",w:390,h:620,left:-.12,top:-.18,iw:1.45,ih:1.03}
];
const f=editorialTwilightHeroCamera({x:.92,y:.22,z:-.32},4.3);
for(const vp of viewports){
 const diameter=Math.tan(f.earthLimbAngleRad)/tanHalf;
 const cx=vp.left+vp.iw/2,cy=vp.top+vp.ih/2;
 const rx=diameter*vp.ih*vp.h/(2*vp.w),ry=diameter*vp.ih/2;
 if(vp.name==="mobile"){
  assert.ok(cy-ry>=0&&cy+ry<.70,"mobile disk above hero copy");
  assert.ok(cx>.45&&cx<.70);
 }else{
  assert.ok(cy-ry>=0&&cy+ry<=1,"entire globe vertically visible");
  assert.ok(cx-rx>.43&&cx+rx<1.01,"globe on right, not over text");
 }
}
const scene=fs.readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(scene.includes('params.get("embed")==="1" && params.get("capture")!=="1"'));
assert.ok(scene.includes('editorialTwilightHeroCamera(getSunDirection(new Date(utcMs)),GLOBE_RADIUS)'));
assert.ok(scene.includes('params.get("heroShot")!=="classic"')&&scene.includes('params.get("heroShot")!=="daylit"'));
assert.ok(scene.includes('twilightHome?"twilight-wide-v1":"sunrise-limb-v1"'));
assert.ok(scene.includes('const [layers, setLayers] = useState({ clouds: true, cityLights: true,'));
assert.ok(scene.includes('retrieveDailyImage("night",nightVersionRef.current,controller.signal)'));
assert.ok(!scene.includes("editorialNightLightsBoost"),"no fictional city lights");
const hero=fs.readFileSync("components/editorial/SceneFrame.tsx","utf8");
assert.ok(hero.includes('src="/explore?embed=1&hero=sunrise"'));
const presets=JSON.parse(fs.readFileSync("config/scene-capture-presets.json","utf8")).presets;
assert.equal(presets.find(p=>p.id==="home-hero").route,"/explore?capture=1&hero=sunrise");
console.log("PASS CUPOLA 8.9: 4.30R home twilight, real night radiance, responsive globe");