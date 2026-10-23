#!/usr/bin/env node
// Source smoke QA: JPL Horizons is queried directly from CI, not reimplemented.
// No fake fallback; a source/schema failure is a FAILED scientific validation.
import {readFileSync} from "node:fs";
import ts from "typescript";
import {createRequire} from "node:module";
const nodeRequire=createRequire(import.meta.url);
const importCommonJS=(path)=>{
  const compiled=ts.transpileModule(readFileSync(path,"utf8"),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const mod={exports:{}};
  new Function("require","module","exports",compiled)(nodeRequire,mod,mod.exports);
  return mod.exports;
};
const importTS=async path=>{
  const js=ts.transpileModule(readFileSync(path,"utf8"),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
  }).outputText;
  return await import("data:text/javascript,"+encodeURIComponent(js));
};
const J=await importTS("lib/earth/jplHorizons.ts");
const A=await importTS("lib/earth/celestialEngine.ts");
const now=new Date();
const start=new Date(Math.floor(now.getTime()/600000)*600000);
const end=new Date(start.getTime()+3600000);
// Scientific failure remains a FAILURE; only retry transient socket/connect
// errors. Never invent an ephemeris, accept a substitute website, or fake PASS.
async function fetchOfficial(url,headers,sourceLabel){
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try {
      return await fetch(url,{
        signal:AbortSignal.timeout(18000),headers
      });
    }catch(error){
      lastError=error;
      const reason=String(error?.cause?.code||error?.name||error);
      console.warn('UPSTREAM RETRY',sourceLabel,
        'attempt='+attempt+'/3',reason.slice(0,96));
      if(attempt<3)await new Promise(resolve=>setTimeout(resolve,1200*attempt));
    }
  }
  throw new Error('Official scientific source unreachable after 3 attempts: '+
    sourceLabel+'; '+String(lastError?.cause?.code||lastError));
}
async function fetchBody(command,name){
  const response=await fetchOfficial(J.buildHorizonsVectorUrl(command,start,end),
    {"User-Agent":"CUPOLA-scientific-source-QA/1.0"},"NASA/JPL Horizons "+name);
  if(!response.ok)throw Error("JPL response HTTP "+response.status+" for "+name);
  const raw=await response.text();
  if(raw.length>1_100_000)throw Error("Oversized JPL response");
  const data=JSON.parse(raw);
  if(data.error||typeof data.result!=="string" ||
    !String(data.signature?.source??"").includes("NASA/JPL")||
    !/^1\./.test(String(data.signature?.version??"")))
    throw Error("JPL API signature or payload invalid for "+name);
  let samples;
  try {
    samples=J.parseHorizonsGeocentricVectors(data.result,name);
  } catch(error) {
    // Only allow known scientific header lines into CI logs, not arbitrary
    // ephemeris payload text or unsanitized upstream error messages.
    const header=data.result.slice(0,Math.max(0,data.result.indexOf(String.fromCharCode(36,36)+"SOE")));
    const selected=header.split(/\r?\n/)
      .map(line=>line.replace(/[^\x20-\x7E]/g,"").slice(0,180))
      .filter(line=>/Target body name|Center body name|Reference frame|Coordinate syst|Output units|Output type|Output format|JDUT|JDTDB|Start time|Step-size/i.test(line))
      .slice(-15);
    console.error(JSON.stringify({body:name,verifiedApi:"NASA/JPL",horizonsHeaders:selected},null,2));
    throw new Error("JPL "+name+" metadata rejected: "+String(error));
  }
  J.validateHorizonsUtcWindow(samples,start,end);
  return samples;
}
const [moon,sun]=await Promise.all([fetchBody("301","moon"),fetchBody("10","sun")]);
if(moon.length!==sun.length || moon.some((m,i)=>Math.abs(m.jdUt-sun[i].jdUt)>1e-7))
  throw Error("JPL Sun/Moon timestamps not identical");
