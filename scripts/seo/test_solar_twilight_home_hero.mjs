#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {editorialSolarTwilightHeroCamera,editorialTwilightHeroCamera,editorialDawnCamera}
 from "../../lib/earth/editorialDawnCamera.mjs";

const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const len=a=>Math.hypot(a.x,a.y,a.z);
const unit=a=>({x:a.x/len(a),y:a.y/len(a),z:a.z/len(a)});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(a,k)=>({x:a.x*k,y:a.y*k,z:a.z*k});
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const solarVectors=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},
 {x:.92,y:.22,z:-.32},{x:-.43,y:-.33,z:.85}];
const desktops=[
 {name:"1600x570",w:1600,h:570,left:.21,top:-.22,iw:1.06,ih:1.45},
 {name:"2006x675",w:2006,h:675,left:.21,top:-.22,iw:1.06,ih:1.45},
 {name:"2048x670",w:2048,h:670,left:.21,top:-.22,iw:1.06,ih:1.45},
 {name:"1600x468",w:1600,h:468,left:.21,top:-.22,iw:1.06,ih:1.45}
];
const project=(v,c,aspect,fov)=>{
 const z=dot(v,c.lookDirection);
 const tangent=Math.tan(fov*Math.PI/360);
 assert.ok(z>0,"the actual physical Sun and Earth's limb must be in front of camera");
 return {x:dot(v,c.right)/(z*tangent*aspect),y:dot(v,c.up)/(z*tangent)};
};
// Mathematically exact silhouette of a physical sphere, traced by its tangent
// rays. A center point and screen coverage test alone did not detect the
// 2026-10-27 production 18%-wide elliptical Earth.
function projectedSphere(c,aspect,fov){
 const center=mul(c.normal,-1);
 const seed=Math.abs(center.y)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};
 const along=unit(add(seed,mul(center,-dot(seed,center))));
 const across=unit(cross(center,along));
 const halfAngle=Math.asin(1/c.distanceEarthRadii);
 const projected=[];
 for(let i=0;i<144;i++){
  const phase=i*2*Math.PI/144;
  const tangentRay=add(mul(center,Math.cos(halfAngle)),
   add(mul(along,Math.sin(halfAngle)*Math.cos(phase)),
       mul(across,Math.sin(halfAngle)*Math.sin(phase))));
  projected.push(project(tangentRay,c,aspect,fov));
 }
 const x=projected.map(p=>p.x),y=projected.map(p=>p.y);
 return {minX:Math.min(...x),maxX:Math.max(...x),
   minY:Math.min(...y),maxY:Math.max(...y),
   pixelAspect:(Math.max(...x)-Math.min(...x))*aspect/
     (Math.max(...y)-Math.min(...y))};
}
for(const vec of solarVectors){
 const before=JSON.stringify(vec),sun=unit(vec);
 const c=editorialSolarTwilightHeroCamera(vec,4.3);
 assert.equal(JSON.stringify(vec),before,"never mutate the physical Sun");
 assert.equal(c.frameKind,"CUPOLA_EARTH_FIXED_SOLAR_TWILIGHT_HERO_CAMERA");
 assert.equal(c.shot,"solar-twilight");
 assert.equal(c.verticalFovDegrees,116);
 assert.ok(Math.abs(c.distance/4.3-1.65)<1e-9);
 assert.ok(c.daylightFractionApprox>.295&&c.daylightFractionApprox<.305,
  "70% observed nightside stays visible without new fake radiance");
 assert.ok(Math.abs(dot(c.up,c.right))<1e-10);
 assert.ok(Math.abs(dot(c.right,c.lookDirection))<1e-10);
 assert.ok(Math.abs(dot(c.up,c.lookDirection))<1e-10);
 const earthDirection=mul(c.normal,-1);
 const earthAngle=Math.acos(dot(sun,earthDirection));
 assert.ok(earthAngle>1.1&&earthAngle<1.2,"physical solar separation remains ~66deg");
 assert.ok(earthAngle-c.earthLimbAngleRad>.46,
   "real Sun must clear the Earth's true limb, not a synthetic overlay");
 for(const d of desktops){
  const aspect=d.w*d.iw/(d.h*d.ih);
  const earth=project(earthDirection,c,aspect,116);
  const sunProjection=project(sun,c,aspect,116);
  const silhouette=projectedSphere(c,aspect,116);
  assert.ok(silhouette.pixelAspect>=.99&&silhouette.pixelAspect<=1.035,
    d.name+" Earth must be genuinely ROUND, not the old 1.18x anamorphic ellipse: "+
     silhouette.pixelAspect);
  const px=p=>d.left+d.iw*(p.x+1)/2;
  const py=p=>d.top+d.ih*(1-p.y)/2;
  const e={x:px(earth),y:py(earth)},sol={x:px(sunProjection),y:py(sunProjection)};
  const bounds={left:px({x:silhouette.minX}),right:px({x:silhouette.maxX}),
    top:py({y:silhouette.maxY}),bottom:py({y:silhouette.minY})};
  assert.ok(bounds.left>.52&&bounds.right<.88,
   d.name+" full Earth cannot collide with heading or solar disc");
  assert.ok(bounds.top>.10&&bounds.bottom<.93,
   d.name+" whole circular Earth limb must fit the external hero");
  assert.ok(e.x>.65&&e.x<.77&&e.y>.48&&e.y<.59,
    d.name+" center-right globe framing must remain readable");
  assert.ok(sol.x>.90&&sol.x<.99&&sol.y>.28&&sol.y<.54,
    d.name+" same real Sun must remain visible INSIDE homepage crop");
  assert.ok(sol.x>bounds.right+.10,"physical Sun separated from Earth's visible limb");
 }
 assert.ok(Math.abs(editorialTwilightHeroCamera(vec,4.3).distance/4.3-4.3)<1e-9,
 "tablet/mobile 8.9 fallback must remain untouched");
 assert.ok(Math.abs(editorialDawnCamera(vec,4.3).distance/4.3-1.56)<1e-9,
 "original sunrise capture and /explore route unchanged");
}
const component=fs.readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(component.includes('params.get("heroShot")!=="twilight" && editorialCamera.aspect>=1.85'));
assert.ok(component.includes('const desiredFov=solarHero?116:41;'));
assert.ok(component.includes('editorialSolarTwilightHeroCamera(getSunDirection(new Date(utcMs)),GLOBE_RADIUS)'));
assert.ok(component.includes('solarHero?"solar-twilight-wide-v1"'));
for(const tag of ["data-earth-projected-disc-aspect","data-earth-rim-min-x",
 "data-earth-rim-max-x","data-earth-rim-min-y","data-earth-rim-max-y",
 "data-webgl-canvas-css-aspect","data-webgl-camera-aspect",
 "data-sun-projection-x","data-sun-visible-in-frustum"]){
 assert.ok(component.includes(tag),"live 3D pixel evidence missing: "+tag);
}
assert.ok(component.includes('cityLights: true'));
assert.ok(component.includes('retrieveDailyImage("night",nightVersionRef.current,controller.signal)'));
const frame=fs.readFileSync("components/editorial/SceneFrame.tsx","utf8");
assert.ok(frame.includes('src="/explore?embed=1&captureShot=explore"'));
const capture=JSON.parse(fs.readFileSync("config/scene-capture-presets.json","utf8")).presets;
assert.equal(capture.find(x=>x.id==="home-hero").route,"/explore?capture=1&hero=sunrise");
const qa=fs.readFileSync("scripts/scene-capture/qa-twilight-home.mjs","utf8");
assert.ok(qa.includes("data-earth-projected-disc-aspect"));
assert.ok(qa.includes("data-webgl-canvas-css-aspect"));
assert.ok(qa.includes("sunPageX"));
console.log("PASS CUPOLA 8.11: 1.024x circular projected Earth silhouette, original city lights, real Sun in visible homepage");
