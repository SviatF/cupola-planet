#!/usr/bin/env node
/**
 * CUPOLA 4.4 Moon Earthshine verification:
 * Earth phase ↔ terrestrial Moon phase are opposite; dark lunar side receives
 * faint real-scale, Earth-reflected light, never an arbitrary emissive boost.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const load=async p=>{
  const js=ts.transpileModule(readFileSync(p,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
  }).outputText;
  return await import("data:text/javascript,"+encodeURIComponent(js));
};
const E=await load("lib/earth/earthshine.ts");
const C=await load("lib/earth/celestialEngine.ts");
const sun={x:149600000,y:0,z:0},moon={x:384400,y:0,z:0};
const newMoonEarthshine=E.earthshineSolarIrradianceRatioAtMoon(sun,moon);
const fullMoonEarthshine=E.earthshineSolarIrradianceRatioAtMoon(sun,{x:-384400,y:0,z:0});
assert.ok(newMoonEarthshine>0.00005&&newMoonEarthshine<0.00006,
  "Lambert reflected light at the full Earth should remain 10^-5 scale");
assert.ok(fullMoonEarthshine<1e-18,"Dark-Earth numerical residual must be negligible");
assert.equal(E.earthshineSolarIrradianceRatioAtMoon(sun,moon,0),0);
const far=E.earthshineSolarIrradianceRatioAtMoon(sun,{x:408000,y:0,z:0});
assert.ok(far<newMoonEarthshine&&Math.abs(
  far/newMoonEarthshine-(384400/408000)**2
)<1e-12,"Earthshine follows inverse-square Earth–Moon distance");
let prev=Infinity;
for(let degrees=0;degrees<=180;degrees+=5){
  const rad=degrees*Math.PI/180;
  const m={x:384400*Math.cos(rad),y:384400*Math.sin(rad),z:0};
  const ratio=E.earthshineSolarIrradianceRatioAtMoon(sun,m);
  assert.ok(ratio<=prev+1e-15,"Lambert Earth phase should dim continuously");
  prev=ratio;
}
const dates=[
 "2024-03-25T07:00:00Z", // near full Moon
 "2024-04-08T18:17:00Z", // solar eclipse / new Moon
 "2026-10-21T12:00:00Z",
 "2027-01-15T00:00:00Z"
];
const ratios=dates.map(iso=>{
  const c=C.celestialAt(new Date(iso));
  const ratio=E.earthshineSolarIrradianceRatioAtMoon(
    c.sun.earthFixedKm,c.moon.earthFixedKm);
  assert.ok(ratio>=0&&ratio<0.00007);
  return ratio;
});
assert.ok(ratios[1]>ratios[0]*1e3,
  "New Moon must receive much more earthshine than full Moon");
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
const shader=readFileSync("lib/earth/moonEclipseShader.ts","utf8");
assert.match(scene,/earthshineSolarIrradianceRatioAtMoon\(\s*celestialShadow\.sun\.earthFixedKm,celestialShadow\.moon\.earthFixedKm/);
assert.match(scene,/uEarthshineMoonCenterWorld\.value\.copy\(physicalMoon\)/);
assert.match(scene,/MOON_EARTHSHINE_OUTGOING_LIGHT\+"\\n#include <opaque_fragment>"/);
assert.match(shader,/outgoingLight \+= diffuseColor\.rgb/);
assert.match(shader,/max\(0\.0,dot\(lunarSurfaceNormal,directionToEarth\)\)/);
assert.match(shader,/uEclipseApparentOffset/);
assert.doesNotMatch(scene, /earthshineSolarIrradianceRatioAtMoon[^;]*sunLight\.current/s,
  "Earthshine must never modify sunlight's Earth/clouds global source");
console.log("CUPOLA 4.4 EARTHSHINE PASS",JSON.stringify({
  physicalFullEarthIrradianceRatio:newMoonEarthshine,
  physicalDarkEarthIrradianceRatio:fullMoonEarthshine,
  referenceDates:dates.map((utc,i)=>({utc,ratio:ratios[i]})),
  source:"Geometric Lambertian Earth phase, assumed 0.30 global albedo",
  caveat:"Not cloud-measured Earth albedo or atmosphere photometry"
}));
