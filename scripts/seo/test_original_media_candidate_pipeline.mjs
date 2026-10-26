#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const workflow=fs.readFileSync(".github/workflows/cupola-original-scene-candidates.yml","utf8");
const assets=JSON.parse(fs.readFileSync("data/editorial/scene-assets.json","utf8"));
assert.ok(workflow.includes("schedule:")&&workflow.includes("workflow_dispatch:"));
assert.ok(workflow.includes('cron: "17 5 * * *"'));
assert.ok(workflow.includes("verify-candidate.mjs"));
assert.ok(workflow.includes("actions/upload-artifact@v4"));
assert.ok(workflow.includes("CUPOLA_CAPTURE_TYPE: still"));
assert.ok(!workflow.includes("contents: write")&&!workflow.includes("wrangler r2")&&!workflow.includes("aws s3 cp"));
assert.ok(Array.isArray(assets.assets));
assert.ok(assets.assets.every(a=>a.approved===true&&a.origin==="CUPOLA_CAPTURE_ENGINE"),
  "pre-approved media must come from separate human-reviewed production, not scheduled candidates");
console.log("PASS CUPOLA 8.5: scheduled original-scene candidates cannot auto-publish; separately approved assets are allowed");
