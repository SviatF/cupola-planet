#!/usr/bin/env node
/** Synthetic immutable-L2 regression for NOAA GMGSI satellite IR display. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class ImageData {
  constructor(data,w,h){this.data=data;this.width=w;this.height=h;}
}
const mod={exports:{}};
const js=ts.transpileModule(
  fs.readFileSync("lib/earth/gmgsiVisualGap.ts","utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
).outputText;
vm.runInNewContext(js,{ImageData,Uint8ClampedArray,module:mod,exports:mod.exports,Error,Math});
const merge=mod.exports.overlayGmgsiVisualGap;
assert.equal(typeof merge,"function");

const w=2048,h=1024,N=w*h;
const science=new ImageData(new Uint8ClampedArray(N*4),w,h);
const observed=new ImageData(new Uint8ClampedArray(N*4),w,h);
const gmgsi=new ImageData(new Uint8ClampedArray(N*4),w,h);
const at=(x,y)=>(y*w+x)*4;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=at(x,y);
  science.data[p+3]=observed.data[p+3]=255;
  if(x<768){
    // native classified clear MUST remain identically zero-cloud.
    const value=x===100?0:190;
    science.data[p]=observed.data[p]=value;
    science.data[p+1]=observed.data[p+1]=255;
    science.data[p+2]=observed.data[p+2]=32;
  }else if(x<1600){
    observed.data[p]=155;
    observed.data[p+1]=116;
    observed.data[p+2]=224;
  }
  if(x>=768 && x<1900 && y>=40 && y<h-40){
    gmgsi.data[p]=x%13===0?0:122;
    gmgsi.data[p+1]=135;gmgsi.data[p+2]=232;gmgsi.data[p+3]=255;
  }
}
const originalScience=new Uint8ClampedArray(science.data);
const originalObserved=new Uint8ClampedArray(observed.data);
const originalIr=new Uint8ClampedArray(gmgsi.data);
const result=merge(science,observed,gmgsi);
assert.deepEqual(science.data,originalScience,"scientific input must be byte-identical");
assert.deepEqual(observed.data,originalObserved,"Meteosat input must not be modified");
assert.deepEqual(gmgsi.data,originalIr,"raw satellite IR input must not be modified");
const rgba=(d,x,y)=>Array.from(d.slice(at(x,y),at(x,y)+4));
assert.deepEqual(rgba(result.image.data,100,200),rgba(science.data,100,200),
  "classified L2 clear stays clear; no low-trust source overwrites L2");
assert.deepEqual(rgba(result.image.data,767,200),rgba(science.data,767,200),
  "last L2 edge pixel must be untouched");
assert.deepEqual(rgba(result.image.data,769,200),[122,135,232,255],
  "real GMGSI replaces WMS only outside classified L2");
assert.deepEqual(rgba(result.image.data,1980,200),[0,0,0,255],
  "invalid IR outside original inputs stays no-data");
assert.deepEqual(rgba(result.image.data,1500,10),[155,116,224,255],
  "WMS is retained where NOAA GMGSI is invalid");
assert.ok(result.visualCoverageFraction>0.45);
assert.ok(result.displacedWmsFraction>0.25);
assert.ok(result.newCoverageFraction>0.1);
assert.ok(result.totalDataFootprintFraction<1);
console.log(JSON.stringify({status:"PASS",test:"GMGSI satellite visual-only priority",
  visualFraction:result.visualCoverageFraction,newFraction:result.newCoverageFraction,
  displacedWmsFraction:result.displacedWmsFraction,
  footprint:result.totalDataFootprintFraction,
  immutableL2:true,noFabricatedClouds:true,sourceProvenance:true}));

/* Scene-matched radiometry needs REAL overlapping Level-2 and NOAA IR.
   The synthetic first fixture deliberately has NO overlap and must remain
   byte-identical to old GMGSI. This second fixture checks actual overlap. */
for(let y=40;y<h-40;y++)for(let x=512;x<768;x++){
  const p=at(x,y);
  gmgsi.data[p]=80;
  gmgsi.data[p+1]=135;
  gmgsi.data[p+2]=232;
  gmgsi.data[p+3]=255;
}
const matched=merge(science,observed,gmgsi);
assert.ok(matched.image.data[at(769,200)]>122,
  "overlapping true L2 should brighten lower-density GMGSI just outside science");
assert.equal(matched.image.data[at(100,200)],0,
  "L2 known-clear must stay clear with IR brightness calibration");
assert.equal(matched.image.data[at(769,200)+2],232,
  "radiometry correction never changes source provenance");
console.log(JSON.stringify({status:"PASS",test:"real L2-only overlap IR tonal calibration",
  originalIR:122,calibratedIR:matched.image.data[at(769,200)],
  nativeLevel2StillProtected:true}));
