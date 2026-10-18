#!/usr/bin/env node
// Source smoke QA: JPL Horizons is queried directly from CI, not reimplemented.
// No fake fallback; a source/schema failure is a FAILED scientific validation.
import {readFileSync} from "node:fs";
import ts from "typescript";
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
async function fetchBody(command,name){
  const response=await fetch(J.buildHorizonsVectorUrl(command,start,end),{
    signal:AbortSignal.timeout(15000),headers:{"User-Agent":"CUPOLA-scientific-source-QA/1.0"}
  });
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
    const header=data.result.slice(0,Math.max(0,data.result.indexOf("$SOE")));
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
console.log(JSON.stringify({
  source:"NASA/JPL Horizons",status:"validated raw ICRF (not Earth-fixed)",
  at:now.toISOString(),moonSamples:moon.length,sunSamples:sun.length,
  sourceChecks:"frame, center, UTC window, KM-S, signature, geometric vectors",
  distanceAndElongationAudit:qa
},null,2));
