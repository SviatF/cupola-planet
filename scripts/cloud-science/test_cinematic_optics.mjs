#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const viewer = readFileSync("components/CupolaExperience.tsx", "utf8");
const sky = readFileSync("lib/earth/milkyWayShader.ts", "utf8");
const stars = readFileSync("lib/earth/celestialStarShader.ts", "utf8");
const gaia = readFileSync("lib/earth/gaiaSkyShader.ts", "utf8");
const image = readFileSync("public/sky/gaia-edr3-equirect.webp");
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
assert.match(viewer, /<GaiaSkyBackdrop cinematic=\{mode === "CINEMA"\}\s*\/>/);
assert.match(viewer, /loadFailed \? <MilkyWayBackdrop cinematic=\{cinematic\} \/> : null/,
  "Procedural Milky Way only appears after verified texture failure");
assert.match(viewer, /\/sky\/gaia-edr3-equirect\.webp/);
const skyMount = viewer.indexOf('<GaiaSkyBackdrop cinematic={mode === "CINEMA"} />');
const earthSuspense = viewer.indexOf("<Suspense fallback={null}>", viewer.indexOf("<Canvas"));
assert.ok(skyMount >= 0 && earthSuspense > skyMount,
  "Gaia sky must mount outside Earth's scientific-texture Suspense tree");
assert.match(viewer, /image\.colorSpace = THREE\.SRGBColorSpace/);
assert.match(viewer, /image\.minFilter = THREE\.LinearMipmapLinearFilter/);
assert.match(viewer, /name="gaia-edr3-observed-sky"/);
assert.match(gaia, /uniform sampler2D gaiaSkyMap/);
assert.match(gaia, /vec3 east = normalize\(cross\(pole, center\)\)/);
assert.match(gaia, /fract\(0\.5 \+ lon \/ 6\.28318530718\)/);
assert.match(gaia, /0\.5 \+ lat \/ 3\.14159265359/);
assert.match(gaia, /if \(absLatitude > 0\.31\) discard;/,
  "No full-sky white Gaia image: the outer field must be true black");
assert.match(gaia, /float denseSpine = exp\(-pow\(absLatitude \/ 0\.095, 1\.65\)\)/);
assert.match(gaia, /float edgeFade = 1\.0 - smoothstep\(0\.16, 0\.31, absLatitude\)/);
assert.match(gaia, /vec3 neutralised = max\(survey - vec3\(0\.14\), vec3\(0\.0\)\)/,
  "Remove survey RGB floor; do not project a bright image pedestal onto space");
assert.match(gaia, /vec3 colour = min\(vec3\(0\.68\), pow\(neutralised, vec3\(1\.30\)\) \* 0\.76\)/,
  "Compress observed highlights to preserve a dark filmic exposure");
assert.match(gaia, /float alpha = min\(0\.13, galacticBand \* stellarStructure \* coreAccent \* intensity\)/,
  "The image alpha must have an explicit low brightness ceiling");
assert.match(viewer, /cinematic \? 0\.115 : 0\.16/,
  "CINEMA must be deliberately darker than EXPLORE");
assert.doesNotMatch(gaia, /pow\(survey, vec3\(0\.80\)\) \* 1\.48/,
  "Never reintroduce the previous over-brightening transform");
// Numerical smoke check: the maximum alpha and texture gain cannot produce
// the former wide 74%-opacity wall even at the brightest texel.
const maxAlpha=0.13, maxColour=0.68;
assert.ok(maxAlpha*maxColour<0.09);
assert.doesNotMatch(gaia, /float valueNoise\(/,
  "Real Gaia map must replace fake nebula noise");
assert.equal(image.toString("ascii", 0, 4), "RIFF");
assert.equal(image.toString("ascii", 8, 12), "WEBP");
assert.ok(image.length > 100000 && image.length < 1800000,
  "Real Gaia asset is local and within the 1.8MB budget");
assert.match(viewer, /<CelestialStarField cinematic=\{mode === "CINEMA"\}\s*\/>/);
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
const skyBlock = viewer.slice(viewer.indexOf("function MilkyWayBackdrop("), viewer.indexOf("function GaiaSkyBackdrop("));
const gaiaBlock = viewer.slice(viewer.indexOf("function GaiaSkyBackdrop("), viewer.indexOf("function CelestialStarField("));
const starBlock = viewer.slice(viewer.indexOf("function CelestialStarField("), viewer.indexOf("function Scene("));
for (const [label, block] of [["Fallback Milky Way",skyBlock],["ESA Gaia",gaiaBlock],["stellar field",starBlock]]) {
  assert.match(block, /depthTest=\{true\}/, label+" must be depth-occluded by Earth");
  assert.match(block, /depthWrite=\{false\}/,label+" cannot corrupt the depth buffer");
  assert.doesNotMatch(block, /depthTest=\{false\}/,label+" must never ignore foreground geometry");
}
assert.match(viewer, /metropolitanCluster\*0\.055/);
assert.match(viewer, /const \[cloudEngine, setCloudEngine\] = useState<CloudEngine>\("v3"\)/);
assert.match(viewer, /initialCloudBlendStartRef\.current = performance\.now\(\)/);
console.log("PASS: local real ESA Gaia WebP, Galactic UV orientation, occlusion, fallback and unchanged science");
