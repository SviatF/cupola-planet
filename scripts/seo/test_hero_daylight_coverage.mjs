#!/usr/bin/env node
import assert from "node:assert/strict";
import {editorialDawnCamera} from "../../lib/earth/editorialDawnCamera.mjs";
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const scale=(a,k)=>({x:a.x*k,y:a.y*k,z:a.z*k});
const unit=a=>scale(a,1/Math.hypot(a.x,a.y,a.z));
// Ray cast through the REAL desktop iframe's final CSS crop. Unlike the
// globe-global 'daylightFractionApprox', this counts actually visible
// daylit Earth pixels in the portion of the homepage right of the copy.
const sun=unit({x:.9,y:.41,z:-.15});
const aspect=(1600*1.06)/(468*1.45);
const halfTan=Math.tan(41*Math.PI/360);
function sample(shot){
 const frame=editorialDawnCamera(sun,1,shot),eye=scale(frame.normal,frame.distance);
 let earth=0,lit=0,total=0;
 for(let yi=0;yi<110;yi++)for(let xi=0;xi<270;xi++){
  const x=(xi+.5)/270,y=(yi+.5)/110;
  if(x<.30)continue;
  total++;
  const u=(x-.21)/1.06,v=(y+.22)/1.45;
  const dir=unit(add(add(frame.lookDirection,
    scale(frame.right,(2*u-1)*halfTan*aspect)),
    scale(frame.up,(1-2*v)*halfTan)));
  const b=dot(eye,dir),disc=b*b-(frame.distance*frame.distance-1);
  if(disc<0)continue;
  const t=-b-Math.sqrt(disc);
  if(t<=0)continue;
  const surface=add(eye,scale(dir,t));
  earth++;
  if(dot(surface,sun)>.05)lit++;
 }
 return {earthCoverage:earth/total,daylightOnEarth:lit/Math.max(earth,1)};
}
const old=sample("classic"),updated=sample("daylit");
assert.ok(updated.earthCoverage>.40,"must retain large globe in right-hand hero");
assert.ok(updated.daylightOnEarth>.30,"right-hand hero must contain physically lit clouds");
assert.ok(updated.daylightOnEarth>old.daylightOnEarth+.25,
 "camera must deliver actual sunlight in visible image, not a shader placebo");
console.log("PASS CUPOLA 8.0 — projected daylit cloud visibility",JSON.stringify({old,updated}));
