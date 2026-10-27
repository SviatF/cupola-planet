#!/usr/bin/env node
// CUPOLA 8.14: verify actual homepage ORIGINAL Explore fallback, not
// the now-retired custom solar/editorial grading. Save WebGL screenshot for
// manual review; never publish or approve scientific imagery here.
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
 if(!response?.ok())throw Error("Homepage not served successfully");
 const iframe=page.locator('.ae-live-scene iframe[src="/explore?embed=1&captureShot=explore"]');
 await iframe.waitFor({state:"attached",timeout:10000});
 const frame=page.frameLocator('.ae-live-scene iframe[src="/explore?embed=1&captureShot=explore"]');
 const root=frame.locator('.cupola-page[data-editorial-shot="explore"]');
 await root.waitFor({state:"attached",timeout:160000});
 await page.waitForFunction(()=>{
   const iframe=document.querySelector('.ae-live-scene iframe');
   return iframe instanceof HTMLIFrameElement &&
    !!iframe.contentWindow?.document?.querySelector(
      '.cupola-page[data-renderer-ready="true"][data-editorial-camera="explore-reference-v1"]');
 },null,{timeout:120000,polling:500});
 await page.waitForTimeout(750); // allow 500ms initial WebGL opacity reveal
 const state=await root.evaluate(el=>({
  ready:el.getAttribute("data-renderer-ready"),
  camera:el.getAttribute("data-editorial-camera"),
  shot:el.getAttribute("data-editorial-shot"),
  shader:el.getAttribute("data-capture-shader-profile"),
  distance:Number(el.getAttribute("data-earth-distance-radii")),
  centerX:Number(el.getAttribute("data-earth-center-projection-x")),
  centerY:Number(el.getAttribute("data-earth-center-projection-y")),
  fov:Number(el.getAttribute("data-editorial-fov-degrees")),
  capturedAt:el.getAttribute("data-solar-camera-utc"),
  cssReady:window.getComputedStyle(el.querySelector(".scene-wrap")).opacity,
  viewport:window.innerWidth
 }));
 if(state.ready!=="true" || state.camera!=="explore-reference-v1" ||
    state.shot!=="explore" || state.shader!=="EXPLORE_UNMODIFIED" ||
    Math.abs(state.distance-3.7093)>.025||Math.abs(state.fov-41)>.15 ||
    Math.abs(state.centerX)>.2||Math.abs(state.centerY)>.2 ||
    !Number.isFinite(Date.parse(state.capturedAt||""))||state.cssReady!=="1")
   throw Error("Home fallback does not match untouched Explore camera: "+JSON.stringify(state));
 const hero=await page.locator(".ae-hero").boundingBox();
 const box=await iframe.boundingBox();
 if(!hero||!box)throw Error("Rendered homepage layout missing");
 const centerX=(box.x+box.width*(1+state.centerX)/2-hero.x)/hero.width;
 const centerY=(box.y+box.height*(1-state.centerY)/2-hero.y)/hero.height;
 const radiusHeight=(box.height/hero.height)*
   Math.tan(Math.asin(1/state.distance))/Math.tan(state.fov*Math.PI/360)/2;
 const radiusWidth=radiusHeight*hero.height/hero.width;
 if(!(centerX-radiusWidth>.50 && centerX+radiusWidth<.90 &&
   centerY-radiusHeight>.05 && centerY+radiusHeight<.95))
   throw Error("Original Explore globe cropped or behind editorial headline: "+
     JSON.stringify({centerX,centerY,radiusHeight,radiusWidth}));
 await page.waitForTimeout(5000);
 const cdp=await page.context().newCDPSession(page);
 const screenshot=await cdp.send("Page.captureScreenshot",{
   format:"png",fromSurface:true,captureBeyondViewport:false
 });
 await cdp.detach();
 const png=Buffer.from(screenshot.data||"","base64");
 if(png.length<10000)throw Error("Empty browser scene screenshot");
 const left=Math.max(0,Math.floor(hero.x)),top=Math.max(0,Math.floor(hero.y));
 const width=Math.min(1600-left,Math.floor(hero.width));
 const height=Math.min(900-top,Math.floor(hero.height));
 const sharpHero=sharp(png).extract({left,top,width,height});
 const stats=await sharpHero.stats();
 if(stats.channels.slice(0,3).every(x=>x.stdev<12))
   throw Error("Original Explore scene blank in homepage");
 const webp=await sharp(png).extract({left,top,width,height}).webp({quality:90,effort:4}).toBuffer();
 await fs.writeFile(path.join(output,"home-explore-fallback-review.webp"),webp);
 await fs.writeFile(path.join(output,"home-explore-fallback-review.json"),
  JSON.stringify({status:"AWAITING_VISUAL_REVIEW_NO_PUBLICATION",
   source:"https://cupola.earth/",capturedAt:new Date().toISOString(),
   revision:process.env.GITHUB_SHA,camera:state,
   globe:{centerX,centerY,radiusWidth,radiusHeight,fullyVisible:true},
   disclaimer:"Original Explore 3D shader and camera, not independently verified real-time cloud satellite observations."},null,2)+"\n");
 console.log("PASS_CUPOLA_8_14_ORIGINAL_EXPLORE_HOME_WEBGL",width,height,webp.length);
}catch(error){
 await fs.writeFile(path.join(output,"home-explore-fallback-error.json"),
   JSON.stringify({status:"NOT_APPROVED",error:String(error)},null,2)+"\n");
 throw error;
}finally{await browser.close();}
