#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync("lib/earth/lightningStormZones.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { extractLightningStormZones, selectLightningStormZones,
  lightningZoneDistance, stormZoneFlashEnvelope, filterModelLightningByObservation } = await import(
    "data:text/javascript;charset=utf-8," + encodeURIComponent(js)
  );

const width = 128, height = 64;
const raster = new Uint8ClampedArray(width * height * 4);
function pixel(x, y, r, g, b, a = 255) {
  const i = (y * width + x) * 4;
  raster[i] = r; raster[i+1] = g; raster[i+2] = b; raster[i+3] = a;
}
// Test opaque black WMS backgrounds: never fabricate lightning.
for(let y = 0; y < height; y++) for(let x = 0; x < width; x++) {
  pixel(x, y, 0, 0, 0, 255);
}
assert.deepEqual(extractLightningStormZones(raster, width, height, "NOAA"),
  {cells: 0, zones: []});

// Two small REAL WMS activity regions: positions are based on image pixels,
// and the number of cinematic effects must remain bounded.
for(let y = 12; y < 15; y++) for(let x = 20; x < 23; x++) pixel(x,y,80,160,255);
for(let y = 37; y < 40; y++) for(let x = 91; x < 94; x++) pixel(x,y,255,180,20);
const result = extractLightningStormZones(raster,width,height,"NOAA",16);
assert.equal(result.cells,18);
assert.ok(result.zones.length >= 2 && result.zones.length <= 6,"should constrain clustered pixels to a few storm zones");
assert.ok(result.zones.some(z=>z.latitude>45 && z.latitude<60 && z.longitude< -100));
assert.ok(result.zones.some(z=>z.latitude< -10 && z.latitude> -25 && z.longitude>60));
assert.ok(result.zones.every(z=>z.source==="NOAA" && z.strength>0));

// Rejected invalid/blank frames should never trigger an animation.
assert.deepEqual(extractLightningStormZones(new Uint8ClampedArray(4),width,height,"NOAA"),
  {cells:0,zones:[]});
for(let y = 0; y < height; y++) for(let x = 0; x < width; x++) {
  pixel(x,y,255,255,255,255);
}
assert.deepEqual(extractLightningStormZones(raster,width,height,"NOAA"),
  {cells:0,zones:[]},"an opaque white WMS background must not be treated as a storm");

// Overlapping satellite coverage must not draw duplicate flashes.
// Regions across the -180/180 seam also count as neighbors.
const zone=(latitude,longitude,strength,source)=>({latitude,longitude,strength,source});
const deduped=selectLightningStormZones([
  zone(0,179,0.8,"NOAA"),zone(0,-179,1,"MTG"),zone(40,35,0.65,"NOAA")
],12,5);
assert.equal(deduped.length,2);
const modelGrid=[
 {latitude:0,longitude:-178,density:1},
 {latitude:-22,longitude:130,density:2},
];
const outside=filterModelLightningByObservation(modelGrid,deduped,7);
assert.equal(outside.length,1);
assert.equal(outside[0].longitude,130,"an Atlantic observation must not suppress Asia Pacific forecasts");
const isolated=new Uint8ClampedArray(width*height*4);
isolated.set([190,190,190,255],(10*width+10)*4);
assert.equal(extractLightningStormZones(isolated,width,height,"NOAA").zones.length,0,
  "a weak isolated styling pixel must not become a storm");
assert.ok(lightningZoneDistance(zone(0,179,1,"NOAA"),zone(0,-179,1,"MTG"))<3);

assert.ok(stormZoneFlashEnvelope(0,0)>0.95);
assert.ok(stormZoneFlashEnvelope(1,0)<0.02);
assert.ok(stormZoneFlashEnvelope(5.8,0)>0.95);

// Static wiring prevents an innocuous UI refactor from hiding all flashes.
const component=readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(component,/function StormZoneFlash\(/);
assert.match(component,/stormZoneFlashEnvelope\(clock\.elapsedTime/);
assert.ok(component.includes("extractLightningStormZones(pixels, 2048, 1024"));
assert.ok(component.includes("setStormZones(combined)"));
assert.ok(component.includes("selectLightningStormZonesBalanced(zonesByFeed.noaa, zonesByFeed.mtg, 36, 12, 1.2)"));
assert.match(component,/stormZones\.map\(\(zone, index\)/);
assert.match(component,/source: "MODEL" as const/);
assert.match(component,/VIEW STORM FLASHES/);
console.log("PASS: cinematic storm-zone flashes are geographically bounded and honest about model data");
