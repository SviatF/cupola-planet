#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const compile=(p)=>ts.transpileModule(readFileSync(p,"utf8"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
const core={exports:{}};
new Function("module","exports","require",compile("lib/earth/celestialEngine.ts"))(
  core,core.exports,()=>{throw Error("No dynamic imports in celestial core");});
const bridge={exports:{}};
new Function("module","exports","require",compile("lib/earth/jplRendererBridge.ts"))(
  bridge,bridge.exports,(p)=>{if(p==="./celestialEngine")return core.exports;
    throw Error("Unexpected bridge import "+p);});
const J=bridge.exports;
const t0=new Date("2026-10-19T19:40:00.000Z");
const jd=t0.getTime()/86400000+2440587.5;
const moon=(r,ang)=>({x:r*Math.cos(ang),y:0,z:r*Math.sin(ang)});
const sun=(r,ang)=>({x:r*Math.cos(ang),y:0,z:r*Math.sin(ang)});
const examples=Array.from({length:7},(_,i)=>({
  jdUt:jd+i/144,
  moonEarthFixedKm:moon(380000,Math.PI/4+i*2.5*Math.PI/180),
  sunEarthFixedKm:sun(149600000,Math.PI-i*2.5*Math.PI/180)
}));
const payload={
  source:"JPL HORIZONS",provenance:"GEOCENTRIC_ICRF_RAW",
  validation:"NOT_EARTH_FIXED_NOT_YET_USED_BY_RENDERER",
  frame:"ICRF_EQUATORIAL",vectorUnits:"KM",
  generatedAt:t0.toISOString(),
  terrestrial:{
    activation:"QA_OPT_IN_RENDERER_ONLY",
    conversion:"EQUINOX_BASED_APPROX_PRECESSION_NUTATION_UT1_POLAR_MOTION",
    angularAudit:{moonDirectionDeltaDeg:0.09,sunDirectionDeltaDeg:0.008},
    earthFixedSamples:examples
  }
};
J.clearJplRendererQa();
assert.equal(J.jplRendererQaAt(t0),null,"Default production must remain analytical");
assert.equal(J.applyJplRendererQa(payload,t0),true);
const dateMid=new Date(t0.getTime()+5*60_000);
const midpoint=J.jplRendererQaAt(dateMid);
assert.ok(midpoint);
assert.ok(Math.abs(core.exports.norm(midpoint.moonEarthFixedKm)-380000)<1e-5,
  "Great-circle interpolation must not shrink Earth/Moon distance");
assert.ok(Math.abs(core.exports.norm(midpoint.sunEarthFixedKm)-149600000)<0.00001,
  "Earth-fixed 10-minute interpolation must keep physical Sun range");
assert.ok(midpoint.illuminatedFraction>=0&&midpoint.illuminatedFraction<=1);
assert.equal(J.jplRendererQaAt(new Date(t0.getTime()-3000)),null,
  "Do not extrapolate to times before the first JPL sample");
assert.equal(J.jplRendererQaAt(new Date(t0.getTime()+61*60_000)),null,
  "Do not extrapolate beyond verified 60-minute window");
for(const bad of [
  {...payload,source:"SYNTHETIC"},
  {...payload,generatedAt:new Date(t0.getTime()-20*60_000).toISOString()},
  {...payload,terrestrial:{...payload.terrestrial,activation:"STAGED_NOT_USED_BY_RENDERER"}},
  {...payload,terrestrial:{...payload.terrestrial,
    earthFixedSamples:[...examples.slice(0,2),
      {...examples[2],jdUt:examples[1].jdUt},...examples.slice(3)]}},
  {...payload,terrestrial:{...payload.terrestrial,
    earthFixedSamples:examples.map((s,i)=>i===1?
      {...s,moonEarthFixedKm:{x:1,y:2,z:3}}:s)}},
  // Physically plausible ranges are NOT sufficient: a corrupted Earth-fixed
  // axis rotation or missing 10-minute sample must not jump the visible Moon.
  {...payload,terrestrial:{...payload.terrestrial,
    earthFixedSamples:examples.map((s,i)=>i===2?
      {...s,moonEarthFixedKm:moon(380000,Math.PI/4+70*Math.PI/180)}:s)}},
  {...payload,terrestrial:{...payload.terrestrial,
    earthFixedSamples:examples.map((s,i)=>i===2?
      {...s,sunEarthFixedKm:sun(149600000,Math.PI-50*Math.PI/180)}:s)}},
  {...payload,terrestrial:{...payload.terrestrial,
    earthFixedSamples:examples.map((s,i)=>i===2?
      {...s,moonEarthFixedKm:moon(404000,Math.PI/4+i*2.5*Math.PI/180)}:s)}}
]){
  assert.equal(J.applyJplRendererQa(bad,t0),false);
  assert.equal(J.jplRendererQaAt(dateMid),null,"Fail closed after bad JPL source");
}
J.clearJplRendererQa();
assert.equal(J.jplRendererQaAt(dateMid),null);
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
const route=readFileSync("app/api/moon-jpl/route.ts","utf8");
assert.match(scene,/new URLSearchParams\(window\.location\.search\)\.get\("celestialJpl"\)==="1"/,
  "Production must not silently opt all visitors into an unvalidated JPL transform");
assert.match(scene,/jplRendererQaAt\(date\)/);
assert.match(scene,/setView\(isLunarView\(view\) \? lastEarthView\.current : "MOON"\)/);
assert.match(scene,/data-celestial-toggle=\{isLunarView\(view\)/);
assert.match(scene,/clearJplRendererQa\(\)/);
assert.match(route,/earthFixedSamples/);
assert.match(route,/QA_OPT_IN_RENDERER_ONLY/);
console.log("PASS: preview JPL Earth-fixed sample interpolation, opt-in, source validation, no extrapolation, Moon/Earth toggle");
