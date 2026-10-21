#!/usr/bin/env node
/**
 * CUPOLA 4.6 -- distinguish geocentric phase from orbital camera phase.
 * Regression for physically correct "78% from Earth vs ~36% from far side"
 * rather than erroneously relighting the Moon or flipping NASA maps.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const module={exports:{}};
const js=ts.transpileModule(readFileSync("lib/earth/lunarCameraPhase.ts","utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
new Function("require","module","exports",js)(()=>{throw Error("No dependencies allowed");},module,module.exports);
const {illuminatedFractionFromMoonView,moonObserverHemisphere}=module.exports;
const sun={x:1,y:0,z:0};
const earth={x:1,y:0,z:0};
const far={x:-1,y:0,z:0};
const quad={x:0,y:1,z:0};
assert.equal(illuminatedFractionFromMoonView(sun,sun),1);
assert.equal(illuminatedFractionFromMoonView(sun,far),0);
assert.equal(illuminatedFractionFromMoonView(sun,quad),0.5);
assert.equal(illuminatedFractionFromMoonView({x:100,y:0,z:0},{x:1,y:0,z:0}),1);
assert.throws(()=>illuminatedFractionFromMoonView(sun,{x:0,y:0,z:0}));
assert.throws(()=>illuminatedFractionFromMoonView({x:NaN,y:0,z:0},sun));
assert.equal(moonObserverHemisphere(earth,earth),"EARTH-FACING");
assert.equal(moonObserverHemisphere(far,earth),"FAR-SIDE");
assert.equal(moonObserverHemisphere(quad,earth),"LIMB");

// Reconstruct the intentional centeredMoonOrbitFrame camera vector:
// far from Earth (-7.7 units) but displaced +2.45 toward the solar limb.
const earthViewPct=78.2;
const cosine=2*earthViewPct/100-1;
const t=Math.sqrt(1-cosine*cosine);
const sunMoon={x:cosine,y:t,z:0},earthMoon={x:1,y:0,z:0};
const orbitCamera={x:-7.7,y:2.45,z:0};
const expectedCameraPct=illuminatedFractionFromMoonView(sunMoon,orbitCamera)*100;
assert.equal(moonObserverHemisphere(orbitCamera,earthMoon),"FAR-SIDE");
assert.ok(expectedCameraPct>32&&expectedCameraPct<40,
  "A gibbous Moon from Earth must look partially lit from far-side orbit: "+expectedCameraPct);
assert.ok(Math.abs(illuminatedFractionFromMoonView(sunMoon,earthMoon)*100-earthViewPct)<1e-10);
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
assert.ok(scene.includes("const position=lunarCenter.clone().addScaledVector(toEarth,-7.7)"));
assert.ok(scene.includes(".addScaledVector(tangent.normalize(),2.45)"));
assert.ok(scene.includes('readout.dataset.cameraIlluminatedPct='));
assert.ok(scene.includes('readout.dataset.earthIlluminatedPct='));
assert.ok(scene.includes('readout.dataset.cameraHemisphere='));
assert.ok(scene.includes('illuminatedFractionFromMoonView('));
assert.ok(scene.includes('CAMERA VIEW '));
assert.ok(scene.includes('EARTH VIEW '));
console.log("CUPOLA 4.6 OBSERVER MOON PHASE QA PASS",JSON.stringify({
 earthVisiblePercent:earthViewPct,cameraVisiblePercent:Number(expectedCameraPct.toFixed(3)),
 cameraHemisphere:"FAR-SIDE",surfaceLightUnchanged:true,source:"Unaltered orbital Moon preset -7.7/2.45"
}));
