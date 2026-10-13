#!/usr/bin/env node
/**
 * Small regression guard for production first paint and Cinema mode changes.
 * Browser E2E still verifies actual GPU rendering and data provenance.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const component=readFileSync("components/CupolaExperience.tsx","utf8");
const shader=readFileSync("lib/earth/liveCloudShader.ts","utf8");
assert.match(component,/\[staticCloudTexture, dayTexture, sunDirection\]\)/,
  "Cinema should not recreate the texture-fetch uniforms object");
assert.doesNotMatch(component,/cloudEngine=\{mode === "CINEMA" \? "legacy" : cloudEngine\}/,
  "Cinema must not unload/reload the V3 observations");
assert.match(component,/\<Scene cloudEngine=\{cloudEngine\}/,
  "manual legacy override remains available without forcing it in Cinema");
assert.match(component,/initialCloudBlendStartRef\.current = performance\.now\(\)/,
  "first observed V3 atlas must fade onto the GPU instead of popping in");
assert.match(component,/invalidate\(\);/,
  "explicitly request a render when asynchronous satellite data arrives");
assert.match(component,/const pendingGmgsi = scienceImage && useGmgsi/,
  "IR network request must start in parallel with WMS");
assert.match(component,/const pendingGfs = scienceImage && useGlobalModel/,
  "GFS request must start in parallel with WMS");
assert.match(component,/await pendingGmgsi/);
assert.match(component,/await pendingGfs/);
assert.equal((shader.match(/uniform float cloudIntroBlend;/g)||[]).length,2,
  "both clouds and ground shadows must use the same first-paint opacity");
assert.equal((shader.match(/staticCloudSignal\(texture2D\(staticCloudTexture, uv\)\)/g)||[]).length,2,
  "no empty cloud sphere before first observed atlas");
assert.match(shader,/mix\(preview, clamp\(visible, 0\.0, 1\.0\), clamp\(cloudIntroBlend/);
assert.match(shader,/mix\(preview, observed, clamp\(cloudIntroBlend/);
console.log("PASS: V3 first paint, Cinema persistence, parallel metadata, GPU placeholder");
