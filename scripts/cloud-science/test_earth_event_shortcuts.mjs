#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync("components/CupolaExperience.tsx", "utf8");
assert.match(s, /const focusEarthEvent = \(event: DiscoveryEvent\) =>/);
assert.match(s, /setFollowIss\(false\);/);
assert.match(s, /setFollowSunrise\(false\);/);
assert.match(s, /setFollowSatellite\(false\);/);
assert.match(s, /focusEarthEvent\(discoveryEvents\[nextIndex\]\)/);
for (const [kind, label] of [
  ["CYCLONE","VIEW STORM"],["EARTHQUAKE","VIEW QUAKE"],
  ["AURORA","VIEW AURORA"],["WILDFIRE","VIEW FIRE"],["VOLCANO","VIEW VOLCANO"],
]) {
 assert.ok(s.includes('focusEventKind("'+kind+'")'), "No event action for "+kind);
 assert.ok(s.includes(label), "Missing UI "+label);
}
assert.match(s, /kind: "LIGHTNING OBSERVED"/);
console.log("PASS: feed-gated direct fly-to for five natural event layers and lightning fallback");
