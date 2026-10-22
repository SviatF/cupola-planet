#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";

const require=createRequire(import.meta.url);
const src=readFileSync("lib/earth/earthIntelTimeline.ts","utf8");
const code=ts.transpileModule(src,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
}}).outputText;
const module={exports:{}};
new Function("require","module","exports",code)(require,module,module.exports);
const {selectHistoricalEvents}=module.exports;
const now=Date.parse("2026-10-22T20:00:00Z");
const samples=[
  {id:"future",occurredAt:"2026-10-22T20:01:00Z"},
  {id:"latest",occurredAt:"2026-10-22T19:59:00Z"},
  {id:"hour",occurredAt:"2026-10-22T19:00:00Z"},
  {id:"overnight",occurredAt:"2026-10-21T20:01:00Z"},
  {id:"expired",occurredAt:"2026-10-21T19:59:00Z"},
  {id:"forecast",occurredAt:null},
  {id:"malformed",occurredAt:"not-a-time"},
];
assert.deepEqual(selectHistoricalEvents(samples,now,0).map(x=>x.id),
  ["latest","hour","overnight"],"NOW shows only actual loaded event timestamps in last 24h");
assert.deepEqual(selectHistoricalEvents(samples,now,2).map(x=>x.id),
  ["overnight"],"rewind cannot introduce future observations");
assert.deepEqual(selectHistoricalEvents(samples,now,24).map(x=>x.id),
  [],"24-hour cutoff excludes events older than 24h");
assert.deepEqual(selectHistoricalEvents(samples,now,Infinity),[],"nonfinite timestamps fail closed");
const panel=readFileSync("components/EarthIntelPanel.tsx","utf8");
assert.match(panel,/NOT TELEMETRY|not.*historical satellite-cloud video/i);
assert.ok(panel.includes("selectHistoricalEvents"));
const globe=readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(globe.includes("earthIntelSources:EarthSourceRow[]"));
assert.ok(globe.includes("earthIntelEvents:EarthDiscoveryRow[]"));
assert.ok(globe.includes('onFocus={(id)=>'),"event card must fly to real coordinates");
console.log("PASS: dated 24h event timeline, future/malformed exclusion, source-provenance and fly-to wiring");
