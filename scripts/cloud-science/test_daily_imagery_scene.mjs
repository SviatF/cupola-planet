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
const preview=readFileSync("components/SatelliteSurfacePreview.tsx","utf8");
const coverageModule=readFileSync("lib/earth/viirsPreviewCoverage.ts","utf8");
const coverageJs=ts.transpileModule(coverageModule,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
}).outputText;
const {estimateViirsPreviewExtent,viirsFrameCrop}=await import(
  "data:text/javascript;charset=utf-8,"+encodeURIComponent(coverageJs));
const black=new Uint8ClampedArray(256*128*4);
const none=estimateViirsPreviewExtent(black,256,128);
assert.equal(none.status,"insufficient-imagery");
assert.equal(none.visibleFraction,0);
// Regression for screenshot: valid narrow polar swath on the right of a
// mostly black equirectangular global JPEG. The crop must locate the swath.
for(let y=18;y<110;y++)for(let x=180;x<238;x++){
  const at=(y*256+x)*4;
  black[at]=155;black[at+1]=144;black[at+2]=130;black[at+3]=255;
}
const swath=estimateViirsPreviewExtent(black,256,128);
assert.equal(swath.status,"partial-swath");
assert.ok(swath.visibleFraction>.15&&swath.visibleFraction<.18);
assert.ok(swath.bounds.x>.60);
assert.ok(swath.bounds.width<.40);
const crop=viirsFrameCrop(swath.bounds,2048,1024,4/3);
assert.ok(crop.width<2048&&crop.height<1024);
assert.ok(crop.x>800);
assert.ok(crop.y>=0);
const covered=new Uint8ClampedArray(256*128*4);
for(let i=0;i<covered.length;i+=4){
  covered[i]=220;covered[i+1]=193;covered[i+2]=173;covered[i+3]=255;
}
assert.equal(estimateViirsPreviewExtent(covered,256,128).status,"broad-visible-swaths");
assert.throws(()=>estimateViirsPreviewExtent(black,3,2));
assert.throws(()=>viirsFrameCrop(swath.bounds,0,1024));
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
assert.doesNotMatch(scene,/surfaceManagedRef\.current/);
assert.match(scene,/setLiveNightTexture\(result\.texture\)/);
assert.doesNotMatch(scene,/setLiveSurfaceTexture\(result\.texture\)/);
assert.doesNotMatch(scene,/group visible=\{!\(props\.satelliteSurface && !!liveSurfaceTexture\)\}/);
assert.match(scene,/dayTexture=\{baseDayTexture\}/);
assert.match(scene,/Cloud V3/);
assert.match(scene,/uniforms\.dayTexture\.value = dayTexture/);
assert.match(scene,/uniforms\.nightTexture\.value = nightTexture/);
assert.match(scene,/Satellite surface \(live land\)/);
assert.match(scene,/setViirsLandTexture\(newTexture\)/);
assert.match(scene,/const dayTexture = props\.satelliteSurface && viirsLandTexture \? viirsLandTexture : baseDayTexture/);
assert.match(scene,/fuseViirsPixels\(baseData\.data,rawData\.data,2048,1024\)/);
assert.match(scene,/ON GLOBE/);
assert.match(scene,/<SatelliteSurfacePreview onImagery=\{setSurfaceImageryMeta\}/);
assert.match(preview,/createImageBitmap/);
assert.match(preview,/estimateViirsPreviewExtent/);
assert.match(preview,/viirsFrameCrop/);
assert.match(preview,/daysAgo=/);
assert.match(preview,/visibleFraction/);
assert.match(preview,/NO VERIFIED RECENT VIIRS SWATH/);
assert.match(preview,/estimateViirsPreviewExtent/);
assert.match(surfaceApi,/rawAge/);
assert.match(surfaceApi,/resolution/);
assert.match(surfaceApi,/SENSOR_LAYERS/);
assert.match(surfaceApi,/X-Cupola-Sensor/);
assert.match(surfaceApi,/X-Cupola-Raster-Width/);
assert.match(preview,/SENSORS\.map/);
assert.match(preview,/readProbe/);
assert.match(preview,/loadFullCandidate/);
assert.match(preview,/NO VERIFIED RECENT VIIRS SWATH/);
assert.match(preview,/NASA_WORLDVIEW/);
assert.match(preview,/checks/);
assert.match(preview,/daysAgo/);
assert.match(surfaceApi,/\[1,0,2,3\]/);
assert.match(surfaceApi,/partial-viirs-orbit-swaths-not-global-surface/);
// Production regression Oct-16: Unicode middle dot in HTTP response header
// is encoded as "Â·" across the Cloudflare/runtime boundary. The browser
// must never split on Unicode punctuation to determine a verified layer.
assert.match(surfaceApi,/"X-Cupola-Source":"NASA_GIBS_VIIRS"/);
assert.match(surfaceApi,/"X-Cupola-Layer":layer/);
assert.match(preview,/response\.headers\.get\("x-cupola-layer"\)/);
assert.match(preview,/source!=="NASA_GIBS_VIIRS"/);
assert.match(preview,/r\.headers\.get\("x-cupola-layer"\)!==item\.info\.layer/);
assert.doesNotMatch(surfaceApi,/"X-Cupola-Source":"NASA GIBS \/ VIIRS · "/);
assert.doesNotMatch(preview,/source\.split\(" · "\)/);
assert.match(preview,/Pixel presence is a/);
assert.match(preview,/NASA Worldview/);
assert.match(scene,/const dayTexture = props\.satelliteSurface/);
assert.match(scene,/dayTexture=\{baseDayTexture\}/);
assert.match(scene,/const \[satelliteSurface, setSatelliteSurface\] = useState\(false\)/);
assert.match(scene,/DAILY VIIRS/);
assert.match(scene,/2016 STATIC/);
assert.match(scene,/setSatelliteSurface\(current => !current\)/);
assert.match(scene,/fetch\("\/api\/night-lights\?meta=1"/);
console.log("PASS: VIIRS real Earth GPU texture updates, base surface remains fallback, clouds remain separate");
