#!/usr/bin/env node
/**
 * Independently published IAU feature centroids (USGS Gazetteer)
 * compared with the actual coordinates used by CUPOLA's NASA LROC texture.
 *
 * Historical source, not generated from our own map:
 * https://planetarynames.wr.usgs.gov/Feature/{featureId}
 * Planetographic latitude, east-positive longitude, [-180,180].
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const js=ts.transpileModule(
  readFileSync("lib/earth/lunarAtlasRegistration.ts","utf8"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
const mod={exports:{}};
new Function("require","module","exports",js)(()=>{throw Error("No imports expected");},mod,mod.exports);
const {LUNAR_ATLAS_CONTROL_POINTS, lunarAtlasPixel,lunarAtlasUv,lunarAtlasSurfacePoint}=mod.exports;
const known=[
  ["TYCHO",6163,"CRATER",-43.30,-11.22],
  ["COPERNICUS",1296,"CRATER",9.62,-20.08],
  ["MARE CRISIUM",3671,"MARE",16.18,59.10],
  ["MARE TRANQUILLITATIS",3691,"MARE",8.35,30.83],
  ["MARE IMBRIUM",3678,"MARE",34.72,-14.91],
  ["MARE SERENITATIS",3686,"MARE",27.29,18.36]
];
assert.equal(LUNAR_ATLAS_CONTROL_POINTS.length,known.length);
const observed=LUNAR_ATLAS_CONTROL_POINTS.map(p=>{
  const expected=known.find(x=>x[0]===p.name);
  assert.ok(expected,"Unknown IAU lunar feature "+p.name);
  assert.equal(p.featureId,expected[1]);
  assert.equal(p.type,expected[2]);
  assert.ok(Math.abs(p.latitudeDeg-expected[3])<1e-10);
  assert.ok(Math.abs(p.longitudeDeg-expected[4])<1e-10);
  assert.equal(p.source,`https://planetarynames.wr.usgs.gov/Feature/${p.featureId}`);
  const uv=lunarAtlasUv(p),px=lunarAtlasPixel(p),vec=lunarAtlasSurfacePoint(p);
  assert.ok(Math.abs(Math.hypot(vec.x,vec.y,vec.z)-1)<1e-12);
  assert.ok(uv.u>0&&uv.u<1&&uv.v>0&&uv.v<1);
  assert.ok(Math.abs(px.x-(2048+p.longitudeDeg*4096/360))<=1);
  assert.ok(Math.abs(px.y-(1024-p.latitudeDeg*2048/180))<=1);
  return{name:p.name,iauFeatureId:p.featureId,latitudeDeg:p.latitudeDeg,
    longitudeEastDeg:p.longitudeDeg,rasterX:px.x,rasterY:px.y};
});
const tycho=observed.find(x=>x.name==="TYCHO");
const copernicus=observed.find(x=>x.name==="COPERNICUS");
const crisium=observed.find(x=>x.name==="MARE CRISIUM");
assert.ok(tycho.rasterY>1024,"Tycho should be on southern lunar surface");
assert.ok(crisium.rasterX>2048&&copernicus.rasterX<2048,
 "Mare Crisium is east of prime meridian; Copernicus is west");
assert.throws(()=>lunarAtlasUv({latitudeDeg:92,longitudeDeg:0}));
console.log("CUPOLA IAU USGS FEATURE CENTRE QA PASS "+JSON.stringify(observed));
