#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const source=readFileSync("lib/earth/lunarShadowField.ts","utf8");
const compiled=ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const field=await import("data:text/javascript,"+encodeURIComponent(compiled));
const earth={x:0,y:0,z:0};
const sun={x:-149597870.7,y:0,z:0};
const moon={x:384400,y:0,z:0};
const eclipse=field.eclipseSolarDiscObscuration;
assert.ok(eclipse(moon,earth,sun)>0.9999,
  "Exact alignment has a full umbral Moon");
assert.equal(eclipse(moon,earth,{x:149597870.7,y:0,z:0}),0,
  "Earth behind observer cannot occult the Sun");
assert.equal(eclipse({x:384400,y:18000,z:0},earth,sun),0,
  "Moon sufficiently off Earth's umbra/penumbra must be bright");
const varying=[-1737.4,0,1737.4].map(offset=>
  eclipse({x:384400,y:4900+offset,z:0},earth,sun));
assert.ok(varying.every(x=>x>=0&&x<=1));
assert.ok(varying[0]>varying[1]&&varying[1]>varying[2],
  "Partial eclipse must vary continuously across individual lunar pixels");
assert.ok(varying.some(x=>x>0&&x<1),
  "Solar overlap must produce an actual geometric penumbra");
assert.deepEqual(field.eclipseSolarTransmission(0),[1,1,1]);
const full=field.eclipseSolarTransmission(1);
assert.ok(full[0]>full[1]&&full[1]>full[2]&&full[0]<0.1,
  "Umbral copper radiance is explicitly dim and uncalibrated");
const scene=readFileSync("components/CupolaExperience.tsx","utf8");
const shader=readFileSync("lib/earth/moonEclipseShader.ts","utf8");
assert.match(scene,/material\.onBeforeCompile=shader=>/,
  "Moon must retain its physical Three.js PBR surface material");
assert.match(scene,/MOON_ECLIPSE_OUTGOING_LIGHT/);
assert.match(scene,/const lunarCenterSunObscuration=eclipseSolarDiscObscuration\(/,
  "Lunar shadow telemetry must use the same exact-disc geometric model as the GPU Moon");
assert.match(scene,/data-lunar-eclipse-centre="geometric"/,
  "Observer UI must distinguish lunar-centre geometry from total surface eclipse");
assert.match(scene,/GEOMETRY ONLY · NOT MEASURED ECLIPSE COLOR OR CONTACT FORECAST/,
  "Do not describe estimated copper radiance as an actual spectral measurement");
assert.match(scene,/uEclipseApparentOffset\.value\.copy\(moon\.current\.position\)/,
  "Refracted view is not a physical displacement of the lunar shadow");
assert.match(scene,/material\.color\.setRGB\(\s*atmosphere\[0\]\*cloudContrast/,
  "Keep atmospheric extinction separate from spatial eclipse shading");
assert.doesNotMatch(scene, /moonAppearanceRGB\(atmosphere,shadow\.umbra,shadow\.penumbra\)/,
  "The previous whole-sphere eclipse scalar is prohibited");
assert.match(shader,/outgoingLight \*= lunarEclipseRadiance;/);
assert.match(shader,/vMoonEclipseWorld-uEclipseApparentOffset/);
assert.match(shader,/acos\(clamp/);
assert.match(scene,/lrocHd \?\? lrocTexture \?\? texture/,
  "The upgraded eclipse must preserve NASA LROC albedo");
assert.match(scene,/bumpMap=\{lrocHd \|\| lrocTexture/,
  "The eclipse must preserve LOLA relief");
// The GPU broad phase must never suppress a real eclipse at ANY lunar
// surface sample, including the faint first penumbral contact near the limb.
const moonCenter={x:384400,y:0,z:0};
const step=Math.PI/180;
let physicallyOcculted=0, safelySkipped=0;
for(let phase=0;phase<=3.5;phase+=0.125){
  const angle=phase*step;
  const sunAt={
    x:moonCenter.x-149600000*Math.cos(angle),
    y:149600000*Math.sin(angle),z:0
  };
  const gate=field.lunarEclipseMayReachSurface(moonCenter,earth,sunAt);
  for(let latitude=-90;latitude<=90;latitude+=15){
    for(let longitude=0;longitude<360;longitude+=15){
      const lat=latitude*step,lon=longitude*step;
      const point={
        x:moonCenter.x+1737.4*Math.cos(lat)*Math.cos(lon),
        y:1737.4*Math.cos(lat)*Math.sin(lon),
        z:1737.4*Math.sin(lat)
      };
      const covered=eclipse(point,earth,sunAt);
      if(covered>1e-8){
        physicallyOcculted++;
        assert.equal(gate,true,
          "GPU eclipse broad phase must never hide real penumbra: "+phase);
      }
    }
  }
  if(!gate)safelySkipped++;
}
assert.ok(physicallyOcculted>0 && safelySkipped>0,
  "Broad phase must both preserve real eclipses and skip empty geometry");
assert.equal(field.lunarEclipseMayReachSurface(moonCenter,earth,{
  x:moonCenter.x+149600000,y:0,z:0}),false,
  "Opposite Sun with no lunar eclipse must skip expensive GPU occultation");
assert.match(scene,/uEclipseActive\.value=lunarEclipseMayReachSurface\(/,
  "Moon shader broad phase must follow current physical UTC geometry");
assert.match(shader,/if\(uEclipseActive<0\.5\)return 0\.0;/,
  "GPU eclipse calculation must short-circuit outside the valid shadow zone");
console.log("PASS: pointwise Earth umbra/penumbra, atmosphere separation, PBR Moon texture");
