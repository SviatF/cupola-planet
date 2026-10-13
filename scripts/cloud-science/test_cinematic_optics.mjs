#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const viewer = readFileSync("components/CupolaExperience.tsx", "utf8");
const sky = readFileSync("lib/earth/milkyWayShader.ts", "utf8");
assert.match(sky, /uniform vec3 galacticPole/);
assert.match(sky, /float wide = exp/);
assert.match(viewer, /function galacticPoleNow\(date: Date\)/);
assert.match(viewer, /lastUpdated\.current < 60/);
assert.match(viewer, /<MilkyWayBackdrop cinematic=\{props.mode === "CINEMA"\}/);
assert.match(viewer, /metropolitanCluster\*0\.055/);
assert.match(viewer, /const \[cloudEngine, setCloudEngine\] = useState<CloudEngine>\("v3"\)/);
assert.match(viewer, /initialCloudBlendStartRef\.current = performance\.now\(\)/);
console.log("PASS: subtle galactic background, light halos, unchanged default Cloud V3");
