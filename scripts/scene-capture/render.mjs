#!/usr/bin/env node
// Render actual CUPOLA canvas only. These files are UNAPPROVED editor-ready
// evidence artifacts; this script never injects its output into the sitemap.
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {chromium} from "playwright";
import sharp from "sharp";
import presets from "../../config/scene-capture-presets.json" with {type:"json"};

const name=process.argv[2]||"home-hero";
const requestedPage=String(process.env.CUPOLA_CAPTURE_PAGE||"").trim();
const captureType=String(process.env.CUPOLA_CAPTURE_TYPE||"still");
if(!["still","video"].includes(captureType))throw Error("Only still and video on-demand requests are supported");
const preset=presets.presets.find(p=>p.id===name);
if(!preset)throw Error("Capture preset is not allowlisted: "+name);
if(!requestedPage||requestedPage!==preset.pageId)throw Error("Capture page/preset mismatch; arbitrary scene commands are prohibited");
if(!preset.renderTypes?.includes(captureType))throw Error("Output type is not approved for requested scene preset");
const origin=process.env.CUPOLA_CAPTURE_ORIGIN||"https://cupola.earth";
const parsed=new URL(origin);
if(parsed.protocol!=="https:" || !["cupola.earth","www.cupola.earth"].includes(parsed.hostname))
  throw Error("Capture origin must be a verified CUPOLA host");
