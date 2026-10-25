#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const css=read("app/editorial-refinement.css");
const old=read("app/atlas.css");
const scene=read("components/CupolaExperience.tsx");
const hero=read("components/editorial/SceneFrame.tsx");
const cloudy=read("lib/earth/liveCloudShader.ts");
const science=read("lib/earth/editorialDawnCamera.mjs");
// Deliberate science and UI boundaries: identical renderer in both routes.
assert.ok(hero.includes('src="/explore?embed=1&hero=sunrise"'));
assert.ok(scene.includes('const [cloudEngine, setCloudEngine] = useState<CloudEngine>("v3")'));
assert.ok(scene.includes('editorialDawnCamera(getSunDirection(new Date(utcMs)),GLOBE_RADIUS)'));
assert.ok(scene.includes('cloudEngine={cloudEngine} editorialDawn={editorialDawn}'));
assert.ok(cloudy.includes('float c = finalCloudSignal(vUv);'));
assert.ok(science.includes('const earthLimbAngleRad=Math.asin(earthRadius/distance);'));
// A full-width dark overlay formerly obscured the source pixels over the
// Earth while the direct Explore view had no such overlay.
assert.ok(old.includes(".ae-hero-shade"),"protect the original editorial copy treatment");
const newStyles=css.slice(css.lastIndexOf("/* CUPOLA 7.9"));
assert.ok(newStyles.length>900,"last included stylesheet should contain 7.9 fix");
assert.match(newStyles, /@media \(min-width:991px\)/);
assert.match(newStyles, /rgba\(2,9,20,0\) 54%/);
assert.match(newStyles, /transparent 65%/);
assert.match(newStyles, /\.ae-hero \.ae-live-scene \.ae-hero-shade/g);
assert.match(newStyles, /\.ae-hero \.ae-live-scene iframe \{ filter:none; \}/);
assert.ok(!newStyles.includes("mask-image:"),"do not introduce a second full-WebGL offscreen compositing pass");
// On mobile, retain a bottom-only backdrop behind text, not an all-globe grey tint.
assert.match(newStyles, /rgba\(2,9,20,\.76\) 54%/);
console.log("PASS CUPOLA 7.9: source-authentic hero WebGL no longer receives a full-width dark UI overlay");
