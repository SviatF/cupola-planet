#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scene = readFileSync("components/CupolaExperience.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert.match(scene, /type LayerLoadState = \{ phase: "connecting" \| "downloading" \| "preparing" \| "visible" \| "unavailable"/);
assert.match(scene, /const \[satelliteLoad, setSatelliteLoad\] = useState<LayerLoadState \| null>\(null\)/);
assert.match(scene, /load=\{satelliteLoad\}/);
assert.match(scene, /setSatelliteLoad\(next \? \{phase: "connecting"\} : null\)/);
assert.match(scene, /fetch\("\/api\/satellites\?format=compact", \{signal: abort.signal\}\)/);
assert.match(scene, /const length = Number\(response.headers.get\("content-length"\)\)/);
assert.match(scene, /response.body.getReader\(\)/);
assert.match(scene, /received \+= value.byteLength/);
assert.match(scene, /length > 0 && Number.isFinite\(length\) \? Math.min\(99, received \/ length \* 100\) : undefined/,
  "Use only real bytes and known content length for numerical percentage");
assert.match(scene, /const buffer = new Uint8Array\(received\)/);
assert.match(scene, /JSON.parse\(new TextDecoder\(\).decode\(buffer\)\)/);
assert.match(scene, /const candidate = normalizeSnapshot\(data\)/);
assert.match(scene, /requestAnimationFrame\(\(\) => window.requestAnimationFrame\(\(\) => \{/);
assert.match(scene, /report\(\{phase: "visible",percent: 100\}\)/,
  "100% must occur only after acceptance and rendering");
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
console.log("PASS: honest source byte progress, instant warm cache, cancellation, and reduced-motion layer feedback");
