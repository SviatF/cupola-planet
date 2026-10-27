#!/usr/bin/env node
// Observes the REAL homepage hero after Cloudflare deploy. Saves a
// screenshot for manual aesthetics review, never science-approves or publishes.
import fs from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
import sharp from "sharp";
const output=path.resolve("capture-output");
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
 "--enable-unsafe-swiftshader","--disable-dev-shm-usage"]});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const response=await page.goto("https://cupola.earth/",{waitUntil:"domcontentloaded",timeout:95000});
 if(!response?.ok())throw Error("Homepage was not served successfully");
 const frame=page.frameLocator('.ae-live-scene iframe[src="/explore?embed=1&hero=sunrise"]');
 const root=frame.locator('.cupola-page[data-editorial-shot="twilight"]');
 await root.waitFor({state:"attached",timeout:150000});
 const state=await root.evaluate(el=>({
  ready:el.getAttribute("data-renderer-ready"),
  camera:el.getAttribute("data-editorial-camera"),
  shot:el.getAttribute("data-editorial-shot"),
  distance:Number(el.getAttribute("data-earth-distance-radii")),
  daylight:Number(el.getAttribute("data-daylight-fraction-approx")),
  centerX:Number(el.getAttribute("data-earth-center-projection-x")),
  centerY:Number(el.getAttribute("data-earth-center-projection-y")),
  viewport:window.innerWidth
 }));
 if(state.ready!=="true" || state.camera!=="twilight-wide-v1" ||
    Math.abs(state.distance-4.3)>.01 || Math.abs(state.daylight-.4)>.015 ||
    Math.abs(state.centerX)>.1||Math.abs(state.centerY)>.1)
   throw Error("Actual home camera has not applied the checked 4.30R twilight framing: "+
     JSON.stringify(state));
 await page.waitForTimeout(5000);
 // CDP screenshot avoids the known SwiftShader+animated-scene Playwright hang.
 const cdp=await page.context().newCDPSession(page);
 const result=await cdp.send("Page.captureScreenshot",{
   format:"png",fromSurface:true,captureBeyondViewport:false
 });
 await cdp.detach();
 if(!result.data)throw Error("No actual WebGL viewport screenshot");
 const png=Buffer.from(result.data,"base64");
 const hero=await page.locator(".ae-hero").boundingBox();
 if(!hero||hero.width<1200||hero.height<400)throw Error("Homepage hero dimensions invalid");
 const left=Math.max(0,Math.floor(hero.x)),top=Math.max(0,Math.floor(hero.y));
 const width=Math.min(1600-left,Math.floor(hero.width));
 const height=Math.min(900-top,Math.floor(hero.height));
 const media=sharp(png).extract({left,top,width,height});
 const stats=await media.stats();
 if(stats.channels.slice(0,3).every(x=>x.stdev<12))
   throw Error("Hero screenshot is blank / near uniform");
 const webp=await sharp(png).extract({left,top,width,height})
    .webp({quality:90,effort:4}).toBuffer();
 await fs.writeFile(path.join(output,"home-twilight-review.webp"),webp);
 await fs.writeFile(path.join(output,"home-twilight-review.json"),
   JSON.stringify({status:"AWAITING_VISUAL_REVIEW_NO_PUBLICATION",
     source:"https://cupola.earth/",capturedAt:new Date().toISOString(),
     sourceRevision:process.env.GITHUB_SHA,camera:state,
     disclaimer:"Rendered 3D scene, not satellite imagery. This screenshot does not prove source freshness or city-light coverage."},null,2)+"\n");
 console.log("CUPOLA_8_9_TWILIGHT_ACTUAL_HERO_SCREENSHOT",width,height,webp.length);
}catch(error){
 await fs.writeFile(path.join(output,"home-twilight-error.json"),
   JSON.stringify({status:"NOT_APPROVED",error:String(error)},null,2)+"\n");
 throw error;
}finally{await browser.close();}
