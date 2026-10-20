#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const engineSource=readFileSync("lib/earth/celestialEngine.ts","utf8");
const compiled=ts.transpileModule(engineSource,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const A=await import("data:text/javascript,"+encodeURIComponent(compiled));
let meaningfulCorrections=0;
for(const iso of [
  "2026-10-20T12:00:00Z",
  "2026-11-07T06:00:00Z",
  "2026-11-20T10:00:00Z",
  "2026-12-03T18:00:00Z",
  "2027-01-07T16:00:00Z",
  "2027-03-15T22:00:00Z"
]){
  const state=A.celestialAt(new Date(iso));
  const moon=state.moon.earthFixedKm,sun=state.sun.earthFixedKm;
  const moonToEarth={x:-moon.x,y:-moon.y,z:-moon.z};
  const moonToSun=A.sub(sun,moon);
  const expected=(1+Math.cos(A.angleDeg(moonToEarth,moonToSun)*Math.PI/180))/2;
  assert.ok(Math.abs(state.moonIlluminatedFraction-expected)<1e-12,
    "Illumination must follow the physical Sun–Moon–Earth angle "+iso);
  const geocentric=(1-Math.cos(state.moonPhaseAngleDeg*Math.PI/180))/2;
  if(Math.abs(expected-geocentric)>1e-6)meaningfulCorrections++;
  assert.ok(expected>=0&&expected<=1);
}
assert.ok(meaningfulCorrections>=2,
  "The Moon-centred phase correction must differ measurably from geocentric elongation");
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
const qa=readFileSync("lib/earth/jplRendererBridge.ts","utf8");
assert.match(qa,/const phaseAngleDeg=angleDeg\(moonToSun,moonToEarth\)/);
assert.match(qa,/illuminatedFraction:\(1\+Math\.cos\(phaseAngleDeg\*Math\.PI\/180\)\)\/2/);
assert.match(scene,/moonIlluminatedFraction:jpl\.illuminatedFraction/,
  "Render bridge must retain the physically corrected JPL illuminated fraction");
console.log("PASS: physical Moon-centred illumination and independent geocentric elongation");
