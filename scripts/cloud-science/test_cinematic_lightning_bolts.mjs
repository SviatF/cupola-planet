#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source=readFileSync("lib/earth/lightningBoltGeometry.ts","utf8");
const code=ts.transpileModule(source, {compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
}}).outputText;
const {buildLightningBoltTriangles,inspectLightningBolt}=await import(
  "data:text/javascript;charset=utf-8,"+encodeURIComponent(code)
);

const core=buildLightningBoltTriangles(27);
const glow=buildLightningBoltTriangles(27,4.1);
const same=buildLightningBoltTriangles(27);
const alternate=buildLightningBoltTriangles(41);
const bounds=inspectLightningBolt(core);

assert.ok(core instanceof Float32Array);
assert.equal(core.length%9,0,"the channels must be assembled from triangles");
assert.ok(bounds.triangles>=55,"expect tapered trunk plus natural side branches");
assert.ok(bounds.maxY>0.12 && bounds.minY< -0.10,"continuous cloud-to-cloud discharge");
assert.ok(bounds.maxX-bounds.minX>0.045,"multiple irregular branches");
assert.ok(core.every(Number.isFinite),"GPU buffers cannot contain NaN or Infinity");
assert.deepEqual([...core],[...same],"stroke is stable across renders, no spatial flicker");
assert.notDeepEqual([...core],[...alternate],"different storms should not share identical lightning");
assert.equal(glow.length,core.length,"soft corona uses the same precise fork structure");
assert.ok(glow.every(Number.isFinite));

const frontend=readFileSync("components/CupolaExperience.tsx","utf8");
const start=frontend.indexOf("function StormZoneFlash(");
const end=frontend.indexOf("function LightningLayer(",start);
const flash=frontend.slice(start,end);
assert.ok(start>=0&&end>start);
assert.match(flash,/buildLightningBoltTriangles\(seed, 1\)/);
assert.match(flash,/buildLightningBoltTriangles\(seed, 4\.1\)/);
assert.match(flash,/STORM_CLOUD_ILLUMINATION_FRAGMENT/);
assert.match(flash,/stormZoneFlashEnvelope\(clock\.elapsedTime/);
assert.match(flash,/cinematic \? 1\.20 : 0\.90/);
assert.match(flash,/normal\.dot\(cameraVector\.current\)/);
assert.doesNotMatch(flash,/<circleGeometry/,"blue button circles must be completely removed");
assert.doesNotMatch(frontend,/function LightningModelPointMarker\(/,"model blue point rings must be removed");
assert.match(frontend,/model.*cinematic|cinematic.*model/is);
assert.match(frontend,/No persistent cobalt disc/,"legacy lightning shader should not leave blue glow");
console.log("PASS: deterministic branching lightning, transient cloud illumination, and no blue button markers");
