#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const content=readFileSync("lib/earth/lightningStormZones.ts","utf8");
const compiled=ts.transpileModule(content,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
}}).outputText;
const { extractLightningStormZones, selectLightningStormZonesBalanced } =
 await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(compiled));
const width=2048,height=1024;
const image=new Uint8ClampedArray(width*height*4);
function observedPixel(lat,lon,red=255,green=120,blue=30){
 const x=Math.round((lon+180)/360*width-0.5);
 const y=Math.round((90-lat)/180*height-0.5);
 const p=(y*width+x)*4;
 image.set([red,green,blue,255],p);
}
function region(lat,lon){
 for(let dLat=0;dLat<3;dLat++)for(let dLon=0;dLon<3;dLon++){
  observedPixel(lat+dLat*0.1758,lon+dLon*0.1758);
 }
}
// Four separate storm accumulations across the US.
// Native 2048 samples should preserve even relatively compact cells.
region(34,-96);
region(41,-84);
region(32,-110);
region(29,-90);
const out=extractLightningStormZones(image,width,height,"NOAA",28);
assert.equal(out.zones.length,4);
assert.ok(out.zones.every(z=>z.longitude< -60&&z.longitude> -130));
assert.ok(out.zones.every(z=>z.latitude>20&&z.latitude<50));
assert.equal(out.cells,36);
// High confidence single NOAA pixel can represent a tiny real 8km
// strike-density product cell; an identical modeled flash is NOT inferred.
const tiny=new Uint8ClampedArray(width*height*4);
tiny.set([252,255,250,255],(256*width+512)*4);
const tinyNoaa=extractLightningStormZones(tiny,width,height,"NOAA");
assert.equal(tinyNoaa.zones.length,1);
assert.equal(extractLightningStormZones(tiny,width,height,"MTG").zones.length,0);
const noise=new Uint8ClampedArray(width*height*4);
noise.set([150,130,90,255],(256*width+512)*4);
assert.equal(extractLightningStormZones(noise,width,height,"NOAA").zones.length,0);
// High-energy MTG accumulation over Europe must not evict observed NOAA
// footprints in the Americas when the global GPU budget is saturated.
const noaa=Array.from({length:19},(_,i)=>({
 latitude:25+(i%4)*7,longitude:-157+Math.floor(i/4)*17,
 strength:0.28,source:"NOAA"
}));
const mtg=Array.from({length:60},(_,i)=>({
 latitude:-35+Math.floor(i/10)*13,longitude:-15+(i%10)*11,
 strength:0.90,source:"MTG"
}));
const balanced=selectLightningStormZonesBalanced(noaa,mtg,36,12,1.2);
assert.equal(balanced.length,36);
assert.ok(balanced.filter(z=>z.source==="NOAA").length>=12,
 "the Americas cannot disappear merely because MTG has stronger cells");
assert.ok(balanced.filter(z=>z.source==="MTG").length>=12);
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(scene.includes("const STORM_FLASH_BRIGHTNESS = 1.35;"));
assert.ok(scene.includes("* STORM_FLASH_BRIGHTNESS;"));
assert.ok(scene.includes("canvas.width = 2048;"));
assert.ok(scene.includes("canvas.height = 1024;"));
assert.ok(scene.includes("extractLightningStormZones(pixels, 2048, 1024, source, 28)"));
assert.ok(scene.includes("selectLightningStormZonesBalanced(zonesByFeed.noaa, zonesByFeed.mtg, 36, 12, 1.2)"));
assert.ok(!scene.includes("console.log(\"debugLightning\""));
console.log("PASS: +35% lightning luminosity, tiny verified NOAA footprints and balanced global storm coverage");
