#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const source=readFileSync("lib/earth/solarCinematic.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {solarLensVisibility}=await import("data:text/javascript,"+encodeURIComponent(js));
const p=(theta)=>{
  const a=theta*Math.PI/180;
  return {x:20*Math.sin(a),y:0,z:10-20*Math.cos(a)};
};
const cam={x:0,y:0,z:10}, earth={x:0,y:0,z:0}, radius=4.3;
assert.equal(solarLensVisibility(cam,p(0),earth,radius),0,
  "Sun completely behind Earth must never create postprocess glare");
assert.equal(solarLensVisibility(cam,p(18),earth,radius),0,
  "Sun safely behind apparent Earth disc");
assert.equal(solarLensVisibility(cam,p(30),earth,radius),1,
  "Sun outside limb must be optically visible");
assert.ok(solarLensVisibility(cam,p(25.5),earth,radius)>0 &&
          solarLensVisibility(cam,p(25.5),earth,radius)<1,
          "Earth limb fade avoids a hard flash when Sun emerges");
assert.equal(solarLensVisibility(cam,{x:0,y:0,z:8},earth,radius),1,
  "Earth behind Sun must never falsely eclipse Sun");
assert.equal(solarLensVisibility(cam,p(140),earth,radius),1,
  "Earth behind observer must not occult Sun");

const scene=readFileSync("components/CupolaExperience.tsx","utf8");
const lens=scene.slice(scene.indexOf("function StableBloomEffect("),
                       scene.indexOf("function ",scene.indexOf("function StableBloomEffect(")+9));
assert.ok(lens.length>2500);
assert.match(lens,/uniform vec2 solarCenter;/);
assert.match(lens,/uniform float solarVisible;/);
assert.match(lens,/uniform float solarGaze;/);
assert.match(lens,/uniform float solarAspect;/);
assert.match(lens,/solarLensVisibility\(camera\.position, sunWorld, GLOBE_CENTER, GLOBE_RADIUS \+ 0\.05\)/);
assert.match(lens,/sunClip\.copy\(sunWorld\)\.project\(camera\)/);
assert.match(lens,/sunToCamera\.dot\(cameraForward\)/);
assert.match(lens,/solarSmooth\.current\.visibility = THREE\.MathUtils\.damp/);
assert.match(lens,/solarSmooth\.current\.gaze = THREE\.MathUtils\.damp/);
assert.match(lens,/float core = exp\(-rSolar \* rSolar \* 85\.0\)/);
assert.match(lens,/float veil = exp\(-rSolar \* rSolar \* 8\.0\)/);
assert.match(lens,/cameraResponse \+ halo \* glowStrength/);
assert.match(lens,/solarGlare/);
assert.equal((scene.match(/<EffectComposer/g)||[]).length,1,
  "Never introduce another global postprocess or render target");
assert.equal((scene.match(/<StableBloomEffect/g)||[]).length,1);
assert.match(scene,/depthTest=\{true\}/,"Solar shader must obey Earth's occlusion");
assert.match(scene,/fog=\{false\}/,"Sun is beyond the scene's far fog");
const sunScene=scene.slice(scene.indexOf('if (props.view === "SUN–EARTH L1") {'),scene.indexOf("controls.current.target.copy(target);"));
assert.match(sunScene,/sunAndLimb/);
assert.match(sunScene,/multiplyScalar\(0\.75\)/);
assert.match(sunScene,/addScaledVector\(earthLook, 0\.25\)/);
assert.match(scene,/SOLAR_VIEW_LIMB_ANGLE_RAD/);
assert.match(source,/smoothstep\(0\.052, 0\.063, r\)/);
assert.match(source,/float corona = exp\(-coronalR \* 8\.0\)/);
assert.doesNotMatch(source,/uTime|sin\(uTime|frameIndex/);
assert.match(scene,/<LiveCloudLayer/);
console.log("PASS Solar Wave 2: partial eclipse, broad view-adaptive lens glare, no additional bloom pass, Earth-limb composition");
