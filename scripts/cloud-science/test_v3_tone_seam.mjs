#!/usr/bin/env node
/** Real 4-channel atlas regression for the one-sided V3 radiometric handoff. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require(process.env.CUPOLA_TEST_TS_PATH || "typescript");
class ImageData {
  constructor(data,width,height){this.data=data;this.width=width;this.height=height;}
}
const mod={exports:{}};
const source=fs.readFileSync("lib/earth/cloudSourceSeamHarmonizer.ts","utf8");
vm.runInNewContext(ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:mod,exports:mod.exports,ImageData,Math,Error,
  Uint8Array,Uint8ClampedArray,Float32Array,Int32Array});
const match=mod.exports.toneMatchV3SupplementalSeams;
assert.equal(typeof match,"function","V3 tone seam function missing");
const w=320,h=96,N=w*h,at=(x,y)=>(y*w+x)*4;
const image=new ImageData(new Uint8ClampedArray(N*4),w,h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const o=at(x,y);
  if(x<90){
    image.data[o]=y>=36&&y<60?42:180;
    if(y<13)image.data[o]=0; // native classified CLEAR
    image.data[o+1]=255;image.data[o+2]=42;
  } else if(x<220){
    image.data[o]=y>=36&&y<60?195:100;
    if(y>=70)image.data[o]=0; // real zero IR density
    image.data[o+1]=135;image.data[o+2]=232;
  } else {
    image.data[o]=60;image.data[o+1]=92;image.data[o+2]=255;
  }
  image.data[o+3]=255;
}
const original=new Uint8ClampedArray(image.data);
const {image:matched,stats}=match(image,56);
assert.deepEqual(image.data,original,"must not mutate observed source atlas");
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const o=at(x,y);
  for(const channel of [1,2,3])
    assert.equal(matched.data[o+channel],original[o+channel],
      "source/confidence/alpha MUST remain byte-identical");
  if(x<90)assert.equal(matched.data[o],original[o],
    "all native L2 pixels incl classified CLEAR MUST remain immutable");
  if(original[o]===0)assert.equal(matched.data[o],0,
    "zero cloud density cannot become fabricated haze");
  if(x>=165)assert.equal(matched.data[o],original[o],
    "the seam correction MUST NOT travel across a full satellite sector");
  assert.ok(Math.abs(matched.data[o]-original[o])<=32,
    "strict bounded local contrast adaptation only");
}
assert.ok(matched.data[at(90,20)]>original[at(90,20)],
  "the underexposed IR next to real cloudy L2 must improve");
assert.ok(matched.data[at(90,42)]<original[at(90,42)],
  "overexposed IR next to real darker L2 must receive a bounded reduction");
assert.equal(matched.data[at(90,8)],original[at(90,8)],
  "known-clear L2 cannot cause an artificial dark band in the IR");
assert.ok(stats.pairedEdges>20&&stats.affectedPixels>100,
  "real paired cloud edges and a non-trivial bounded correction are required");
assert.ok(stats.brightenedPixels>0&&stats.darkenedPixels>0);
assert.equal(stats.originalLevel2Immutable,true);
assert.equal(stats.zeroCloudPixelsPreserved,true);
assert.ok(stats.maxAbsoluteChange<=32);
console.log(JSON.stringify({status:"PASS",source:"V3 bounded local photometric seam",
  ...stats,scienceRgbaByteExact:true,sourceTagsByteExact:true,
  noZeroToCloudFill:true,correctedBothTonalDirections:true}));
