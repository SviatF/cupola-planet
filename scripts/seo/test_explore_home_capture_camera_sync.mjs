#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
const scene=fs.readFileSync("components/CupolaExperience.tsx","utf8");
const renderer=fs.readFileSync("scripts/scene-capture/render.mjs","utf8");
const science=fs.readFileSync("lib/scene-media/science-gate.mjs","utf8");
const request=JSON.parse(fs.readFileSync("requests/cupola-8-12-home-cover.json","utf8"));
const preset=JSON.parse(fs.readFileSync("config/scene-capture-presets.json","utf8"))
 .presets.find(p=>p.id==="home-cover");
assert.ok(preset);
assert.equal(preset.route,"/explore?capture=1&captureShot=explore");
assert.equal(preset.cameraMode,"explore-reference");
assert.equal(request.autoApprove,false);
assert.equal(request.publishToSite,false);

// Show why 8.13 could fail: the raw onCreated camera has not been aimed
// at Earth yet. 12 GPU frames alone say nothing about OrbitControls pose.
const center=new THREE.Vector3(.62,-2.18,0);
const near=new THREE.Vector3(-.12,.28,7.55);
const position=center.clone().add(near.sub(center).multiplyScalar(2));
const camera=new THREE.PerspectiveCamera(41,1600/900,.1,960);
camera.position.copy(position);
camera.updateMatrixWorld(true);
const before=center.clone().project(camera);
assert.ok(Math.abs(before.y)>.2,
 "unoriented onCreated default camera should NOT be accepted by capture");
camera.lookAt(center);
camera.updateMatrixWorld(true);
const after=center.clone().project(camera);
assert.ok(Math.abs(after.x)<.01 && Math.abs(after.y)<.01);
const distance=camera.position.distanceTo(center)/(2.5*1.72);
assert.ok(distance>=3.65&&distance<=3.78);
assert.ok(!scene.includes('if(sceneCapture && new URLSearchParams(window.location.search)\n                      .get("captureShot")==="explore")'),
 "do not stamp camera once in onCreated before OrbitControls is mounted");
const probe=scene.slice(scene.indexOf("// Original Explore photographic capture"),
 scene.indexOf("\n\n  return (",scene.indexOf("// Original Explore photographic capture")));
for(const expected of [
 "useFrame(() => {","exploreCaptureRequested","controls.current",
 "positionError<0.03","targetError<0.03","exploreCaptureFrames.current+1",
 "exploreCaptureFrames.current<12","data-capture-pose-stable",
 'data-capture-shader-profile","EXPLORE_UNMODIFIED"',
 'data-editorial-camera","explore-reference-v1"',
 "data-capture-probe-center-y"
])assert.ok(probe.includes(expected),"original Explore pose guard missing "+expected);
assert.ok(renderer.includes('data-capture-pose-stable')&&
 renderer.includes("CUPOLA_EXPLORE_REFERENCE_POSE_STABLE_12_FRAMES")&&
 renderer.includes("explore-camera-diagnostics.json"),
 "snapshot must wait for a stable native Explore pose and emit diagnostics");
assert.ok(renderer.includes("CUPOLA_CLOUD_GPU_OBSERVED_AT_CAPTURE"),
 "camera ready does NOT constitute scientific cloud provenance");
assert.ok(science.includes('camera.cameraMode==="explore-reference-v1"'));
const assetManifest=JSON.parse(fs.readFileSync("data/editorial/scene-assets.json","utf8"));
assert.ok(!assetManifest.assets.some(a=>a.id==="home-cover"),
 "do not publish a screenshot before verifying scientific/visual source");
console.log("PASS CUPOLA 8.14: premature camera evidence rejected, stable Explore screenshot guarded");
