#!/usr/bin/env node
/**
 * CUPOLA 8.7: fail-closed capture preflight. The production renderer must be
 * the exact checked-out commit BEFORE chromium is even launched.
 * Prevents silent still/video divergence during Cloudflare deploy races.
 */
const sha=(process.env.CUPOLA_EXPECTED_REVISION||process.env.GITHUB_SHA||"").trim().toLowerCase();
if(!/^[0-9a-f]{40}$/.test(sha))throw Error("RELEASE_PREFLIGHT_MISSING_SHA: refusing unknown source");
const origin=process.env.CUPOLA_CAPTURE_ORIGIN||"https://cupola.earth";
const url=new URL("/explore?capture=1&hero=sunrise",origin);
if(url.protocol!=="https:"||url.hostname!=="cupola.earth")
  throw Error("RELEASE_PREFLIGHT_UNTRUSTED_ORIGIN");
const maxMs=Number(process.env.CUPOLA_RELEASE_WAIT_MS||480000);
if(!Number.isFinite(maxMs)||maxMs<0||maxMs>600000)
  throw Error("RELEASE_PREFLIGHT_BAD_TIMEOUT");
const started=Date.now();
let observed="",status="not-checked",attempt=0;
do{
  attempt++;
  try{
    const endpoint=new URL(url);
    endpoint.searchParams.set("capturePreflight",String(Date.now()));
    const response=await fetch(endpoint,{
      method:"HEAD",redirect:"error",cache:"no-store",
      headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)
    });
    status=String(response.status);
    observed=(response.headers.get("x-cupola-revision")||"").trim().toLowerCase();
    if(response.ok&&observed===sha){
      console.log("CUPOLA_PRODUCTION_RELEASE_MATCH",sha,
        "attempt="+attempt,"elapsedSeconds="+Math.round((Date.now()-started)/1000));
      process.exit(0);
    }
    console.log("CUPOLA_RELEASE_PENDING","expected="+sha,
      "observed="+(observed||"missing"),"http="+status,"attempt="+attempt);
  }catch(error){
    console.warn("CUPOLA_RELEASE_CHECK_RETRY",String(error).slice(0,160));
  }
  const remaining=maxMs-(Date.now()-started);
  if(remaining<=0)break;
  await new Promise(resolve=>setTimeout(resolve,Math.min(20000,remaining)));
}while(Date.now()-started<=maxMs);
throw Error("CUPOLA_DEPLOYED_SHA_NOT_READY: expected "+sha+
  " but /explore returned "+(observed||"no revision")+" (HTTP "+status+
  "). No media captured or published. Retry after Cloudflare deploy; do not bypass.");
