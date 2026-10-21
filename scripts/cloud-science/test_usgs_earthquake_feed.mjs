#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const source=readFileSync("lib/earth/usgsEarthquakeFeed.ts","utf8");
const code=ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const U=await import("data:text/javascript,"+encodeURIComponent(code));
const now=Date.parse("2026-10-20T11:30:00Z");
const good={type:"FeatureCollection",metadata:{generated:now-60000},features:[
  {id:"ok",geometry:{type:"Point",coordinates:[-118.3,34.1,11]},
   properties:{mag:4.8,time:now-100000,place:"Los Angeles",
     url:"https://earthquake.usgs.gov/earthquakes/eventpage/test"}},
  {id:"no-time",geometry:{type:"Point",coordinates:[-118.3,34.1,11]},
   properties:{mag:6.3,time:null,place:"Unknown time"}},
  {id:"future",geometry:{type:"Point",coordinates:[-118.3,34.1,11]},
   properties:{mag:7.9,time:now+3600000}},
  {id:"old",geometry:{type:"Point",coordinates:[-118.3,34.1,11]},
   properties:{mag:8.2,time:now-40*3600000}},
  {id:"ok",geometry:{type:"Point",coordinates:[-118.3,34.1,11]},
   properties:{mag:4.8,time:now-100000}},
  {id:"invalid-lat",geometry:{type:"Point",coordinates:[0,200]},
   properties:{mag:5.6,time:now-100000}}
]};
const parsed=U.parseUsgsRecentEarthquakes(good,now);
assert.equal(parsed.earthquakes.length,1);
assert.equal(parsed.earthquakes[0].id,"ok");
assert.equal(parsed.earthquakes[0].magnitude,4.8);
assert.equal(parsed.earthquakes[0].time,now-100000);
assert.equal(parsed.provenance,"USGS_GEOJSON_VERIFIED");
assert.ok(parsed.newestEventAt!==parsed.sourceGeneratedAt,
  "Event occurrence and source generation must be distinct clocks");
for(const bad of [
  {...good,type:"Other"},
  {...good,features:null},
  {...good,metadata:{generated:now-3*3600000}},
  {...good,metadata:{generated:now+10*60000}},
  {...good,metadata:{}}
]){
  assert.throws(()=>U.parseUsgsRecentEarthquakes(bad,now));
}
const route=readFileSync("app/api/earthquakes/route.ts","utf8");
assert.match(route,/parseUsgsRecentEarthquakes\(source,Date\.now\(\)\)/);
assert.match(route,/provenance:"UNAVAILABLE"/);
assert.match(route,/status:503/);
assert.doesNotMatch(route,/time:\s*Number\.isFinite\(time\)\s*\?\s*time\s*:\s*Date\.now\(\)/,
  "No fabricated current-time quakes");
console.log("PASS: real USGS event times, metadata freshness, deduplication and outage handling");
