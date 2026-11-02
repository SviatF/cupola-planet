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
   fit:getComputedStyle(el).objectFit,
   fade:getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage,
   loaded:el instanceof HTMLImageElement && el.complete && el.naturalWidth>0
  }));
  if(!info.loaded)throw Error("Approved WebP did not load");
  if(info.fit!=="contain")throw Error("Desktop globe must be a whole circular disk, not a cropped overscan");
  if(!info.fade?.includes("linear-gradient"))throw Error("Desktop WebP lacks the soft seam feather");
  const actual=await image.evaluate(el=>{
   const rect=el.getBoundingClientRect();
   const host=el.closest(".ae-live-scene")?.getBoundingClientRect();
   const src=el.getAttribute("src");
   const ambient=document.querySelector(".ae-home-ambient-poster");
   const back=ambient?.getAttribute("src");
   return {x:rect.x,y:rect.y,w:rect.width,h:rect.height,
     hostX:host?.x||0,hostWidth:host?.width||0,
     naturalRatio:el.naturalWidth/el.naturalHeight,
     ambientSameSource:src===back,
     ambienceFilter:ambient?getComputedStyle(ambient).filter:"none"};
  });
  if(!actual.ambientSameSource || !actual.ambienceFilter.includes("blur("))
   throw Error("Missing same-WebP atmospheric backdrop");
  if(Math.abs(actual.w/actual.h-actual.naturalRatio)>.03)
   throw Error("Masked image box includes letterboxing, rather than the actual WebP: "+JSON.stringify(actual));
  if(actual.x-actual.hostX<actual.hostWidth*.16)
   throw Error("Image edge position is not the rendered 16:9 frame: "+JSON.stringify(actual));
  console.log("CUPOLA_ACTUAL_WEBP_EDGE_GEOMETRY",JSON.stringify(actual));
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
 // Recreate the user's wide desktop layout, not only the old 1600px smoke
 // viewport: 8.17.3 masked the full-width element while a 16:9 raster
 // started much farther to the right. Verify the real bitmap edge and
 // archive a full-resolution screenshot for visual QA.
 if(hasImage){
  await page.setViewportSize({width:2048,height:1123});
  await page.waitForTimeout(500);
  const wide=await image.evaluate(el=>{
   const rect=el.getBoundingClientRect();
   const parent=el.closest(".ae-live-scene")?.getBoundingClientRect();
   return {x:rect.x,w:rect.width,h:rect.height,
    naturalRatio:el.naturalWidth/el.naturalHeight,
    hostX:parent?.x||0,hostWidth:parent?.width||0,
    fade:getComputedStyle(el).maskImage||getComputedStyle(el).webkitMaskImage};
  });
  if(Math.abs(wide.w/wide.h-wide.naturalRatio)>.03 ||
     wide.x-wide.hostX<wide.hostWidth*.25 || !wide.fade.includes("linear-gradient"))
   throw Error("2048px wide viewport image edge still letterboxed: "+JSON.stringify(wide));
  const wideHero=await page.locator(".ae-hero").boundingBox();
  if(!wideHero)throw Error("2048px hero missing");
  const png=await page.screenshot({type:"png"});
  const left=Math.max(0,Math.floor(wideHero.x)),top=Math.max(0,Math.floor(wideHero.y));
  const width=Math.min(2048-left,Math.floor(wideHero.width));
  const height=Math.min(1123-top,Math.floor(wideHero.height));
  await fs.writeFile(path.join(dir,"home-wide-2048-seam-qa.webp"),
    await sharp(png).extract({left,top,width,height}).webp({quality:90}).toBuffer());
  console.log("CUPOLA_WIDE_2048_SEAM_GEOMETRY_PASS",JSON.stringify(wide));
 }
 console.log("CUPOLA_HOME_NO_WEBGL_SMOKE_PASS",hasImage?"ORIGINAL_WEBP":"FIRST_SOURCE_IMAGE_PENDING");
}catch(error){
 await fs.writeFile(path.join(dir,"home-qa-error.json"),JSON.stringify({error:String(error)},null,2)+"\n");
 throw error;
}finally{await browser.close();}
