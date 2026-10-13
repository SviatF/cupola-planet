#!/usr/bin/env node
/**
 * CUPOLA V3 measured SAME-OBSERVATION infrared crossover regression.
 *
 * This catches the visible Africa source stripe that all old tests missed:
 * the old one-way max() overlay could never reduce native Level-2 when
 * real NOAA IR on the adjacent side was darker. The science atlas is NEVER
 * modified. Only the display-only crossover texture is populated.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require(process.env.CUPOLA_TEST_TS_PATH || "typescript");
class ImageData {
  constructor(data,width,height){this.data=data;this.width=width;this.height=height;}
}
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync("lib/earth/cloudLimbOverlay.ts","utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
).outputText,{module,exports:module.exports,ImageData,Uint8Array,
  Uint8ClampedArray,Int32Array,Math,Number,Error});
const build=module.exports.buildSatelliteLimbOverlay;
assert.equal(typeof build,"function");
const w=400,h=68,n=w*h;
const make=()=>new ImageData(new Uint8ClampedArray(n*4),w,h);
const at=(x,y)=>(y*w+x)*4;
const science=make(),composite=make(),infrared=make();
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const o=at(x,y);
  const native=(x>=100&&x<300)||(x<15);
  const originalIr=Math.round(24+0.4*x + 2*Math.sin(y/7));
  infrared.data[o]=originalIr;
  infrared.data[o+1]=135;infrared.data[o+2]=232;infrared.data[o+3]=255;
  if(native){
    science.data[o]=(y<10?0:y<34?210:12);
    science.data[o+1]=255;science.data[o+2]=42;science.data[o+3]=255;
    composite.data.set(science.data.slice(o,o+4),o);
  } else {
    composite.data[o]=Math.round(originalIr*0.93);
    composite.data[o+1]=135;composite.data[o+2]=232;composite.data[o+3]=255;
  }
}
const immutableL2=new Uint8ClampedArray(science.data);
const immutableComposite=new Uint8ClampedArray(composite.data);
const result=build(science,composite,infrared,64);
const dst=result.image.data;
assert.deepEqual(science.data,immutableL2,"verified L2 RGBA byte-perfect");
assert.deepEqual(composite.data,immutableComposite,"provenance atlas byte-perfect");
assert.ok(result.stats.borderSeeds>0);
assert.ok(result.stats.nativeSidePixels>0&&result.stats.supplementalSidePixels>0);
assert.ok(result.stats.farSideIrPixels>0);
assert.ok(result.stats.maxObservedDistance>=55);
assert.equal(result.stats.originalLevel2Immutable,true);
assert.equal(result.stats.sameCoordinateIrBothSides,true);
assert.equal(result.stats.radiusPixels,64);
for(const y of [3,20,49,66]){
  for(const [a,b] of [[99,100],[299,300],[399,0]]){
    assert.equal(dst[at(a,y)+1],255,"boundary full-cover first source");
    assert.equal(dst[at(b,y)+1],255,"boundary full-cover second source");
    assert.equal(dst[at(a,y)],infrared.data[at(a,y)],
      "A: exact per-coordinate NOAA IR, not neighboring fake pixels");
    assert.equal(dst[at(b,y)],infrared.data[at(b,y)],
      "B: same NOAA product both sides; no seam from L2 class");
  }
  assert.equal(dst[at(200,y)+1],0,"full native interior protected visually");
  assert.equal(dst[at(100,y)+2],232,"overlay cannot claim Level-2 provenance");
  assert.ok(dst[at(120,y)+1]>0&&dst[at(120,y)+1]<255,
    "smooth finite 64px crossover, not binary mask");
}
assert.ok(infrared.data[at(100,20)]<science.data[at(100,20)],
  "must explicitly test DOWNWARD replacement, forbidden by old max()");
assert.ok(infrared.data[at(100,49)]>science.data[at(100,49)],
  "must explicitly test UPWARD replacement too");
// NOAA R=0 is a measured dark satellite cell, not invalid DQF: G still
// contains crossover weight so the shader can actually darken bright L2.
infrared.data[at(100,20)]=0;
const zero=build(science,composite,infrared,64);
assert.equal(zero.image.data[at(100,20)],0);
assert.equal(zero.image.data[at(100,20)+1],255);
// Never fabricate pixels from model-only, missing or invalid NOAA masks.
const modelOnly=make();
modelOnly.data.set(composite.data);
for(let p=0;p<n;p++){
  const o=p*4;
  if(!science.data[o+1]){
    modelOnly.data[o+1]=72;modelOnly.data[o+2]=255;
  }
}
const blocked=build(science,modelOnly,infrared,64);
assert.equal(blocked.stats.borderSeeds,0);
assert.equal(blocked.stats.observedIrLimbPixels,0);
const invalid=make();invalid.data.set(infrared.data);
for(let p=0;p<n;p++)invalid.data[p*4+2]=255;
const bad=build(science,composite,invalid,64);
assert.equal(bad.stats.borderSeeds,0);
assert.equal(bad.stats.observedIrLimbPixels,0);
const shader=fs.readFileSync("lib/earth/liveCloudShader.ts","utf8");
assert.ok(shader.includes("visible = mix(visible, satelliteIr, clamp(limb.g"),
  "cloud shader must allow both brighter AND darker real IR");
assert.ok(shader.includes("c = mix(c, satelliteIr, clamp(limb.g"),
  "ground-shadow shader must match the cloud transition");
assert.ok(!shader.includes("visible = max(visible, mix(visible, limb.r"),
  "old positive-only shader must not silently return");
console.log(JSON.stringify({status:"PASS",algorithm:"bilateral-noaa-ir-continuity-v2",
  ...result.stats,L2Immutable:true,sourceMasksImmutable:true,
  zeroMeasuredIrCanDarken:true,matchingSourceOnBothSides:true,
  avoidsModelAndInvalidIR:true,mainAndShadowShaderConsistent:true}));
