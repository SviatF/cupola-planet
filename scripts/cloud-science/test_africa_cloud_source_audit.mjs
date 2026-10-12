#!/usr/bin/env node
/** Test geographic source coverage auditing WITHOUT altering the clouds. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
class ImageData {
  constructor(data,width,height) {this.data=data;this.width=width;this.height=height;}
}
const out={};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync("lib/earth/africaCloudSourceAudit.ts","utf8"),{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText,{module:{exports:out},exports:out,ImageData,
 Uint8ClampedArray,Math,Error});
assert.equal(typeof out.auditAfricaCloudSources,"function");
const w=360,h=180,n=w*h;
const make=()=>new ImageData(new Uint8ClampedArray(n*4),w,h);
const science=make(),wms=make(),ir=make(),final=make();
const offset=(lon,lat)=>{
 const x=Math.floor((lon+180)/360*w),y=Math.floor((90-lat)/180*h);
 return (y*w+x)*4;
};
for(const picture of [science,wms,ir,final])
 for(let p=0;p<n;p++)picture.data[p*4+3]=255;
// NOAA IR weak/clear over Africa; cloud mask from Meteosat does see a cloud.
const cloud=offset(2,5);
wms.data.set([174,126,224,255],cloud);
ir.data.set([0,135,232,255],cloud);
final.data.set([84,126,224,255],cloud);
// Cloud seen in independently measured NOAA GMGSI infrared.
const irCloud=offset(20,-10);
ir.data.set([74,135,232,255],irCloud);
final.data.set([74,135,232,255],irCloud);
// Known-clear authoritative L2 at Africa coastal pixel.
const native=offset(-11,10);
science.data.set([0,255,42,255],native);
wms.data.set([0,255,42,255],native);
final.data.set([0,255,42,255],native);
// A real forecast is distinct from satellite observations.
const model=offset(60,0);
final.data.set([31,92,255,255],model);
const before=[science,wms,ir,final].map(v=>new Uint8ClampedArray(v.data));
const audit=out.auditAfricaCloudSources(science,wms,ir,final);
assert.equal(audit.schema,"cupola-cloud-source-audit/v1");
assert.equal(audit.untouchedLevel2,true);
const africa=audit.sectors.find(v=>v.sector==="africa");
assert.ok(africa);
assert.equal(africa.meteosatDetectedCloud,1);
assert.equal(africa.meteosatDetectedButNoaaDark,1);
assert.equal(africa.meteosatCloudInFinal,1);
assert.equal(africa.noaaIrVisual,1);
assert.equal(africa.nativeLevel2,1);
assert.equal(africa.nativeLevel2Clear,1);
const indian=audit.sectors.find(v=>v.sector==="indian-ocean");
assert.ok(indian.modelGfs>=1);
for(let i=0;i<before.length;i++)
 assert.deepEqual([science,wms,ir,final][i].data,before[i],"audit must not write anything");
const damaged=make();damaged.data.set(final.data);
damaged.data[native]=15;
assert.equal(out.auditAfricaCloudSources(science,wms,ir,damaged).untouchedLevel2,false,
 "audit must flag damage to authoritative classified clear pixels");
assert.throws(()=>out.auditAfricaCloudSources(science,wms,null,
 new ImageData(new Uint8ClampedArray(120),10,3)),/identical georeferenced/i);
console.log(JSON.stringify({status:"PASS",auditSchema:audit.schema,
  africaCloudDetectedAndRetained:true,weakNoaaIrNotMisclassified:true,
  classifiedL2ClearProtected:true,noModelAsSatellite:true,
  sourceInputsUnchanged:true,sectorKeys:audit.sectors.map(s=>s.sector)}));
