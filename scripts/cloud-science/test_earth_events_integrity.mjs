#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const component = readFileSync("components/CupolaExperience.tsx", "utf8");
const weather = readFileSync("app/api/weather/route.ts", "utf8");
const aurora = readFileSync("app/api/aurora-oval/route.ts", "utf8");
const storms = readFileSync("app/api/storms/route.ts", "utf8");
const volcanoes = readFileSync("app/api/volcanoes/route.ts", "utf8");
const quakes = readFileSync("app/api/earthquakes/route.ts", "utf8");
assert.match(component, /if \(!satellitePrefetchEnabled\) return;/);
assert.match(component, /\}, \[satellitePrefetchEnabled\]\);/);
assert.match(component, /if \(!satellitePrefetchEnabled\) return;/);
assert.match(component, /controlPanel === "layers" \|\| layers\.satellites/);
assert.match(component, /weatherLayer === "PRESSURE"/);
assert.match(component, /weatherLayer === "SNOW"/);
assert.match(component, /SOURCE OFFLINE/);
assert.match(component, /earthFeeds\.storms \? storms : \[\]/);
assert.match(weather, /surface_pressure,snowfall/);
assert.match(weather, /pressure: Number\.isFinite/);
assert.match(weather, /snowfall: Number\.isFinite/);
assert.match(aurora, /status: "stale-or-unknown"/);
assert.match(storms, /status: 503/);
assert.match(volcanoes, /status: 503/);
const quakeParser=readFileSync("lib/earth/usgsEarthquakeFeed.ts","utf8");
assert.match(quakeParser,/time>nowMs\+5\*60000/,
  "USGS events must reject future timestamps instead of inventing occurrence time");
assert.match(quakeParser,/generated<nowMs-2\*3600000/,
  "USGS feed publication must be recent");
assert.match(quakes,/parseUsgsRecentEarthquakes\(source,Date\.now\(\)\)/,
  "USGS route must enforce verified source timing and event metadata");
assert.match(quakes,/status:503/,
  "USGS failure must not look like zero earthquakes");
console.log("PASS: lazy orbital catalog, point weather and event-source fail-closed checks");
