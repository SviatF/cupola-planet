#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const source=readFileSync("lib/earth/dailyImagery.ts","utf8");
const js=ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
}).outputText;
const {parseDailyImageryInfo,imageVersion}=await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(js));
const now=Date.parse("2026-10-16T12:00:00Z");
const night={kind:"night",status:"daily-satellite",source:"NASA GIBS / VIIRS",
 layer:"VIIRS_NOAA21_GapFilled_BRDF_Corrected_DayNightBand_Radiance",
 imageryDate:"2026-10-15",verifiedPixelTime:false,latestPixelObservationUnknown:true,gapFilled:true};
const day={...night,kind:"surface",
 layer:"VIIRS_NOAA20_CorrectedReflectance_TrueColor",gapFilled:false};
assert.ok(parseDailyImageryInfo(night,"night",now));
assert.ok(parseDailyImageryInfo(day,"surface",now));
assert.equal(imageVersion(night),night.layer+"@2026-10-15");
assert.equal(parseDailyImageryInfo({...night,imageryDate:"2016-composite"},"night",now),null);
assert.equal(parseDailyImageryInfo({...night,imageryDate:"2026-10-20"},"night",now),null);
assert.equal(parseDailyImageryInfo({...night,imageryDate:"2026-10-01"},"night",now),null);
assert.equal(parseDailyImageryInfo({...night,latestPixelObservationUnknown:false},"night",now),null);
assert.equal(parseDailyImageryInfo({...night,verifiedPixelTime:true},"night",now),null);
assert.equal(parseDailyImageryInfo(day,"night",now),null);
assert.equal(parseDailyImageryInfo({...day,source:"Fallback Earth texture"},"surface",now),null);
assert.equal(parseDailyImageryInfo({...day,layer:"MODIS_Terra_CorrectedReflectance_TrueColor"},"surface",now),null);
assert.equal(parseDailyImageryInfo({...day,gapFilled:true},"surface",now),null);
assert.equal(parseDailyImageryInfo(null,"surface",now),null);
const nightApi=readFileSync("app/api/night-lights/route.ts","utf8");
const surfaceApi=readFileSync("app/api/satellite/route.ts","utf8");
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(nightApi,/metadataOnly/);
assert.match(nightApi,/GapFilled_BRDF_Corrected_DayNightBand_Radiance/);
assert.match(nightApi,/gapFilled: true/);
assert.match(nightApi,/2016-composite/);
assert.match(nightApi,/daily-gapfilled-brdf-pixel-acquisition-time-unknown/);
assert.match(surfaceApi,/getRecentViirs/);
assert.match(surfaceApi,/mode"\)==="live"/);
assert.match(surfaceApi,/VIIRS_NOAA21_CorrectedReflectance_TrueColor/);
assert.match(surfaceApi,/daily-truecolor-swaths-contain-clouds-and-nodata/);
assert.match(surfaceApi,/status:204/);
assert.match(scene,/async function retrieveDailyImage\(/);
assert.match(scene,/parseDailyImageryInfo\(await metaResponse\.json\(\),kind\)/);
assert.match(scene,/X-Cupola-Imagery-Date/);
assert.match(scene,/nightManagedRef\.current/);
assert.match(scene,/surfaceManagedRef\.current/);
assert.match(scene,/setLiveNightTexture\(result\.texture\)/);
assert.match(scene,/setLiveSurfaceTexture\(result\.texture\)/);
assert.match(scene,/group visible=\{!\(props\.satelliteSurface && !!liveSurfaceTexture\)\}/);
assert.match(scene,/dayTexture=\{baseDayTexture\}/);
assert.match(scene,/uniforms\.dayTexture\.value = dayTexture/);
assert.match(scene,/uniforms\.nightTexture\.value = nightTexture/);
assert.match(scene,/Satellite surface \(experimental\)/);
assert.match(scene,/DAILY VIIRS/);
assert.match(scene,/2016 STATIC/);
assert.match(scene,/setSatelliteSurface\(current => !current\)/);
assert.match(scene,/fetch\("\/api\/night-lights\?meta=1"/);
console.log("PASS: honest NASA GIBS daily dates, safe fallback, atomic GPU texture swap, experimental cloud-safe surface");
