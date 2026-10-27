#!/usr/bin/env node
/**
 * Fail-closed prerequisite for the original CUPOLA WebP photographer.
 * Checks REAL published NOAA/JMA Level-2 manifests; visual IR, GFS and
 * archived observations can never satisfy this gate.
 *
 * Trigger the real publisher when the photo request changes, then poll the
 * verified production endpoint for its fresh manifest. The browser must
 * separately prove the exact atlas was actually applied to its GPU.
 */
const retryMs=20_000;
const timeoutMs=Number(process.env.CUPOLA_SCIENCE_WAIT_MS||600_000);
const origin=process.env.CUPOLA_CAPTURE_ORIGIN||"https://cupola.earth";
const u=new URL("/api/clouds-science-v3?kind=manifest",origin);
if(u.origin!=="https://cupola.earth" || u.protocol!=="https:")
 throw Error("SCIENCE_PREFLIGHT_INVALID_ORIGIN");
if(!Number.isInteger(timeoutMs)||timeoutMs<0||timeoutMs>600_000)
 throw Error("SCIENCE_PREFLIGHT_INVALID_TIMEOUT");

export function validateScientificManifest(meta,now=Date.now()){
 const errors=[];
 const fail=(condition,msg)=>{if(!condition)errors.push(msg);};
 const date=value=>typeof value==="string"?Date.parse(value):NaN;
 fail(meta?.schema==="cupola-scientific-cloud-v3/v1","missing-authoritative-level2-schema");
 fail(/^\d{14}$/.test(meta?.version||""),"missing-immutable-atlas-version");
 fail(meta?.not_a_static_fallback===true,"fallback-is-not-scientific-l2");
 fail(meta?.width===2048&&meta?.height===1024,"unverified-atlas-dimensions");
 fail(Number(meta?.observed_coverage_fraction)>.05 &&
      Number(meta?.observed_coverage_fraction)<=1,"no-measured-coverage");
 const made=date(meta?.generated_at),expiry=date(meta?.expires_at);
 fail(Number.isFinite(made)&&made<=now+300_000&&now-made<65*60_000,
      "manifest-not-recently-published");
 fail(Number.isFinite(expiry)&&expiry-now>=20*60_000,
      "atlas-may-expire-during-capture");
 const list=meta?.sources;
 fail(Array.isArray(list)&&list.length>0,"missing-observed-sources");
 if(Array.isArray(list))for(const source of list){
   const start=date(source?.observation_start),end=date(source?.observation_end);
   fail(["goes-acmf","himawari9-cmsk"].includes(source?.source),
        "unrecognized-level2-satellite");
   fail(Number.isFinite(start)&&Number.isFinite(end)&&
        start<=end&&end<=now+300_000&&now-start<=65*60_000,
        "satellite-scan-too-old-or-invalid");
 }
 return errors;
}

function selfTest(){
 const now=Date.parse("2026-10-27T18:00:00.000Z");
 const valid={
  schema:"cupola-scientific-cloud-v3/v1",version:"20261027175000",
  width:2048,height:1024,not_a_static_fallback:true,
  generated_at:"2026-10-27T17:50:00.000Z",
  expires_at:"2026-10-27T19:00:00.000Z",
  observed_coverage_fraction:.6558,
  sources:[{source:"goes-acmf",observation_start:"2026-10-27T17:38:00Z",
    observation_end:"2026-10-27T17:40:00Z"}]
 };
 const assert=(yes,msg)=>{if(!yes)throw Error("SELF_TEST_"+msg);};
 assert(validateScientificManifest(valid,now).length===0,"fresh-l2");
 assert(validateScientificManifest({...valid,expires_at:"2026-10-27T18:10:00Z"},now).length>0,"expiring");
 assert(validateScientificManifest({...valid,generated_at:"2026-10-27T15:35:00Z"},now).length>0,"stale-publisher");
 assert(validateScientificManifest({...valid,not_a_static_fallback:false},now).length>0,"fallback");
 assert(validateScientificManifest({...valid,sources:[{...valid.sources[0],
  observation_start:"2026-10-27T16:00:00Z"}]},now).length>0,"aged-source");
 assert(validateScientificManifest({...valid,observed_coverage_fraction:0},now).length>0,"no-coverage");
 console.log("PASS Cloud V3 capture freshness: strict native Level-2 vs fallback, age and expiry");
}
if(process.argv.includes("--self-test"))selfTest();
else {
 const begin=Date.now();
 let attempt=0,last="not-checked";
 while(true){
  ++attempt;
  try{
   const endpoint=new URL(u);
   endpoint.searchParams.set("captureSciencePreflight",String(Date.now()));
   const response=await fetch(endpoint,{
     cache:"no-store",headers:{"Cache-Control":"no-cache"},
     signal:AbortSignal.timeout(18_000),redirect:"error"
   });
   const type=response.headers.get("x-cupola-data-status")||"missing";
   if(response.ok && type==="scientific-observed"){
    const manifest=await response.json();
    const errors=validateScientificManifest(manifest);
    if(errors.length===0){
     console.log("CUPOLA_FRESH_SCIENTIFIC_L2_READY",
       JSON.stringify({version:manifest.version,coverage:manifest.observed_coverage_fraction,
        generatedAt:manifest.generated_at,attempt}));
     process.exit(0);
    }
    last="Level-2 invalid: "+errors.join(",");
   }else last="Level-2 HTTP "+response.status+" source="+type;
  }catch(e){last="Level-2 fetch error: "+String(e).slice(0,180);}
  console.warn("CUPOLA_WAITING_FOR_REAL_LEVEL2",last,"attempt",attempt);
  const remaining=timeoutMs-(Date.now()-begin);
  if(remaining<=0)break;
  await new Promise(resolve=>setTimeout(resolve,Math.min(remaining,retryMs)));
 }
 throw Error("FRESH_SATELLITE_L2_UNAVAILABLE_NO_CAPTURE: "+last+
  "; refusing to create a false-live WebP. Check scientific publisher workflow.");
}
