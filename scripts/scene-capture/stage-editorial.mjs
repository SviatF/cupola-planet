#!/usr/bin/env node
/**
 * CUPOLA ORIGINAL MEDIA staging. Runs AFTER real Playwright WebGL render.
 * Automatic capture is not automatic factual publication. This job writes
 * authentic binary WebP/WebM into a review PR and records exact SHA256, UTC,
 * remote-revision status, GPU/cloud source diagnostics and classification.
 * Nothing from the review queue is consumed by public React components.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import presets from "../../config/scene-capture-presets.json" with {type:"json"};

const root=process.cwd();
const out=path.resolve(process.argv[2]??"capture-output");
const review=path.join(root,"public","scene-captures","review");
const manifestPath=path.join(root,"data","editorial","scene-review-queue.json");
await fs.mkdir(review,{recursive:true});
const candidates=new Map();
try{
 const former=JSON.parse(await fs.readFile(manifestPath,"utf8"));
 if(former.schemaVersion!==1 || !Array.isArray(former.candidates))throw Error("Invalid review queue");
 for(const c of former.candidates)candidates.set(c.id,c);
}catch(e){if(e.code!=="ENOENT")throw e;}
const files=(await fs.readdir(out)).filter(name=>name.endsWith(".json")).sort();
if(files.length===0)throw Error("No actual renderer QA manifests found; refusing empty media PR");
for(const file of files){
 const evidence=JSON.parse(await fs.readFile(path.join(out,file),"utf8"));
 const preset=presets.presets.find(p=>p.id===evidence.preset && p.output===path.basename(file,".json"));
 if(!preset)throw Error("Unrecognized renderer preset "+file);
 if(evidence.pageId!==preset.pageId || evidence.imageType!=="CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH"
   || evidence.actualThreeJsCanvas!==true || evidence.sceneReadyVerified!==true ||
   evidence.approved!==false || evidence.assetStatus!=="AWAITING_EDITORIAL_AND_SCIENCE_REVIEW")
  throw Error("Renderer verification or review safeguards missing: "+file);
 if(!Number.isFinite(Date.parse(evidence.renderedAt)))throw Error("Missing render UTC: "+file);
 if(evidence.classification==="LIVE_SATELLITE_PHOTOGRAPH")throw Error("Mislabelled rendered media");
 if(evidence.warnings?.some(x=>/WebGL context lost|THREE.WebGLRenderer: Error/i.test(x)))
  throw Error("Unstable scene renderer: "+file);
 if(!Array.isArray(evidence.contrastStdev)||evidence.contrastStdev.every(v=>v<8))
  throw Error("Empty captured scene: "+file);
 const id=preset.assetId,stem=preset.output;
 if(!/^[a-z0-9-]{3,70}$/.test(id))throw Error("Invalid asset ID");
 async function copyVerified(name,expected){
   const source=path.join(out,name),buf=await fs.readFile(source);
   const actual=createHash("sha256").update(buf).digest("hex");
   if(expected && actual!==expected)throw Error("SHA-256 mismatch "+name);
   if(name.endsWith(".webp") && !(buf.toString("ascii",0,4)==="RIFF" && buf.toString("ascii",8,12)==="WEBP"))
     throw Error("Asset is not real WebP: "+name);
   if(buf.length<12000)throw Error("Suspiciously small capture: "+name);
   await fs.writeFile(path.join(review,name),buf);
   return {url:"/scene-captures/review/"+name,sha256:actual,bytes:buf.length};
 }
 const still=await copyVerified(stem+".webp",evidence.heroSha256);
 const og=await copyVerified(stem+"-og.webp",evidence.ogSha256);
 let video=null;
 if(evidence.requestType==="video"){
   if(!evidence.video || evidence.video.durationSeconds<7.5 || evidence.video.durationSeconds>8.25)
    throw Error("Not an 8-second original WebGL recording");
   video=await copyVerified(stem+"-8s.webm");
 }
 // Publish the QA JSON into the review directory as an independent record.
 await fs.copyFile(path.join(out,file),path.join(review,file));
 candidates.set(id,{
  id,assetId:id,pageId:preset.pageId,source:"CUPOLA_CAPTURE_ENGINE",
  captureUrl:evidence.captureUrl,renderedAt:evidence.renderedAt,
  sceneRevision:evidence.sceneRevision??null,revisionStatus:evidence.revisionStatus,
  imageType:evidence.imageType,cloudSourceEvidence:evidence.cloudSourceEvidence,
  scientificClassification:evidence.scientificClassification,
  disclosure:preset.disclosure,renderedMedia:still,ogMedia:og,videoMedia:video,
  qaManifestUrl:"/scene-captures/review/"+file,
  approval:"PENDING_SCIENTIFIC_AND_EDITORIAL_REVIEW",
  warning:"CUPOLA 3D illustration with mixed source ages. NOT a live satellite photograph."
 });
 console.log("STAGED_ORIGINAL_CUPOLA_WEBGL_MEDIA",id,evidence.renderedAt,evidence.revisionStatus);
}
await fs.mkdir(path.dirname(manifestPath),{recursive:true});
await fs.writeFile(manifestPath,JSON.stringify({
 schemaVersion:1,purpose:"Unpublished scene-media review candidates, created automatically from genuine WebGL",
 generatedBy:"scripts/scene-capture/stage-editorial.mjs",
 candidates:[...candidates.values()].sort((a,b)=>a.id.localeCompare(b.id))
},null,2)+"\n");
console.log("STAGED_REVIEW_QUEUE",files.length,"captures, not published automatically");
