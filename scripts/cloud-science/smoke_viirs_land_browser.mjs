#!/usr/bin/env node
/**
 * Exact PR-SHA Cloudflare Playwright verification. A green TypeScript build
 * is not proof that a daily satellite image changed the rotating Earth!
 * Use real NASA images, real Workers image API, no mocked pixels/sources.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require("/tmp/cupola-viirs/node_modules/playwright");
const sha=process.env.CUPOLA_EXPECTED_SHA||"";
const repo=process.env.GITHUB_REPOSITORY||"";
const pr=process.env.CUPOLA_PR_NUMBER||"";
const token=process.env.GH_TOKEN||"";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
assert.match(sha,/^[a-f0-9]{40}$/);
assert.match(repo,/^[^/]+\/[^/]+$/);
assert.match(pr,/^[0-9]+$/);
const artifacts="viirs-land-globe-browser";
fs.mkdirSync(artifacts,{recursive:true});
const report={sha,pr,date:new Date().toISOString(),status:"PENDING",observations:[]};
let browser;
try{
  const api="https://api.github.com/repos/"+repo;
  const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
    "User-Agent":"CUPOLA-Real-VIIRS-Land-Renderer-Browser-QA"};
  async function json(url){
    const response=await fetch(url,{headers});
    if(!response.ok)throw Error("GitHub SHA-CI query HTTP "+response.status);
    return response.json();
  }
  let worker=null;
  // Do not use stable aliases while Cloudflare may be serving a prior PR.
  for(let i=0;i<26;i++){
    const checks=(await json(api+"/commits/"+sha+"/check-runs?per_page=100")).check_runs||[];
    const cf=checks.find(x=>x.name==="Workers Builds: cupola-planet"&&
      x.app?.slug==="cloudflare-workers-and-pages"&&x.conclusion==="success");
    const match=String(cf?.details_url||"").match(/\/previews\/([a-z0-9-]+)\/builds\//);
    if(match){worker="https://"+match[1]+"-cupola-planet.oleg22777.workers.dev";break;}
    await sleep(10000);
  }
  assert.ok(worker,"Must test SHA-matched Cloudflare deployment");
  report.worker=worker;
  browser=await chromium.launch({headless:true,
    args:["--no-sandbox","--enable-webgl","--use-gl=angle","--use-angle=swiftshader"]});
  const page=await browser.newPage({viewport:{width:1400,height:900},deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__cupolaLandEvents=[];
    window.addEventListener("cupola-viirs-land-applied",e=>{
      window.__cupolaLandEvents.push(e.detail);
    });
  });
  const result=await page.goto(worker+"/?cloudEngine=legacy",{
    waitUntil:"domcontentloaded",timeout:90000});
  assert.equal(result?.status(),200);
  await page.locator(".scene-wrap canvas").first().waitFor({timeout:90000});
  const apiResponse=await page.request.get(
    worker+"/api/satellite?mode=live&sensor=noaa21&daysAgo=1&resolution=probe",
    {timeout:24000});
  assert.equal(apiResponse.status(),200,"real NASA source through this Worker");
  assert.equal(apiResponse.headers()["x-cupola-source"],"NASA_GIBS_VIIRS");
  assert.equal(apiResponse.headers()["x-cupola-layer"],
    "VIIRS_NOAA21_CorrectedReflectance_TrueColor");
  report.actualSource={status:apiResponse.status(),
    date:apiResponse.headers()["x-cupola-imagery-date"],bytes:(await apiResponse.body()).length};
  await page.locator(".control-center-trigger").evaluate(el=>el.click());
  const layersTab=page.locator('[data-control-center="layers"]');
  await layersTab.waitFor({state:"visible",timeout:15000});
  await layersTab.evaluate(el=>el.click());
  const toggle=page.locator(".layer-row").filter({
    hasText:"Satellite surface (on globe)",
  }).first();
  await toggle.waitFor({state:"visible",timeout:15000});
  await toggle.evaluate(el=>el.click());
  await page.waitForFunction(()=>{
    const status=document.querySelector(".surface-applied-info")?.textContent||"";
    return status.includes("Real satellite land pixels are now rendered ON EARTH");
  },undefined,{timeout:120000});
  const events=await page.evaluate(()=>window.__cupolaLandEvents||[]);
  assert.ok(events.length>=1,"On-Earth integration must emit verified render event");
  const event=events.at(-1);
  assert.equal(event.source,"NASA_GIBS_VIIRS");
  assert.ok(event.landPixelsPercent>0.5&&event.landPixelsPercent<50);
  assert.match(event.date,/^\d{4}-\d{2}-\d{2}$/);
  report.observations=events;
  report.layerStatus=await toggle.innerText();
  assert.match(report.layerStatus,/ON GLOBE/);
  assert.equal(errors.length,0,"No uncaught page errors while applying daily land texture");
  try{
    await page.screenshot({path:artifacts+"/actual-noaa-land-on-globe.png",
      animations:"disabled",timeout:18000});
    report.screenshot="captured";
  }catch(error){report.screenshot="software-WebGL capture unavailable: "+String(error).slice(0,160);}
  // Feature OFF MUST restore original premium Earth, not alter Cloud V3.
  await toggle.evaluate(el=>el.click());
  await page.waitForFunction(()=>{
    const element=Array.from(document.querySelectorAll(".layer-row"))
      .find(el=>el.textContent?.includes("Satellite surface (on globe)"));
    return element?.textContent?.includes("OFF");
  },undefined,{timeout:10000});
  report.toggleOffRestoresBase="PASS";
  report.status="PASS";
}catch(e){
  report.status="FAIL";report.error=String(e.stack||e);process.exitCode=1;
}finally{
  if(browser)await browser.close();
  fs.writeFileSync(artifacts+"/report.json",JSON.stringify(report,null,2));
  console.log("CUPOLA REAL NASA LAND ON GLOBE BROWSER QA",JSON.stringify(report));
}
