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
// Independent Swiss Ephemeris/Moshier benchmark values (geocentric
// ecliptic) as a tolerance test for this intentionally low-order Moon theory.
// The bound is NOT adequate for precise local eclipse contact predictions.
for(const [instant,longitude,km] of [
  ["2024-04-08T18:17:00Z",19.359704,359802.791],
  ["2026-08-12T17:45:00Z",140.115808,366972.523],
  ["2026-10-17T12:00:00Z",281.367863,404494.455],
]){
  const m=C.celestialAt(date(instant)).moon;
  const delta=Math.abs(((m.eclipticLongitudeDeg-longitude+540)%360)-180);
  assert.ok(delta<0.15,"Moon longitude outside declared analytical preview range: "+instant+" "+delta);
  assert.ok(Math.abs(m.distanceKm-km)<500,"Moon distance outside preview tolerance: "+instant);
}
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

assert.match(scene,/function MoonVisual\(\{detailed\}/);
assert.match(scene,/function EclipseShadowPreview\(\)/);
assert.match(scene,/<MoonVisual detailed=\{props\.view==="MOON" \|\| props\.view==="MOON ORBIT" \|\| props\.view==="MOON FROM EARTH"\} \/>/);
assert.match(scene,/<EclipseShadowPreview \/>/);
assert.match(scene,/SUN_PROXY_SCENE_DISTANCE=650/);
assert.match(scene,/position\.copy\(camera\.position\)\.addScaledVector\(sun, SUN_PROXY_SCENE_DISTANCE\)/);
assert.match(scene,/perspective\.far = 960/);
assert.match(scene,/far: 960/);
assert.match(scene,/moonWorldPosition\(new Date\(\)\)/);
assert.match(scene,/props\.view === "MOON"/);
assert.match(scene,/getCelestial\(now\)/);
assert.match(scene,/ANALYTICAL PREVIEW · NOT VERIFIED ECLIPSE CONTACT TIMES/);
assert.match(scene,/LUNAR MAP: NASA SVS \/ LROC · NEUTRAL FALLBACK/);
assert.match(scene,/LUNAR TEXTURE · \{moonMapStatus\}/);
assert.match(scene,/new THREE\.TextureLoader\(\)\.load\("\/api\/moon-texture"/);
const moonEffect=scene.slice(scene.indexOf("function MoonVisual({detailed}"),
  scene.indexOf("const ECLIPSE_SHADOW_VERTEX"));
assert.match(moonEffect,/ownedLroc\.current=loaded/,"successful NASA texture must be cached in ref");
assert.match(moonEffect,/if\(!alive\.current\|\|ownedLroc\.current\|\|fetching\.current\)return/,
  "never fetch NASA Moon again when already cached or in flight");
assert.match(moonEffect,/loadNasaMoon\(\);[\s\S]*?\},\[\]\);/,
  "preload the real NASA texture at scene mount independently of Moon View");
assert.doesNotMatch(moonEffect,/\[detailed,lrocTexture\]/,
  "do not bind image load effect to its own successful state update");
assert.match(moonEffect,/ownedLroc\.current\?\.dispose\(\)/,"release GPU texture on unmount");

assert.match(moonEffect,/if\(!ownedLroc\.current\)loadNasaMoon\(\)/,
  "retry NASA Moon when opening a lunar view after an upstream outage");