const jd=now.getTime()/86400000+2440587.5;
const moonNow=J.interpolateHorizonsVectors(moon,jd);
const sunNow=J.interpolateHorizonsVectors(sun,jd);
if(!moonNow||!sunNow)throw Error("No JPL interpolation for current UTC");
const analytic=A.celestialAt(now);
const qa=J.horizonsFrameInvariantAudit(sunNow,moonNow,
  analytic.moon.distanceKm,analytic.sun.distanceKm,analytic.moonPhaseAngleDeg);
if(!qa.plausible)throw Error("JPL invariant mismatch "+JSON.stringify(qa));
// Independent Earth-orientation data: never replace missing UT1 with invented 0.
const E=importCommonJS("lib/earth/iersEop.ts");
const T=importCommonJS("lib/earth/jplEarthFixed.ts");
const source=await fetchOfficial(
  "https://datacenter.iers.org/products/eop/rapid/daily/json/finals2000A.daily.json",
  {},"IERS finals2000A daily"
);
if(!source.ok)throw Error("Official IERS daily EOP unreachable HTTP "+source.status);
const text=await source.text();
if(text.length>1_500_000)throw Error("IERS payload oversized");
const series=E.parseIersDaily(JSON.parse(text));
const eop=E.interpolateIersEop(series,now);
if(!eop)throw Error("IERS has no bracketed UT1/polar-motion data for UTC "+now.toISOString());
const moonEcef=T.horizonsIcrfToCupolaEarthFixed(moonNow,now,eop);
const sunEcef=T.horizonsIcrfToCupolaEarthFixed(sunNow,now,eop);
const moonBearingErrorDeg=T.terrestrialAngularDifferenceDeg(moonEcef,analytic.moon.earthFixedKm);
const sunBearingErrorDeg=T.terrestrialAngularDifferenceDeg(sunEcef,analytic.sun.earthFixedKm);
if(moonBearingErrorDeg>2||sunBearingErrorDeg>2)
  throw Error("JPL and preview Earth-fixed geometry disagree: "+JSON.stringify({
    moonBearingErrorDeg,sunBearingErrorDeg
  }));
// Earth-fixed trajectories must advance smoothly with a real rotating Earth.
// A ten-minute sample must move about 2.5 degrees as Earth turns; wrong
// ICRF-to-ITRF handedness, time-scale or static-GMST bugs are caught here.
for(const [name,vectors] of [["moon",moon],["sun",sun]]){
  let prior=null;
  for(const vector of vectors){
    const instant=new Date((vector.jdUt-2440587.5)*86400000);
    const orientation=E.interpolateIersEop(series,instant);
    if(!orientation)throw Error("IERS interpolation hole during JPL "+name+" trajectory");
    const rotated=T.horizonsIcrfToCupolaEarthFixed(vector,instant,orientation);
    if(prior){
      const delta=T.terrestrialAngularDifferenceDeg(prior,rotated);
      if(!(delta>2.0 && delta<3.0))
        throw Error("Unexpected 10-minute Earth-fixed "+name+" rotation: "+delta);
    }
    prior=rotated;
  }
}
console.log(JSON.stringify({
  source:"NASA/JPL Horizons",status:"validated raw ICRF (not Earth-fixed)",
  at:now.toISOString(),moonSamples:moon.length,sunSamples:sun.length,
  sourceChecks:"frame, center, UTC window, KM-S, signature, geometric vectors",
  distanceAndElongationAudit:qa,
  terrestrialFrame:{
    source:"IERS finals2000A BulletinA",eopQuality:eop.quality,
    ut1MinusUtcSeconds:eop.dut1Seconds,xpArcsec:eop.xpArcsec,ypArcsec:eop.ypArcsec,
    moonBearingErrorDeg,sunBearingErrorDeg,
    status:"APPROX_EQUINOX_TRANSFORM_NOT_ERFA_C2T06A"
  }
},null,2));
