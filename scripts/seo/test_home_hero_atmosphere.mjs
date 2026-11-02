#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync("app/editorial-refinement.css","utf8");
const media=readFileSync("components/editorial/HomeHeroMedia.tsx","utf8");
const scene=readFileSync("components/editorial/SceneFrame.tsx","utf8");
const tail=css.split("/* CUPOLA 8.17.3 — ONE CINEMATIC CANVAS")[1];
assert.ok(tail,"CUPOLA 8.17.3 cinematic blend missing");
assert.match(tail, /@media \(min-width:1500px\)/);
assert.match(tail, /@media \(min-width:991px\) and \(max-width:1499px\)/);
assert.match(tail, /@media \(min-width:651px\) and \(max-width:990px\)/);
assert.match(tail, /@media \(max-width:650px\)/);
assert.match(tail, /\.ae-live-scene--poster \.ae-home-approved-poster/g);
assert.match(tail, /-webkit-mask-image:linear-gradient\(/);
assert.match(tail, /mask-image:linear-gradient\(/);
assert.match(tail, /transparent 19%/);
assert.match(tail, /#000 56%/);
assert.match(tail, /-webkit-mask-image:none;mask-image:none/);
assert.match(tail, /\.ae-live-scene--poster::before/g);
assert.match(tail, /radial-gradient\(ellipse/);
assert.match(tail, /\.ae-live-scene--poster \.ae-hero-shade \{z-index:2\}/);
assert.doesNotMatch(tail, /filter\s*:\s*(?:blur|brightness|contrast|saturate)\(/,
  "never blur/regrade scientifically sourced cloud pixels");
assert.doesNotMatch(tail, /<iframe|url\(https?:|background-image:\s*url\(/,
  "cinematic art direction is CSS-only, with no stock background");
assert.match(media, /ae-live-scene--poster/);
assert.doesNotMatch(media, /iframe|WebGLRenderer/);
assert.match(scene, /HomeHeroMedia/);
console.log("PASS CUPOLA 8.17.3: continuous poster fade, low-cost atmospheric light, sharp Earth, responsive image-only hero");
