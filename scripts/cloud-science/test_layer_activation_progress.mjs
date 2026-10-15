#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scene = readFileSync("components/CupolaExperience.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert.match(scene, /type LayerLoadState = \{ phase: "connecting" \| "downloading" \| "preparing" \| "visible" \| "unavailable"/);
assert.match(scene, /const \[satelliteLoad, setSatelliteLoad\] = useState<LayerLoadState \| null>\(null\)/);
assert.match(scene, /load=\{satelliteLoad\}/);
assert.match(scene, /setSatelliteLoad\(next \? \{phase: alreadyPrepared \? "preparing" : "connecting"\} : null\)/);
assert.match(scene, /fetch\("\/api\/satellites\?format=compact", \{signal: abort.signal\}\)/);
assert.match(scene, /const encoded = response.headers.get\("content-encoding"\)/);
assert.match(scene, /const length = !encoded \|\| encoded === "identity"/,
  "Numerical progress is invalid when transfer length covers compressed bytes");
assert.match(scene, /response.body.getReader\(\)/);
assert.match(scene, /received \+= value.byteLength/);
assert.match(scene, /length > 0 && Number.isFinite\(length\) \? Math.min\(99, received \/ length \* 100\) : undefined/,
  "Use only real bytes and known content length for numerical percentage");
assert.match(scene, /const buffer = new Uint8Array\(received\)/);
assert.match(scene, /JSON.parse\(new TextDecoder\(\).decode\(buffer\)\)/);
assert.match(scene, /const candidate = normalizeSnapshot\(data\)/);
assert.match(scene, /const readyNotified = useRef\(false\)/);
assert.match(scene, /if \(!enabled \|\| !materialRef\.current \|\| !visible\.length\) return;/);
assert.match(scene, /window\.requestAnimationFrame\(\(\) => onReady\?\.\(\)\)/);
assert.match(scene, /onReady=\{\(\) => setSatelliteLoad\(current =>/);
assert.match(scene, /generation=\{satelliteActivation\}/);
assert.match(scene, /controlPanel === "layers" \|\| layers\.satellites/,
  "Opening Layers should prewarm the source without affecting first Earth paint");
assert.match(scene, /if \(!satellitePrefetchEnabled\) return;/);
assert.match(scene, /\}, \[satellitePrefetchEnabled\]\);/,
  "Toggling a checkbox must not cancel an inflight orbital prefetch");
assert.match(scene, /if \(satelliteVisibleRef\.current\) void load\(\);/,
  "Background prefetch must not poll 16k objects while disabled");
assert.match(scene, /readyNotified\.current = false;/);
assert.match(scene, /\}, \[enabled, generation\]\);/,
  "Rapid toggles must reset GPU frame acknowledgement even when React batches them");
assert.match(scene, /\(layers\.satellites \|\| !!satelliteData\?\.satellites\.length\)/,
  "Reuse a hidden instanced GPU fleet and avoid repeated 16k geometry uploads");
const canvasIndex=scene.indexOf("<Canvas");
const fleetIndex=scene.indexOf("<SatelliteLayer",canvasIndex);
const earthSuspendIndex=scene.indexOf("<Suspense fallback={null}>",canvasIndex);
assert.ok(canvasIndex>=0 && fleetIndex>canvasIndex && earthSuspendIndex>fleetIndex,
  "Satellite fleet should mount independently of suspended Earth textures");
assert.match(scene,/if\(!enabled \|\| !visible\.length\)return null/,
  "A hidden fleet must not capture pointer selection");

assert.match(scene, /<group visible=\{enabled\}>/);
assert.match(scene, /\{phase: "visible",\s*percent: 100\}/,
  "100% must be emitted by a populated GPU fleet, never merely by download completion");
assert.match(scene, /abort.abort\(\)/);
assert.match(scene, /const \[applied, setApplied\] = useState<LayerLoadState \| null>\(null\)/,
  "All lightweight layer toggles should show application feedback");
assert.match(scene, /props.load \?\? applied/);
assert.match(scene, /phase === "unavailable"/);
assert.match(scene, /aria-valuenow=\{progress != null \? Math.round\(progress\) : undefined\}/);
assert.match(scene, /hasUsableCache = true/);
assert.match(scene, /if \(!hasUsableCache\) report\(\{phase: "unavailable"\}\)/,
  "Never label an already-rendered healthy cache unavailable after background refresh errors");
assert.match(css, /\.layer-load-detail/);
assert.match(css, /\.layer-load-track\.indeterminate/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(scene, /setInterval\(\(\) => setSatelliteLoad/,
  "Never animate a fictitious 0..100 percentage");
assert.doesNotMatch(scene, /setTimeout\(\(\) => setSatelliteLoad\(\{ phase: "visible"/,
  "Do not mark catalog loaded after a random timeout");
console.log("PASS: actual streamed satellite bytes, reusable orbit catalog, render-confirmed 100%, and layer activation status");
