#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {assessScienceCandidate} from "../../lib/scene-media/science-gate.mjs";
const read=p=>fs.readFileSync(p,"utf8");
const preset=JSON.parse(read("config/scene-capture-presets.json")).presets
 .find(p=>p.id==="home-orbit-video");
assert.ok(preset && preset.cameraMode==="orbit-video");
assert.equal(preset.videoSeconds,24);
assert.equal(preset.route,"/explore?capture=1&captureShot=orbit");
const scene=read("components/CupolaExperience.tsx");
assert.ok(scene.includes("data-orbit-capture-ready")&&
 scene.includes("data-orbit-capture-degrees")&&
 scene.includes("data-orbit-capture-state")&&
 scene.includes("phase*Math.PI*2")&&
 scene.includes("eye.lookAt(GLOBE_CENTER)")&&
 scene.includes("!props.editorialDawn && !orbitVideoCapture"));
const render=read("scripts/scene-capture/render.mjs");
assert.ok(render.includes('preset.cameraMode==="orbit-video"')&&
 render.includes('root.setAttribute("data-orbit-capture-state","recording")')&&
 render.includes("orbitCompletedDegrees")&&
 render.includes("after.kind!==\"verified-l2\""));
const wf=read(".github/workflows/cupola-8-16-home-orbit-video.yml");
assert.ok(wf.includes('CUPOLA_REQUIRE_SCIENCE_READY: "1"')&&
 wf.includes("wait-fresh-cloud-v3.mjs")&&
 wf.includes("assess-candidate.mjs")&&wf.includes("UNAPPROVED")&&
 !wf.includes("CLOUDFLARE_API_TOKEN"));
const publisher=read(".github/workflows/science-v3-publish.yml");
assert.ok(publisher.includes("requests/cupola-8-16-home-orbit-video.json"));
const hero=read("components/editorial/SceneFrame.tsx");
assert.ok(hero.includes('getApprovedSceneAsset("home-cover")')&&
 hero.includes("ae-home-approved-video")&&
 hero.includes("autoPlay loop muted playsInline")&&
 hero.includes("360° FILM")&&hero.includes('src="/explore?embed=1&hero=sunrise"'));
const css=read("app/atlas.css");
assert.ok(css.includes("prefers-reduced-motion:reduce")&&
 css.includes(".ae-home-approved-video"));
const shader=read("lib/earth/liveCloudShader.ts");
assert.ok(shader.includes("vec3(0.985, 0.995, 1.0)")&&
 shader.includes("mix(0.56, 0.72, day)")&&
 shader.includes("if (editorialCloudGrade > 0.5)")&&
 shader.includes("float day = smoothstep(-0.14, 0.20, ndl)"));
const rev="a".repeat(40),digest="b".repeat(64);
const film={
 preset:"home-orbit-video",pageId:"home",requestType:"video",
 approved:false,assetStatus:"AWAITING_EDITORIAL_AND_SCIENCE_REVIEW",
 imageType:"CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH",
 sceneReadyVerified:true,actualThreeJsCanvas:true,sceneRevision:rev,requestRevision:rev,
 heroSha256:digest,ogSha256:digest,renderedAt:"2026-10-27T18:30:00Z",
 viewport:{width:1600,height:900},contrastStdev:[22,20,19],
 actualSceneCameraEvidence:{renderer:"CUPOLA_THREEJS_WEBGL",cameraMode:"orbit-video-v1",
  shot:"orbit",captureShaderProfile:"CUPOLA_ORIGINAL_L2_EDITORIAL_DAYLIGHT",
  earthDistanceRadii:3.71,verticalFovDegrees:41,earthCenterClipX:0,
  earthCenterClipY:0,utcSolarFrame:"2026-10-27T18:29:00Z"},
 cloudSourceEvidence:{mode:"observed",observedAt:"2026-10-27T18:10:00Z",
  footprint:0.65,gpuAppliedKind:"verified-l2",
  gpuAppliedAt:"2026-10-27T18:28:00Z",gpuAtlasVersion:"20261027182500"},
 video:{classification:"CUPOLA_3D_SCENE_SIMULATION_NOT_OBSERVED_TIMELAPSE",
  durationSeconds:24,orbitCompletedDegrees:360,sha256:digest}
};
assert.equal(assessScienceCandidate(film).eligible,true,
 "source-labelled full revolution must be scientifically eligible for HUMAN review");
for(const change of [
 {video:{...film.video,orbitCompletedDegrees:180}},
 {video:{...film.video,durationSeconds:8}},
 {cloudSourceEvidence:{...film.cloudSourceEvidence,gpuAppliedKind:"visual-backup"}},
 {actualSceneCameraEvidence:{...film.actualSceneCameraEvidence,earthCenterClipX:.4}}
]){
 const bad=structuredClone(film);
 Object.assign(bad,change);
 assert.equal(assessScienceCandidate(bad).eligible,false,
 "reject incomplete video / fallback GPU / bad geometry");
}
console.log("PASS CUPOLA 8.16: original 24s 360 film, real L2, reviewed-video-only homepage, daylit whites");
