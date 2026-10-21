#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";
const nodeRequire=createRequire(import.meta.url);
function compile(path,deps={}){
  const transpiled=ts.transpileModule(readFileSync(path,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const mod={exports:{}};
  new Function("require","module","exports",transpiled)(
    id=>deps[id]||nodeRequire(id),mod,mod.exports);
  return mod.exports;
}
const shadows=compile("lib/earth/lunarShadowField.ts");
const lab=compile("lib/earth/eclipseLabGeometry.ts",{
  "./lunarShadowField":shadows
});
assert.equal(lab.ECLIPSE_LAB_EVENTS.length,4);
assert.equal(lab.ECLIPSE_LAB_EVENTS[1].utc,"2025-09-07T18:11:43Z",
  "Do not confuse NASA dynamical (TD) peak times with UTC");
for(const event of lab.ECLIPSE_LAB_EVENTS){
  const at=lab.eclipseLabAt(new Date(event.utc));
  assert.equal(at.model,"ASTRONOMY_ENGINE_GEOCENTRIC_PREVIEW");
  assert.equal(at.timeUtc,new Date(event.utc).toISOString());
  assert.ok(at.moonDistanceKm>340000&&at.moonDistanceKm<410000);
  assert.ok(at.sunDistanceKm>145000000&&at.sunDistanceKm<155000000);
  assert.ok(at.solarAngularRadiusRad>0.0045&&at.solarAngularRadiusRad<0.0049);
  assert.ok(at.moonCentreObscuration>=0&&at.moonCentreObscuration<=1);
  assert.ok(at.earthSunSeparationDeg>=0&&at.earthSunSeparationDeg<3.5,
    "Lunar eclipse should align the Earth and Sun as seen from Moon");
  assert.ok(at.eclipseActive,"NASA eclipse maximum must activate Moon shadow shader");
  const centre=shadows.eclipseSolarDiscObscuration(
    {x:0,y:0,z:0},at.earthWorldKm,at.moonToSunWorldKm);
  assert.ok(Math.abs(centre-at.moonCentreObscuration)<1e-12);
  const delta=lab.eclipseLabAt(new Date(Date.parse(event.utc)+60000));
  assert.ok(Math.abs(delta.earthSunSeparationDeg-at.earthSunSeparationDeg)<0.03,
    "One-minute time step must not create a discontinuous sky jump");
  console.log(event.id,at.moonCentreObscuration.toFixed(4),
    at.earthSunSeparationDeg.toFixed(4),"degrees");
}
const nonEclipse=lab.eclipseLabAt(new Date("2026-10-21T12:00:00Z"));
assert.equal(nonEclipse.moonCentreObscuration,0);
assert.equal(nonEclipse.eclipseActive,false);
assert.throws(()=>lab.eclipseLabAt(new Date("2040-01-01T00:00:00Z")));
const home=readFileSync("app/page.tsx","utf8");
assert.doesNotMatch(home,/EclipseLab|eclipseLabAt/,
  "Isolated QA page must never replace or time-travel the LIVE homepage");
const page=readFileSync("app/eclipse-lab/page.tsx","utf8");
const scene=readFileSync("components/EclipseLab.tsx","utf8");
const metadata=readFileSync("app/eclipse-lab/layout.tsx","utf8");
assert.match(page,/dynamic\(\(\)=>import\("@\/components\/EclipseLab"\)/);
assert.match(metadata,/index:false/);
assert.match(scene,/SIMULATION · NOT LIVE/);
assert.match(scene,/NASA LROC \+ LOLA ACTIVE/);
assert.match(scene,/MOON_ECLIPSE_FRAGMENT/);
assert.match(scene,/data-eclipse-lab-status=/);
console.log("PASS: NASA UTC presets, geocentric eclipse geometry, source provenance, no LIVE path changes");
