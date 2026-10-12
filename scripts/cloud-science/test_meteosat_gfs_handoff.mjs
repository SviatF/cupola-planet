#!/usr/bin/env node
/** Verify a visible Meteosat/GFS seam is softened without making up L2 pixels. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class ImageData {
  constructor(bytes,w,h){this.data=bytes;this.width=w;this.height=h;}
}
const raw=fs.readFileSync("lib/earth/globalCloudModelFill.ts","utf8");
const code=ts.transpileModule(raw,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const exports={};
vm.runInNewContext(code,{
  ImageData, Uint8Array, Uint8ClampedArray, Int32Array, Math, Error, exports,
  require:(name)=> {
    if(name!=="./cloudSeamBridge")throw Error("Unexpected import");
    return {bridgeVisualCloudGap:()=>{throw Error("bridge not used in this unit test")}};
  },
});
const filter=exports.featherMeteosatGfsHandoff;
assert.equal(typeof filter,"function");
const w=112,h=48,N=w*h;
const science=new ImageData(new Uint8ClampedArray(N*4),w,h);
const observed=new ImageData(new Uint8ClampedArray(N*4),w,h);
const filled=new ImageData(new Uint8ClampedArray(N*4),w,h);
const model=new ImageData(new Uint8ClampedArray(N*4),w,h);
const off=(x,y)=>(y*w+x)*4;
const get=(img,x,y)=>img.data[off(x,y)];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=off(x,y);
  model.data[p]=255;model.data[p+1]=255;
  for(const a of [science,observed,filled])a.data[p+3]=255;
  if(x<20){
    science.data[p]=observed.data[p]=filled.data[p]=(x===6?0:155);
    science.data[p+1]=observed.data[p+1]=filled.data[p+1]=255;
    science.data[p+2]=observed.data[p+2]=filled.data[p+2]=42;
  }else if(x<72) {
    const cloud=y<24?175:0;
    observed.data[p]=filled.data[p]=cloud;
    observed.data[p+1]=filled.data[p+1]=156;
    observed.data[p+2]=filled.data[p+2]=224;
  }else {
    filled.data[p]=51;filled.data[p+1]=92;filled.data[p+2]=255;
  }
}
const immutableScience=new Uint8ClampedArray(science.data);
const immutableObserved=new Uint8ClampedArray(observed.data);
const immutableFilled=new Uint8ClampedArray(filled.data);
const revised=filter(science,observed,filled,model,32);
assert.deepEqual(science.data,immutableScience,"original scientific input modified");
assert.deepEqual(observed.data,immutableObserved,"Meteosat input modified");
assert.deepEqual(filled.data,immutableFilled,"source mosaic modified");
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=off(x,y);
  if(x<20 || x>=72)assert.deepEqual(
    Array.from(revised.data.slice(p,p+4)),
    Array.from(filled.data.slice(p,p+4)),
    "L2 incl clear OR the actual model bytes must stay intact"
  );
  for(const ch of [1,2,3])assert.equal(revised.data[p+ch],filled.data[p+ch],
    "confidence, provenance, alpha must remain intact");
  if(x>=20 && x<72)assert.ok(revised.data[p]<=filled.data[p],
    "WMS measured cloud may never be brightened by a forecast");
}
const before=Math.abs(get(filled,71,12)-get(filled,72,12));
const after=Math.abs(get(revised,71,12)-get(revised,72,12));
assert.ok(before>100,"fixture should reproduce high-contrast right border");
assert.ok(after<=2,"sharp WMS/model boundary must transition continuously");
assert.equal(get(revised,27,12),175,"WMS interior must keep original detail");
assert.equal(get(revised,71,32),0,"known-clear WMS must remain clear");
assert.equal(get(revised,6,12),0,"known-clear L2 must remain clear");
assert.ok(get(revised,59,12)<175 && get(revised,59,12)>51,
  "intermediate cloud pixels should form gradual nonbinary transition");
console.log(JSON.stringify({status:"PASS",wmsModelContrastBefore:before,
  wmsModelContrastAfter:after,immutableL2:true,classifiedClearProtected:true,
  confidenceAndProvenanceUnchanged:true}));
