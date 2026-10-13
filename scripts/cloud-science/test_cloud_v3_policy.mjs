#!/usr/bin/env node
/** Protect the accepted V3 cloud defaults and keep optional QA isolated. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require(process.env.CUPOLA_TEST_TS_PATH || "typescript");
const source=fs.readFileSync("lib/earth/cloudV3RuntimeConfig.ts","utf8");
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module,exports:module.exports,URLSearchParams});
const resolve=module.exports.resolveCloudV3RuntimeConfig;
assert.equal(typeof resolve,"function");
const defaults=resolve(new URLSearchParams());
assert.equal(defaults.seamMode,"normal","preserve approved 12/56px baseline");
assert.equal(defaults.nativeIrCrossoverRadius,64,"96px must stay explicit QA");
assert.equal(defaults.useLimbOverlay,true,"keep two-sided real NOAA IR bridge");
assert.equal(defaults.useGreyDetail,true,"keep last approved grey-detail v2");
assert.equal(defaults.useGmgsi,true,"keep real NOAA IR available");
assert.equal(defaults.useGlobalModel,true,"GFS should remain lower-priority gap only");
assert.equal(defaults.useVisualGap,true,"keep Meteosat coverage in its gap only");
assert.equal(defaults.meteosatVisualMode,"clm","retain proven cloud mask default");
assert.equal(defaults.exportAtlasPng,false,"no heavy PNG encode in production");
assert.equal(resolve(new URLSearchParams("cloudCrossover=right96")).nativeIrCrossoverRadius,96);
assert.equal(resolve(new URLSearchParams("cloudSeams=wide")).seamMode,"wide");
assert.equal(resolve(new URLSearchParams("cloudSeams=legacy")).seamMode,"legacy");
assert.equal(resolve(new URLSearchParams("cloudGrey=legacy")).useGreyDetail,false);
assert.equal(resolve(new URLSearchParams("cloudAtlasExport=1")).exportAtlasPng,true);
assert.equal(resolve(new URLSearchParams("cloudAudit=sources")).exportAtlasPng,true);
assert.equal(resolve(new URLSearchParams("cloudGmgsi=none")).useGmgsi,false);
const scene=fs.readFileSync("components/CupolaExperience.tsx","utf8");
assert.match(scene,/useState<CloudEngine>\("v3"\)/,"EXPLORE must default to V3");
assert.ok(scene.includes('mode === "CINEMA" ? "legacy" : cloudEngine'),
  "CINEMA look must stay intact");
assert.ok(scene.includes('v3Policy.exportAtlasPng'),
  "PNG compression must stay behind opt-in flag");
assert.ok(scene.includes('const sourcePixels = cloudEngine === "v3"'),
  "only one raster readback per V3 publish");
console.log("PASS: production V3 defaults/optional overrides/Cinema/PNG/readback");
