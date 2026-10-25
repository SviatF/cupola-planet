#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(path,"utf8");
const render=read("components/CupolaExperience.tsx");
const shader=read("lib/earth/liveCloudShader.ts");
const css=read("app/editorial-refinement.css");
const camera=read("lib/earth/editorialDawnCamera.mjs");
const hero=read("components/editorial/SceneFrame.tsx");

// Opt-in only: normal Explore, Cinema, Moon and satellite modes never get
// display-grade cloud density/color or altered solar postprocessing.
assert.match(render,/editorialHero=\{props\.editorialDawn===true\}/);
assert.match(render,/editorialHero=\{props\.editorialHero===true\}/);
assert.match(render,/editorialCloudGrade: \{ value: editorialHero \? 1 : 0 \}/);
assert.match(render,/u\.editorialCloudGrade\.value=uniforms\.editorialCloudGrade\.value/);
assert.match(render,/editorialDawn=\{props\.editorialDawn\}/);
assert.match(render,/editorialDawn \? 0\.25 : 1/);
assert.match(render,/editorialGlareScale/);
assert.match(shader,/uniform float editorialCloudGrade;/);
assert.ok(shader.includes("if (editorialCloudGrade > 0.5)"));
assert.ok(shader.includes("float c = finalCloudSignal(vUv);"));
assert.ok(shader.includes("vec3 underside = vec3(0.115, 0.145, 0.195);"));
assert.ok(shader.includes("vec3 sunlit = vec3(0.85, 0.89, 0.95) * brightness;"));

// The tonal curve never fabricates clouds where source density is zero.
const grade=(c)=>Math.pow(Math.min(1,Math.max(0,c)),.90);
assert.match(shader,/c = pow\(clamp\(c, 0\.0, 1\.0\), 0\.90\)/);
assert.ok(render.includes("cinematic={props.cinematic || props.editorialHero===true}"),
  "hero-only cinematic cloud shading must not affect the normal Explore view");
assert.equal(grade(0),0);
for(let c=0;c<=1;c+=.01){
  assert.ok(grade(c)>=0&&grade(c)<=1);
  if(c>0)assert.ok(grade(c)>=grade(c-.01-1e-10));
}
assert.ok(hero.includes('src="/explore?embed=1&hero=sunrise"'));
assert.ok(css.includes(".ae-live-scene iframe{filter:none}"));
assert.ok(camera.includes("const earthLimbAngleRad=Math.asin(earthRadius/activeDistance);"));
assert.ok(camera.includes("const distance=earthRadius*(isClassic?1.40:1.56);"));
assert.ok(camera.includes("const compositionOffsetRad=rad(isClassic?37:51);"));
assert.ok(render.includes('editorialDawnCamera(getSunDirection(new Date(utcMs)),GLOBE_RADIUS,shot)'));
// Preserve documented scientifically observed / forecast cloud atlas fields.
assert.ok(render.includes('sourceObservationAt'));
assert.ok(shader.includes("float coverage = smoothstep(0.0, 1.0 / 255.0, atlas.g) * cloudAtlasReady;"));
console.log("PASS CUPOLA 7.7: opt-in cloud color-grade, preserved science raster and camera, reduced Sun veil");
