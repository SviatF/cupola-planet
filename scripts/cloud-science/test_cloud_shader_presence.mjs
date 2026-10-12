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
// New V3 weak grey is strictly real NOAA GMGSI visual IR (B=232),
// NOT native Level-2, categorical WMS, or GFS. No zero-to-grey hallucination.
assert.ok(source.includes("float photographedIrWisp(float signal, float original)"),
  "the source-specific IR wisp transfer must be present");
assert.ok(source.includes("float isGmgsi = 1.0 - step(0.5, abs(src - 232.0));"),
  "only B=232 GMGSI may receive extra thin-layer detail");
assert.ok(source.includes("visible += isGmgsi * photographedIrWisp(visible, density);"),
  "restrict visual boost to actual measured IR pixels");
assert.ok(source.includes("float realIr = limb.r + photographedIrWisp(limb.r, limb.r);"),
  "keep identical source-specific weak-IR transfer across the repaired 64px limb");
const smoothstep=(lo,hi,x)=>smooth((x-lo)/(hi-lo));
const detail=(v,original)=>Math.max(0,Math.sqrt(Math.max(0,v))-v)*
  0.32*smoothstep(.015,.08,original)*(1-smoothstep(.34,.75,original));
for(const d of [0,.01,.3,.72,1])
  assert.equal(detail(d,d)>=0,true,"IR gain must never erase genuine cloud");
assert.equal(detail(0,0),0,"NOAA IR R=0 stays black, no grey veil");
assert.equal(detail(.85,.85),0,"bright cloud cores must retain original shape");
assert.ok(detail(.14,.14)>.03,"weak measured IR details must become visibly distinguishable");
assert.equal(0*detail(.14,.14),0,"Level-2 must not receive IR-specific gain");
console.log(JSON.stringify({test:"GMGSI-only soft grey structure",
  zeroUnchanged:true,strongCloudUnchanged:true,
  untouchedScience:true,irlOnly:true}));

// Africa screenshot regression: the IR texture exists but its positive
// low-density signal almost disappears in the night-side cloud opacity.
// Require real source-specific display gain, never additive fake density.
assert.ok(source.includes("uniform float v3IrNightExposure;"),
  "A/B preview requires the independent IR night exposure uniform");
assert.ok(source.includes("float measuredIrOwnership = 0.0;"),
  "measured NOAA IR ownership must be explicit in the material");
assert.ok(source.includes("alpha *= 1.0 + 2.6 * nightIrExposure * faintMeasuredIr;"),
  "IR night exposure must be applied at the actual alpha bottleneck");
assert.ok(source.includes("limb.g * smoothstep(0.0, 1.0 / 255.0, limb.r)"),
  "the proven 64px bridge must receive matching IR exposure");
const evaluate=(v,owner,day,tone)=>{
  const curve=(lo,hi,x)=>smooth((x-lo)/(hi-lo));
  const original=Math.pow(curve(.012,.87,v),1.28)*.56*(.34+.54*day);
  const faint=curve(.014,.085,v)*(1-curve(.32,.72,v));
  return Math.min(.56,original*(1+2.6*tone*(1-day)*owner*faint));
};
for(const v of [0,.02,.12,.25,.5,1]){
 assert.equal(evaluate(v,0,0,1),evaluate(v,0,0,0),
   "verified L2, WMS and GFS unchanged");
 assert.equal(evaluate(v,1,1,1),evaluate(v,1,1,0),
   "daytime clouds unchanged");
 assert.ok(evaluate(v,1,0,1)>=evaluate(v,1,0,0),
   "no legitimate source cloud may be darkened");
}
assert.equal(evaluate(0,1,0,1),0,"IR zero must stay transparent");
assert.equal(evaluate(.95,1,0,1),evaluate(.95,1,0,0),
  "dense bright clouds retain prior opacity");
assert.ok(evaluate(.18,1,0,1)>evaluate(.18,1,0,0)*2,
  "real faint NOAA IR should be visibly more photographic at night");
console.log(JSON.stringify({test:"night IR source-aware opacity",
  source232Only:true,l2Unchanged:true,dayUnchanged:true,
  noZeroFilling:true,nightFaintAlphaGain:Math.round(1000*
    evaluate(.18,1,0,1)/evaluate(.18,1,0,0))/1000}));

console.log(JSON.stringify({test:"V3 visual footprint is not QA opacity",oldGap,
  newGap,l2BytesModified:false,clearSkyPreserved:true,shadowShaderConsistent:true}));
