#!/usr/bin/env node
import assert from "node:assert/strict";
import {assessScienceCandidate} from "../../lib/scene-media/science-gate.mjs";
const rev="a".repeat(40), sha="b".repeat(64);
const candidate={
 approved:false,assetStatus:"AWAITING_EDITORIAL_AND_SCIENCE_REVIEW",
 imageType:"CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH",
 sceneReadyVerified:true,actualThreeJsCanvas:true,
 sceneRevision:rev,requestRevision:rev,heroSha256:sha,ogSha256:sha,
 preset:"from-orbit-feature",pageId:"earth",requestType:"still",
 renderedAt:"2026-10-26T14:00:00Z",viewport:{width:1600,height:900},
 contrastStdev:[20,19,24],
 actualSceneCameraEvidence:{renderer:"CUPOLA_THREEJS_WEBGL",cameraMode:"sunrise-limb-v1",
  shot:"wide",earthDistanceRadii:4.15,earthLimbAngleDegrees:13.94,
  earthCenterClipX:-0.22,earthCenterClipY:0.05,daylightFractionApprox:0.68,
  solarDiscInsideFrustum:false,utcSolarFrame:"2026-10-26T13:59:59Z"},
 cloudSourceEvidence:{mode:"observed",observedAt:"2026-10-26T12:00:00Z",footprint:.68,
  gpuAppliedKind:"verified-l2",gpuAppliedAt:"2026-10-26T13:59:00Z",gpuAtlasVersion:"l2-20261026"}
};
const a=x=>assessScienceCandidate(x);
assert.equal(a(candidate).eligible,true);
for(const [field,value] of [["mode","fallback"],["mode","visual"],["gpuAppliedKind","visual-backup"],
 ["observedAt",null],["gpuAtlasVersion",null],["footprint",0]]) {
 const c=structuredClone(candidate);c.cloudSourceEvidence[field]=value;
 assert.equal(a(c).eligible,false,"must fail closed: "+field+"="+value);
}
for(const [field,value] of [["shot","daylit"],["earthDistanceRadii",1.56],
 ["earthLimbAngleDegrees",40],["earthCenterClipX",0.95],["daylightFractionApprox",0.25]]) {
 const c=structuredClone(candidate);c.actualSceneCameraEvidence[field]=value;
 assert.equal(a(c).eligible,false,"wide Earth must fail closed on invalid "+field);
}
const cover=structuredClone(candidate);
cover.preset="home-cover";cover.pageId="home";
cover.actualSceneCameraEvidence={
 renderer:"CUPOLA_THREEJS_WEBGL",cameraMode:"explore-reference-v1",
 shot:"explore",captureShaderProfile:"EXPLORE_UNMODIFIED",
 earthDistanceRadii:3.7093,verticalFovDegrees:41,
 earthCenterClipX:0,earthCenterClipY:0,
 utcSolarFrame:"2026-10-26T13:59:59Z"
};
assert.equal(a(cover).eligible,true,"home cover requires same source-verified wide globe");
const badCover=structuredClone(cover);
badCover.cloudSourceEvidence.gpuAppliedKind="visual-backup";
assert.equal(a(badCover).eligible,false,"fallback clouds may not be called science approved");
const nightCover=structuredClone(cover);
nightCover.actualSceneCameraEvidence.daylightFractionApprox=.3;
assert.equal(a(nightCover).eligible,false,"dark gray night hemisphere isn't the selected daylit cover");
const old=structuredClone(candidate);old.cloudSourceEvidence.observedAt="2026-10-23T12:00:00Z";
assert.equal(a(old).eligible,false);
const shaMissing=structuredClone(candidate);shaMissing.sceneRevision=null;
assert.equal(a(shaMissing).eligible,false);
const staleDeploy=structuredClone(candidate);staleDeploy.sceneRevision="c".repeat(40);
assert.equal(a(staleDeploy).eligible,false);
const blank=structuredClone(candidate);blank.contrastStdev=[1,2,3];
assert.equal(a(blank).eligible,false);
const video=structuredClone(candidate);video.requestType="video";
video.video={classification:"CUPOLA_3D_SCENE_SIMULATION_NOT_OBSERVED_TIMELAPSE",durationSeconds:8};
assert.equal(a(video).eligible,false);
video.video.sha256="d".repeat(64);
assert.equal(a(video).eligible,true);
console.log("PASS 8.5 science gate: observed GPU atlas, revision, freshness, video hash and fail-closed fallbacks");
