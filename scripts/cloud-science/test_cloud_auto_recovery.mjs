#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const source=ts.transpileModule(readFileSync("lib/earth/cloudAutoRecovery.ts","utf8"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const {isFreshCloudV3RecoveryManifest}=await import("data:text/javascript,"+encodeURIComponent(source));
const now=Date.parse("2026-10-16T18:45:00Z");
const valid={
  schema:"cupola-scientific-cloud-v3/v1",version:"20261016180004",
  width:2048,height:1024, observed_coverage_fraction:0.655799,
  generated_at:"2026-10-16T18:00:04Z",
  expires_at:"2026-10-16T19:30:04Z",
  sources:[
    {source:"goes-acmf",observation_end:"2026-10-16T17:25:06Z"},
    {source:"himawari9-cmsk",observation_end:"2026-10-16T17:10:00Z"},
  ]
};
assert.equal(isFreshCloudV3RecoveryManifest(valid,now),true,"current NOAA/JMA must resume");
assert.equal(isFreshCloudV3RecoveryManifest({...valid, expires_at:"2026-10-16T18:20:00Z"},now),false,"expired release rejected");
assert.equal(isFreshCloudV3RecoveryManifest({...valid,observed_coverage_fraction:0},now),false,"empty observations");
assert.equal(isFreshCloudV3RecoveryManifest({...valid,sources:[{source:"gfs",observation_end:"2026-10-16T18:00:00Z"}]},now),false,"model cannot masquerade as live L2");
assert.equal(isFreshCloudV3RecoveryManifest({...valid,sources:[{source:"goes-acmf",observation_end:"2026-10-16T16:00:00Z"}]},now),false,"old source observation");
assert.equal(isFreshCloudV3RecoveryManifest({...valid,expires_at:"2026-10-17T02:00:00Z"},now),false,"unreasonably long expiry");
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(scene,/cloudAutoRecover/, "recover flag must survive page reload");
assert.match(scene,/setCloudEngine\("v3"\)/, "must reactivate true V3 after new observations");
assert.match(scene,/isFreshCloudV3RecoveryManifest\(meta, Date\.now\(\)\)/);
assert.match(scene,/kind=atlas&version=/,"verify image endpoint before resuming");
assert.match(scene,/setCloudAutoRecover\(false\)/,"manual STANDARD selection must cancel automatic recovery");
assert.match(scene,/setCloudAutoRecover\(true\)/,"incomplete satellite fallback must opt into recovery");
console.log("PASS: V3 scientific source-only auto-recovery, persistent fallback, manual opt-out and fresh atlas gate");
