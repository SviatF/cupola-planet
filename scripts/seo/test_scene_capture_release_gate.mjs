#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const gate=read("scripts/scene-capture/wait-production-release.mjs");
assert.match(gate,/x-cupola-revision/);
assert.match(gate,/expected\+sha|observed===sha/);
assert.match(gate,/method:"HEAD"/);
assert.match(gate,/CUPOLA_DEPLOYED_SHA_NOT_READY/);
assert.match(gate,/cache:"no-store"/);
assert.doesNotMatch(gate,/CLOUDFLARE_API_TOKEN|GITHUB_TOKEN|publish-plan-r2/);
for(const path of [
 ".github/workflows/cupola-7-5-original-scene-media.yml",
 ".github/workflows/cupola-original-scene-candidates.yml",
 ".github/workflows/cupola-scene-capture.yml"
]){
 const s=read(path);
 assert.match(s,/wait-production-release\.mjs/,path+" must verify live deploy");
 assert.ok(s.indexOf("wait-production-release.mjs")<s.indexOf("npx playwright install chromium"),
  path+" must fail fast before installing the GPU browser");
 assert.match(s,/CUPOLA_RELEASE_WAIT_MS:/,path+" requires bounded rollout window");
 assert.match(s,/contents: read/);
}
const render=read("scripts/scene-capture/render.mjs");
assert.match(render,/\.playwright-recording-/,"video source must use quarantined directory");
assert.match(render,/await fs\.rm\(scratchVideoDir/,"raw video must be removed even on failure");
assert.match(render,/Page\.captureScreenshot/);
assert.match(render,/animations:"allow"/);
console.log("PASS CUPOLA 8.7 deployment SHA preflight and WebM scratch isolation");
