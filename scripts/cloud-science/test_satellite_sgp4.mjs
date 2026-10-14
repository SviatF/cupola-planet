#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { twoline2satrec, propagate, gstime, eciToGeodetic } from "satellite.js";

const require = createRequire(import.meta.url);
const source = readFileSync("lib/earth/satelliteSgp4.ts", "utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText;
const module={exports:{}};
new Function("require","module","exports",compiled)(require,module,module.exports);
const {orbitalElementQuality,prepareSgp4Omm,sgp4GeodeticPosition}=module.exports;

// Independent reference: published TLE from the satellite.js initialization
// guide. The reference is NEVER calculated from CUPOLA's old two-body code.
const l1="1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992";
const l2="2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442";
const t0=Date.UTC(2019,0,1)+ (156.50900463-1)*86400_000;
const at=new Date(t0);
const iss={
  NORAD_CAT_ID:25544,
  EPOCH:at.toISOString(),
  MEAN_MOTION:15.51174618,
  ECCENTRICITY:0.0008217,
  INCLINATION:51.6433,
  RA_OF_ASC_NODE:59.2583,
  ARG_OF_PERICENTER:16.4489,
  MEAN_ANOMALY:347.6017,
  BSTAR:0.59442e-4,
  MEAN_MOTION_DOT:0.00003075,
  MEAN_MOTION_DDOT:0,
};
const good=orbitalElementQuality(iss,at);
assert.ok(good);
assert.equal(good.maxAgeHours,72);
assert.ok(Math.abs(good.ageHours)<1e-9);
const ready=prepareSgp4Omm(iss,at);
assert.ok(ready,"valid official TLE-derived ISS OMM must initialize SGP4");
const ref=twoline2satrec(l1,l2);
for(const minutes of [0,5,20,60]){
  const time=new Date(t0+minutes*60_000);
  const expected=propagate(ref,time);
  const observed=sgp4GeodeticPosition(ready,time);
  assert.ok(expected?.position);
  assert.ok(observed);
  const geo=eciToGeodetic(expected.position,gstime(time));
  const latitude=geo.latitude*180/Math.PI;
  const longitude=geo.longitude*180/Math.PI;
  const errorDeg=Math.hypot(observed.latitude-latitude,observed.longitude-longitude);
  assert.ok(errorDeg<0.3,"SGP4 OMM geolocation must agree with independent TLE SGP4");
  assert.ok(Math.abs(observed.altitude-geo.height)<10,"ISS altitude must match SGP4 within 10 km");
  assert.ok(observed.altitude>300 && observed.altitude<500);
  assert.ok(observed.velocity>7 && observed.velocity<9);
}
const now=new Date(t0+72*3600_000+1000);
assert.equal(orbitalElementQuality(iss,now),null,
 "old LEO GP epoch must NEVER be relabeled as live through fresh HTTP");
assert.equal(prepareSgp4Omm({...iss,EPOCH:"2024-01-01T00:00:00Z"},new Date("2026-10-14T19:00:00Z")),null);
assert.equal(prepareSgp4Omm({...iss,MEAN_MOTION:0},at),null);
assert.equal(prepareSgp4Omm({...iss,ECCENTRICITY:1.1},at),null);
assert.equal(prepareSgp4Omm({...iss,BSTAR:"invalid"},at),null);
assert.equal(prepareSgp4Omm({...iss,NORAD_CAT_ID:"-1"},at),null);
assert.equal(orbitalElementQuality({...iss,EPOCH:new Date(t0+7*3600_000).toISOString()},at),null);
assert.equal(orbitalElementQuality({...iss,MEAN_MOTION:2.1},new Date(t0+8*86400_000)),null,
 "MEO records older than 7d are stale");
assert.equal(orbitalElementQuality({...iss,MEAN_MOTION:1},new Date(t0+15*86400_000)),null,
 "GEO records older than 14d are stale");
const route=readFileSync("app/api/satellites/route.ts","utf8");
assert.ok(route.includes("prepareSgp4Omm(record, at)"));
assert.ok(route.includes("sgp4GeodeticPosition(prepared, motionTargetDate)"));
assert.ok(route.includes("sgp4GeodeticPosition(prepared, sampleDate)"));
assert.ok(route.includes("orbitalElementQuality(record, now)"));
assert.ok(route.includes("staleMirrorRecordsDropped"));
assert.ok(route.includes('orbitModel: "SGP4"'));
assert.ok(route.includes("const bstarRaw = line1.slice(53, 61).trim()"));
assert.ok(!route.includes("solveEccentricAnomaly("));
assert.ok(!route.includes("gmstRadians("));
assert.ok(!route.includes("const MU = 398600.4418;"));
console.log("PASS: real ISS SGP4 OMM vs TLE, WGS84, velocity, age gates, and no two-body fallback");
