#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const modulePath = "lib/earth/lightningObservation.ts";
const source = readFileSync(modulePath, "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext
} }).outputText;
const { lightningLayerTime, LIGHTNING_FRESHNESS_MINUTES } = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(compiled));
const now = Date.parse("2026-10-13T17:30:00Z");
const xml = `<WMS_Capabilities>
  <Layer><Name>unrelated_weather</Name><Dimension name="time">2026-10-13T17:29:00Z</Dimension></Layer>
  <Layer><Name>ldn_lightning_strike_density</Name><Dimension name="time">2026-10-13T17:10:00Z,2026-10-13T17:20:00Z</Dimension></Layer>
  <Layer><Name>other_source</Name><Dimension name="time">2026-10-13T17:29:59Z</Dimension></Layer>
  <Layer><Name>mtg_fd:li_afa</Name><Dimension name="time">2026-10-13T16:50:00Z/2026-10-13T17:25:00Z/PT5M</Dimension></Layer>
</WMS_Capabilities>`;
assert.equal(lightningLayerTime(xml, "ldn_lightning_strike_density", 90, now), "2026-10-13T17:20:00.000Z");
assert.equal(lightningLayerTime(xml, "mtg_fd:li_afa", 90, now), "2026-10-13T17:25:00.000Z");
assert.equal(lightningLayerTime(xml, "ldn_lightning_strike_density", 5, now), null);
assert.equal(lightningLayerTime(xml, "not-a-real-layer", 90, now), null);
assert.equal(LIGHTNING_FRESHNESS_MINUTES.NOAA,45);
assert.equal(LIGHTNING_FRESHNESS_MINUTES.MTG,30);
assert.equal(lightningLayerTime(xml,"mtg_fd:li_afa",4,now),null);
const userInterface = readFileSync("components/CupolaExperience.tsx", "utf8");
assert.match(userInterface, /canvas.width = 1024;/);
assert.match(userInterface, /const focusObservedLightning = \(\) =>/);
assert.ok(userInterface.includes("ageMs <= LIGHTNING_FRESHNESS_MINUTES[feed === \"noaa\" ? \"NOAA\" : \"MTG\"] * 60000"));
assert.match(userInterface, /uniforms.lightningTexture.value = transparentFallback/);
assert.match(userInterface, /uniforms.lightningEuropeTexture.value = transparentFallback/);
assert.match(userInterface, /float observedColor=max\(max\(s\.r,s\.g\),s\.b\);/);
assert.match(userInterface, /observedColor\*smoothstep\(0\.035,0\.12,s\.a\)/);
assert.doesNotMatch(userInterface, /return max\(s\.a,max\(max\(s\.r,s\.g\),s\.b\)\);/);
console.log("PASS: source-scoped lightning timestamps, stale expiry, readable hotspots and GPU reset");
