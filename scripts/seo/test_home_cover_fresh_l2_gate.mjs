#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const pub=read(".github/workflows/science-v3-publish.yml");
const capture=read(".github/workflows/cupola-8-12-home-cover-capture.yml");
const render=read("scripts/scene-capture/render.mjs");
const checker=read("scripts/scene-capture/wait-fresh-cloud-v3.mjs");
const request=JSON.parse(read("requests/cupola-8-12-home-cover.json"));
const scientific=read("lib/scene-media/science-gate.mjs");
assert.ok(pub.includes("- 'requests/cupola-8-12-home-cover.json'"),
 "every requested photograph must also start an actual science publish");
assert.ok(pub.includes("gh release upload")&&pub.includes("latest.json"),
 "only the existing real NOAA/JMA verified publisher may refresh the data");
assert.ok(capture.includes("wait-fresh-cloud-v3.mjs"));
assert.ok(capture.indexOf("wait-fresh-cloud-v3.mjs") <
 capture.indexOf("npx playwright install chromium"),
 "fail early rather than waste cloud GPU before science is fresh");
assert.ok(capture.includes('CUPOLA_REQUIRE_SCIENCE_READY: "1"'),
 "home-cover MUST NOT ever save successful visual-backup screenshots");
assert.ok(render.includes("strictlyObserved?300000:25000")&&
 render.includes("CUPOLA_CAPTURE_BLOCKED: fresh Level-2 was not applied on GPU")&&
 render.includes("cloud-v3-gpu-diagnostics.json"));
assert.ok(checker.includes("source?.observation_start") &&
 checker.includes('x-cupola-data-status') &&
 checker.includes("atlas-may-expire-during-capture"));
assert.ok(scientific.includes('cloud.gpuAppliedKind==="verified-l2"'));
assert.equal(request.publishToSite,false);
assert.equal(request.autoApprove,false);
assert.equal(request.scientificReviewRequired,true);
assert.equal(request.visualReviewRequired,true);
assert.ok(!capture.includes("CLOUDFLARE_API_TOKEN")&&!capture.includes("publish-plan-r2"),
 "capture job must never publish R2 objects");
console.log("PASS 8.15: photo request initiates native L2 science and fallback is blocked on GPU");
