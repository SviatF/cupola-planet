#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const js=ts.transpileModule(readFileSync("lib/earth/cloudHealth.ts","utf8"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const {cloudHealth}=await import("data:text/javascript,"+encodeURIComponent(js));
const now=Date.parse("2026-10-16T21:00:00Z");
const args=(mins,status="observed",coverage=.65)=>({enabled:true,engine:"v3",status,coverage,
  observationTime:new Date(now-mins*60000).toISOString()});
assert.equal(cloudHealth(args(12),now).state,"LIVE");
assert.equal(cloudHealth(args(30),now).state,"LIVE");
assert.equal(cloudHealth(args(31),now).state,"DELAYED");
assert.equal(cloudHealth(args(88),now).state,"DELAYED");
assert.equal(cloudHealth(args(91),now).state,"OFFLINE");
assert.equal(cloudHealth(args(10,"visual",0),now).state,"DELAYED");
assert.match(cloudHealth(args(10,"visual",0),now).description,/zero verified current L2/i);
assert.equal(cloudHealth(args(100,"visual",0),now).state,"OFFLINE");
assert.equal(cloudHealth(args(10,"observed",0),now).state,"OFFLINE",
  "synthetic no-coverage must not claim LIVE");
assert.equal(cloudHealth({...args(10),engine:"legacy"},now).state,"OFFLINE");
assert.equal(cloudHealth({...args(10),enabled:false},now).label,"OFF");
assert.equal(cloudHealth({...args(10),observationTime:null},now).state,"OFFLINE");
assert.equal(cloudHealth({enabled:true,engine:"v3"},now).state,"CHECKING");
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(scene,/cloudHealth\(/);
assert.match(scene,/sourceObservationAt/);
assert.match(scene,/cloudHealthLabel\.label/);
assert.match(scene,/Satellite surface \(experimental\)/);
assert.doesNotMatch(scene,/<SatelliteSurfacePreview\b/);
assert.match(scene,/setCloudAutoRecover\(true\)/);
console.log("PASS: L2 LIVE/DELAYED/OFFLINE, visual-not-L2, stale expiry, compact VIIRS panel");
