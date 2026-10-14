#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";

const SOURCE="https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=JSON";
const MIN_VALID=10000;
const MAX_VALID=20000;
const MAX_FUTURE_MS=6*3600000;
const HOUR=3600000;
const keys=["MEAN_MOTION","ECCENTRICITY","INCLINATION","RA_OF_ASC_NODE",
  "ARG_OF_PERICENTER","MEAN_ANOMALY"];
const optional=["BSTAR","MEAN_MOTION_DOT","MEAN_MOTION_DDOT"];
function normalize(record,nowMs){
  if(!record||typeof record!=="object")return null;
  const id=Number(record.NORAD_CAT_ID);
  const motion=Number(record.MEAN_MOTION);
  if(!Number.isSafeInteger(id)||id<1||!Number.isFinite(motion)||motion<=0||motion>=19)return null;
  if(keys.some(k=>record[k]==null||!Number.isFinite(Number(record[k]))))return null;
  const raw=String(record.EPOCH||"").trim();
  const epoch=new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)?raw:raw+"Z");
  if(!Number.isFinite(epoch.getTime()))return null;
  const maxAge=(motion>=6?72:motion>=2?168:336)*HOUR;
  if(nowMs-epoch.getTime()>maxAge||epoch.getTime()-nowMs>MAX_FUTURE_MS)return null;
  const eccentricity=Number(record.ECCENTRICITY);
  const inclination=Number(record.INCLINATION);
  if(eccentricity<0||eccentricity>=1||inclination<0||inclination>180)return null;
  const out={NORAD_CAT_ID:id,OBJECT_NAME:String(record.OBJECT_NAME||"SATELLITE").slice(0,100),
    EPOCH:epoch.toISOString()};
  for(const k of keys)out[k]=Number(record[k]);
  for(const k of optional){
    out[k]=record[k]==null?0:Number(record[k]);
    if(!Number.isFinite(out[k]))return null;
  }
  return out;
}
function compact(records,nowMs){
  const ids=new Set(),result=[];
  for(const record of records){
    const normalized=normalize(record,nowMs);
    if(!normalized||ids.has(normalized.NORAD_CAT_ID))continue;
    ids.add(normalized.NORAD_CAT_ID);
    result.push(normalized);
    if(result.length>=MAX_VALID)break;
  }
  return result;
}
if(process.argv.includes("--self-test")){
  const now=Date.parse("2026-10-14T20:00:00Z");
  const sample={NORAD_CAT_ID:25544,OBJECT_NAME:"ISS",EPOCH:new Date(now).toISOString(),
    MEAN_MOTION:15.5,ECCENTRICITY:0.0007,INCLINATION:51.6,RA_OF_ASC_NODE:12,
    ARG_OF_PERICENTER:34,MEAN_ANOMALY:56,BSTAR:0.00005};
  assert.equal(compact([sample,sample],now).length,1);
  assert.equal(normalize({...sample,EPOCH:"2024-01-01T00:00:00Z"},now),null);
  assert.equal(normalize({...sample,MEAN_MOTION:0},now),null);
  assert.equal(normalize({...sample,NORAD_CAT_ID:"bad"},now),null);
  assert.equal(normalize({...sample,ECCENTRICITY:2},now),null);
  console.log("PASS: official OMM normalization, epochs, deduplication, invalid records");
  process.exit(0);
}
let data;
for(let n=0;n<3;n++){
  try{
    const res=await fetch(SOURCE,{headers:{Accept:"application/json",
      "User-Agent":"CUPOLA-Orbital-Publisher/1.0"},signal:AbortSignal.timeout(40000)});
    if(!res.ok)throw Error("Official CelesTrak HTTP "+res.status);
    const json=await res.json();
    if(!Array.isArray(json))throw Error("CelesTrak response was not OMM JSON array");
    data=json;break;
  }catch(e){
    console.warn("Official OMM request "+(n+1)+" failed:",String(e));
    if(n===2)throw e;
    await new Promise(r=>setTimeout(r,5000*(n+1)));
  }
}
const now=new Date(),records=compact(data,now.getTime());
if(records.length<MIN_VALID)throw Error(
  "Refusing to publish partial/stale catalog: "+records.length+"/"+data.length);
const version=now.toISOString().replace(/[-:T]/g,"").slice(0,14);
const catalogFile="catalog-"+version+".json";
const catalog=JSON.stringify({schema:"cupola-omm-catalog/v1",
  generatedAt:now.toISOString(),source:"CelesTrak ACTIVE OMM",count:records.length,records});
const sha256=createHash("sha256").update(catalog).digest("hex");
const latest={schema:"cupola-omm-manifest/v1",version,catalogFile,
  generatedAt:now.toISOString(),
  expiresAt:new Date(now.getTime()+4*HOUR).toISOString(),
  count:records.length,sha256,source:"CelesTrak ACTIVE OMM"};
const outIndex=process.argv.indexOf("--output");
const folder=outIndex>=0?process.argv[outIndex+1]:null;
if(!folder)throw Error("Provide --output PATH");
await mkdir(folder,{recursive:true});
await Promise.all([
  writeFile(folder+"/"+catalogFile,catalog),
  writeFile(folder+"/latest.json",JSON.stringify(latest)),
  writeFile(folder+"/version.txt",version),
]);
console.log("PUBLISHED READY",JSON.stringify({version,count:records.length,
  rejected:data.length-records.length,bytes:Buffer.byteLength(catalog),sha256,
  earliestEpoch:records.reduce((p,r)=>r.EPOCH<p?r.EPOCH:p,records[0].EPOCH)}));
