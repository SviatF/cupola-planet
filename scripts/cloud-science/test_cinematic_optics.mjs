#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const viewer = readFileSync("components/CupolaExperience.tsx", "utf8");
const sky = readFileSync("lib/earth/milkyWayShader.ts", "utf8");
const stars = readFileSync("lib/earth/celestialStarShader.ts", "utf8");
assert.match(sky, /uniform vec3 galacticPole/);
assert.match(sky, /uniform vec3 galacticCenter/);
assert.match(sky, /precision highp float/);
assert.match(sky, /float wide = exp/);
assert.match(sky, /if \(latitude > 0\.235\) discard;/,
  "Haze must be fully absent away from the Galactic plane");
assert.match(sky, /latitude \/ 0\.108/,
  "Narrow the broad Galactic gradient; no screen-wide grey band");
assert.match(sky, /latitude \/ 0\.036/,
  "Bright Galactic spine must be spatially localized");
assert.match(sky, /float laneDistance = abs\(signedLatitude - bend\)/,
  "Dark, meandering dust channels must structure the stellar band");
assert.match(sky, /float opacity = min\(0\.047, glow \* intensity\)/,
  "Limit broad dust haze opacity so the star points dominate");
assert.match(sky, /float valueNoise\(vec3 p\)/);
assert.match(sky, /f = f \* f \* \(3\.0 - 2\.0 \* f\)/,
  "Galaxy noise must interpolate across cells instead of showing square tiles");
assert.match(sky, /darkDust/);
assert.doesNotMatch(sky, /grain\(floor\(d/, "Remove cellwise unfiltered patch noise");
assert.match(viewer, /function galacticPoleNow\(date: Date\)/);
assert.match(viewer, /function galacticCenterNow\(date: Date\)/);
assert.match(viewer, /lastUpdated\.current < 60/);
assert.match(viewer, /<MilkyWayBackdrop cinematic=\{props\.mode === "CINEMA"\}/);
assert.match(viewer, /<CelestialStarField cinematic=\{props\.mode === "CINEMA"\}/);
assert.doesNotMatch(viewer, /<Stars\b/, "The previous artificial-twinkling Drei sprite field must be replaced");
assert.match(viewer, /function CelestialStarField\(/);
assert.match(viewer, /const total = 5200/);
assert.match(viewer, /const bright = index % 89 === 0/);
assert.match(viewer, /const medium = !bright && index % 11 === 0/);
assert.match(viewer, /cinematic \? 1\.13 : 0\.96/);
assert.match(viewer, /cinematic \? 0\.074 : 0\.055/);
assert.match(viewer, /const bright = index % 149 === 0/);
assert.match(viewer, /geometry\.setAttribute\("starTemperature"/);
assert.match(stars, /gl_PointCoord/);
assert.match(stars, /gl_PointSize = clamp\(starSize \* min\(1\.8, pixelRatio\), 1\.7, 8\.0\)/);
assert.match(stars, /float core = 1\.0 - smoothstep\(0\.055, 0\.31, r2\)/,
  "Distinct stellar core should replace diffuse gaussian spots");
assert.match(stars, /if \(r2 > 1\.0\) discard/,"Stars must be circular, not square sprites");
assert.match(stars, /starLuminance/);
assert.match(stars, /starTemperature/);
assert.match(stars, /precision highp float/);
const skyBlock = viewer.slice(viewer.indexOf("function MilkyWayBackdrop("), viewer.indexOf("function CelestialStarField("));
const starBlock = viewer.slice(viewer.indexOf("function CelestialStarField("), viewer.indexOf("function Scene("));
for (const [label, block] of [["Milky Way",skyBlock],["stellar field",starBlock]]) {
  assert.match(block, /depthTest=\{true\}/, label+" must be depth-occluded by Earth");
  assert.match(block, /depthWrite=\{false\}/,label+" cannot corrupt the depth buffer");
  assert.doesNotMatch(block, /depthTest=\{false\}/,label+" must never ignore foreground geometry");
}
assert.match(viewer, /metropolitanCluster\*0\.055/);
assert.match(viewer, /const \[cloudEngine, setCloudEngine\] = useState<CloudEngine>\("v3"\)/);
assert.match(viewer, /initialCloudBlendStartRef\.current = performance\.now\(\)/);
console.log("PASS: narrow structured Galaxy, bright 5.2k stellar points, and Earth depth occlusion; unchanged scientific clouds");
