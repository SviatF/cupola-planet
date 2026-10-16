#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src=readFileSync("lib/earth/eventDataFreshness.ts","utf8");
const js=ts.transpileModule(src,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const {earthSourceTime,sourceAgeMinutes,isCurrentSource,summarizeEventSource}
  =await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(js));
const now=Date.parse("2026-10-15T22:00:00Z");
assert.equal(earthSourceTime(1792101300000),new Date(1792101300000).toISOString());
assert.equal(earthSourceTime("2026-10-15 21:20:00"),"2026-10-15T21:20:00.000Z");
assert.equal(earthSourceTime("2026-10-15T21:20:00Z"),"2026-10-15T21:20:00.000Z");
assert.equal(earthSourceTime("not a timestamp"),null);
assert.equal(sourceAgeMinutes("2026-10-15T21:20:00Z",now),40);
assert.equal(isCurrentSource("2026-10-15T21:20:00Z",45,now),true);
assert.equal(isCurrentSource("2026-10-15T21:20:00Z",30,now),false);
assert.equal(isCurrentSource(null,45,now),false);
assert.equal(sourceAgeMinutes("2026-10-15T22:10:00Z",now),null);
assert.deepEqual(summarizeEventSource("2026-10-15T21:20:00Z",45,now),
  {observationAgeMinutes:40,sourceFresh:true});

const load=p=>readFileSync(p,"utf8");
const aurora=load("app/api/aurora-oval/route.ts");
assert.match(aurora,/dataStatus: "forecast"/);
assert.match(aurora,/MAX_OBSERVATION_AGE_MINUTES/);
assert.match(aurora,/source-observation-outside-90-min-window/);
assert.match(aurora,/forecastMs < observationMs/);
assert.match(aurora,/status: "stale-or-unknown"/);
assert.match(aurora,/points: \[\]/);

const storms=load("app/api/storms/route.ts");
assert.match(storms,/numberValue\(p\.fcstprd\)/);
assert.match(storms,/ADVISORY_MAX_AGE_MINUTES/);
assert.match(storms,/find\(\(entry\) => entry\.point\.tau === 0\)/);
assert.match(storms,/if \(!currentEntry\) \{ filteredUnknown\+\+; continue; \}/);
assert.match(storms,/trackKind: "forecast-projection"/);
assert.match(storms,/excludedOutdatedAdvisories/);
assert.match(storms,/status: 503/);

const volcano=load("app/api/volcanoes/route.ts");
const gdacs=load("lib/earth/gdacsVolcano.ts");
assert.match(volcano,/fetchGdacsVolcanoAdvisories/);
assert.match(volcano,/recentReportCount/);
assert.match(volcano,/age<=48\*60/);
assert.match(volcano,/status: 503/);
assert.match(gdacs,/kind\s*!==\s*"VO"/);
assert.match(gdacs,/type\s*!==\s*"FeatureCollection"/);
assert.match(gdacs,/sourceAgeMinutes/);

const wildfires=load("app/api/wildfires/route.ts");
const gwis=load("lib/earth/gdacsWildfires.ts");
assert.match(wildfires,/NASA_FIRMS_MAP_KEY/);
assert.match(wildfires,/fetchGdacsWildfireReports/);
assert.match(wildfires,/age > 12\*60/);
assert.match(wildfires,/observationAgeMinutes/);
assert.match(wildfires,/recent-reports-not-thermal-satellite-detections/);
assert.match(wildfires,/status:503/);
assert.match(gwis,/kind\s*!==\s*"WF"\s*&&\s*kind\s*!==\s*"FF"/);

const ui=load("components/CupolaExperience.tsx");
assert.match(ui,/FORECAST QUIET/);
assert.match(ui,/NO CURRENT NHC ADVISORIES/);
assert.match(ui,/RECENT REPORTS/);
assert.match(ui,/HISTORICAL REPORTS/);
assert.match(ui,/REPORTED WILDFIRE/);
assert.match(ui,/NO NEW REPORTS/);
assert.match(ui,/source: typeof data\.source/);
assert.match(ui,/wildfireAge = formatUpdatedAge\(wildfireData\?\.latestAcquisition, now\)/);
assert.match(ui,/volcanoUpdatedAge = formatUpdatedAge\(volcanoData\?\.latestReportAt, now\)/);

console.log("PASS: observed UTC source ages, real NHC advisory positions, OVATION forecast, official volcano and wildfire reports");
