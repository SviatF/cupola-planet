#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadTs(path, customRequire = require, extra = "") {
  const source = readFileSync(path,"utf8") + extra;
  const code = ts.transpileModule(source,{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
  }}).outputText;
  const module = {exports:{}};
  new Function("require","module","exports",code)(customRequire,module,module.exports);
  return module.exports;
}
const {encodeSatelliteRows,decodeSatelliteRows,SATELLITE_WIRE_FORMAT}=
  loadTs("lib/earth/satelliteCatalogWire.ts");
const sgp4=loadTs("lib/earth/satelliteSgp4.ts");
const route=loadTs("app/api/satellites/route.ts",id=>{
  if(id==="next/server")return {NextResponse:{json:(body,options)=>Response.json(body,options)}};
  if(id==="@/lib/earth/satelliteSgp4")return sgp4;
  if(id==="@/lib/earth/satelliteCatalogWire")return {encodeSatelliteRows,SATELLITE_WIRE_FORMAT};
  return require(id);
},"\nexport { fetchVerifiedReleaseCatalog };");

const now = new Date();
const records = Array.from({length:10000},(_,i)=>({
  NORAD_CAT_ID:100001+i,OBJECT_NAME:"TEST "+i,EPOCH:now.toISOString(),
  MEAN_MOTION:15.3,ECCENTRICITY:.0005,INCLINATION:53,
  RA_OF_ASC_NODE:(i*13)%360,ARG_OF_PERICENTER:(i*17)%360,
  MEAN_ANOMALY:(i*19)%360,BSTAR:.00005,
  MEAN_MOTION_DOT:0,MEAN_MOTION_DDOT:0,
}));
const catalog={schema:"cupola-omm-catalog/v1",count:records.length,records};
const bytes=new TextEncoder().encode(JSON.stringify(catalog));
const digest=createHash("sha256").update(bytes).digest("hex");
const manifest={schema:"cupola-omm-manifest/v1",
  catalogFile:"catalog-20261014212152.json",
  generatedAt:now.toISOString(),
  expiresAt:new Date(now.getTime()+4*3600000).toISOString(),
  count:records.length,sha256:digest};
