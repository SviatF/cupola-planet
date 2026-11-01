#!/usr/bin/env node
// Automatic *technical* QA, not a claim of independent human editorial review.
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {assessScienceCandidate} from "../../lib/scene-media/science-gate.mjs";

const dir=process.env.CUPOLA_CAPTURE_OUT||"capture-output";
const meta=JSON.parse(await fs.readFile(path.join(dir,"home-cover.json"),"utf8"));
const fail=message=>{throw Error("CUPOLA_AUTO_HOME_QA_BLOCKED "+message);};
if(meta.preset!=="home-cover"||meta.pageId!=="home"||meta.requestType!=="still"||
   meta.approved!==false||meta.actualThreeJsCanvas!==true)fail("unexpected capture identity");
const science=assessScienceCandidate(meta,{maxObservedAgeHours:1.5});
if(!science.eligible)fail("science: "+science.issues.join("; "));
if(science.observedFootprint<0.45)fail("satellite observation footprint below minimum");
const jpg=path.join(dir,"home-cover.webp");
const og=path.join(dir,"home-cover-og.webp");
const bytes=await fs.readFile(jpg),ogBytes=await fs.readFile(og);
const sha=x=>createHash("sha256").update(x).digest("hex");
if(sha(bytes)!==meta.heroSha256 || sha(ogBytes)!==meta.ogSha256)fail("immutable image checksum mismatch");
if(bytes.length<30000||ogBytes.length<10000)fail("image bytes too small");
const dimensions=await sharp(bytes).metadata();
if(dimensions.width!==1600||dimensions.height!==900||dimensions.format!=="webp")
 fail("unexpected original frame dimensions/format");
// Lighting is allowed to be dark on the *night* side; reject missing/near-black
// frames without manufacturing artificial brightness or cloud pixels.
const small=await sharp(bytes).resize(160,90).removeAlpha().raw().toBuffer({resolveWithObject:true});
const pixels=small.data,channels=small.info.channels;
const values=[];
for(let i=0;i<pixels.length;i+=channels){
 values.push(0.2126*pixels[i]+0.7152*pixels[i+1]+0.0722*pixels[i+2]);
}
values.sort((a,b)=>a-b);
const sample=q=>values[Math.min(values.length-1,Math.floor((values.length-1)*q))];
const p05=sample(.05),p50=sample(.5),p95=sample(.95);
const visiblyLit=values.filter(v=>v>75).length/values.length;
if(p95-p05<38 || p95<73 || visiblyLit<0.018)
 fail("frame too dark, flat or missing visible illuminated Earth");
const camera=meta.actualSceneCameraEvidence||{};
if(camera.poseStable!==true || Number(camera.stableFrames)<12 ||
   Math.abs(Number(camera.earthCenterClipX))>=.2 ||
   Math.abs(Number(camera.earthCenterClipY))>=.2)
 fail("Earth/camera composition not settled");
const v=meta.heroSha256.slice(0,20);
const prefix="scene-captures/home-cover/"+v+"/";
const pointer={
 schemaVersion:1,assetId:"home-cover",origin:"CUPOLA_CAPTURE_ENGINE",
 status:"AUTO_QA_PASSED",imageType:meta.imageType,
 url:"/api/scene-media/home-cover/image?v="+v,
 manifestKey:prefix+"manifest.json",
 sceneRevision:meta.sceneRevision,renderedAt:meta.renderedAt,
 sourceObservedAt:science.observedAt,observedFootprint:science.observedFootprint,
 heroSha256:meta.heroSha256
};
const report={
 status:"AUTO_QA_PASSED",humanEditorialApproval:false,
 checkedAt:new Date().toISOString(),frame:{width:1600,height:900,
 bytes:bytes.length,p05,p50,p95,visiblyLit},
 science:{eligible:true,classification:science.classification,
 observedFootprint:science.observedFootprint,observedAt:science.observedAt,
 gpuAppliedKind:meta.cloudSourceEvidence.gpuAppliedKind,
 gpuAtlasVersion:meta.cloudSourceEvidence.gpuAtlasVersion},
 composition:camera,heroSha256:meta.heroSha256,ogSha256:meta.ogSha256
};
const provenance={...pointer,classification:science.classification,
 caveat:"Source-observed regional cloud data in a 3D simulation at capture time; not a live whole-Earth satellite photograph.",
 video:false,report,cloudSourceEvidence:meta.cloudSourceEvidence};
await fs.writeFile(path.join(dir,"home-cover-auto-report.json"),JSON.stringify(report,null,2)+"\n");
await fs.writeFile(path.join(dir,"home-cover-auto-manifest.json"),JSON.stringify(provenance,null,2)+"\n");
await fs.writeFile(path.join(dir,"home-cover-current.json"),JSON.stringify(pointer,null,2)+"\n");
console.log("CUPOLA_AUTO_HOME_QA_PASSED",v,JSON.stringify({coverage:science.observedFootprint,p05,p95,visiblyLit}));
