#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
const viewer = readFileSync("components/CupolaExperience.tsx", "utf8");
const sky = readFileSync("lib/earth/milkyWayShader.ts", "utf8");
const stars = readFileSync("lib/earth/celestialStarShader.ts", "utf8");
// The observed Gaia EDR3 map must be bundled — never silently ship the old
// noisy procedural shader as the only option or fetch the 3.7MB original.
const mapPath = "public/astro/gaia-edr3-sky.webp";
assert.ok(existsSync(mapPath), "The optimized licensed Gaia equirectangular map must be committed");
assert.ok(statSync(mapPath).size < 900_000, "Keep the full sky within the low-bandwidth asset budget");
const assetHead = readFileSync(mapPath).subarray(0,12);
assert.equal(assetHead.toString("ascii",0,4),"RIFF");
assert.equal(assetHead.toString("ascii",8,12),"WEBP");
assert.match(sky,/uniform sampler2D gaiaSky/);
assert.match(sky,/uniform float gaiaAvailable/);
assert.match(sky,/uniform float gaiaIntensity/);
assert.match(sky,/gaiaAvailable > 0\.5/);
assert.match(sky,/vec2 uv = vec2\(fract\(0\.5 - longitude \/ 6\.2831853\)/);
assert.match(sky,/texture2D\(gaiaSky, uv\)/);
assert.match(viewer,/new THREE\.TextureLoader\(\)/);
assert.match(viewer,/loader\.load\("\/astro\/gaia-edr3-sky\.webp"/);
assert.match(viewer,/document\.documentElement\.dataset\.gaiaSky = "observed"/);
assert.match(viewer,/actualTexture\?\.dispose\(\)/);
assert.match(viewer,/gaiaSky: \{ value: null as THREE\.Texture \| null \}/);
assert.match(viewer,/texture\.colorSpace = THREE\.SRGBColorSpace/);
assert.match(viewer,/ESA \/ GAIA \/ DPAC/);
assert.match(viewer,/CC BY-SA 3\.0 IGO/);
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
assert.match(sky, /float darkLane =/);
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
assert.doesNotMatch(viewer, /const bright = index % 149 === 0/);
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
console.log("PASS: licensed observed Gaia panorama, sidereal projection, lazy texture fallback, bright stars, Earth depth occlusion, unchanged science clouds");