const nativeFetch=globalThis.fetch;
let upstream=0,manifestRequests=0,catalogRequests=0,other=0;
let releaseUnavailable=false,officialAvailable=false;
globalThis.fetch=async input=>{
  const url=String(input);
  if(url.includes("gp.php") && url.includes("GROUP=ACTIVE")){
    upstream++;
    return officialAvailable ? Response.json(records) :
      new Response("upstream unavailable",{status:503});
  }
  if(url.endsWith("/latest.json")){
    manifestRequests++;
    return releaseUnavailable ? new Response("release unavailable",{status:404}) :
      Response.json(manifest);
  }
  if(url.includes("/catalog-20261014212152.json")){
    catalogRequests++;return new Response(bytes,{headers:{"Content-Type":"application/json"}});
  }
  other++;throw new Error("Unexpected external dependency "+url);
};
try{
  const snapshot=await route.GET(new Request("https://cupola.test/api/satellites"));
  assert.equal(snapshot.status,200,"failover must return 200 during CelesTrak outage");
  const json=await snapshot.json();
  assert.equal(json.count,10000);
  assert.equal(json.feedHealth.runtimeFallback,"verified-release");
  assert.equal(json.feedHealth.verifiedRelease,10000);
  assert.equal(json.feedHealth.orbitModel,"SGP4");
  assert.equal(json.satellites.length,json.count);
  assert.equal(new Set(json.satellites.map(x=>x.id)).size,json.count);
  assert.ok(json.satellites.every(x=>x.motionTarget && x.track.length===0));
  assert.equal(upstream,0,"healthy signed publication must avoid live CelesTrak cold timeout");
  assert.equal(manifestRequests,1);
  assert.equal(catalogRequests,1);
  assert.equal(other,0,"healthy verified snapshot must bypass stale mirror and groups");

  const compact=await route.GET(new Request("https://cupola.test/api/satellites?format=compact"));
  assert.equal(compact.status,200);
  const data=await compact.json();
  assert.equal(data.wireFormat,SATELLITE_WIRE_FORMAT);
  assert.equal(data.count,json.count);
  const decoded=decodeSatelliteRows(data.satellites,data.motionTargetTimestamp);
  // Separate server invocations propagate at different UTC instants.
  // Verify identifiers/epochs are stable and angular movement is physically bounded.
  const angularDistance=(a,b)=>{
    const rad=Math.PI/180;
    const x=Math.sin(a.latitude*rad)*Math.sin(b.latitude*rad)+
      Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*
      Math.cos((a.longitude-b.longitude)*rad);
    return Math.acos(Math.max(-1,Math.min(1,x)));
  };
  for (const i of [0,1,100,2500,5000,9999]) {
    assert.equal(decoded[i].id,json.satellites[i].id);
    assert.equal(decoded[i].name,json.satellites[i].name);
    assert.equal(decoded[i].epoch,json.satellites[i].epoch);
    assert.equal(decoded[i].category,json.satellites[i].category);
    assert.ok(angularDistance(decoded[i],json.satellites[i])<0.05);
    assert.ok(Math.abs(decoded[i].altitude-json.satellites[i].altitude)<20);
  }
  const legacySize=Buffer.byteLength(JSON.stringify(json));
  const wireSize=Buffer.byteLength(JSON.stringify(data));
  assert.ok(wireSize/legacySize<0.85,"must save at least 15% JSON");
  const sample=json.satellites[0];
  assert.deepEqual(decodeSatelliteRows(encodeSatelliteRows([sample]),
    sample.motionTarget.timestamp),[sample]);
  assert.deepEqual(decodeSatelliteRows([[1,"bad"]],sample.motionTarget.timestamp),[]);

  manifest.sha256="0".repeat(64);
  assert.deepEqual((await route.fetchVerifiedReleaseCatalog(now)).records,[],
    "tampered body must never be accepted");
  manifest.sha256=digest;
  // Publisher freshness can lapse during 403 outages without invalidating
  // every individually checked orbit. Never pretend its data was refreshed.
  manifest.generatedAt=new Date(now.getTime()-6*3600000).toISOString();
  manifest.expiresAt=new Date(now.getTime()-2*3600000).toISOString();
  const grace=await route.fetchVerifiedReleaseCatalog(now);
  assert.equal(grace.records.length,10000);
  assert.equal(grace.publisherExpired,true);
  assert.ok(grace.sourceAgeMinutes>=359 && grace.sourceAgeMinutes<=361);
  manifest.generatedAt=new Date(now.getTime()-25*3600000).toISOString();
  manifest.expiresAt=new Date(now.getTime()-21*3600000).toISOString();
  assert.deepEqual((await route.fetchVerifiedReleaseCatalog(now)).records,[],
    "24h manifest grace must reject stale snapshots even with valid checksum");
  // If release is absent, the original live CelesTrak ACTIVE fallback
  // remains healthy, without displaying a degraded or fabricated catalog.
  manifest.generatedAt=now.toISOString();
  manifest.expiresAt=new Date(now.getTime()+4*3600000).toISOString();
  releaseUnavailable=true;
  officialAvailable=true;
  const officialResponse=await route.GET(new Request("https://cupola.test/api/satellites?format=compact"));
  assert.equal(officialResponse.status,200);
  const officialCatalog=await officialResponse.json();
  assert.equal(officialCatalog.count,10000);
  assert.equal(officialCatalog.feedHealth.runtimeFallback,"active-gp");
  assert.equal(officialCatalog.feedHealth.verifiedRelease,0);
  assert.equal(officialCatalog.feedHealth.officialActive,10000);
  assert.equal(upstream,1,"CelesTrak is called only when publisher unavailable");
  assert.equal(other,0,"healthy direct fallback never requests mirror/group");
  console.log("PASS: published verified OMM first => zero live upstream calls on cold edge, 10k SGP4 positions, checksum and bounded 24h grace gates, direct CelesTrak fallback, compact lossless "+(100*(1-wireSize/legacySize)).toFixed(1)+"% fewer raw JSON bytes");
} finally {
  globalThis.fetch=nativeFetch;
}
