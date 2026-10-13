#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
async function moduleFrom(path){
 const s=readFileSync(path,"utf8");
 const js=ts.transpileModule(s,{compilerOptions:{
   target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
 }}).outputText;
 return import("data:text/javascript;charset=utf-8,"+encodeURIComponent(js));
}
const {extractLightningStormZones}=await moduleFrom("lib/earth/lightningStormZones.ts");
const {LIGHTNING_FRESHNESS_MINUTES,lightningLayerTime}=await moduleFrom("lib/earth/lightningObservation.ts");

const width=1024,height=512,pixels=new Uint8ClampedArray(width*height*4);
// Synthetic NOAA footprint in northeast quadrant: true geolocation must
// be north of 0 and east of 0; never mirrored across equator or Greenwich.
for(let y=102;y<111;y++)for(let x=766;x<777;x++){
  pixels.set([254,110,15,255],(y*width+x)*4);
}
let observed=extractLightningStormZones(pixels,width,height,"NOAA");
assert.ok(observed.zones.length===1,"one connected storm != multiple grid cells");
assert.ok(observed.zones[0].latitude>50&&observed.zones[0].latitude<55);
assert.ok(observed.zones[0].longitude>85&&observed.zones[0].longitude<95);
assert.ok(observed.zones[0].strength>0&&observed.zones[0].strength<=1);

// A second region nearby but more than 2 degrees away stays independent.
for(let y=121;y<128;y++)for(let x=766;x<773;x++){
  pixels.set([245,190,20,255],(y*width+x)*4);
}
observed=extractLightningStormZones(pixels,width,height,"MTG");
assert.equal(observed.zones.length,2,"do not invent one giant storm hotspot");

// NOAA and MTG have different accumulation windows / latency policies.
assert.equal(LIGHTNING_FRESHNESS_MINUTES.NOAA,45);
assert.equal(LIGHTNING_FRESHNESS_MINUTES.MTG,30);
const now=Date.parse("2026-10-13T22:00:00Z");
const xml='<Layer><Name>mtg_fd:li_afa</Name>'+
 '<Dimension name="time">2026-10-13T21:15:00Z</Dimension></Layer>';
assert.equal(lightningLayerTime(xml,"mtg_fd:li_afa",30,now),null);
assert.equal(lightningLayerTime(xml,"mtg_fd:li_afa",90,now),
 "2026-10-13T21:15:00.000Z");
const mtg=readFileSync("app/api/lightning-eumetsat/route.ts","utf8");
const noaa=readFileSync("app/api/lightning/route.ts","utf8");
assert.ok(mtg.includes("LIGHTNING_FRESHNESS_MINUTES.MTG"));
assert.ok(noaa.includes("LIGHTNING_FRESHNESS_MINUTES.NOAA"));
for(const route of [mtg,noaa]){
 assert.ok(route.includes("X-Cupola-Observation-Time"));
 assert.ok(route.includes("X-Cupola-Quality"));
 assert.ok(route.includes("X-Cupola-Max-Age-Minutes"));
}
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(scene,/wmsUv=vec2\(uv\.x,1\.0-uv\.y\)/);
assert.match(scene,/texture\.flipY = false/);
assert.match(scene,/position=\{GLOBE_CENTER\} rotation=\{GLOBE_ROTATION\}/);
assert.match(scene,/scale=\{GLOBE_SCALE \* 1\.0175\}/);
assert.match(scene,/canvas\.width = 1024/);
assert.match(scene,/canvas\.height = 512/);
assert.match(scene,/filterModelLightningByObservation\(/);
assert.match(scene,/showLightningModel=\{modelLightningVisible\.length > 0\}/);
assert.match(scene,/now\.getTime\(\) - updated > 45 \* 60000/);
assert.match(scene,/OBS " \+ observedLightningZones \+ " ZONES/);
const model=readFileSync("app/api/lightning-model/route.ts","utf8");
assert.ok(model.includes('timeformat: "unixtime"'));
assert.ok(model.includes("MAX_MODEL_HOUR_OFFSET_MS"));
assert.ok(model.includes("Number.isFinite(bestDistance)"));
console.log("PASS: accurate geographic footprints, satellite UV orientation, source freshness and regional model honesty");
