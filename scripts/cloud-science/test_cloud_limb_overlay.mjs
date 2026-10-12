#!/usr/bin/env node
/** Real-satellite-only V3 limb visualization. Science/provenance stays exact. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
class ImageData {
  constructor(data,width,height){this.data=data;this.width=width;this.height=height;}
}
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync("lib/earth/cloudLimbOverlay.ts","utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
).outputText,{module,exports:module.exports,ImageData,Uint8Array,
  Uint8ClampedArray,Int32Array,Math,Error});
const build=module.exports.buildSatelliteLimbOverlay;
assert.equal(typeof build,"function");
const w=160,h=60,n=w*h;
const make=()=>new ImageData(new Uint8ClampedArray(n*4),w,h);
const science=make(),composite=make(),infrared=make();
const at=(x,y)=>(y*w+x)*4;
for(let y=0;y<h;y++) for(let x=0;x<w;x++){
  const o=at(x,y);
  // A low-confidence classified-clear Level-2 disk appears both to the
  // RIGHT of the main satellite seam and across the periodic world edge.
  const native=(x>=64&&x<128)||(x<12);
  const conf=x<12 ? Math.min(255,26+15*x)
    : x>=64&&x<128 ? Math.min(255,26+15*(x-64)) : 0;
  if(native){
    science.data[o]= x===90?155:0; // strong native cloud must never be dimmed
    science.data[o+1]=conf;
    science.data[o+2]=42;
    composite.data.set(science.data.slice(o,o+4),o);
  } else {
    composite.data[o]=145;
    composite.data[o+1]=135;
    composite.data[o+2]=232;
  }
  infrared.data[o]=145;
  infrared.data[o+1]=135;
  infrared.data[o+2]=232;
  infrared.data[o+3]=science.data[o+3]=composite.data[o+3]=255;
}
const unchangedScience=new Uint8ClampedArray(science.data);
const unchangedComposite=new Uint8ClampedArray(composite.data);
const result=build(science,composite,infrared,16),data=result.image.data;
assert.deepEqual(science.data,unchangedScience,"every scientific RGBA byte stays exact");
assert.deepEqual(composite.data,unchangedComposite,"global atlas and source tags stay exact");
assert.ok(result.stats.borderSeeds>0);
assert.ok(result.stats.observedIrLimbPixels>100,"satellite supports the limb");
for(const y of [3,30,57]){
  assert.equal(data[at(64,y)],145,"same-coordinate real satellite IR is used");
  assert.ok(data[at(64,y)+1]>0,"visual overlay masks only the limb");
  assert.ok(data[at(68,y)+1]>0);
  assert.equal(data[at(90,y)+1],0,"full-confidence science / strong native L2 cloud protected");
  assert.equal(data[at(95,y)+1],0,"interior L2 unchanged");
  assert.equal(data[at(40,y)+1],0,"never paint supplementary area");
  assert.ok(data[at(0,y)+1]>0,"antimeridian must be periodic and support a genuine satellite border");
}
assert.equal(result.stats.alteredSciencePixels,0);
// A genuine IR clear pixel MUST NOT borrow cloud from its neighbour.
infrared.data[at(65,20)]=0;
const withClear=build(science,composite,infrared,16);
assert.equal(withClear.image.data[at(65,20)+1],0,"do not invent cloud where satellite IR is zero");
// Low-confidence L2 adjacent ONLY to GFS may not receive a fabricated cloud.
// Suppress ALL source borders other than forecast; even valid IR is insufficient.
const forecast=make();
for(let p=0;p<n;p++){
 const o=p*4;forecast.data.set(composite.data.slice(o,o+4),o);
 if(!science.data[o+1]){forecast.data[o+1]=92;forecast.data[o+2]=255;}
}
const modelOnly=build(science,forecast,infrared,16);
assert.equal(modelOnly.stats.borderSeeds,0);
assert.equal(modelOnly.stats.observedIrLimbPixels,0);
assert.equal(modelOnly.image.data[at(64,10)+1],0);
// Invalid IR provenance cannot be treated as actual satellite signal.
const brokenIR=make();brokenIR.data.set(infrared.data);
for(let p=0;p<n;p++)brokenIR.data[p*4+2]=255;
const invalid=build(science,composite,brokenIR,16);
assert.equal(invalid.stats.observedIrLimbPixels,0);
assert.equal(invalid.stats.borderSeeds,0);
console.log(JSON.stringify({status:"PASS",...result.stats,
  nativeL2ByteExact:true,strictSameCoordinateIR:true,noForecastAsSatellite:true,
  longitudeWrap:true,interiorProtected:true}));
