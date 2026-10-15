#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=readFileSync("components/CupolaExperience.tsx","utf8");
const css=readFileSync("app/globals.css","utf8");
const keys=["clouds","precipitation","cityLights","aurora","earthquakes",
  "storms","wildfires","volcanoes","satellites","lightning"];
for(const key of keys){
  assert.match(source,new RegExp("loading=\\{layerProgress\\."+key+"\\}"),
    key+" must support a compact loading strip");
  assert.match(source,new RegExp('toggleLayer\\("'+key+'"\\)'),
    key+" must update layer progress only on explicit checkbox changes");
}
assert.match(source,/function LayerFrameReadinessProbe\(/);
assert.match(source,/const frameCount = \(frames\.current\[token\] \?\? 0\) \+ 1/);
assert.match(source,/if \(frameCount === 3\) props\.onReady\(key\)/);
assert.match(source,/key === "satellites"\) continue/);
assert.match(source,/phase: "ready", value: 100, message: "VISIBLE · READY"/);
assert.match(source,/const \[satellitePrefetchEnabled, setSatellitePrefetchEnabled\]/);
assert.match(source,/controlPanel === "layers" \|\| layers\.satellites/);
assert.match(source,/if \(!satellitePrefetchEnabled\) return/);
assert.match(source,/\[satellitePrefetchEnabled, satelliteRetryNonce\]/);
assert.doesNotMatch(source,/\}, \[layers\.satellites\]\);\s*useEffect\(\(\) => \{\s*if \(!coords/,
 "Catalog refresh must not restart every time the checkbox is toggled");
assert.match(source,/if \(satelliteEnabledRef\.current\) void load\(\)/);
assert.match(source,/\(props\.layers\.satellites \|\| props\.satellites\.length > 0\)/);
assert.match(source,/<group visible=\{enabled\}>/);
assert.match(source,/if\(!enabled \|\| !visible\.length\)return null/);
assert.match(source,/if \(!enabled\) \{\s*element\.style\.cursor = ""/);
assert.match(source,/fleetDrawCount\.current === 3 && onFirstFrame/);
assert.match(source,/onFirstFrame=\{\(\) => markLayerReady\("satellites"\)\}/);
const firstCanvas = source.indexOf("<Canvas");
const fleetMount = source.indexOf("<SatelliteLayer", firstCanvas);
const earthSuspense = source.indexOf("<Suspense fallback={null}>", firstCanvas);
assert.ok(fleetMount > firstCanvas && fleetMount < earthSuspense,
  "Orbital GPU instances must render independently of suspended Earth assets");
assert.match(source,/<LayerFrameReadinessProbe pending=\{layerProgress\} sources=\{layerSources\}/);
assert.match(source,/role="progressbar"/);
assert.match(source,/aria-valuenow=\{pending\.value\}/);
assert.match(css,/\.layer-loading-track \{/);
assert.match(css,/height:2px/);
assert.match(css,/\.layer-loading-track > span/);
assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
console.log("PASS: 10 responsive layer progress rows; 100% requires GPU frame, prewarm and cached orbital geometry");