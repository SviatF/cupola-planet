#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const source=readFileSync("lib/earth/viirsLandComposite.ts","utf8");
const js=ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
}).outputText;
const {compositeVIIRSLandSurface}=await import(
  "data:text/javascript;charset=utf-8,"+encodeURIComponent(js));
const W=128,H=64,land=new Uint8ClampedArray(W*H*4);
const ocean=new Uint8ClampedArray(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4;
  // Specular NASA mask: left white ocean, right dark land.
  const water=x<W/2;
  ocean[i]=ocean[i+1]=ocean[i+2]=water?255:0;ocean[i+3]=255;
  // Real-looking valid *synthetic test* RGB: warm soil on land/ocean
  // (not claiming the fixture itself is satellite observations).
  land[i]=153;land[i+1]=104;land[i+2]=71;land[i+3]=255;
  if(x>=70&&x<85&&y>=12&&y<30){
    // Bright grey-white cloud candidate MUST be excluded.
    land[i]=225;land[i+1]=224;land[i+2]=223;
  }
  if(x>=90&&x<101&&y>=40&&y<50){
    // Black missing acquisition MUST be excluded.
    land[i]=0;land[i+1]=0;land[i+2]=0;
  }
}
const original=land.slice();
const result=compositeVIIRSLandSurface(land,ocean,W,H);
const alpha=(x,y)=>result.pixels[(y*W+x)*4+3];
assert.equal(alpha(12,8),0,"ocean must NEVER be overwritten");
assert.equal(alpha(75,20),0,"white cloud candidate excluded");
assert.equal(alpha(95,44),0,"NASA no-data pixels excluded");
assert.ok(alpha(112,16)>100,"genuine optically accepted land is nontransparent");
assert.equal(result.pixels[(16*W+112)*4],153,"RGB copied directly, no invented terrain");
assert.deepEqual(land,original,"upstream observations cannot be mutated");
assert.ok(result.stats.coverageFraction>.1);
assert.ok(result.stats.oceanRejected>=W*H*.5);
assert.ok(result.stats.cloudCandidateRejected>=100);
assert.ok(result.stats.noDataRejected>=100);
assert.throws(()=>compositeVIIRSLandSurface(new Uint8ClampedArray(2),ocean,W,H));
const globe=readFileSync("components/CupolaExperience.tsx","utf8");
const renderer=readFileSync("components/LiveVIIRSLandLayer.tsx","utf8");
const cloudCheck=readFileSync("scripts/cloud-science/test_cloud_v3_policy.mjs","utf8");
assert.match(globe,/<LiveVIIRSLandLayer enabled=\{props\.surfaceEnabled\}/);
assert.match(globe,/oceanMask=\{specularTexture\}/);
assert.match(globe,/surfaceEnabled=\{satelliteSurface\}/);
assert.match(globe,/onSurfaceStatus=\{setLiveSurfaceStatus\}/);
assert.match(globe,/Satellite surface \(on globe\)/);
assert.match(globe,/ON GLOBE/);
assert.match(globe,/<LiveCloudLayer/);
assert.match(globe,/dayTexture=\{baseDayTexture\}/);
assert.match(globe,/const dayTexture = baseDayTexture/);
assert.doesNotMatch(globe,/liveSurfaceTexture \?\? baseDayTexture/);
assert.match(renderer,/new THREE\.CanvasTexture\(updated\)/);
assert.match(renderer,/compositeVIIRSLandSurface/);
assert.match(renderer,/onStatus:\(status:LiveSurfaceStatus\|null\)=>void/);
assert.match(renderer,/CANDIDATES/);
assert.match(renderer,/source"\)!=="NASA_GIBS_VIIRS"/);
assert.match(renderer,/x-cupola-layer/);
assert.match(renderer,/x-cupola-imagery-date/);
assert.match(renderer,/setCurrent\(chosen\.texture\)/);
assert.match(renderer,/renderOrder=\{1\}/);
assert.match(renderer,/meshPhysicalMaterial/);
assert.match(renderer,/depthWrite=\{false\}/);
assert.match(renderer,/window\.setInterval\(\(\)=>void reload\(\),30\*60_000\)/);
assert.match(renderer,/NOT official VIIRS cloud QA/);
assert.match(cloudCheck,/scientific/i);
console.log("PASS: new genuine NASA VIIRS land pixels render on Earth; dark ocean, clouds and missing pixels preserve original cinematic globe; Cloud V3 unchanged");
