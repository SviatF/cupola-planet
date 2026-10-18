#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const helpers=ts.transpileModule(readFileSync("lib/earth/solarCinematic.ts","utf8"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const {solarBillboardWorldRadius,SOLAR_CORE_RADIUS_UV,SOLAR_ANGULAR_RADIUS_RAD,
  SOLAR_FRAGMENT_SHADER,SOLAR_VERTEX_SHADER,SOLAR_VIEW_CAMERA_DISTANCE,
  SOLAR_VIEW_LIMB_ANGLE_RAD}=await import("data:text/javascript,"+encodeURIComponent(helpers));
const viewer=readFileSync("components/CupolaExperience.tsx","utf8");
const sunlight=viewer.slice(viewer.indexOf("function SunVisual({moonDistanceFactor,fromEarth}"),viewer.indexOf("type CloudDebugMode"));
const solarView=viewer.slice(viewer.indexOf('if (props.view === "GEOSTATIONARY") camera.position'),viewer.indexOf("}, [props.view, props.mode]);"));

for(const distance of [6,9,16,28,56]){
  const scale=solarBillboardWorldRadius(distance);
  const angularRadius=Math.atan(scale*SOLAR_CORE_RADIUS_UV/distance);
  assert.ok(Math.abs(angularRadius-SOLAR_ANGULAR_RADIUS_RAD)<1e-10,
    "physical solar angular size must be invariant under Earth camera zoom");
}
assert.equal(solarBillboardWorldRadius(-4),0);
assert.equal(solarBillboardWorldRadius(Number.NaN),0);
assert.ok(SOLAR_VIEW_CAMERA_DISTANCE>4.3+0.6);
assert.ok(SOLAR_VIEW_LIMB_ANGLE_RAD>0.65 && SOLAR_VIEW_LIMB_ANGLE_RAD<0.75);
assert.match(SOLAR_FRAGMENT_SHADER,/precision highp float/);
assert.match(SOLAR_FRAGMENT_SHADER,/float disc = 1\.0 - smoothstep/);
assert.match(SOLAR_FRAGMENT_SHADER,/float corona =/);
assert.match(SOLAR_FRAGMENT_SHADER,/uniform float uGaze/);
assert.match(SOLAR_FRAGMENT_SHADER,/uniform float uVisibility/);
assert.match(SOLAR_FRAGMENT_SHADER,/opacity \* uVisibility/,
  "Solar glare must vanish when occulted by the Moon");
assert.match(SOLAR_FRAGMENT_SHADER,/r > 1\.0\) discard/);
assert.match(SOLAR_VERTEX_SHADER,/gl_Position/);
assert.doesNotMatch(SOLAR_FRAGMENT_SHADER,/uTime|sin\(uTime|frameIndex/,"No procedural flashing strobe");
assert.match(sunlight,/getSunDirection\(utcNow\)/);
assert.match(sunlight,/moonSunVisibility\(camera\.position,renderedMoon/,
  "Moon must geometrically mask solar image using shared camera and 3D Moon");
assert.match(sunlight,/camera\.position\.distanceTo\(group\.current\.position\)/);
assert.match(sunlight,/solarBillboardWorldRadius\(distance\)/);
assert.match(sunlight,/THREE\.MathUtils\.damp/);
assert.match(sunlight,/depthTest=\{true\}/,"Earth MUST mask the Sun when occulted");
assert.match(sunlight,/depthWrite=\{false\}/,"Glow MUST NOT occlude Earth");
assert.match(sunlight,/fog=\{false\}/,"Distant Sun cannot vanish in 7..15 scene fog");
assert.match(sunlight,/blending=\{THREE\.AdditiveBlending\}/);
assert.match(sunlight,/toneMapped=\{false\}/);
assert.match(viewer, /equationOfTimeMinutes = 229\.18/);
assert.match(viewer, /subSolarLongitude = THREE\.MathUtils\.euclideanModulo/);
assert.match(viewer, /<SunVisual moonDistanceFactor=\{props\.moonDistanceFactor\}/);
assert.match(viewer, /<directionalLight ref=\{sunLight\}/);
assert.match(viewer, /<StableBloomEffect mode=\{props\.mode\} \/>/);
assert.equal((viewer.match(/<EffectComposer/g)||[]).length,1,"One bloom pass; avoid second expensive postprocessing pipeline");
assert.equal((viewer.match(/<SunVisual moonDistanceFactor=/g)||[]).length,1,"No double Sun sprites");
assert.match(solarView,/props\.view === "SUN VIEW"/);
assert.match(solarView,/SOLAR_VIEW_LIMB_ANGLE_RAD/);
assert.match(solarView,/SOLAR_VIEW_CAMERA_DISTANCE/);
assert.match(solarView,/props\.view === "SUN–EARTH L1"\) \{/);
assert.match(solarView,/camera\.position\.copy\(GLOBE_CENTER\)\.addScaledVector\(solarDirection, GLOBE_RADIUS \+ 5\.8\)/);
assert.doesNotMatch(solarView,/camera\.position\.set\(-0\.9, 0\.25, 7\.7\)/);
assert.match(viewer, /"SUN VIEW"\] as ViewMode\[\]/);
assert.match(viewer, /props\.view === "SUN VIEW"\) return/);
assert.match(viewer, /getSunDirection\(new Date\(\)\)/);
assert.match(viewer, /<LiveCloudLayer/,"No changes to Cloud V3 rendering graph");
console.log("PASS: angular-Sun, camera gaze, physical-depth eclipse, far fog exclusion, NOAA equation of time and one-pass bloom");
