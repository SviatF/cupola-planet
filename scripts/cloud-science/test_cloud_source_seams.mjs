#!/usr/bin/env node
/** Regression: V3 visually harmonizes ACTUAL cloud-vs-clear boundaries. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
class ImageData{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}}
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync("lib/earth/cloudSourceSeamHarmonizer.ts","utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
).outputText,{module:mod,exports:mod.exports,ImageData,Uint8Array,
  Uint8ClampedArray,Int32Array,Float32Array,Math,Error});
const harmonize=mod.exports.harmonizeV3CloudEdges;
assert.equal(typeof harmonize,"function");
const w=192,h=64,n=w*h,input=new ImageData(new Uint8ClampedArray(n*4),w,h);
const at=(x,y)=>(y*w+x)*4;
const r=(bytes,x,y)=>bytes[at(x,y)];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const o=at(x,y);
  input.data[o+3]=255;
  if(x<48){
    input.data[o]=x===9?0:170;
    input.data[o+1]=255;input.data[o+2]=42;
  }else if(x<112){
    input.data[o]=160;input.data[o+1]=135;input.data[o+2]=232;
  }else if(x<176){
    input.data[o]=y<32?45:0;input.data[o+1]=92;input.data[o+2]=255;
  }else{
    input.data[o]=110;input.data[o+1]=156;input.data[o+2]=224;
  }
}
input.data[at(169,5)]=0;
input.data[at(169,5)+1]=0;
input.data[at(169,5)+2]=0;
const before=new Uint8ClampedArray(input.data);
const result=harmonize(input,28),out=result.image.data;
assert.deepEqual(input.data,before,"never mutate input atlas");
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const o=at(x,y);
  for(const channel of [1,2,3])
    assert.equal(out[o+channel],before[o+channel],
      "scientific confidence, source identity and alpha MUST remain exact");
  if(x<48)assert.deepEqual(
    Array.from(out.slice(o,o+4)),Array.from(before.slice(o,o+4)),
    "ALL Level-2 pixels incl classified clear unchanged");
  if(before[o+1]===0)assert.equal(out[o],before[o],
    "never paint missing footprint or no-data");
}
assert.ok(result.stats.longitudePairs>0,"wrap longitude edge must be tested");
assert.ok(result.stats.boundaryPairs>0);
assert.ok(result.stats.crossSourceClearEdges>0,
  "must process cloud-to-model-clear edge, previously skipped!");
assert.ok(result.stats.interpolatedModelClearPixels>0);
assert.equal(r(out,9,12),0,"classified-clear science preserved");
assert.equal(r(out,140,46),0,"far-field forecast clear remains intact");
assert.equal(r(out,112,46)>0,true,
  "ONLY immediate forecast-side clear can receive explicitly display-only continuation");
assert.ok(Math.abs(r(out,112,46)-r(out,111,46))<Math.abs(r(before,112,46)-r(before,111,46))-50,
  "the actual cloud-to-dark-model-cut must shrink significantly");
assert.equal(r(out,90,46),160,"GMGSI interior unchanged");
assert.equal(r(out,169,5),0,"invalid footprint remains no-data");
assert.ok(Math.abs(r(out,191,12)-r(out,0,12))<
          Math.abs(r(before,191,12)-r(before,0,12))-20,
  "the wrap seam is smoothed without altering Level-2");
console.log(JSON.stringify({status:"PASS",...result.stats,
  immutableL2:true,invalidFootprintsProtected:true,
  immutableProvenance:true,cloudToModelClearSeamReduced:true,
  modeledClearIsVisualInterpolationNotSatelliteObservation:true}));

/* The screenshot regression is NOT a 1px discontinuity: a genuine L2
   cloud borders a wide dark IR proxy. Make sure adaptive preview extends
   native cloud continuity beyond the previous 28px limit, WITHOUT painting
   or reclassifying original L2 or far-field forecast cells. */
const darkWide=new ImageData(new Uint8ClampedArray(input.data),w,h);
for(let y=10;y<20;y++)for(let x=48;x<110;x++)
  darkWide.data[at(x,y)]=0;
const v1=harmonize(darkWide,28);
const v2=harmonize(darkWide,84);
assert.equal(r(v1.image.data,100,14),0,
  "the original 28px fade cannot reach the wide dark strip");
assert.ok(r(v2.image.data,100,14)>0,
  "extended satellite-to-dark visual transition must reach deep inside strip");
assert.equal(r(v2.image.data,0,14),r(darkWide.data,0,14),
  "native L2 untouched even with wider matching");
assert.equal(r(v2.image.data,140,46),0,
  "forecast-clear far field still unchanged");
console.log(JSON.stringify({status:"PASS",test:"pole-to-pole dark gap wider than old feather",
  old28:r(v1.image.data,100,14),new84:r(v2.image.data,100,14),
  provenanceProtected:true,originalScienceProtected:true}));

/* Opposite direction: L2 classified-clear + brighter infrared used to
   generate a visibly artificial 28px black curtain inside the IR scene.
   Keep this black transition narrow (12px) and native classified-clear
   science entirely untouched. */
const clearL2=new ImageData(new Uint8ClampedArray(input.data),w,h);
for(let y=35;y<46;y++)for(let x=0;x<48;x++)
  clearL2.data[at(x,y)]=0;
const darkSide=harmonize(clearL2,84);
assert.equal(r(darkSide.image.data,47,40),0,
  "native L2 clear must remain classified clear");
assert.equal(r(darkSide.image.data,80,40),160,
  "bright IR interior must not be darkened by a wide L2-clear border");
assert.equal(r(darkSide.image.data,65,40),160,
  "negative edge matching ends within 12px and cannot form a 28px curtain");
console.log("PASS: dark-side source edge limited, broad artificial pole-to-pole black band prevented");
