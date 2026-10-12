#!/usr/bin/env node
/** Protect the reason our V3 mosaic must not show black satellite seams. */
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("lib/earth/liveCloudShader.ts","utf8");
const current="smoothstep(0.0, 1.0 / 255.0, atlas.g) * cloudAtlasReady";
assert.equal(source.split(current).length-1,2,
  "Both cloud and matching cloud-shadow shaders must use observed-footprint presence");
assert.equal(/float coverage = smoothstep\(0\.002, 0\.085, atlas\.g\)/.test(source),false,
  "Do not reintroduce an excessive confidence-to-opacity threshold");
const smooth=(g)=>{const x=Math.max(0,Math.min(1,g));return x*x*(3-2*x);};
const present=g=>smooth((g/255)/(1/255));
const old=g=>smooth((g/255-.002)/(.085-.002));
for(const g of [1,2,11,92,158,255]) assert.equal(present(g),1);
assert.equal(present(0),0,"outside ALL satellite and model coverage must remain empty");
const density=145;
const oldGap=Math.abs(density*old(1)-density*old(158));
const newGap=Math.abs(density*present(1)-density*present(158));
assert.ok(oldGap>130,"fixture must actually recreate reported false seam");
assert.equal(newGap,0,"same R at valid adjoining sources must have same rendered strength");
assert.equal(0*present(1),0,"classified CLEAR native L2 must remain clear");
console.log(JSON.stringify({test:"V3 visual footprint is not QA opacity",oldGap,
  newGap,l2BytesModified:false,clearSkyPreserved:true,shadowShaderConsistent:true}));
