#!/usr/bin/env node
/**
 * Science/editorial sign-off of original 3D visualization AFTER browser QA.
 * Run only on previously merged Media Factory review files. Source revision
 * MUST have been attested by deployed /explore; no SHA guessed from Actions.
 * Immutable, content-addressed published files prevent later unpublished
 * captures from swapping pixels under an approved URL.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import presets from "../../config/scene-capture-presets.json" with {type:"json"};
const id=process.argv[2];
const reviewer=(process.env.CUPOLA_MEDIA_REVIEWER||"").trim();
const approval=process.env.CUPOLA_MEDIA_REVIEW_CONFIRM;
const notes=(process.env.CUPOLA_MEDIA_REVIEW_NOTES||"").trim();
if(!id||!reviewer||approval!=="I_REVIEWED_THIS_3D_RENDER"||notes.length<15)
 throw Error("Explicit reviewer, 3D-only approval and substantive scientific review notes required");
const approvedAlts={
 "home-hero":"Original CUPOLA 3D orbital view of Earth, rendered from mixed-age textures and physical solar geometry.",
 "clouds-hero":"Original CUPOLA 3D model of Earth's clouds, with regionally observed and possibly modelled cloud coverage.",
 "day-night-hero":"Original CUPOLA 3D depiction of Earth's calculated daylight boundary from an orbital camera.",
 "night-lights-hero":"Original CUPOLA 3D visualization of Earth's night lights; radiance imagery may be historical.",
 "from-orbit-feature":"Original CUPOLA 3D Earth from orbit with calculated solar geometry and mixed-age scientific imagery.",
 "satellite-atlas-hero":"Original CUPOLA 3D view of a modelled spacecraft orbit; orbital propagation is not live satellite telemetry."
};
const preset=presets.presets.find(p=>p.assetId===id);
if(!preset||!approvedAlts[id])throw Error("Unknown approved original-3D asset ID: "+id);
const candidatePath="data/editorial/scene-review-queue.json";
const queue=JSON.parse(await fs.readFile(candidatePath,"utf8"));
const c=queue.candidates.find(c=>c.id===id);
if(!c||c.approval!=="PENDING_SCIENTIFIC_AND_EDITORIAL_REVIEW")
 throw Error("Capture has not completed a proper Media Factory review queue");
if(c.sceneRevision===null || !/^[a-f0-9]{40}$/.test(c.sceneRevision) ||
 c.revisionStatus!=="REMOTE_REVISION_HEADER_VERIFIED")
 throw Error("Cannot attribute an unverified remote scene revision; repair build provenance and recapture");
const metadata=JSON.parse(await fs.readFile(path.join("public",c.qaManifestUrl),"utf8"));
if(metadata.sceneRevision!==c.sceneRevision || metadata.revisionStatus!==c.revisionStatus ||
 metadata.imageType!=="CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH" ||
 metadata.actualThreeJsCanvas!==true || metadata.sceneReadyVerified!==true ||
 metadata.preset!==preset.id || metadata.approved!==false)
 throw Error("Manifest/renderer provenance mismatch");
if(!Number.isFinite(Date.parse(c.renderedAt)))throw Error("Missing valid UTC rendering timestamp");
if(metadata.cloudSourceEvidence?.mode==="observed" &&
 !metadata.cloudSourceEvidence?.observedAt)
 throw Error("Observed cloud status without sensor time — do not advertise as observation");

await fs.mkdir("public/scene-captures/published",{recursive:true});
const dir="public/scene-captures/published";
async function promote(a,ext){
 if(!a)return null;
 const source=path.join("public",a.url),buffer=await fs.readFile(source);
 const sha=createHash("sha256").update(buffer).digest("hex");
 if(sha!==a.sha256)throw Error("The approved media changed since staging: "+source);
 const filename=id+"-"+sha.slice(0,16)+"."+ext;
 await fs.writeFile(path.join(dir,filename),buffer);
 return "/scene-captures/published/"+filename;
}
const image=await promote(c.renderedMedia,"webp");
const og=await promote(c.ogMedia,"webp");
const video=c.videoMedia?await promote(c.videoMedia,"webm"):null;
const evidenceSha=createHash("sha256").update(JSON.stringify(metadata)).digest("hex");
const publishedMetaName=id+"-"+c.renderedMedia.sha256.slice(0,16)+".json";
const publishedRecord={...metadata,assetStatus:"APPROVED_FOR_ILLUSTRATIVE_3D_USE_ONLY",
 approved:true,approvedBy:reviewer,approvedAt:new Date().toISOString(),
 editorialNotes:notes,
 sourceOriginalManifestSha256:evidenceSha,
 warning:"The scene is a visualization, not an instantaneous global satellite photograph",
 sourceObservedAt:null
};
await fs.writeFile(path.join(dir,publishedMetaName),JSON.stringify(publishedRecord,null,2)+"\n");
const manifestPath="data/editorial/scene-assets.json";
const manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));
if(manifest.schemaVersion!==1||!Array.isArray(manifest.assets))throw Error("Invalid approved media registry");
const record={id,approved:true,origin:"CUPOLA_CAPTURE_ENGINE",url:image,ogUrl:og,
 ...(video?{videoUrl:video}:{}),alt:approvedAlts[id],
 manifestUrl:"/scene-captures/published/"+publishedMetaName,
 renderedAt:c.renderedAt,sourceObservedAt:null,sceneRevision:c.sceneRevision,
 classification:"CUPOLA_3D_VISUALIZATION_NOT_SATELLITE_PHOTOGRAPH",
 reviewer,approvedAt:publishedRecord.approvedAt};
manifest.assets=manifest.assets.filter(x=>x.id!==id).concat(record).sort((a,b)=>a.id.localeCompare(b.id));
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+"\n");
console.log("REVIEWED_CUPOLA_ORIGINAL_SCENE_READY_FOR_PUBLICATION_PR",id,image);
