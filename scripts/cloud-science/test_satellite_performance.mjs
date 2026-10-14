#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync("lib/earth/satelliteSgp4.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(require, module, module.exports);
const { prepareSgp4Omm, sgp4GeodeticPosition } = module.exports;

// Synthetic but physically valid 17,000-element load test. This proves
// algorithmic capacity, NOT a claim that 17k current GP records are online.
const now = new Date("2026-10-14T19:30:00Z");
const later = new Date(now.getTime() + 180_000);
const start = performance.now();
const count = 17000;
let valid = 0;
for (let i = 0; i < count; i++) {
  const record = {
    NORAD_CAT_ID: 100000 + i,
    EPOCH: now.toISOString(),
    MEAN_MOTION: 15.3,
    ECCENTRICITY: 0.0005,
    INCLINATION: 53.0,
    RA_OF_ASC_NODE: (i * 13) % 360,
    ARG_OF_PERICENTER: (i * 17) % 360,
    MEAN_ANOMALY: (i * 19) % 360,
    BSTAR: 0.00005,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  };
  const prepared = prepareSgp4Omm(record, now);
  assert.ok(prepared, "every valid GP record initializes SGP4");
  const a = sgp4GeodeticPosition(prepared, now);
  const b = sgp4GeodeticPosition(prepared, later);
  assert.ok(a && b, "both 3-minute SGP4 samples must be available");
  assert.ok(a.latitude >= -90 && a.latitude <= 90);
  assert.ok(b.longitude >= -180 && b.longitude <= 180);
  assert.ok(Math.abs(a.altitude - b.altitude) < 100);
  valid++;
}
const duration = performance.now() - start;
assert.equal(valid, count);

// Source-contract regression: production exposes measured compute time and
// invalid/duplicate counts, and a track request never replaces newer state.
const route = readFileSync("app/api/satellites/route.ts", "utf8");
const scene = readFileSync("components/CupolaExperience.tsx", "utf8");
assert.match(route, /function buildSatelliteSnapshot\(/);
assert.match(route, /performance\.now\(\)/);
assert.match(route, /sgp4ComputeMs:/);
assert.match(route, /duplicateRecords/);
assert.match(route, /invalidRecords/);
assert.match(route, /await fetchGpCat\(trackId\)/);
assert.match(scene, /item\.epoch !== tracked\.epoch/);
assert.match(scene, /return \{ \.\.\.item, track: tracked\.track \}/);
assert.doesNotMatch(scene, /\.\.\.item, \.\.\.tracked/);
assert.match(scene, /previousTrack\.epoch === satellite\.epoch/);
console.log(`PASS: ${valid} synthetic SGP4 orbits x2 positions; ${duration.toFixed(0)} ms on CI runner; Follow epoch isolation and API telemetry`);
