#!/usr/bin/env node
/** Periodic, strictly source-aware final RGB seam display regression. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class ImageData {
  constructor(data,width,height){this.data=data;this.width=width;this.height=height;}
}
const mod={exports:{}};
const script=ts.transpileModule(
  fs.readFileSync("lib/earth/cloudSourceSeamHarmonizer.ts","utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
).outputText;
vm.runInNewContext(script,{module:mod,exports:mod.exports,ImageData,
  Uint8Array,Uint8ClampedArray,Int32Array,Float32Array,Math,Error});
const harmonize=mod.exports.harmonizeV3CloudEdges;
assert.equal(typeof harmonize,"function");

const w=128,h=64,n=w*h;
const input=new ImageData(new Uint8ClampedArray(n*4),w,h);
const at=(x,y)=>(y*w+x)*4;
const r=(bytes,x,y)=>bytes[at(x,y)];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const o=at(x,y);
  input.data[o+3]=255;
  if(x<32){
    input.data[o]=(x===10?0:170);
    input.data[o+1]=255; input.data[o+2]=42; // QA-verified L2
  }else if(x<64){
    input.data[o]=160;input.data[o+1]=135;input.data[o+2]=232; // NOAA GMGSI IR
  }else if(x<96){
    input.data[o]=y<32?45:0;input.data[o+1]=92;input.data[o+2]=255; // GFS
  }else {
    input.data[o]=110;input.data[o+1]=156;input.data[o+2]=224; // Meteosat
  }
}
// Real no-data island: never borrow clouds from neighbouring source.
input.data[at(109,5)]=0;
input.data[at(109,5)+1]=0;
input.data[at(109,5)+2]=0;
const before=new Uint8ClampedArray(input.data);
const result=harmonize(input,18);
const output=result.image.data;
assert.deepEqual(input.data,before,"incoming scene must not mutate");
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const o=at(x,y);
  for(const channel of [1,2,3])
    assert.equal(output[o+channel],before[o+channel],
      "QA, source provenance and alpha must ALWAYS remain identical");
  if(x<32)
    assert.deepEqual(Array.from(output.slice(o,o+4)),Array.from(before.slice(o,o+4)),
      "ALL native L2 including R=0 classified clear must remain byte-perfect");
  if(before[o+1]===0)assert.equal(output[o],before[o],
      "No-data MUST NOT acquire a cloud");
  if(before[o]===0)assert.equal(output[o],0,
      "Original clear sky MUST NOT acquire a fabricated cloud");
}
assert.ok(result.stats.boundaryPairs>0);
assert.ok(result.stats.longitudePairs>0,
  "periodic +/-180 longitude boundary must be recognized");
assert.ok(result.stats.taperedIrPixels>0,
  "GMGSI->clear GFS transition must taper the IR side");
assert.ok(result.stats.softenedPixels>0);
const oldLon=Math.abs(r(before,127,12)-r(before,0,12));
const newLon=Math.abs(r(output,127,12)-r(output,0,12));
assert.ok(newLon<oldLon-20,
  "periodic seam across antimeridian must improve, not create a copied strip");
assert.ok(r(output,64,12)>r(before,64,12),
  "positive forecast cloud may be harmonized on GFS-only side");
assert.equal(r(output,64,46),0,
  "model-clear sky must stay clear even adjacent to a bright IR cloud");
assert.equal(r(output,63,46),0,
  "visual-only GMGSI pixel tapers smoothly to known model-clear boundary");
assert.equal(r(output,50,12),160,
  "GMGSI center more than 18px from native L2 and model-clear boundaries must be untouched");
assert.equal(r(output,120,12)>110,true,
  "WMS fallback may be adjusted against higher-priority L2 at wrap boundary");
assert.equal(r(output,109,5),0,
  "invalid pixel remains invalid, no empty-column fabrication");
console.log(JSON.stringify({status:"PASS",
  ...result.stats,
  periodicSeamBefore:oldLon,periodicSeamAfter:newLon,
  protectedL2:true,protectedClear:true,protectedSourceChannels:true,
  noSyntheticFootprint:true,forecastClearProtected:true}));
