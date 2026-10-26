#!/usr/bin/env node
/**
 * Manual-only, reviewed publication plan. Never uploads or writes to Git here.
 * Called by a protected GitHub Actions environment, after downloading the
 * original capture artifact and merging explicit reviews into main.
 */
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {assessScienceCandidate} from "../../lib/scene-media/science-gate.mjs";

const fail=message=>{throw Error("CUPOLA publication blocked: "+message)};
const candidatePath=process.argv[2];
if(!candidatePath||!candidatePath.endsWith(".json"))fail("missing candidate JSON");
const meta=JSON.parse(fs.readFileSync(candidatePath,"utf8"));
const dir=path.dirname(candidatePath);
const registry=JSON.parse(fs.readFileSync("data/editorial/scene-reviews.json","utf8"));
const current=JSON.parse(fs.readFileSync("data/editorial/scene-assets.json","utf8"));
const science=assessScienceCandidate(meta);
if(!science.eligible)fail("science QA: "+science.issues.join("; "));
if(registry.schemaVersion!==1||!Array.isArray(registry.reviews))fail("review registry invalid");
if(current.schemaVersion!==1||!Array.isArray(current.assets))fail("scene asset registry invalid");
const presetSlot={
  "home-hero":{page:"home",asset:"home-hero"},
  "from-orbit-feature":{page:"earth",asset:"earth-observatory-cover"},
  "satellite-atlas-hero":{page:"satellites",asset:"satellite-atlas-hero"}
}[meta.preset];
if(!presetSlot||meta.pageId!==presetSlot.page)fail("unauthorized page/preset");
if(meta.requestType!=="still"&&meta.requestType!=="video")fail("invalid media type");
const review=registry.reviews.find(r=>r.preset===meta.preset &&
  r.heroSha256===meta.heroSha256 && r.renderedAt===meta.renderedAt);
if(!review)fail("matching Git-reviewed human signoff does not exist");
if(review.assetId!==presetSlot.asset||review.sceneRevision!==meta.sceneRevision)
  fail("review asset slot or renderer revision mismatch");
if(review.scienceApproved!==true||review.editorialApproved!==true)
  fail("both science and editorial reviews must pass");
if(typeof review.scienceReviewedBy!=="string"||review.scienceReviewedBy.length<2||
   typeof review.editorialReviewedBy!=="string"||review.editorialReviewedBy.length<2)
  fail("named accountable human reviewers required");
if(typeof review.alt!=="string"||review.alt.length<35||
   /live satellite photo|live from space/i.test(review.alt))
  fail("accurate, descriptive 3D visualization alt text required");
if(!Number.isFinite(Date.parse(review.reviewedAt))||
   Date.parse(review.reviewedAt)<Date.parse(meta.renderedAt))
  fail("valid post-capture approval date required");
for(const key of ["earthVisible","cloudProvenanceChecked","frameCompositionApproved","visualArtifactsChecked","notRepresentedAsSatellitePhoto"]){
  if(review.visualChecks?.[key]!==true)fail("human visual QA missing: "+key);
}
const hashFile=(file,expected)=>{
  if(!fs.existsSync(file))fail("missing candidate file "+file);
  const hash=createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if(hash!==expected)fail("file checksum mismatch "+file);
};
const p=path.join(dir,meta.preset);
hashFile(p+".webp",meta.heroSha256);
hashFile(p+"-og.webp",meta.ogSha256);
if(meta.requestType==="video")hashFile(p+"-8s.webm",meta.video?.sha256);
if(current.assets.some(a=>a.id===review.assetId&&a.heroSha256===meta.heroSha256))
  fail("asset already published; cannot overwrite immutable publication");
const prefix="scene-captures/"+review.assetId+"/"+meta.heroSha256.slice(0,20)+"/";
const cdn="https://media.cupola.earth/"+prefix;
const publicationManifest={
  schemaVersion:1,assetId:review.assetId,origin:"CUPOLA_CAPTURE_ENGINE",
  approved:true,classification:science.classification,
  disclaimer:"A CUPOLA 3D visualization with regionally observed clouds, historical surface basemaps and calculated lighting. NOT a live whole-Earth satellite photograph.",
  renderedAt:meta.renderedAt,sourceObservedAt:science.observedAt,
  observedFootprint:science.observedFootprint,sceneRevision:meta.sceneRevision,
  imageType:meta.imageType,heroSha256:meta.heroSha256,ogSha256:meta.ogSha256,
  cloudSourceEvidence:meta.cloudSourceEvidence,actualSceneCameraEvidence:meta.actualSceneCameraEvidence,
  review:{scienceReviewedBy:review.scienceReviewedBy,
    editorialReviewedBy:review.editorialReviewedBy,reviewedAt:review.reviewedAt,
    source:"Git-reviewed data/editorial/scene-reviews.json"},
  video:meta.requestType==="video"?meta.video:null
};
const publicationManifestPath=path.join(dir,meta.preset+"-reviewed-publication.json");
fs.writeFileSync(publicationManifestPath,JSON.stringify(publicationManifest,null,2)+"\n");
const objects=[
 {local:p+".webp",key:prefix+meta.preset+".webp",contentType:"image/webp"},
 {local:p+"-og.webp",key:prefix+meta.preset+"-og.webp",contentType:"image/webp"},
 {local:publicationManifestPath,key:prefix+"manifest.json",contentType:"application/json"}
];
if(meta.requestType==="video")objects.push({
 local:p+"-8s.webm",key:prefix+meta.preset+"-8s.webm",contentType:"video/webm"});
const asset={
 id:review.assetId,approved:true,origin:"CUPOLA_CAPTURE_ENGINE",
 url:cdn+meta.preset+".webp",manifestUrl:cdn+"manifest.json",
 alt:review.alt,renderedAt:meta.renderedAt,sourceObservedAt:science.observedAt,
 sceneRevision:meta.sceneRevision,heroSha256:meta.heroSha256,
 ...(meta.requestType==="video"?{videoUrl:cdn+meta.preset+"-8s.webm"}:{})
};
const next={...current,assets:[...current.assets.filter(a=>a.id!==asset.id),asset]};
const plan={schemaVersion:1,approved:true,mediaHost:"media.cupola.earth",
  id:asset.id,sha256:meta.heroSha256,objects};
fs.writeFileSync(path.join(dir,"publication-plan.json"),JSON.stringify(plan,null,2)+"\n");
fs.writeFileSync(path.join(dir,"next-scene-assets.json"),JSON.stringify(next,null,2)+"\n");
console.log("PUBLICATION_PLAN_READY",asset.id,prefix,"requires protected R2 credentials and a PR");
