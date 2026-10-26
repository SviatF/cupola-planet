#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";
const read=p=>fs.readFileSync(p,"utf8");
const publisher=read(".github/workflows/cupola-reviewed-media-publish.yml");
const candidate=read(".github/workflows/cupola-original-scene-candidates.yml");
const render=read("scripts/scene-capture/render.mjs");
const cfg=read("next.config.ts");
const reviews=JSON.parse(read("data/editorial/scene-reviews.json"));
assert.equal(reviews.schemaVersion,1);
assert.ok(Array.isArray(reviews.reviews),"explicit review registry required");
assert.match(publisher,/workflow_dispatch:/);
assert.doesNotMatch(publisher,/\bschedule:/);
assert.match(publisher,/environment: cupola-media-publication/);
assert.match(publisher,/actions\/download-artifact@v4/);
assert.match(publisher,/prepare-publication\.mjs/);
assert.match(publisher,/publish-plan-r2\.mjs/);
assert.match(publisher,/gh pr create/);
assert.doesNotMatch(publisher,/gh pr merge|git push origin main/);
assert.match(candidate,/permissions:\s*\n\s*contents: read/);
assert.doesNotMatch(candidate,/CLOUDFLARE_API_TOKEN|publish-plan-r2/);
assert.match(render,/videoSha256=createHash\("sha256"\)/);
assert.match(render,/data-cloud-gpu-applied-kind/);
assert.match(cfg,/x-cupola-revision/);
assert.match(cfg,/git",\["rev-parse","HEAD"\]/);
const upload=read("scripts/scene-capture/publish-plan-r2.mjs");
assert.match(upload,/"--remote"/);
assert.match(upload,/CLOUDFLARE_API_TOKEN/);
assert.match(upload,/CUPOLA_R2_BUCKET/);
const staging=read("scripts/scene-capture/prepare-publication.mjs");
for(const s of ["scienceApproved","editorialApproved","sceneRevision","heroSha256","sourceObservedAt","next-scene-assets.json"]){
 assert.ok(staging.includes(s),"publication must check "+s);
}
const outcome=spawnSync(process.execPath,["scripts/scene-capture/prepare-publication.mjs"],{encoding:"utf8"});
assert.notEqual(outcome.status,0,"publication without a reviewed candidate must fail closed");
console.log("PASS 8.5 manual-only, science-reviewed R2 publication and immutable asset manifest gates");
