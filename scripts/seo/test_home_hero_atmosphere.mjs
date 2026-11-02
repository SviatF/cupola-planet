#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync("app/editorial-refinement.css","utf8");
const media=readFileSync("components/editorial/HomeHeroMedia.tsx","utf8");
const scene=readFileSync("components/editorial/SceneFrame.tsx","utf8");
const tail=css.split("/* CUPOLA 8.17.4 — seamless single-scene hero")[1];
assert.ok(tail,"real image-pixel-geometry correction missing");
assert.match(tail, /@media \(min-width:991px\)/);
assert.match(tail, /@media \(min-width:651px\) and \(max-width:990px\)/);
assert.match(tail, /@media \(max-width:650px\)/);
assert.match(tail, /top:0;right:0;left:auto;bottom:auto/);
assert.match(tail, /width:auto;height:100%;max-width:100%/);
assert.match(tail, /object-fit:contain/);
assert.match(tail, /-webkit-mask-image:linear-gradient\(90deg,transparent 0%/);
assert.match(tail, /mask-image:linear-gradient\(90deg,transparent 0%/);
assert.match(tail, /#000 26%/);
assert.match(tail, /\.ae-home-ambient-poster/);
assert.match(tail, /filter:blur\(56px\)/);
assert.match(tail, /-webkit-mask-image:none;mask-image:none/);
assert.match(tail, /\.ae-live-scene--poster::before/g);
assert.match(tail, /radial-gradient\(ellipse/);
assert.match(tail, /\.ae-live-scene--poster \.ae-hero-shade/);
assert.doesNotMatch(tail, /\.ae-home-approved-poster\s*{[^}]*filter:blur\(/s,
  "main satellite source may never be blurred");
assert.doesNotMatch(tail, /url\(https?:|background-image:\s*url\(/,
  "no stock photo or third-party media");
assert.match(media, /className="ae-home-ambient-poster" src={still.url}/);
assert.match(media, /className="ae-home-approved-poster" src={still.url}/);
assert.match(media, /aria-hidden="true"/);
assert.match(media, /fetchPriority="high"/);
assert.doesNotMatch(media, /iframe|WebGLRenderer/);
assert.match(scene, /HomeHeroMedia/);
console.log("PASS CUPOLA 8.17.4: native 16:9 element geometry, real-edge matte, same-asset ambient glow and sharp globe");
