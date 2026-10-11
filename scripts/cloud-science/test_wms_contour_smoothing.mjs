#!/usr/bin/env node
/** Pure synthetic QA for WMS-only contour smoothing (never native satellite pixels). */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class ImageData {
  constructor(bytes, width, height) {
    this.data = bytes;
    this.width = width;
    this.height = height;
  }
}
const content = fs.readFileSync("lib/earth/supplementalCloudDetail.ts","utf8");
const js = ts.transpileModule(content,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const mod={exports:{}};
vm.runInNewContext(js,{ImageData,Uint8Array,Uint8ClampedArray,module:mod,exports:mod.exports,Math,Error});
const soften = mod.exports.softenSupplementalCloudContours;
assert.equal(typeof soften, "function");
const w=32,h=16;
const science=new ImageData(new Uint8ClampedArray(w*h*4),w,h);
const supplement=new ImageData(new Uint8ClampedArray(w*h*4),w,h);
const get=(x,y)=> (y*w+x)*4;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const o=get(x,y);
  science.data[o+3]=supplement.data[o+3]=255;
  if(x<16){
    science.data[o]=supplement.data[o]=(x===10 ? 0 : 170);
    science.data[o+1]=supplement.data[o+1]=255;
  }else if(x<31){
    const source=x===30 ? 248 : 224;
    supplement.data[o] = (x>=23 && x<=28 && y>=3 && y<=12) ? 220 : 0;
    supplement.data[o+1]=104; supplement.data[o+2]=source;
  }
}
const savedBase=new Uint8ClampedArray(science.data);
const savedIncoming=new Uint8ClampedArray(supplement.data);
const res=soften(science,supplement);
assert.deepEqual(science.data,savedBase,"scientific source must remain intact");
assert.deepEqual(supplement.data,savedIncoming,"supplemental input must remain intact");
for(let p=0;p<w*h;p++){
  const o=p*4,x=p%w;
  if(x<16)assert.deepEqual(
    Array.from(res.data.slice(o,o+4)),
    Array.from(savedBase.slice(o,o+4)),
    "L2 including classified clear must remain byte-identical"
  );
  for(let channel=1;channel<4;channel++)assert.equal(
    res.data[o+channel],savedIncoming[o+channel],
    "cloud contour filtering may change ONLY channel R"
  );
}
assert.equal(res.data[get(31,8)],0,"never fill a no-data pixel");
assert.equal(res.data[get(23,8)]<220,true,"cloud block edge must soften");
assert.equal(res.data[get(28,8)]<220,true,"opposite edge must soften");
assert.equal(res.data[get(26,8)],220,"interior measured WMS texture remains stable");
assert.equal(res.data[get(30,8)],0,"independent Meteosat source cannot mix across boundary");
assert.equal(res.data[get(10,8)],0,"classified clear L2 remains clear");
console.log("PASS WMS-ONLY CLOUD CONTOURS: L2 byte-identical, no-data intact, no cross-source bleed, only supplemental R adjusted");
