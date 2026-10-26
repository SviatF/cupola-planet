#!/usr/bin/env node
/**
 * CUPOLA 8.6 — isolated Cloudflare REST API R2 connectivity probe.
 * Never handles, approves, or publishes any scene media.
 * Optional write test creates a tiny unlisted diagnostic object and MUST
 * delete it before the job can report success.
 */
import {randomUUID} from "node:crypto";

const account=process.env.CLOUDFLARE_ACCOUNT_ID||"";
const token=process.env.CLOUDFLARE_API_TOKEN||"";
const bucket=process.env.CUPOLA_R2_BUCKET||"";
if(!/^[a-f0-9]{32}$/i.test(account))
  throw Error("CUPOLA_R2_CONFIG_INVALID: missing/malformed account ID");
if(!token.trim())throw Error("CUPOLA_R2_CONFIG_INVALID: API token secret unavailable");
if(bucket!=="cupola-scene-media")
  throw Error("CUPOLA_R2_CONFIG_INVALID: variable CUPOLA_R2_BUCKET must be cupola-scene-media");
const root="https://api.cloudflare.com/client/v4/accounts/"+account+
  "/r2/buckets/"+bucket;
const headers={Authorization:"Bearer "+token};
const request=async(method,endpoint,body)=>{
  const response=await fetch(endpoint,{
    method,headers:{...headers,...(body?{"Content-Type":"text/plain; charset=utf-8"}:{})},
    ...(body?{body}:{}),signal:AbortSignal.timeout(25000),redirect:"error"
  });
  // Never include API response bodies or request headers in CI output.
  if(!response.ok)throw Error("CLOUDFLARE_R2_HTTP_"+response.status+"_"+method);
  if(method==="DELETE")return {ok:true};
  if(method==="GET" && endpoint===root){
    const payload=await response.json();
    if(!payload.success||payload.result?.name!==bucket)
      throw Error("CUPOLA_R2_BUCKET_IDENTITY_MISMATCH");
    return payload.result;
  }
  return {ok:true};
};
const info=await request("GET",root);
console.log("CUPOLA_R2_BUCKET_AUTH_OK",info.name,info.storage_class||"unreported");
// CDN custom domain is independently reported. Not being active is NOT
// evidence that the API token or the R2 bucket is broken.
try{
  const r=await fetch(root+"/domains/custom",{
    headers,signal:AbortSignal.timeout(18000),redirect:"error"
  });
  if(r.ok){
    const json=await r.json();
    const domains=json.result?.domains || json.result || [];
    const domain=Array.isArray(domains)?
      domains.find(d=>d.domain==="media.cupola.earth"):null;
    const enabled=domain?.enabled===true;
    const ownership=domain?.status?.ownership||"unknown";
    const ssl=domain?.status?.ssl||"unknown";
    console.log(enabled&&ownership==="active"&&ssl==="active"?
      "CUPOLA_MEDIA_DOMAIN_ACTIVE":"CUPOLA_MEDIA_DOMAIN_NOT_YET_ACTIVE",
      "enabled="+enabled,"ownership="+ownership,"ssl="+ssl);
  }else console.log("CUPOLA_MEDIA_DOMAIN_CHECK_UNAVAILABLE",r.status);
}catch{console.log("CUPOLA_MEDIA_DOMAIN_CHECK_UNAVAILABLE_NETWORK");}

if(process.env.CUPOLA_R2_WRITE_PROBE==="1"){
  // Unique diagnostic key, never a media/scene asset. A failed cleanup fails CI.
  const run=/^\d+$/.test(process.env.GITHUB_RUN_ID||"")?
    process.env.GITHUB_RUN_ID:"manual";
  const key="__cupola-smoke/"+run+"-"+randomUUID()+".txt";
  const objectUrl=root+"/objects/"+key.split("/").map(encodeURIComponent).join("/");
  let uploadAttempted=false, cleanupError=null, probeError=null;
  try{
    uploadAttempted=true;
    await request("PUT",objectUrl,"CUPOLA R2 connectivity probe; not scene media.\n");
    console.log("CUPOLA_R2_WRITE_OK","temporary diagnostic only");
  }catch(error){probeError=error;}
  finally{
    if(uploadAttempted){
      try{
        await request("DELETE",objectUrl);
        console.log("CUPOLA_R2_PROBE_CLEANED");
      }catch(error){
        cleanupError=error;
        console.error("CUPOLA_R2_PROBE_CLEANUP_FAILED",String(error));
      }
    }
  }
  if(probeError)throw probeError;
  if(cleanupError)throw cleanupError;
}
console.log("CUPOLA_R2_CONNECTION_PASS","no media published");
