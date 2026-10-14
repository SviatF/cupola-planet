#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const client=readFileSync("components/CupolaExperience.tsx","utf8");
const api=readFileSync("app/api/satellites/route.ts","utf8");
assert.match(client,/const earthEntry=disc>=0/);
assert.match(client,/getAttribute\("instanceStart"\)/);
assert.match(client,/satelliteFeedStale/);
assert.match(client,/get\("satellite"\)/);
assert.ok(!client.includes("const point = satelliteInterpolatedWorldPoint(satellite, nowMs);"));
assert.ok(!api.includes("s-maxage=120, stale-while-revalidate=600"));
assert.match(api,/status: 503/);
console.log("PASS: satellite picking, cache freshness and honest failure");
