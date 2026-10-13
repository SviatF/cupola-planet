#!/usr/bin/env node
/** Regression for the exact 8.9-hour V3 NOAA visual seam outage.
 * A 4h-expired, SHA-authentic GMGSI observation must be unavailable through
 * LIVE endpoints but usable with explicit ARCHIVED/NOT LIVE provenance.
 * Beyond 48h, broken hashes or invalid DQF MUST fail closed.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require(process.env.CUPOLA_TEST_TS_PATH || "typescript");
const NOW=Date.UTC(2026,9,13,10,0,0);
const observed=new Date(NOW-8.9*3600_000).toISOString();
const version="20261013010400";
const png=new Uint8Array(1500);
const dv=new DataView(png.buffer);
dv.setUint32(0,0x89504e47);dv.setUint32(4,0x0d0a1a0a);
dv.setUint32(16,2048);dv.setUint32(20,1024);
const digest=crypto.createHash("sha256").update(png).digest("hex");
const baseMeta={
 schema:"cupola-gmgsi-ir-visual/v1",version,generated_at:new Date(NOW-8.8*3600_000).toISOString(),
 observation_start:observed,expires_at:new Date(NOW-4.9*3600_000).toISOString(),
 atlas_file:"gmgsi-visual-"+version+".png",atlas_sha256:digest,
 width:2048,height:1024,source_grid_fraction:.809,source_area_fraction:.91,
 cloud_optical_depth_calibrated:false,native_noaa_jma_level2_cloudmask:false,
 native_dqf_zero_screen_used:true,used_as_visual_only:true,
 source:"NOAA GMGSI LW multisatellite infrared mosaic",grey_detail_available:false,
};
let metadata={...baseMeta};
let modified=false,missingPointer=false;
const assetBase="https://github.com/SviatF/cupola-planet/releases/download/cupola-gmgsi-visual-preview/";
const assetApi="https://api.github.com/repos/SviatF/cupola-planet/releases/assets/";
const asset=(name,id,size)=>({
 name,id,size,state:"uploaded",url:assetApi+id,
 browser_download_url:assetBase+name
});
class MockDate extends Date {static now(){return NOW;}}
class NextResponse extends Response {
 static json(data,opts={}){return new NextResponse(JSON.stringify(data),{
   status:opts.status??200,
   headers:{"content-type":"application/json",...(opts.headers??{})}
 });}
}
const requests=[];
const fetchStub=async url=>{
 requests.push(url);
 if(url.includes("/releases/tags/cupola-gmgsi-visual-preview")){
  return new Response(JSON.stringify({assets:[
    asset("manifest-"+metadata.version+".json",123456,1000),
    asset("gmgsi-visual-"+metadata.version+".png",123457,1500),
  ]}),{status:200});
 }
 if(missingPointer && url.includes("/latest.json")){
  return new Response(null,{status:404});
 }
 if(url.includes(".json")){
  return new Response(JSON.stringify(metadata),{status:200});
 }
 if(url.includes(".png")){
  const bytes=modified?new Uint8Array(png):png;
  if(modified)bytes[32]^=1;
  return new Response(bytes,{status:200});
 }
 throw Error("Unrecognized GitHub asset");
};
const module={exports:{}};
const source=fs.readFileSync("app/api/clouds-visual-gmgsi/route.ts","utf8");
vm.runInNewContext(ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{
 module,exports:module.exports,require:id=>{
   if(id==="next/server")return {NextResponse};
   throw Error("Unsupported import: "+id);
 },fetch:fetchStub,Date:MockDate,AbortSignal,Response,Uint8Array,DataView,
 Number,RegExp,Array,Object,JSON,String,Math,crypto:crypto.webcrypto,console,
});
const get=async(params)=>{
 const url=new URL("https://unit.local/api/clouds-visual-gmgsi?"+params);
 return module.exports.GET({nextUrl:url});
};
let res=await get("kind=manifest");
assert.equal(res.status,204,"expired data CANNOT become a current observation");
res=await get("kind=atlas&version="+version);
assert.equal(res.status,204,"expired LIVE atlas must fail closed");
res=await get("kind=archive-manifest");
assert.equal(res.status,200,"the 8.9h observed frame must remain for visual continuity");
assert.equal(res.headers.get("x-cupola-data-status"),"archived-ir-visual-not-live");
assert.equal(res.headers.get("x-cupola-visual-archive"),"true");
assert.equal((await res.json()).version,version);
// GitHub release CDN can return 404 for latest.json while the immutable
// versioned assets exist. The 9h source must not vanish in that case.
missingPointer=true;
res=await get("kind=archive-manifest");
assert.equal(res.status,200,"404 latest.json must recover from verified Release API assets");
assert.equal(res.headers.get("x-cupola-data-status"),"archived-ir-visual-not-live");
missingPointer=false;
res=await get("kind=archive-atlas&version="+version);
assert.equal(res.status,200,"SHA-protected archived PNG must be downloadable");
assert.equal(res.headers.get("x-cupola-data-status"),"archived-ir-visual-not-live");
assert.equal(res.headers.get("x-cupola-verified-cloudmask"),"false");
assert.equal(new Uint8Array(await res.arrayBuffer()).byteLength,1500);
modified=true;
res=await get("kind=archive-atlas&version="+version);
assert.equal(res.status,204,"tampering must be rejected by SHA-256");
modified=false;
metadata={...baseMeta,observation_start:new Date(NOW-49*3600_000).toISOString(),
 generated_at:new Date(NOW-48.9*3600_000).toISOString(),
 expires_at:new Date(NOW-45*3600_000).toISOString()};
res=await get("kind=archive-manifest");
assert.equal(res.status,204,"48h maximum archive lifetime must be enforced");
metadata={...baseMeta,observation_start:new Date(NOW-3*3600_000).toISOString(),
 generated_at:new Date(NOW-2.9*3600_000).toISOString(),
 expires_at:new Date(NOW+3600_000).toISOString()};
res=await get("kind=manifest");
assert.equal(res.status,200,"fresh NOAA continues to win whenever available");
assert.equal(res.headers.get("x-cupola-data-status"),"satellite-ir-visual-not-cloudmask");
console.log(JSON.stringify({status:"PASS",regression:"9h NOAA publication lapse",
  freshL2NeverForged:true,visualArchiveLabelExplicit:true,
  verifiedPngHashEnforced:true,latestPointer404Recovered:true,
  oldArchiveRejected:true,freshFeedPreferred:true,
  externalReads:requests.length}));
