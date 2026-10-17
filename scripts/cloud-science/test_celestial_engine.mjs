#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const src=readFileSync("lib/earth/celestialEngine.ts","utf8");
const js=ts.transpileModule(src,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const C=await import("data:text/javascript,"+encodeURIComponent(js));
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
const solar=readFileSync("lib/earth/solarCinematic.ts","utf8");
const date=(s)=>new Date(s);
const earth={x:0,y:0,z:0};
const six=[date("2024-04-08T18:17:00Z"),date("2026-08-12T17:45:00Z"),
  date("2026-10-17T12:00:00Z"),date("2020-12-14T16:00:00Z")];
for(const instant of six){
  const x=C.celestialAt(instant);
  assert.equal(x.accuracy,"ANALYTICAL_PREVIEW");
  assert.equal(x.at,instant.toISOString());
  assert.ok(x.sun.distanceKm>147_000_000 && x.sun.distanceKm<153_000_000);
  assert.ok(x.moon.distanceKm>355_000 && x.moon.distanceKm<408_000);
  assert.ok(x.sun.angularRadiusDeg>.25 && x.sun.angularRadiusDeg<.275);
  assert.ok(x.moon.angularRadiusDeg>.235 && x.moon.angularRadiusDeg<.29);
  assert.ok(Math.abs(C.norm(x.moon.earthFixedKm)-x.moon.distanceKm)<1e-6);
  assert.ok(Math.abs(C.norm(x.sun.earthFixedKm)-x.sun.distanceKm)<1e-5);
  assert.ok(x.moonIlluminatedFraction>=0 && x.moonIlluminatedFraction<=1);
  assert.ok(Number.isFinite(C.eclipseAt(x,earth).obscuration));
}
// Low-order lunar theory must remain within its DECLARED preview error band.
// Independent reference: Swiss Ephemeris Moshier geocentric ecliptic on UTC.
// 2024 Apr-08 and 2026 Aug-12 are real eclipse days, but no local contact-time
// claim is allowed until a high-precision DE440 or equivalent validation.
assert.ok(C.eclipseAt(C.celestialAt(six[0]),earth).separationDeg<2.0);
assert.ok(C.eclipseAt(C.celestialAt(six[1]),earth).separationDeg<2.0);
const newMoon=C.celestialAt(date("2024-04-08T18:17:00Z"));
assert.ok(newMoon.moonIlluminatedFraction<.015);
const fullMoon=C.celestialAt(date("2024-03-25T07:00:00Z"));
assert.ok(fullMoon.moonIlluminatedFraction>.98);

const state=C.celestialAt(six[2]);
const mock=(sunKm,moonKm,sunR,moonR)=>({
  ...state,sun:{...state.sun,earthFixedKm:{x:sunKm,y:0,z:0}},
  moon:{...state.moon,earthFixedKm:{x:moonKm,y:0,z:0}}
});
const total=C.eclipseAt(mock(150_000_000,365_000),earth);
assert.equal(total.kind,"total");assert.equal(total.obscuration,1);
const annular=C.eclipseAt(mock(150_000_000,407_000),earth);
assert.equal(annular.kind,"annular");
assert.ok(annular.obscuration<1 && annular.obscuration>.5);
const partial=C.eclipseAt({
 ...state, sun:{...state.sun,earthFixedKm:{x:150_000_000,y:0,z:0}},
 moon:{...state.moon,earthFixedKm:{x:385_000*Math.cos(.006),y:385_000*Math.sin(.006),z:0}}
},earth);
assert.equal(partial.kind,"partial");
assert.ok(partial.obscuration>0 && partial.obscuration<1);
const none=C.eclipseAt({
 ...state, sun:{...state.sun,earthFixedKm:{x:150_000_000,y:0,z:0}},
 moon:{...state.moon,earthFixedKm:{x:0,y:385_000,z:0}}
},earth);
assert.equal(none.kind,"none");assert.equal(none.obscuration,0);
assert.ok(Math.abs(C.kmToScene(C.EARTH_RADIUS_KM,4.3)-4.3)<1e-9);
assert.ok(Math.abs(C.kmToScene(C.MOON_RADIUS_KM,4.3)-1.1727)<.005);
assert.ok(Math.abs(C.kmToScene(C.MEAN_MOON_DISTANCE_KM,4.3)-259.5)<2);

assert.match(scene,/function MoonVisual\(\)/);
assert.match(scene,/function EclipseShadowPreview\(\)/);
assert.match(scene,/<MoonVisual \/>/);
assert.match(scene,/<EclipseShadowPreview \/>/);
assert.match(scene,/SUN_PROXY_SCENE_DISTANCE=650/);
assert.match(scene,/position\.copy\(camera\.position\)\.addScaledVector\(sun, SUN_PROXY_SCENE_DISTANCE\)/);
assert.match(scene,/perspective\.far = 960/);
assert.match(scene,/far: 960/);
assert.match(scene,/moonWorldPosition\(new Date\(\)\)/);
assert.match(scene,/props\.view === "MOON"/);
assert.match(scene,/getCelestial\(now\)/);
assert.match(scene,/ANALYTICAL PREVIEW · NOT VERIFIED ECLIPSE CONTACT TIMES/);
assert.match(scene,/LUNAR SURFACE: ILLUSTRATIVE/);
assert.match(scene,/const lunarTransmission=1-0\.995\*eclipse\.obscuration/);
assert.match(scene,/eclipseAt\(e,\{x:0,y:0,z:0\}\)\.separationDeg<2\.0/);
assert.match(scene,/earthFixedToWorld\(getCelestial\(date\)\.sun\.earthFixedKm\)/);
assert.match(scene,/<SunVisual \/>/);
assert.match(scene,/<LiveCloudLayer/);
assert.equal((scene.match(/<EffectComposer/g)||[]).length,1);
assert.match(solar,/SOLAR_CORE_RADIUS_UV = 0\.063/);
console.log("PASS: actual Sun/Moon km geometry, physical angles, UTC phase, eclipse total/annular/partial/none, camera and shader provenance");
