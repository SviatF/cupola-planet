#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("components/CupolaExperience.tsx","utf8");
const browser=readFileSync(".github/workflows/satellite-live-browser.yml","utf8");

const start=source.indexOf('{controlPanel === "layers" && (');
const end=source.indexOf('{controlPanel === "events" && (',start);
assert.ok(start>=0 && end>start);
const publicLayers=source.slice(start,end);
assert.doesNotMatch(publicLayers,/Satellite surface/,"experimental land toggle must not appear in visitor layers");
assert.doesNotMatch(publicLayers,/satellite-surface-preview/);
assert.match(publicLayers,/label="Clouds"/);
assert.match(publicLayers,/cloudGpuApply\.version/,"visitor must see which V3 version was actually applied");
assert.match(browser,/\.layer-row'\)\.count\(\),10/,"normal controls have 10 public layer rows");
assert.doesNotMatch(browser,/\.layer-row'\)\.count\(\),11/);

assert.match(source,/setSurfaceDiagnostics\(params\.get\("surfaceDebug"\) === "1"\)/);
assert.match(source,/\{surfaceDiagnostics && \(/);
assert.match(source,/aria-label="Technical VIIRS land diagnostics"/);
assert.match(source,/onClick=\{\(\) => setSatelliteSurface\(current => !current\)\}/);
assert.match(source,/props\.satelliteSurface && viirsLandTexture/,"actual daytime Earth must still use verified land overlay");
assert.match(source,/fuseViirsPixels\(/,"retain safe land blending");

const renderer=source.slice(source.indexOf("const publishCanvas = ("),source.indexOf("if (cloudEngine === \"v3\") {",source.indexOf("const publishCanvas")));
assert.match(renderer,/pendingGpuApplyRef\.current/,"3D upload sets pending state");
assert.doesNotMatch(renderer,/cupola-cloud-gpu-applied/,"must not claim GPU applied at data download/texture allocation");
const frame=source.slice(source.indexOf("useFrame(() => {",source.indexOf("const publishCanvas")),source.indexOf("return (\n    <group>",source.indexOf("const publishCanvas")));
assert.match(frame,/atlasTransitionRef\.current/);
assert.match(frame,/announceGpuApplied\(\)/,"report only after fade");
assert.match(frame,/cupola-cloud-gpu-applied/);
assert.match(source,/meta\.version\);/,"version must originate in verified science manifest");
assert.match(source,/kind: cloudEngine === "v3" && atlasVersion \? "verified-l2" : "visual-backup"/,
  "visual backups must never impersonate a verified science atlas");
assert.match(source,/setCloudGpuApply\(/);
assert.match(source,/\bnew Date\(\)\.toISOString\(\)/);
console.log("PASS: opt-in VIIRS inspector, clean public Controls, truthful post-fade GPU telemetry");
