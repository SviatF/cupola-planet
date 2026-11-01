#!/usr/bin/env node
// Immutable R2 objects first; replace the small current.json pointer LAST.
// Keeps last known good photo if upload, CDN, science or QA fails.
import fs from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
const dir=process.env.CUPOLA_CAPTURE_OUT||"capture-output";
const bucket=process.env.CUPOLA_R2_BUCKET||"cupola-scene-media";
const origin=process.env.CUPOLA_PUBLIC_ORIGIN||"https://cupola.earth";
if(origin!=="https://cupola.earth")throw Error("Unexpected public site origin");
if(bucket!=="cupola-scene-media")throw Error("Unexpected home media bucket");
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)
 throw Error("Missing R2 write credentials; keeping last approved image");
const pointer=JSON.parse(await fs.readFile(dir+"/home-cover-current.json","utf8"));
const report=JSON.parse(await fs.readFile(dir+"/home-cover-auto-report.json","utf8"));
if(pointer.status!=="AUTO_QA_PASSED"||pointer.assetId!=="home-cover"||
 report.status!=="AUTO_QA_PASSED"||report.science?.eligible!==true||
 report.heroSha256!==pointer.heroSha256||pointer.observedFootprint<.45)
 throw Error("QA/provenance record mismatch");
const v=pointer.heroSha256.slice(0,20);
if(!/^[a-f0-9]{20}$/.test(v)||!pointer.url.endsWith("v="+v))
 throw Error("Bad version fingerprint");
const base="scene-captures/home-cover/"+v+"/";
if(pointer.manifestKey!==base+"manifest.json")throw Error("Manifest path mismatch");
const bytes=await fs.readFile(dir+"/home-cover.webp");
if(createHash("sha256").update(bytes).digest("hex")!==pointer.heroSha256)
 throw Error("Source image changed after science/visual QA");
const http=async url=>{
 const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("Expected reachable CUPOLA URL, got "+response.status);
 return response;
};
try{
 // Never roll back to an older capture if a prior job has completed first.
 const previous=await fetch(origin+"/api/scene-media/home-cover?check="+Date.now(),
  {cache:"no-store",signal:AbortSignal.timeout(12000)});
 if(previous.ok){
  const current=await previous.json();
  if(Number.isFinite(Date.parse(current.renderedAt))&&
     Date.parse(current.renderedAt)>=Date.parse(pointer.renderedAt)){
   console.log("CUPOLA_HOME_SKIP_STALE_CAPTURE");process.exit(0);
  }
 }
}catch(err){
 // If origin is unavailable, DO NOT publish an unobservable pointer.
 throw Error("Cannot check current image before replacing: "+String(err));
}
function put(file,key,type,cacheControl){
 if(!/^[a-z0-9/.-]+$/.test(key)||key.includes(".."))throw Error("Invalid R2 key");
 const result=spawnSync("npx",["wrangler","r2","object","put",bucket+"/"+key,
  "--remote","--file",file,"--content-type",type,
  "--cache-control",cacheControl],{stdio:"inherit",timeout:240000});
 if(result.status!==0)throw Error("R2 upload failed: "+key);
}
put(dir+"/home-cover.webp",base+"home-cover.webp","image/webp","public, max-age=31536000, immutable");
put(dir+"/home-cover-og.webp",base+"home-cover-og.webp","image/webp","public, max-age=31536000, immutable");
put(dir+"/home-cover-auto-manifest.json",base+"manifest.json","application/json","public, max-age=31536000, immutable");
// Test the deployed same-origin R2 binding before shifting the public pointer.
const image=await http(origin+pointer.url);
if((image.headers.get("content-type")||"").split(";")[0]!=="image/webp")
 throw Error("R2 delivery is not a WebP image");
const delivered=Buffer.from(await image.arrayBuffer());
if(createHash("sha256").update(delivered).digest("hex")!==pointer.heroSha256)
 throw Error("CDN image checksum mismatch");
put(dir+"/home-cover-current.json","scene-captures/home-cover/current.json",
 "application/json","no-store, max-age=0");
const latest=await http(origin+"/api/scene-media/home-cover?check="+v);
const live=await latest.json();
if(live.url!==pointer.url||live.renderedAt!==pointer.renderedAt)
 throw Error("Public R2 pointer verification failed");
console.log("CUPOLA_HOME_WEBP_PUBLISHED",v,pointer.renderedAt,pointer.observedFootprint);
