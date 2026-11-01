#!/usr/bin/env node
// Verifies the production WEBSITE after deployment. It does not create
// or science-approve satellite imagery and never mounts the 3D hero iframe.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {chromium} from "playwright";
const dir=path.resolve("capture-output");
await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:["--disable-dev-shm-usage"]});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const response=await page.goto("https://cupola.earth/",{waitUntil:"domcontentloaded",timeout:90000});
 if(!response?.ok())throw Error("Homepage not served");
 const hero=page.locator(".ae-live-scene");
 await hero.waitFor({state:"attached",timeout:15000});
 if(await hero.locator("iframe, canvas").count()!==0)
   throw Error("Homepage unexpectedly loaded second WebGL or iframe");
 // The very first capture is allowed to be pending. Never label a placeholder
 // as a source-verified Earth image simply to make visual smoke pass.
 await page.waitForTimeout(6000);
 const image=hero.locator(".ae-home-approved-poster");
 const hasImage=await image.count()===1;
 if(hasImage){
  const info=await image.evaluate(el=>({
   src:el.getAttribute("src"),
   loaded:el instanceof HTMLImageElement && el.complete && el.naturalWidth>0
  }));
  if(!info.loaded)throw Error("Approved WebP did not load");
  if(!/^\/api\/scene-media\/home-cover\/image\?v=[a-f0-9]{20}$/.test(info.src||"") &&
     !/^https:\/\/media\.cupola\.earth\/scene-captures\//.test(info.src||""))
    throw Error("Unexpected home image origin");
 }else if(await hero.locator(".ae-home-still-fallback").count()!==1){
  throw Error("Neither source-verified image nor honest fallback exists");
 }
 const raw=await page.screenshot({type:"png"});
 const heroBox=await page.locator(".ae-hero").boundingBox();
 if(!heroBox)throw Error("Homepage hero missing");
 const left=Math.max(0,Math.floor(heroBox.x)),top=Math.max(0,Math.floor(heroBox.y));
 const width=Math.min(1600-left,Math.floor(heroBox.width)),height=Math.min(900-top,Math.floor(heroBox.height));
 const snapshot=await sharp(raw).extract({left,top,width,height}).webp({quality:88}).toBuffer();
 await fs.writeFile(path.join(dir,"home-verified-webp-qa.webp"),snapshot);
 await fs.writeFile(path.join(dir,"home-verified-webp-qa.json"),JSON.stringify({
  status:hasImage?"SOURCE_VERIFIED_WEBP_VISIBLE":"AWAITING_FIRST_SCIENCE_VERIFIED_WEBP",
  checkedAt:new Date().toISOString(),renderRevision:process.env.GITHUB_SHA,
  secondWebGLContext:false,imageVisible:hasImage,
  description:"Homepage display smoke only. Scientific Level-2 QA is carried by the capture workflow."
 },null,2)+"\n");
 console.log("CUPOLA_HOME_NO_WEBGL_SMOKE_PASS",hasImage?"ORIGINAL_WEBP":"FIRST_SOURCE_IMAGE_PENDING");
}catch(error){
 await fs.writeFile(path.join(dir,"home-qa-error.json"),JSON.stringify({error:String(error)},null,2)+"\n");
 throw error;
}finally{await browser.close();}
