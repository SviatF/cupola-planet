#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const source=readFileSync("lib/earth/volcanoReportPresentation.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
}}).outputText;
const {volcanoReportPresentation:classify}=await import(
  "data:text/javascript,"+encodeURIComponent(js));
const now=Date.parse("2026-10-20T12:00:00Z");
const at=hours=>new Date(now-hours*3600000).toISOString();
const fresh=classify("recent-report",at(3),now);
assert.equal(fresh.recentReport,true);
assert.ok(fresh.strength>0.62&&fresh.strength<=1);
for(const [status,time] of [
  ["historical-report",at(3)],
  ["recent-report",at(49)],
  ["recent-report",null],
  ["recent-report","invalid"],
  ["recent-report",at(-2)]
]){
  const value=classify(status,time,now);
  assert.equal(value.recentReport,false,
    "Unverified or stale volcano report must NEVER have live animation");
  assert.equal(value.strength,0.22);
}
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
const start=scene.indexOf("function VolcanoMarker(");
const end=scene.indexOf("function VolcanoLayer(",start);
assert.ok(start>=0&&end>start);
const marker=scene.slice(start,end);
assert.match(marker,/volcanoReportPresentation\(event\.dataStatus,event\.eventTime\)/);
assert.match(marker,/if\(report\.recentReport\)/);
assert.match(marker,/report\.recentReport \? "#ff8a4f" : "#9daeb8"/);
assert.doesNotMatch(marker,/plumeRef|coneGeometry/,
  "A recent activity REPORT alone cannot justify a rendered eruption plume");
assert.doesNotMatch(marker,/magnitudeBoost|Math\.max\(0,\(Date\.now\(\)-/,
  "Eruption magnitude and actual activity must not be invented");
const route=readFileSync("app/api/volcanoes/route.ts","utf8");
assert.match(route,/recent-report/);
assert.match(route,/historical-report/);
assert.match(route,/does not prove a continuing eruption/);
console.log("PASS: volcano markers represent reports, not fictional live ash plumes");
