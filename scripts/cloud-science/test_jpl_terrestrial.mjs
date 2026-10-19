#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";
const req=createRequire(import.meta.url);
function load(path){
  const transpiled=ts.transpileModule(readFileSync(path,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const mod={exports:{}};
  new Function("require","module","exports",transpiled)(req,mod,mod.exports);
  return mod.exports;
}
const E=load("lib/earth/iersEop.ts");
const J=load("lib/earth/jplEarthFixed.ts");
const rows=[
  {time:{MJD:"612?."}}, // omitted incomplete observation
  {time:{MJD:"61331"},dataEOP:{
    pole:[{source:"BulletinA",type:"final",X:"0.12",Y:"0.34"}],
    UT:[{source:"BulletinA",type:"final","UT1-UTC":"-0.13"}]
  }},
  {time:{MJD:"61332"},dataEOP:{
    pole:[{source:"BulletinA",type:"prediction",X:"0.14",Y:"0.32"}],
    UT:[{source:"BulletinA",type:"prediction","UT1-UTC":"-0.11"}]
  }}
];
const data={EOP:{type:"IAU2000A",data:{timeSeries:rows}}};
const parsed=E.parseIersDaily(data);
assert.equal(parsed.length,2);
assert.equal(parsed[0].xpArcsec,0.12);
assert.equal(parsed[1].dut1Seconds,-0.11);
assert.throws(()=>E.parseIersDaily({EOP:{type:"IAU1980",data:{timeSeries:rows}}}));
assert.throws(()=>E.parseIersDaily({EOP:{type:"IAU2000A",data:{timeSeries:[
  rows[1],rows[1]
]}}}));
const jdStart=61331+2400000.5;
const date=new Date((jdStart+0.5-2440587.5)*86400000);
const atMid=E.interpolateIersEop(parsed,date);
assert.ok(atMid && atMid.quality==="PREDICTION");
assert.ok(Math.abs(atMid.dut1Seconds+0.12)<1e-10);
assert.equal(E.interpolateIersEop(parsed,new Date("2030-01-01")),null);
const epoch=new Date("2000-01-01T12:00:00.000Z");
const jd=epoch.getTime()/86400000+2440587.5;
const eop={mjd:51544.5,dut1Seconds:0,xpArcsec:0,ypArcsec:0,quality:"FINAL"};
const sun={jdUt:jd,x:149600000,y:0,z:0};
const earth=J.horizonsIcrfToCupolaEarthFixed(sun,epoch,eop);
const r=Math.hypot(earth.x,earth.y,earth.z);
assert.ok(Math.abs(r-149600000)<0.001);
assert.ok(Math.abs(earth.y/r)<0.005,"J2000 equatorial RA0 should lie near equator");
const shifted=J.horizonsIcrfToCupolaEarthFixed(sun,epoch,{
  ...eop,dut1Seconds:0.5
});
const angle=J.terrestrialAngularDifferenceDeg(shifted,earth);
assert.ok(angle>0.001&&angle<0.003,
  "UT1-UTC offset should produce ~7.5 arcsec for half a second");
const polar=J.horizonsIcrfToCupolaEarthFixed(sun,epoch,{
  ...eop,xpArcsec:0.4,ypArcsec:-0.2
});
assert.ok(J.terrestrialAngularDifferenceDeg(earth,polar)<0.001,
  "Earth polar motion must be small, not degrees");
const pole=J.horizonsIcrfToCupolaEarthFixed(
  {jdUt:jd,x:0,y:0,z:384400},epoch,eop);
assert.ok(pole.y/384400>0.999,
  "The celestial north pole should point to CUPOLA's +Y geographic north");
assert.throws(()=>J.horizonsIcrfToCupolaEarthFixed(sun,
  new Date("2000-01-02T12:00:00.000Z"),eop));
assert.throws(()=>J.horizonsIcrfToCupolaEarthFixed(sun,epoch,
  {...eop,xpArcsec:30}));
console.log("CUPOLA Celestial 2.9 terrestrial frame basic unit tests PASS");
