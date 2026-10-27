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
 const root=frame.locator('.cupola-page[data-editorial-shot="solar-twilight"]');
 await root.waitFor({state:"attached",timeout:150000});
 const state=await root.evaluate(el=>({
  ready:el.getAttribute("data-renderer-ready"),
  camera:el.getAttribute("data-editorial-camera"),
  shot:el.getAttribute("data-editorial-shot"),
  distance:Number(el.getAttribute("data-earth-distance-radii")),
  daylight:Number(el.getAttribute("data-daylight-fraction-approx")),
  centerX:Number(el.getAttribute("data-earth-center-projection-x")),
  centerY:Number(el.getAttribute("data-earth-center-projection-y")),
  sunX:Number(el.getAttribute("data-sun-projection-x")),
  sunY:Number(el.getAttribute("data-sun-projection-y")),
  sunInFrustum:el.getAttribute("data-sun-visible-in-frustum"),
  fov:Number(el.getAttribute("data-editorial-fov-degrees")),
  discAspect:Number(el.getAttribute("data-earth-projected-disc-aspect")),
  limbMinX:Number(el.getAttribute("data-earth-rim-min-x")),
  limbMaxX:Number(el.getAttribute("data-earth-rim-max-x")),
  limbMinY:Number(el.getAttribute("data-earth-rim-min-y")),
  limbMaxY:Number(el.getAttribute("data-earth-rim-max-y")),
  cssCanvasAspect:Number(el.getAttribute("data-webgl-canvas-css-aspect")),
  cameraAspect:Number(el.getAttribute("data-webgl-camera-aspect")),
  viewport:window.innerWidth
 }));
 if(state.ready!=="true" || state.camera!=="solar-twilight-wide-v1" ||
    Math.abs(state.distance-1.65)>.01 || Math.abs(state.daylight-.3)>.015 ||
    Math.abs(state.fov-116)>.01 || state.sunInFrustum!=="true" ||
    !(state.discAspect>=.99&&state.discAspect<=1.035) ||
    !(state.cssCanvasAspect>0&&Math.abs(state.cssCanvasAspect/state.cameraAspect-1)<.015) ||
    Math.abs(state.centerX)>1 || Math.abs(state.centerY)>1 ||
    !Number.isFinite(state.sunX)||!Number.isFinite(state.sunY))
   throw Error("Deployed WebGL is not round-sphere 1.65R Earth + real Sun composition: "+
     JSON.stringify(state));
// The physical Sun must survive the outer iframe clip on the ACTUAL page.
// Previously it projected into the WebGL camera but not into the homepage.
const heroBox=await page.locator(".ae-hero").boundingBox();
const iframeBox=await page.locator(".ae-live-scene iframe").boundingBox();
if(!heroBox||!iframeBox)throw Error("Actual hero and iframe layout missing");
const sunPageX=(iframeBox.x+iframeBox.width*(state.sunX+1)/2-heroBox.x)/heroBox.width;
const sunPageY=(iframeBox.y+iframeBox.height*(1-state.sunY)/2-heroBox.y)/heroBox.height;
if(!(sunPageX>.90&&sunPageX<.99&&sunPageY>.25&&sunPageY<.58))
 throw Error("True solar disc is outside visible homepage CSS crop: "+
   JSON.stringify({sunPageX,sunPageY,state}));
console.log("CUPOLA_8_10_TRUE_SUN_VISIBLE_IN_HERO",sunPageX.toFixed(3),sunPageY.toFixed(3));
// Check the actual Three.js globe limb AFTER the webpage's iframe crop.
// Width/height of the projected tangent cone is sampled in the running
// shader camera above; never trust a center-point-only screenshot gate.
const limbPageX=ndc=>(iframeBox.x+iframeBox.width*(1+ndc)/2-heroBox.x)/heroBox.width;
const limbPageY=ndc=>(iframeBox.y+iframeBox.height*(1-ndc)/2-heroBox.y)/heroBox.height;
const limbBounds={left:limbPageX(state.limbMinX),right:limbPageX(state.limbMaxX),
 top:limbPageY(state.limbMaxY),bottom:limbPageY(state.limbMinY)};
if(!(limbBounds.left>.50&&limbBounds.right<.88&&
 limbBounds.top>.10&&limbBounds.bottom<.94))
 throw Error("Entire ROUND Earth silhouette does not fit outside text and inside hero: "+
  JSON.stringify({limbBounds,discAspect:state.discAspect}));
console.log("CUPOLA_8_11_ROUND_EARTH_LIMB",state.discAspect.toFixed(4),
 JSON.stringify(limbBounds));
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
     realSun:{sunPageX,sunPageY,insideHeroCrop:true},
     roundEarth:{projectedPixelAspect:state.discAspect,
       canvasCssAspect:state.cssCanvasAspect,webglCameraAspect:state.cameraAspect,
       limbBounds,fullEarthInsideHero:true},
     disclaimer:"Rendered 3D scene, not satellite imagery. This screenshot does not prove source freshness or city-light coverage."},null,2)+"\n");
 console.log("CUPOLA_8_10_REAL_SUN_TWILIGHT_SCREENSHOT",width,height,webp.length);
}catch(error){
 await fs.writeFile(path.join(output,"home-twilight-error.json"),
   JSON.stringify({status:"NOT_APPROVED",error:String(error)},null,2)+"\n");
 throw error;
}finally{await browser.close();}
