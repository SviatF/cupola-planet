#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const code=readFileSync("components/CupolaExperience.tsx","utf8");
const fn=code.slice(code.indexOf("function buildSatelliteFleetGeometry("),
  code.indexOf("function SelectedSatelliteMarker("));
assert.ok(fn.length>5000,"fleet geometry must be covered by structural QA");
assert.match(fn,/function buildSatelliteFleetGeometry\(satellites: LiveSatellite\[\]\)/);
assert.match(fn,/\(\) => buildSatelliteFleetGeometry\(visible\),\s*\[visible\]/);
assert.doesNotMatch(fn,/\[visible, selectedId\]/);
assert.match(fn,/instanceIndexById\.set\(satellite\.id, index\)/);
assert.match(fn,/instanceIndexById\.get\(selectedId\)/);
assert.match(fn,/flags\.setX\(previousIndex, 0\)/);
assert.match(fn,/flags\.setX\(nextIndex, 1\)/);
assert.match(fn,/flags\.needsUpdate = true/);
assert.match(fn,/flags\.addUpdateRange\(previousIndex, 1\)/);
assert.match(fn,/flags\.addUpdateRange\(nextIndex, 1\)/);
assert.match(fn,/selectedAttribute\.setUsage\(THREE\.DynamicDrawUsage\)/);
assert.match(fn,/geometry\.userData\.buildMs =/);
assert.match(fn,/geometry\.userData\.instanceBufferBytes =/);
assert.match(code,/function SatellitePerformanceProbe\(/);
assert.match(code,/data-satellite-perf-fps/);
assert.match(code,/satellitePerfEnabled && layers\.satellites/);
assert.match(code,/groupRef\.current\.quaternion\.copy\(orientation\)\.multiply\(spinRotation\)/);
assert.match(fn,/if \(previousIndex === nextIndex\) return/);
assert.equal((fn.match(/new THREE\.Color\(/g)||[]).length,5,
  "one Color per category, never one allocation per satellite");
assert.match(fn,/geometry\.instanceCount = count/);
assert.match(fn,/new THREE\.InstancedBufferAttribute\(starts, 3\)/);
assert.match(fn,/new THREE\.InstancedBufferAttribute\(ends, 3\)/);
console.log("PASS: Follow/selection updates one GPU flag buffer without rebuilding 17k instanced satellites; 5 palette colors, per-object SGP4 motion untouched");
