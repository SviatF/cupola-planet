#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync("lib/earth/glmFlashFeed.ts", "utf8");
const compiled = ts.transpileModule(src, {
  compilerOptions: {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
}).outputText;
const {parseGLMFeed, selectUnseenGLMFlashes} =
  await import("data:text/javascript;charset=utf-8," + encodeURIComponent(compiled));

const now = Date.parse("2026-10-15T22:00:00.000Z");
const observed = "2026-10-15T21:58:03.120Z";
const base = {
  schema:"cupola-goes-glm-flashes/v1",
  generated_at:"2026-10-15T21:59:40Z",
  expires_at:"2026-10-15T22:09:40Z",
  latest_observation_at:"2026-10-15T21:59:25Z",
  observation_kind:"satellite-optical-flash-centroid-not-ground-strike",
  source:"NOAA GOES GLM-L2-LCFA, public anonymous S3",
  sources:[
    {satellite:"GOES-18",product:"GLM-L2-LCFA",last_scan_end:"2026-10-15T21:59:20Z",granules_validated:12},
    {satellite:"GOES-19",product:"GLM-L2-LCFA",last_scan_end:"2026-10-15T21:59:25Z",granules_validated:12},
  ],
  flashes:[
    {id:"18:2026288215800:10",lat:26.0,lon:-100.0,observed_at:observed,satellite:"GOES-18"},
    {id:"19:2026288215800:22",lat:14.0,lon:-66.0,observed_at:observed,satellite:"GOES-19"},
  ],
  count_sampled:2,count_available_in_selected_files:2,
};
assert.ok(parseGLMFeed(base,now),"fresh native satellite data admitted");
assert.equal(parseGLMFeed({...base,generated_at:"2026-10-15T21:30:00Z"},now),null,"stale publisher rejected");
assert.equal(parseGLMFeed({...base,expires_at:"2026-10-15T21:59:59Z"},now),null,"expired publisher rejected");
assert.equal(parseGLMFeed({...base,observation_kind:"ground-strike"},now),null,"misrepresented strike origin rejected");
assert.equal(parseGLMFeed({...base,flashes:[base.flashes[0],base.flashes[0]]},now),null,"same flash ID cannot appear twice");
assert.equal(parseGLMFeed({...base,flashes:[{...base.flashes[0],observed_at:"2026-10-15T21:30:00Z"},base.flashes[1]]},now),null,"stale flash rejected");
assert.equal(parseGLMFeed({...base,flashes:[{...base.flashes[0],lat:120},base.flashes[1]]},now),null,"bad geolocation rejected");
const seen = new Set();
const valid = parseGLMFeed(base,now);
assert.ok(valid);
assert.equal(selectUnseenGLMFlashes(valid,seen,now,80).length,2,"new detections appear once");
assert.equal(selectUnseenGLMFlashes(valid,seen,now,80).length,0,"same publication cannot replay a flash");
const next = {...base,flashes:[...base.flashes,
  {id:"19:2026288215940:23",lat:14.2,lon:-66.1,observed_at:"2026-10-15T21:59:41Z",satellite:"GOES-19"}],
  count_sampled:3,count_available_in_selected_files:3};
assert.equal(selectUnseenGLMFlashes(next,seen,now,80).length,1,"only a newly arrived GLM ID animates");

const component = readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(component,/function RealGLMFlashLayer\(/);
assert.match(component,/flashOnceAtMs/);
assert.match(component,/initializedRef\.current = true/);
assert.match(component,/selectUnseenGLMFlashes\(feed, seenRef\.current/);
assert.match(component,/glmActiveRef\.current \? \[\] : zonesByFeed\.noaa/);
assert.match(component,/onCoverageChange\(false, 0\)/);
assert.match(component,/performance\.now\(\) - flashOnceAtMs/);
assert.ok(!component.includes("Math.random() + flashOnceAtMs"),"never simulate extra GLM records");
const route=readFileSync("app/api/lightning-glm/route.ts","utf8");
assert.match(route,/parseGLMFeed\(JSON\.parse\(text\)\)/);
assert.match(route,/no-fresh-qa-screened-glm-flashes/);
assert.match(route,/optical-centroid-not-ground-strike/);
const publisher=readFileSync("scripts/lightning/publish_goes_glm.py","utf8");
assert.match(publisher,/flash_quality_flag/);
assert.match(publisher,/num2date/);
assert.match(publisher,/noaa-goes19/);
assert.match(publisher,/noaa-goes18/);
assert.ok(!publisher.includes("api_key"),"no hidden subscription / paid API");
console.log("PASS: GLM no-key source, bounded freshness, single-shot unique ID and honest regional fallback");
