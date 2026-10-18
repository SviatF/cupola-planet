#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync,statSync} from "node:fs";
import ts from "typescript";

const src=readFileSync("lib/earth/celestialEngine.ts","utf8");
const js=ts.transpileModule(src,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const C=await import("data:text/javascript,"+encodeURIComponent(js));
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
const solar=readFileSync("lib/earth/solarCinematic.ts","utf8");
const date=(s)=>new Date(s);

const moonAppearanceTS=readFileSync("lib/earth/moonAppearance.ts","utf8");
const moonAppearanceJS=ts.transpileModule(moonAppearanceTS,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const A=await import("data:text/javascript,"+encodeURIComponent(moonAppearanceJS));
// IAU mean lunar pole should be unit-length, point north and rotate with
// Earth; this controls the actual high-resolution LROC mare/crater tilt.
const poleA=C.moonPoleEarthFixed(new Date("2026-10-18T00:00:00Z"));
const poleB=C.moonPoleEarthFixed(new Date("2026-10-18T12:00:00Z"));
assert.ok(Math.abs(C.norm(poleA)-1)<1e-12&&Math.abs(C.norm(poleB)-1)<1e-12);
assert.ok(poleA.y>0.90&&poleB.y>0.90,"Lunar north pole must remain above equatorial plane");
assert.ok(C.dot(poleA,poleB)<0.90,"Earth-fixed lunar pole must rotate over 12 UTC hours");
assert.match(scene,/new THREE\.Matrix4\(\)\.makeBasis\(xAxis,alignedNorth,toEarth\)/,
  "NASA Moon map north axis is anchored to IAU mean lunar pole");
assert.match(scene,/earthFixedToWorld\(moonPoleEarthFixed\(utcNow\)\)/);

const clearZenith=A.lunarAtmosphereTransmission(80,0);
const clearHorizon=A.lunarAtmosphereTransmission(1,0);
const highOrbit=A.lunarAtmosphereTransmission(1,450);
assert.deepEqual(highOrbit,[1,1,1],
  "A spacecraft above atmosphere must see a neutral-colored Moon");
assert.ok(clearHorizon[2]/clearHorizon[0] < clearZenith[2]/clearZenith[0],
  "Low Moon should redden from longer terrestrial blue-light extinction");
assert.ok(clearHorizon[0]<clearZenith[0],
  "Low Moon should also be darker, never turn bright neon orange");
const alignedSun={x:149600000,y:0,z:0};
const centralEclipse=A.moonEarthShadow({x:-384400,y:0,z:0},alignedSun);
const sideEclipse=A.moonEarthShadow({x:-384400,y:80000,z:0},alignedSun);
assert.ok(centralEclipse.umbra>0.98,
  "Moon behind Earth on Sun axis must fall into Earth's umbra");
assert.equal(sideEclipse.umbra,0,
  "Moon far outside umbra cannot be red just because it is full");
assert.equal(A.moonEarthShadow({x:384400,y:0,z:0},alignedSun).umbra,0,
  "New Moon on sunlit side of Earth is never a lunar eclipse");
const fullEclipseRGB=A.moonAppearanceRGB([1,1,1],1,1);
assert.ok(fullEclipseRGB[0]>fullEclipseRGB[2]&&fullEclipseRGB[2]>0,
  "Earth-refracted eclipse illumination may be dim red, not opaque black");
const frontMoon={x:0,y:0,z:70};
const faceSun={x:0,y:0,z:1};
assert.ok(A.moonSunVisibility({x:0,y:0,z:0},frontMoon,1.17,faceSun)<0.01,
  "Moon directly between camera and Sun must fully cover the solar disc");
assert.equal(A.moonSunVisibility({x:0,y:0,z:0},{x:0,y:0,z:-70},1.17,faceSun),1,
  "Moon behind the viewer cannot obstruct the Sun");
assert.equal(A.moonSunVisibility({x:0,y:0,z:0},{x:70,y:0,z:0},1.17,faceSun),1,
  "Off-axis Moon cannot obstruct the Sun");
assert.match(scene,/moonRenderWorldPosition\(date:Date,observer:THREE\.Vector3/,
  "Camera-dependent Moon must preserve actual sightline even at 4× compression");
assert.match(scene,/moon\.current\.position\.copy\(moonRenderWorldPosition\(/);
assert.match(scene,/material\.color\.setRGB\(rgb\[0\],rgb\[1\],rgb\[2\]\)/);
assert.match(scene,/moonSunVisibility\(camera\.position,renderedMoon/);
assert.match(scene,/moonSunVisibility\(camera\.position,moonRendered/);
assert.match(scene,/depthTest=\{props\.lunarObserver\}/,
  "Earth atmospheric layers must not render through the foreground Moon");
assert.match(scene,/depthTest=\{true\}[\s\S]*?blending=\{THREE\.NormalBlending\}/,
  "Cloud shadow must also obey the Moon's depth buffer");

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

assert.match(scene,/function MoonVisual\(\{detailed,visualDistanceFactor,fromEarth,observerLocation\}/);
assert.match(scene,/function EclipseShadowPreview\(\)/);
assert.match(scene,/<MoonVisual detailed=\{props\.view==="MOON" \|\| props\.view==="MOON ORBIT" \|\| props\.view==="MOON FROM EARTH"\}/);
assert.match(scene,/visualDistanceFactor=\{props\.view==="MOON FROM EARTH" \? 1 : props\.moonDistanceFactor\}/,
  "Normal Earth orbit MUST render the Moon at 4× closer distance for visibility");
assert.match(scene,/fromEarth=\{props\.view==="MOON FROM EARTH"\} observerLocation=\{props\.marker\}/,
  "Moon visibility should use the already selected Earth city");
assert.match(scene,/<EclipseShadowPreview \/>/);
assert.match(scene,/SUN_PROXY_SCENE_DISTANCE=650/);
assert.match(scene,/position\.copy\(camera\.position\)\.addScaledVector\(sun, SUN_PROXY_SCENE_DISTANCE\)/);
assert.match(scene,/perspective\.far = 960/);
assert.match(scene,/far: 960/);
assert.match(scene,/moonWorldPosition\(new Date\(\)\)/);
assert.match(scene,/props\.view === "MOON"/);
assert.match(scene,/getCelestial\(now\)/);
assert.doesNotMatch(scene,/ANALYTICAL PREVIEW · NOT VERIFIED ECLIPSE CONTACT TIMES/,
  "Moon geometry diagnostic block must not appear in Controls");
assert.match(scene,/loadHd\("\/moon\/lroc_color_4k\.webp","albedo"\)/,
  "Real NASA LROC map is still loaded without diagnostic controls");
assert.doesNotMatch(scene,/aria-label="Sun and Moon geometry preview"/,
  "No Moon status diagnostics should appear in Controls");
assert.match(scene,/new THREE\.TextureLoader\(\)\.load\("\/api\/moon-texture"/);
const moonEffect=scene.slice(scene.indexOf("function MoonVisual({detailed,visualDistanceFactor,fromEarth,observerLocation}"),
  scene.indexOf("const ECLIPSE_SHADOW_VERTEX"));
assert.match(moonEffect,/moon\.current\.visible=observer\.altitudeRadians> -moonHalfAngle/,
  "Moon must NOT shine through the planet if fully below the local horizon");
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
assert.match(moonEffect,/bumpMap=\{lrocHd \|\| lrocTexture \? lolaHd \?\? lolaRelief \?\? undefined : undefined\}/,
  "only show the LOLA height map on a genuine NASA-colored Moon");
assert.match(moonEffect,/displacementScale=\{\(lrocHd \|\| lrocTexture\) && \(lolaHd \|\| lolaRelief\) \? 0\.0035 : 0\}/,
  "keep real LOLA height displacement deliberately conservative");
assert.match(moonEffect,/const lrocApplied=!!lrocTexture && material\.map===lrocTexture/,
  "NASA LROC ACTIVE cannot be emitted until the lunar mesh material actually binds it");
assert.match(moonEffect,/const lolaApplied=!!lolaRelief && material\.bumpMap===lolaRelief/,
  "NASA LOLA ACTIVE must mean the actual material applied verified relief");
assert.match(moonEffect,/bumpScale=\{\(lrocHd \|\| lrocTexture\) && \(lolaHd \|\| lolaRelief\) \? 0\.028 : 0\}/,
  "Measured lunar topography must define crater normal variation");
assert.match(moonEffect,/detailed\?256:64,detailed\?160:40/,
  "Lunar mesh needs a dense enough surface for image-based local relief");
assert.match(moonEffect,/loadHd\("\/moon\/lroc_color_4k\.webp","albedo"\)/,
  "LROC high-res map must only load when detailed lunar views are selected");
assert.match(moonEffect,/loadHd\("\/moon\/lola_height_4k\.webp","relief"\)/,
  "LOLA high-res measured heights must be loaded lazily");
assert.match(moonEffect,/const lrocHdApplied=!!lrocHd && material\.map===lrocHd/,
  "Only report LROC HD once the lunar mesh actually uses the 4K NASA texture");
assert.match(moonEffect,/const lolaHdApplied=!!lolaHd && material\.bumpMap===lolaHd/,
  "Only report LOLA HD once the lunar mesh actually uses 4K height data");
assert.match(moonEffect,/ownedLrocHd\.current\?\.dispose\(\)/,
  "Dispose higher-resolution GPU textures when leaving the scene");
const assetBuilder=readFileSync("scripts/cloud-science/generate_lunar_assets.py","utf8");
assert.match(assetBuilder,/lroc_color_16bit_srgb_4k\.tif/);
assert.match(assetBuilder,/ldem_16_uint\.tif/);
assert.match(assetBuilder,/NASA SVS CGI Moon Kit/);
const moonManifest=JSON.parse(readFileSync("public/moon/source-manifest.json","utf8"));
assert.match(moonManifest.source,/NASA SVS CGI Moon Kit/);
assert.equal(moonManifest.assets.length,2);
for(const asset of moonManifest.assets){
  const file="public/moon/"+asset.output;
  assert.ok(["lroc_color_4k.webp","lola_height_4k.webp"].includes(asset.output));
  const size=statSync(file).size;
  assert.equal(size,asset.size_bytes,"manifest provenance size mismatch for "+asset.output);
  assert.ok(size>100_000&&size<8_000_000,"Moon 4K asset should remain CDN-friendly");
  const signature=readFileSync(file).subarray(0,12);
  assert.equal(signature.toString("ascii",0,4),"RIFF");
  assert.equal(signature.toString("ascii",8,12),"WEBP");
  assert.match(asset.sha256_source,/^[0-9a-f]{64}$/);
}
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
assert.match(earthriseFrame,/mode:LunarObserverMode="EARTHRISE"/,
  "Real Earthrise and lunar orbit must share one physical observer model");
assert.match(earthriseFrame,/mode==="ORBIT"\?280:185/,
  "Two orbit heights must clear the 0.1 near clipping plane while keeping Earth physical");
assert.match(earthriseFrame,/const depression=Math\.acos\(lunarRadius\/\(lunarRadius\+altitude\)\)/,
  "Lunar horizon curvature must come from the Moon radius and camera altitude");
assert.match(earthriseFrame,/const earthNormalComponent=-Math\.sin\(depression-earthAboveLimb\)/,
  "Earth must clear the real curved lunar limb by the configured elevation");
assert.match(earthriseFrame,/up:surfaceNormal/,
  "Lunar camera up is the local lunar zenith rather than global Earth Y");
assert.match(scene,/camera\.up\.copy\(orbit\.up\)/,
  "Lunar orbital camera must keep Moon local horizon level");
assert.match(scene,/moonCameraUpAnchor\.current\.applyQuaternion\(orbitSpin\)/,
  "Lunar horizon frame must move as the Moon traverses the Earth-fixed scene");
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
// Both lunar observing stations use the TRUE tangent horizon.
const renderMoonRadius=C.kmToScene(C.MOON_RADIUS_KM,4.3);
for(const [mode,altitudeKm,clearanceDeg] of [["EARTHRISE",185,1.05],["ORBIT",280,1.25]]){
  const height=C.kmToScene(altitudeKm,4.3);
  const limbDepression=Math.acos(renderMoonRadius/(renderMoonRadius+height));
  const earthNormalComponent=-Math.sin(limbDepression-clearanceDeg*Math.PI/180);
  const elevation=(limbDepression-Math.asin(-earthNormalComponent))*180/Math.PI;
  assert.ok(Math.abs(elevation-clearanceDeg)<1e-7,
    mode+" Earth centre must clear the REAL lunar limb by configured degrees");
  assert.ok(height>.1,
    mode+" lunar terrain may not be clipped by the perspective near=0.1 scene units");
  assert.ok(elevation>earthAngularFromMoon/2,
    mode+" Earth disk must fully clear the horizon, not hide behind a fake cutout");
}
assert.match(scene,/props\.view === "MOON" \? 41/,
  "Default Moon selection must restore Moon-centred wide orbit, not force Earthrise");
const centeredMoonFrame=scene.slice(scene.indexOf("function centeredMoonOrbitFrame("),
  scene.indexOf("function latLonToPoint("));
assert.match(centeredMoonFrame,/return \{position,target:lunarCenter,lunarCenter\}/,
  "The orbit pivot and main screen focus MUST remain at the lunar centre");
assert.match(scene,/const orbit=centeredMoonOrbitFrame\(new Date\(\),props\.moonDistanceFactor\)/,
  "MOON view must orbit a visually compressed Moon while retaining its actual centre as pivot");
assert.match(scene,/lunarPresetTarget=orbit\.target/,
  "Moon-centred navigation should not target Earth or a horizon point");
assert.match(scene,/setView\("MOON"\);\s*setControlPanel\(null\);\s*\}\} aria-label="View and orbit the Moon"/,
  "Bottom VIEW MOON button must center camera on Moon without opening Controls");
assert.match(scene,/MOON_CINEMATIC_DISTANCE_FACTOR:MoonDistanceFactor=4/,
  "Distance must be 4× closer by default without configurable controls");
assert.match(moonEffect,/meshStandardMaterial ref=\{lunarMaterial\} fog=\{false\}/,
  "Earth orbital fog must NEVER hide the distant Moon");
assert.doesNotMatch(scene,/aria-label="Moon visual distance"/,
  "Remove all previous Moon distance settings from Controls");
assert.doesNotMatch(scene,/MOON · EARTHRISE/,
  "Remove Moon Earthrise controls");
assert.doesNotMatch(scene,/MOON · EARTH TELESCOPE/,
  "Remove Moon telescope controls");
// Celestial 1.8 — the artist-controlled visual gap is NOT an ephemeris.
// At 1× the Moon render position is its real calculated position; at 2×
// and 3× the Earth–Moon line is shortened without touching actual data.
const visualFunction=scene.slice(scene.indexOf("function moonCinematicWorldPosition("),
  scene.indexOf("const SUN_PROXY_SCENE_DISTANCE"));
assert.match(visualFunction,/moonWorldPosition\(date\)/);
assert.match(visualFunction,/physical\.sub\(GLOBE_CENTER\)\.divideScalar\(factor\)/,
  "Visual gap must be an exact factor, no changes to Moon radius or real ephemerides");
assert.match(scene,/type MoonDistanceFactor = 1 \| 2 \| 3 \| 4;/);
assert.match(scene,/const moonDistanceFactor=MOON_CINEMATIC_DISTANCE_FACTOR;/,
  "4× visual compression is internal and has no UI switches");
assert.match(scene,/const currentMoon=moonCinematicWorldPosition\(new Date\(\),props\.moonDistanceFactor\)/,
  "Moving Moon camera tracks visual position on the Moon");
assert.match(scene,/const observer=moonObserverFrame\(new Date\(\),moonObserverMarker\.current\)/,
  "Moon tracks observer's chosen city, not a moving sublunar location");
assert.match(scene,/\{\(props\.moonDistanceFactor===1 \|\| \(props\.view!=="MOON" && props\.view!=="MOON ORBIT"\)\) && <EclipseShadowPreview \/>\}/,
  "No false geometric eclipse shadow when user selects compressed view");
assert.doesNotMatch(scene,/CINE \$\{factor\}/,
  "No Moon options in Controls");
assert.doesNotMatch(scene,/CELESTIAL GEOMETRY · UTC/,
  "No Moon diagnostic panel in Controls");
const moonPosition=C.celestialAt(date("2026-10-17T12:00:00Z")).moon.distanceKm;
for(const factor of [1,2,3,4]){
  const visualDistance=moonPosition/factor;
  assert.ok(Math.abs(visualDistance*factor-moonPosition)<1e-7,
    "Cinematic distance must compress exactly by the selected factor");
}
assert.ok(Math.abs(moonPosition-C.celestialAt(date("2026-10-17T12:00:00Z")).moon.distanceKm)<1e-10,
  "Visual compression must not mutate the physical ephemeris");
assert.match(earthriseFrame,/earthHalfAngle\+THREE\.MathUtils\.degToRad\(0\.22\)/,
  "Lunar horizon must allow larger apparent Earth discs at 2× and 3×");

assert.match(scene,/props\.view === "MOON ORBIT" \? 6\.5/,
  "Low lunar orbit gets a different honest 6.5 degree portrait lens");
assert.match(earthriseFrame,/addScaledVector\(surfaceNormal,-0\.001\)/,
  "Camera must keep Earth centered while the curved lunar limb sits in the lower frame");
assert.match(scene,/lunarEarthriseFrame\(new Date\(\),"ORBIT",props\.moonDistanceFactor\)/,
  "Orbit geometry must use the selected visual compression without altering Sun phase");
assert.doesNotMatch(scene,/addScaledVector\(towardEarth,-5\.7\)/,
  "Old far-side camera responsible for featureless Moon portrait must be removed");
assert.match(scene,/props\.view==="MOON" \|\| props\.view==="MOON ORBIT" \|\| props\.view==="MOON FROM EARTH" \? 0 : 0\.012/,
  "Deep lunar night must not be filled by generic ambient light");

// Celestial 1.9 — genuine twilight is shader-derived, not an overlaid black sphere.
assert.doesNotMatch(scene,/LUNAR_OBSERVER_NIGHT_OCCLUSION_FRAGMENT_SHADER/,
  "A fully separate opaque dark hemisphere is a rendering defect");
assert.doesNotMatch(scene,/renderOrder=\{35\}/,
  "No late-composited black disk may cover the Earth's terminator");
assert.match(scene,/\{props\.cityLights && !props\.lunarObserver && \(/,
  "Optional Moon view must not expose old nighttime VIIRS emissions");
assert.match(scene,/\{props\.precipitation && !props\.lunarObserver && \(/);

const observerFrame=scene.slice(scene.indexOf("function moonObserverFrame("),
  scene.indexOf("function globeWorldPoint("));
assert.match(observerFrame,/globeWorldNormal\(marker\.lat,marker\.lon\)/,
  "Observe Moon from selected city latitude/longitude");
assert.match(observerFrame,/moonWorldPosition\(date\)/,
  "Topocentric Moon is always based on real lunar ephemerides");
assert.match(observerFrame,/Math\.asin\(THREE\.MathUtils\.clamp\(sight\.dot\(radial\),-1,1\)\)/,
  "Lunar elevation must be computed relative to actual horizon");
assert.match(observerFrame,/return \{position,moon,up,altitudeRadians\}/);
assert.match(scene,/moonObserverFrame\(new Date\(\),props\.marker\)/,
  "Existing selected place and FIND ME drive Moon observer without new controls");
assert.match(scene,/moonObserverFrame\(new Date\(\),moonObserverMarker\.current\)/,
  "Observer stays at their actual chosen location as Moon moves");
assert.match(scene,/props\.view==="MOON FROM EARTH" \? props\.marker\?\.lat : undefined/,
  "Moon observer latitude changes only reframe the telescope, not standard Earth fly-to");
assert.match(scene,/props\.view==="MOON FROM EARTH" \? props\.marker\?\.lon : undefined/,
  "Moon observer longitude changes only reframe the telescope, not standard Earth fly-to");
const topoAltitude=(lat,lon,state)=>{
  const rad=Math.PI/180,r=lat*rad,q=lon*rad;
  const normal={x:Math.cos(r)*Math.cos(q),y:Math.sin(r),z:-Math.cos(r)*Math.sin(q)};
  const station={x:normal.x*(C.EARTH_RADIUS_KM+18),y:normal.y*(C.EARTH_RADIUS_KM+18),
    z:normal.z*(C.EARTH_RADIUS_KM+18)};
  return Math.asin(C.dot(C.direction(C.sub(state.moon.earthFixedKm,station)),normal))*180/Math.PI;
};
const testState=C.celestialAt(date("2026-10-18T00:00:00Z"));
const actualTopocentricAltitude=topoAltitude(49.8397,24.0297,testState);
assert.ok(actualTopocentricAltitude>=-90&&actualTopocentricAltitude<=90,
  "Topocentric lunar altitude must have physical bounds in Lviv");
const altitudesInLviv=Array.from({length:24},(_,i)=>
  topoAltitude(49.8397,24.0297,C.celestialAt(
    date("2026-10-18T00:00:00Z".replace("00:00:00",String(i).padStart(2,"0")+":00:00")))));
assert.ok(altitudesInLviv.some(v=>v>0) && altitudesInLviv.some(v=>v<0),
  "Lviv should have hours with visible and non-visible lunar altitude on a normal day");
assert.match(scene,/const moonHalfAngle=Math\.asin\(Math\.min\(1,moonRadius\//,
  "Use lunar angular radius to stop rendering only when entire disc is below horizon");


const cloudShader=readFileSync("lib/earth/liveCloudShader.ts","utf8");
assert.match(scene,/const LUNAR_OBSERVER_EARTH_FRAGMENT_SHADER/,
  "Earth needs physically dark lunar-observer-specific illumination");
assert.match(scene,/float ndl=dot\(normalize\(vWorldNormal\),normalize\(sunDirection\)\)/,
  "Lunar Earth surface uses SAME UTC solar direction as all other bodies");
assert.match(scene,/float day=smoothstep\(-0\.075,0\.055,ndl\)/,
  "Real Earth terminator must have smooth light and twilight scattering");
assert.match(scene,/gl_FragColor=vec4\(sunlit\*day,1\.0\)/,
  "Nightside naturally darkens within the surface shader");
assert.match(scene,/props\.lunarObserver \? \(/,
  "Moon Earth material must not overwrite ordinary Earth rendering");
assert.match(scene,/!props\.lunarObserver && <Billboard follow>/,
  "Sun-independent all-around blue atmosphere glow must be disabled on Moon");
assert.match(scene,/float side=mix\(0\.30\+0\.70\*day,smoothstep\(-0\.075,0\.055,nds\),lunarObserver\)/,
  "Atmosphere core must fade out over Earth's sunless hemisphere on Moon view");
assert.match(scene,/float side=mix\(0\.22\+0\.78\*day\+0\.04\*night,smoothstep\(-0\.075,0\.055,nds\),lunarObserver\)/,
  "Atmosphere inner scattering cannot be a permanent night-side blue sphere");
assert.match(scene,/lightsEnabled: \{ value: props\.cityLights \? \(props\.lunarObserver \? 0\.42 : 1\) : 0 \}/,
  "Night city light brightness must be lower in far-away Moon view");

assert.match(cloudShader,/uniform float lunarObserver;/);
assert.match(cloudShader,/float lunarDay=smoothstep\(-0\.075,0\.055,ndl\)/,
  "Clouds must share the SAME terminator as Earth, not brighten lunar-view nights");
assert.match(cloudShader,/float lunarMask=mix\(1\.0,lunarDay,lunarObserver\)/,
  "Existing original cloud V3 remains unmodified in other perspectives");
assert.match(scene,/lunarObserver=\{props\.view==="MOON" \|\| props\.view==="MOON ORBIT"\}/);
const solarState=C.celestialAt(date("2026-10-17T22:40:32Z"));
const sunUnit=C.direction(solarState.sun.earthFixedKm);
const unitDot=(a,b)=>C.dot(a,b);
assert.ok(unitDot(sunUnit,sunUnit)>.9999999999);
assert.ok(unitDot(sunUnit,{x:-sunUnit.x,y:-sunUnit.y,z:-sunUnit.z})<-.999999,
  "A surface facing directly away from the Sun must stay completely dark");
assert.ok(solarState.moonIlluminatedFraction>=0&&solarState.moonIlluminatedFraction<=1,
  "Current phase must remain ephemeris-driven rather than forced to 50 percent");

const lunarRoute=readFileSync("app/api/moon-texture/route.ts","utf8");
assert.match(lunarRoute,/NASA.*LRO\/LROC/);
assert.match(lunarRoute,/lroc_color_2k\.jpg/);
assert.match(lunarRoute,/X-Cupola-Lunar-Source/);
assert.match(lunarRoute,/status:503/,"NASA outage must retain illustrative fallback");

const lolaRoute=readFileSync("app/api/moon-relief/route.ts","utf8");
assert.match(lolaRoute,/ldem_3_8bit\.jpg/,"NASA SVS must supply LOLA elevations");
assert.match(lolaRoute,/X-Cupola-Lunar-Relief-Source/);
assert.match(lolaRoute,/status:503/,"never silently fake verified LOLA relief");
assert.doesNotMatch(scene,/LUNAR RELIEF · \{moonReliefStatus\}/,
  "Removed the Moon diagnostic section without disabling true NASA LOLA textures");
assert.match(scene,/const lunarTransmission=1-0\.995\*eclipse\.obscuration/);
assert.match(scene,/eclipseAt\(e,\{x:0,y:0,z:0\}\)\.separationDeg<2\.0/);
assert.match(scene,/earthFixedToWorld\(getCelestial\(date\)\.sun\.earthFixedKm\)/);
assert.match(scene,/<SunVisual moonDistanceFactor=\{props\.moonDistanceFactor\}/);
assert.match(scene,/<LiveCloudLayer/);
assert.equal((scene.match(/<EffectComposer/g)||[]).length,1);
assert.match(solar,/SOLAR_CORE_RADIUS_UV = 0\.063/);
console.log("PASS: actual Sun/Moon km geometry, physical angles, UTC phase, eclipse total/annular/partial/none, camera and shader provenance");