const dest=path.resolve(process.env.CUPOLA_CAPTURE_OUT||"capture-output");
await fs.mkdir(dest,{recursive:true});
const url=new URL(preset.route,origin).toString();
const browser=await chromium.launch({
  headless:true,
  args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-dev-shm-usage"]
});
try{
  const page=await browser.newPage({
    viewport:{width:preset.width,height:preset.height},deviceScaleFactor:1,
    reducedMotion:"reduce",
    ...(captureType==="video"?{recordVideo:{dir:dest,size:{
      width:preset.width,height:preset.height}}}:{})
  });
  const failures=[];
  page.on("pageerror",e=>failures.push(e.message));
  const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:95000});
  if(!response || response.status()!==200)throw Error("CUPOLA scene HTTP not 200");
  await page.locator(".cupola-page.capture-scene canvas").waitFor({state:"visible",timeout:95000});
  await page.waitForFunction(()=>{
    const root=document.querySelector(".cupola-page.capture-scene");
    const canvas=root?.querySelector("canvas");
    return root?.getAttribute("data-renderer-ready")==="true" &&
      root?.getAttribute("data-renderer-type")==="CUPOLA_THREEJS_WEBGL" &&
      root?.getAttribute("data-observation-verified")==="false" &&
      canvas instanceof HTMLCanvasElement &&
      canvas.width>=800 && canvas.height>=450;
  },null,{timeout:70000,polling:500});
  if(preset.cameraMode==="editorial-dawn-realtime"){
    // A sky-only screenshot is not a sunrise globe, even if the WebGL
    // renderer reported ready. Require the actual scene camera to calculate
    // the same solar limb framing that the homepage uses.
    await page.waitForFunction(()=>{
      const root=document.querySelector(".cupola-page.capture-scene");
      const time=root?.getAttribute("data-solar-camera-utc");
      const margin=Number(root?.getAttribute("data-sun-limb-separation-deg"));
      return root?.getAttribute("data-editorial-camera")==="sunrise-limb-v1" &&
        Number.isFinite(Date.parse(time||"")) &&
        Number.isFinite(margin) && margin>20 && margin<40;
    },null,{timeout:70000,polling:500});
  }
  // Buffer for real textures/NOAA layer sources, but never call this
  // proof of scientific observation. Scientific review stays separate.
  await page.waitForTimeout(10000);
  const canvas=page.locator(".cupola-page.capture-scene canvas");
  if(await page.locator(".cupola-page.capture-scene [data-scene-error]").count()>0)
    throw Error("CUPOLA scene reports a rendering failure");
  const box=await canvas.boundingBox();
  if(!box || box.width<800 || box.height<450)throw Error("Scene canvas has invalid dimensions");
  const png=await page.screenshot({type:"png",animations:"disabled",timeout:30000});
  const scene=sharp(png,{limitInputPixels:18_000_000});
  const stats=await scene.stats();
  const contrast=stats.channels.slice(0,3).map(x=>x.stdev);
  if(contrast.every(x=>x<8))throw Error("Scene capture is blank or nearly uniform");
  if(failures.some(x=>/WebGL context lost|THREE\.WebGLRenderer: Error/i.test(x)))
    throw Error("WebGL renderer failed: "+failures.slice(0,3).join("; "));
  const hero=await sharp(png).webp({quality:88,effort:5}).toBuffer();
  const og=await sharp(png).resize(preset.ogWidth,preset.ogHeight,{fit:"cover",position:"centre"})
    .webp({quality:85,effort:5}).toBuffer();
  const prefix=path.join(dest,preset.output);
  await Promise.all([fs.writeFile(prefix+".webp",hero),fs.writeFile(prefix+"-og.webp",og)]);
  const cameraEvidence=await page.locator(".cupola-page.capture-scene")
    .evaluate(root=>({
      cameraMode:root.getAttribute("data-editorial-camera")||null,
      utcSolarFrame:root.getAttribute("data-solar-camera-utc")||null,
      sunCenterSeparationDegrees:root.getAttribute("data-sun-limb-separation-deg")||null,
      renderer:root.getAttribute("data-renderer-type")||null,
      classification:root.getAttribute("data-scene-frame-type")||"3D_VISUALIZATION"
    }));
  let videoBytes=null;
  if(captureType==="video"){
    // A video request is an opt-in record of the CURRENT 3D renderer.
    // This is a simulation clip, not eight seconds of satellite acquisition.
    const clip=page.video();
    if(!clip)throw Error("Playwright WebGL video recorder not initialized");
    await page.waitForTimeout(8000);
    await page.close();
    const videoOutput=prefix+"-8s.webm";
    await clip.saveAs(videoOutput);
    videoBytes=(await fs.stat(videoOutput)).size;
    if(videoBytes<30_000)throw Error("Requested video is blank or corrupt");
  }
  const stamp=new Date().toISOString();
  const meta={
    schemaVersion:1,preset:name,pageId:requestedPage,
    requestType:captureType,trigger:"GITHUB_WORKFLOW_DISPATCH_AUTHORIZED",
    captureUrl:url,
    assetStatus:"AWAITING_EDITORIAL_AND_SCIENCE_REVIEW",approved:false,
    imageType:"CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH",
    renderedAt:stamp,sourceObservedAt:null,
    basemapVintage:"MIXED / MAY INCLUDE HISTORICAL NASA IMAGERY",
    sourceFreshness:"UNVERIFIED_CAPTURE_ONLY",
    sourceStatus:"UNKNOWN_NOT_ASSESSED",
    sceneReadyVerified:true,
    actualThreeJsCanvas:true,
    approvalConditions:["validate layer observation provenance","review captured geography and pixels","verify scene image contains valid non-placeholder Earth","upload immutable asset to CUPOLA R2","register independent editorial approval"],
    reason:"Do not assign a specific NOAA observation time without joining authoritative source-state metadata from the scene",
    sceneRevision:process.env.GITHUB_SHA||"unresolved",
    actualSceneCameraEvidence:cameraEvidence,
    viewport:{width:preset.width,height:preset.height},og:{width:preset.ogWidth,height:preset.ogHeight},
    heroSha256:createHash("sha256").update(hero).digest("hex"),
    ogSha256:createHash("sha256").update(og).digest("hex"),
    video:captureType==="video"?{filename:preset.output+"-8s.webm",sizeBytes:videoBytes,
      classification:"CUPOLA_3D_SCENE_SIMULATION_NOT_OBSERVED_TIMELAPSE"}:null,
    contrastStdev:contrast.map(n=>Math.round(n*100)/100),
    warnings:failures.slice(0,10)
  };
  await fs.writeFile(prefix+".json",JSON.stringify(meta,null,2)+"\n");
  console.log("UNAPPROVED_ON_DEMAND_SCENE_CAPTURE",requestedPage,name,captureType,hero.length,"B",og.length,"B",videoBytes??"no video",stamp);
}finally{await browser.close();}
