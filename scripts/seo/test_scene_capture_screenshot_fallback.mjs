#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(file,"utf8");
const render=read("scripts/scene-capture/render.mjs");
const once=read(".github/workflows/cupola-7-5-original-scene-media.yml");
const scheduled=read(".github/workflows/cupola-original-scene-candidates.yml");
const request=JSON.parse(read("requests/cupola-7-5-initial-capture.json"));
assert.ok(render.includes('animations:"allow",timeout:65000'),"do not freeze WebGL requestAnimationFrame during capture");
assert.ok(render.includes('Page.captureScreenshot'),"CDP fallback must exist");
assert.ok(render.includes('fromSurface:true,captureBeyondViewport:false'),"capture the real rendered viewport, not an invented image");
assert.ok(render.includes('CAPTURE_FAILED_NOT_PUBLISHED'),"capture failures must produce safe diagnostics");
assert.ok(render.includes('Unexpected original scene screenshot dimensions'),"reject partial or invalid compositor images");
assert.ok(render.includes('contrast.every(x=>x<8)'),"uniform empty frames must fail");
assert.ok(!render.includes('animations:"disabled",timeout:30000'),"the known 2026-10-24 failure must not return");
for(const workflow of [once,scheduled]){
 assert.match(workflow,/if: always\(\)/,"upload diagnostics even when the render failed");
 assert.match(workflow,/if-no-files-found: warn/);
 assert.match(workflow,/retention-days: 30/);
}
assert.equal(request.publishToSite,false);
assert.equal(request.autoApprove,false);
assert.ok(request.presets.some(x=>x.page==="earth"&&x.format==="still"));
assert.ok(request.presets.some(x=>x.page==="home"&&x.format==="video"));
console.log("PASS scene screenshot recovery and provenance-preserving diagnostic uploads");