assert.match(moonEffect,/new THREE\.TextureLoader\(\)\.load\("\/api\/moon-relief"/,
  "source the measured NASA LOLA relief on demand");
assert.match(moonEffect,/loaded\.colorSpace=THREE\.NoColorSpace/,
  "interpret LOLA heights as linear data, not color");
assert.match(moonEffect,/ownedLola\.current\?\.dispose\(\)/,
  "release GPU LOLA texture when scene unmounts");
assert.match(moonEffect,/bumpMap=\{lrocTexture && lolaRelief \? lolaRelief : undefined\}/,
  "only enable LOLA relief on verified lunar color textures");
assert.match(moonEffect,/displacementScale=\{lrocTexture && lolaRelief \? 0\.0035 : 0\}/,
  "keep lunar height displacement deliberately conservative");
assert.match(scene,/rotation=\{\[0,-Math\.PI\/2,0\]\}/,"LROC 0-degree lunar longitude should face Earth");

// Celestial 1.2: all observing geometries use the same physical ephemeris.
// The old MOON camera pointed back at the Moon with Earth BEHIND the viewer.
const earthriseFrame=scene.slice(scene.indexOf("function lunarEarthriseFrame("),
  scene.indexOf("function latLonToPoint("));
assert.match(earthriseFrame,/GLOBE_CENTER\.clone\(\)\.sub\(lunarCenter\)/,
  "Earthrise must use the real lunar-to-Earth direction");
assert.match(earthriseFrame,/kmToScene\(MOON_RADIUS_KM,GLOBE_RADIUS\)/,
  "Lunar horizon must use the real lunar radius");
assert.match(earthriseFrame,/getSunDirection\(date\)/,
  "Earthrise observing site must be oriented to the current Sun");
assert.match(scene,/if \(props\.view === "MOON ORBIT"\)/);
assert.match(scene,/if \(props\.view === "MOON FROM EARTH"\)/);
assert.match(scene,/moonCameraAnchor\.current=currentMoon/,
  "A camera on the Moon must travel with the rotating Earth-fixed lunar state");
assert.match(scene,/earthTelescopeAnchor\.current/,
  "Earth-side telescope must keep the actual Moon centered as UTC progresses");
assert.match(scene,/props\.view === "MOON FROM EARTH" \? 1\.6/,
  "Physical lunar scale must be presented via a 1.6-degree telephoto lens");
assert.match(scene,/props\.view === "MOON FROM EARTH" \? 300/,
  "Moon observer must not be clamped to near-Earth orbit controls");
assert.match(scene,/props\.view !== "MOON" && props\.view !== "MOON ORBIT" && props\.view !== "MOON FROM EARTH"/,
  "Near-Earth distance fog must not hide lunar and terrestrial long-distance views");
const moonNow=C.celestialAt(date("2026-10-17T12:00:00Z"));
const earthAngularFromMoon=2*Math.atan(C.EARTH_RADIUS_KM/
  (moonNow.moon.distanceKm-C.MOON_RADIUS_KM))*180/Math.PI;
const moonAngularFromEarth=2*Math.atan(C.MOON_RADIUS_KM/
  (moonNow.moon.distanceKm-C.EARTH_RADIUS_KM))*180/Math.PI;
assert.ok(earthAngularFromMoon>1.7 && earthAngularFromMoon<2.2,
  "Earth must remain about 1.8–2.0 degrees across as viewed from the lunar surface");
assert.ok(moonAngularFromEarth>.46 && moonAngularFromEarth<.57,
  "Moon must remain about half a degree across as seen from Earth");
const earthTelescopeCoverage=moonAngularFromEarth/1.6;
assert.ok(earthTelescopeCoverage>0.28 && earthTelescopeCoverage<0.36,
  "Earth-side Moon must occupy 28-36% of the telephoto viewport height");
// At 15 km above the Moon, the 0.11 far-limb normal brings Earth just
// above the *curved lunar horizon*. This is real geometry, not a cutout.
const renderMoonRadius=C.kmToScene(C.MOON_RADIUS_KM,4.3);
const moonCameraRadius=renderMoonRadius+0.01;
const moonLimbAngle=Math.asin(renderMoonRadius/moonCameraRadius);
const earthToLimbAngle=Math.acos(0.11)-moonLimbAngle;
const earthToLimbDeg=earthToLimbAngle*180/Math.PI;
assert.ok(earthToLimbDeg>0.95 && earthToLimbDeg<1.35,
  "Earth's centre should rise about one degree above the actual lunar limb");
assert.ok(earthToLimbDeg>earthAngularFromMoon/2,
  "Earth's lower rim must stay above the lunar horizon without cheating depth");
assert.match(earthriseFrame,/const earthNormalComponent=-0\.11/);
assert.match(earthriseFrame,/lunarRadius\+0\.01/);
assert.match(scene,/props\.view === "MOON" \? 5\.6/,
  "cinematic Earthrise uses a physical 5.6-degree lens without object scaling");
assert.match(earthriseFrame,/addScaledVector\(surfaceNormal,-0\.011\)/,
  "Earthrise aims slightly below Earth to give space to the true lunar horizon");
const earthFrameCoverage=earthAngularFromMoon/5.6;
assert.ok(earthFrameCoverage>0.30 && earthFrameCoverage<0.40,
  "Earth must occupy 30–40% of the Earthrise viewport height, at its true distance");
assert.match(scene,/props\.view === "MOON ORBIT" \? 30/,
  "orbital closeup gets a 30-degree lens");
assert.match(scene,/addScaledVector\(towardEarth,-5\.7\)/,
  "orbital camera observes the actual Moon from its anti-Earth hemisphere");

const lunarRoute=readFileSync("app/api/moon-texture/route.ts","utf8");
assert.match(lunarRoute,/NASA.*LRO\/LROC/);
assert.match(lunarRoute,/lroc_color_2k\.jpg/);
assert.match(lunarRoute,/X-Cupola-Lunar-Source/);
assert.match(lunarRoute,/status:503/,"NASA outage must retain illustrative fallback");

const lolaRoute=readFileSync("app/api/moon-relief/route.ts","utf8");
assert.match(lolaRoute,/ldem_3_8bit\.jpg/,"NASA SVS must supply LOLA elevations");
assert.match(lolaRoute,/X-Cupola-Lunar-Relief-Source/);
assert.match(lolaRoute,/status:503/,"never silently fake verified LOLA relief");
assert.match(scene,/LUNAR RELIEF · \{moonReliefStatus\}/,
  "show truthfully whether real relief loaded");
assert.match(scene,/const lunarTransmission=1-0\.995\*eclipse\.obscuration/);
assert.match(scene,/eclipseAt\(e,\{x:0,y:0,z:0\}\)\.separationDeg<2\.0/);
assert.match(scene,/earthFixedToWorld\(getCelestial\(date\)\.sun\.earthFixedKm\)/);
assert.match(scene,/<SunVisual \/>/);
assert.match(scene,/<LiveCloudLayer/);
assert.equal((scene.match(/<EffectComposer/g)||[]).length,1);
assert.match(solar,/SOLAR_CORE_RADIUS_UV = 0\.063/);
console.log("PASS: actual Sun/Moon km geometry, physical angles, UTC phase, eclipse total/annular/partial/none, camera and shader provenance");
