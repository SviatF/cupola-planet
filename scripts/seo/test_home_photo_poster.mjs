#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(path,"utf8");
const component=read("components/editorial/SceneFrame.tsx");
const assets=JSON.parse(read("data/editorial/scene-assets.json"));
const presets=JSON.parse(read("config/scene-capture-presets.json")).presets;
const css=read("app/atlas.css"),coreCss=read("app/globals.css");
assert.ok(component.includes('getApprovedSceneAsset("home-cover")'),
 "homepage poster must come ONLY from the independently approved immutable manifest");
assert.ok(component.includes('poster?')&&component.includes('ae-home-approved-poster'),
 "homepage poster should replace the extra WebGL renderer, not merely cover it");
assert.ok(component.includes("CAPTURED ")&&!component.includes("LIVE SATELLITE"),
 "do not label static pixels as live");
assert.ok(component.includes('src="/explore?embed=1&hero=sunrise"'),
 "if there is no approved original still, preserve authentic CUPOLA scene fallback");
assert.ok(component.includes('a.approved===true')&&
 component.includes('a.origin==="CUPOLA_CAPTURE_ENGINE"'),
 "do not load arbitrary or unapproved R2 files into hero");
assert.ok(!assets.assets.some(a=>a.id==="home-cover"),
 "new home picture must stay UNPUBLISHED until actual science and visual approval");
assert.ok(css.includes(".ae-home-approved-poster")&&css.includes("object-fit:cover"));
assert.ok(coreCss.includes('.embedded-scene:not(.capture-scene) .scene-wrap')&&
 coreCss.includes('[data-editorial-camera][data-renderer-ready="true"]'),
 "hide default initial camera until actual selected Sun/Earth camera is rendered");
assert.ok(!coreCss.includes(".capture-scene .scene-wrap{opacity:0"),
 "explicit science capture must remain visible");
const p=presets.find(x=>x.id==="home-cover");
assert.ok(p && p.pageId==="home" && p.assetId==="home-cover" &&
 p.cameraMode==="explore-reference" && p.route.includes("captureShot=explore") &&
 p.distanceEarthRadii>3.65&&p.distanceEarthRadii<3.78&&p.renderTypes.length===1&&p.renderTypes[0]==="still",
 "photo must be from exact normal Explore 3D view, not alternate editorial grade");
const science=read("lib/scene-media/science-gate.mjs");
assert.ok(science.includes('meta.preset==="home-cover"') &&
 science.includes('cloud.gpuAppliedKind==="verified-l2"'),
 "do not science-approve fallback cloud pixels");
const workflow=read(".github/workflows/cupola-8-12-home-cover-capture.yml");
assert.ok(workflow.includes("wait-production-release.mjs")&&
 workflow.includes("render.mjs home-cover")&&
 workflow.includes("assess-candidate.mjs")&&
 workflow.includes("UNAPPROVED"));
assert.ok(!workflow.includes("publish-plan-r2")&&!workflow.includes("CLOUDFLARE_API_TOKEN"));
assert.ok(!/\bschedule:/.test(workflow),"home photo capture must be one shot and approved");
console.log("PASS CUPOLA 8.12 approved-photo-first home and zero first-load camera jump");
